import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

import type { PlanRequest, PlanResponse, Plan, Module, AgentEnvelope } from "@/lib/types";
import { ROLES, COURSES, SKILLS } from "@/lib/seed";
import {
  computeGap, buildDraftPlan, validatePlan, compressPlan
} from "@/lib/engine";
import { timedEnvelope } from "@/lib/llm";
import {
  PlannerOutputSchema, CriticOutputSchema, ProfileOutputSchema,
} from "@/lib/schemas";
import {
  plannerPrompt, criticPrompt, profilePrompt,
  plannerRationale, criticVerdict,
} from "@/lib/prompts";

export const maxDuration = 60;

const MODEL = process.env.GOOGLE_GENERATIVE_AI_MODEL ?? "gemini-1.5-flash";

function getGoogle() {
  return createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "",
  });
}

// Hydrate draft plan from LLM planner output
function hydratePlan(
  plannerModules: { moduleId: string; week: number; rationale: string }[],
  draft: Plan,
  roleId: string,
  version: number,
): Plan {
  const moduleMap = new Map(draft.modules.map(m => [m.id, m]));
  const modules: Module[] = [];

  for (const pm of plannerModules) {
    const existing = moduleMap.get(pm.moduleId);
    if (!existing) continue; // skip unknown IDs
    modules.push({ ...existing, week: pm.week, rationale: pm.rationale });
  }

  if (modules.length === 0) return { ...draft, version }; // fallback to draft

  const totalHours   = modules.reduce((s, m) => s + m.hours, 0);
  const numberOfWeeks = Math.max(...modules.map(m => m.week));
  const weeklyHours  = totalHours / numberOfWeeks;

  return {
    ...draft,
    id:           uuidv4(),
    version,
    modules,
    totalHours,
    weeklyHours,
    numberOfWeeks,
    createdAt:    new Date().toISOString(),
  };
}

export async function POST(req: Request) {
  const body: PlanRequest = await req.json();
  const { learner, resumeText } = body;

  const role = ROLES.find(r => r.id === learner.targetRoleId);
  if (!role) {
    return NextResponse.json({ error: "Unknown role" }, { status: 400 });
  }

  const trace: AgentEnvelope[] = [];
  let degraded = false;
  const google = getGoogle();

  // ── 1. Profile (optional) ─────────────────────────────────────────────────
  let currentLearner = { ...learner };

  if (resumeText) {
    const profileEnv = await timedEnvelope(
      "profile",
      { resumeText: resumeText.slice(0, 500) },
      async () => {
        const result = await generateObject({
          model: google(MODEL),
          schema: ProfileOutputSchema,
          prompt: profilePrompt(resumeText),
          temperature: 0.2,
        });
        return {
          output: result.object,
          rationale: "Extracted skills from resume text.",
        };
      },
      () => ({
        output: { skills: [] },
        rationale: "deterministic fallback: resume parsing skipped",
      }),
    );
    trace.push(profileEnv as AgentEnvelope);
    if (profileEnv.status === "error") degraded = true;
    else {
      const extracted = (profileEnv.output as { skills: { skillId: string; level: number }[] }).skills;
      const updatedSkills = [...currentLearner.skills];
      for (const ex of extracted) {
        const idx = updatedSkills.findIndex(s => s.skillId === ex.skillId);
        if (idx >= 0) updatedSkills[idx] = { ...updatedSkills[idx], level: ex.level as 0|1|2|3|4|5 };
        else updatedSkills.push({ skillId: ex.skillId, level: ex.level as 0|1|2|3|4|5, confidence: 0.5, evidence: ["resume"] });
      }
      currentLearner = { ...currentLearner, skills: updatedSkills };
    }
  }

  // ── 2. Gap (deterministic) ────────────────────────────────────────────────
  const gap = computeGap(currentLearner, role);
  trace.push({
    id: uuidv4(), agent: "gap", input: { learner: currentLearner, role: role.id },
    output: gap, rationale: gap.summary, latencyMs: 0, status: "ok",
    createdAt: new Date().toISOString(),
  } as AgentEnvelope);

  // ── 3. Draft (deterministic) ──────────────────────────────────────────────
  const draft = buildDraftPlan(gap, role, currentLearner.hoursPerWeek);

  // ── 4. Planner (LLM) ──────────────────────────────────────────────────────
  let planV1: Plan = draft;
  const plannerEnv = await timedEnvelope(
    "planner",
    { gapSummary: gap.summary, moduleCount: draft.modules.length },
    async () => {
      const result = await generateObject({
        model: google(MODEL),
        schema: PlannerOutputSchema,
        prompt: plannerPrompt(gap, role, draft),
        temperature: 0.2,
      });
      return {
        output: result.object,
        rationale: result.object.summary,
      };
    },
    () => ({
      output: {
        modules: draft.modules.map(m => ({ moduleId: m.id, week: m.week, rationale: plannerRationale(m.skillId) })),
        summary: "Deterministic schedule based on prerequisite order.",
      },
      rationale: plannerRationale("all skills"),
    }),
  );
  trace.push(plannerEnv as AgentEnvelope);
  if (plannerEnv.status === "error") degraded = true;
  else {
    const po = plannerEnv.output as { modules: { moduleId: string; week: number; rationale: string }[] };
    planV1 = hydratePlan(po.modules, draft, role.id, 1);
  }

  // ── 5. Critic (rule + optional LLM) ──────────────────────────────────────
  let finalPlan = planV1;
  let criticAttempts = 0;

  while (criticAttempts < 2) {
    const validation = validatePlan(finalPlan, currentLearner.hoursPerWeek);
    const criticEnv = await timedEnvelope(
      "critic",
      { weeklyHours: finalPlan.weeklyHours, budget: currentLearner.hoursPerWeek },
      async () => {
        const result = await generateObject({
          model: google(MODEL),
          schema: CriticOutputSchema,
          prompt: criticPrompt(finalPlan, currentLearner.hoursPerWeek),
          temperature: 0.2,
        });
        // Rule overrides LLM: if rule says fail, it fails regardless
        const verdict = validation.ok ? result.object.verdict : "revise";
        return {
          output: { ...result.object, verdict, ruleIssues: validation.issues },
          rationale: result.object.rationale,
        };
      },
      () => ({
        output: { verdict: validation.ok ? "pass" : "revise", ruleIssues: validation.issues },
        rationale: criticVerdict(finalPlan.weeklyHours, currentLearner.hoursPerWeek * 1.1),
      }),
    );
    trace.push(criticEnv as AgentEnvelope);
    if (criticEnv.status === "error") degraded = true;

    const verdict = (criticEnv.output as { verdict: string }).verdict;

    if (verdict === "pass") break;

    // Compress and retry once
    if (criticAttempts === 0) {
      const compressed = compressPlan(finalPlan, currentLearner.hoursPerWeek);
      // Planner retry on compressed plan
      const retryEnv = await timedEnvelope(
        "planner",
        { compressed: true, moduleCount: compressed.modules.length },
        async () => {
          const result = await generateObject({
            model: google(MODEL),
            schema: PlannerOutputSchema,
            prompt: plannerPrompt(gap, role, compressed),
            temperature: 0.2,
          });
          return { output: result.object, rationale: result.object.summary };
        },
        () => ({
          output: {
            modules: compressed.modules.map(m => ({ moduleId: m.id, week: m.week, rationale: plannerRationale(m.skillId) })),
            summary: "Compressed plan — deterministic schedule.",
          },
          rationale: "Deterministic fallback on compressed plan.",
        }),
      );
      trace.push(retryEnv as AgentEnvelope);
      if (retryEnv.status === "error") degraded = true;

      const rpo = retryEnv.output as { modules: { moduleId: string; week: number; rationale: string }[] };
      finalPlan = hydratePlan(rpo.modules, compressed, role.id, 2);
    } else {
      break;
    }
    criticAttempts++;
  }

  const response: PlanResponse = {
    plan: finalPlan,
    gap,
    trace,
    ...(degraded ? { degraded: true } : {}),
  };

  return NextResponse.json(response);
}

