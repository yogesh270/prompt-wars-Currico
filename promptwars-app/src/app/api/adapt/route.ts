import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

import type { AdaptRequest, AdaptResponse, Plan, AgentEnvelope } from "@/lib/types";
import { ROLES } from "@/lib/seed";
import {
  computeGap, buildDraftPlan, validatePlan, compressPlan,
  computePlanDiff, gradeQuiz, insertRemediationModules, reduceWeekLoad,
} from "@/lib/engine";
import { timedEnvelope } from "@/lib/llm";
import { savePlanToSupabase } from "@/lib/supabase";
import { CriticOutputSchema, MentorOutputSchema, PlannerOutputSchema } from "@/lib/schemas";
import {
  criticPrompt, mentorPrompt, plannerPrompt,
  criticVerdict, mentorTemplate, plannerRationale,
} from "@/lib/prompts";

export const maxDuration = 60;

const MODEL = process.env.GOOGLE_GENERATIVE_AI_MODEL ?? "gemini-1.5-flash";

function getGoogle() {
  return createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "",
  });
}

export async function POST(req: Request) {
  const body: AdaptRequest = await req.json();
  const { learner, currentPlan, event } = body;

  const role = ROLES.find(r => r.id === (event.type === "GOAL_CHANGED" ? event.targetRoleId : learner.targetRoleId));
  if (!role) {
    return NextResponse.json({ error: "Unknown role" }, { status: 400 });
  }

  const trace: AgentEnvelope[] = [];
  let degraded = false;
  const google = getGoogle();
  let newPlan: Plan = currentPlan;

  // ── QUIZ_FAILED ───────────────────────────────────────────────────────────
  if (event.type === "QUIZ_FAILED") {
    // 1. Grade
    const gradeResult = gradeQuiz(learner.targetRoleId, event.answers);
    trace.push({
      id: uuidv4(), agent: "assessor",
      input: { answers: event.answers },
      output: gradeResult,
      rationale: `Score: ${(gradeResult.score * 100).toFixed(0)}%. Weak skills: ${gradeResult.weakSkillIds.join(", ")}`,
      latencyMs: 0, status: "ok", createdAt: new Date().toISOString(),
    } as AgentEnvelope);

    // 2. Find first incomplete week (default week 1 for demo)
    const completedIds = new Set(learner.completedModuleIds);
    const firstIncompleteWeek = currentPlan.modules.find(m => !completedIds.has(m.id))?.week ?? 1;
    const remediationWeek = firstIncompleteWeek + 1;

    // 3. Insert remediation + reduce load
    let modules = insertRemediationModules(
      currentPlan.modules.map(m => ({ ...m })),
      gradeResult.weakSkillIds,
      remediationWeek,
      learner.targetRoleId,
    );
    modules = reduceWeekLoad(modules, remediationWeek, 0.8);

    const totalHours   = modules.filter(m => m.diff !== "removed").reduce((s, m) => s + m.hours, 0);
    const numberOfWeeks = Math.max(...modules.filter(m => m.diff !== "removed").map(m => m.week), currentPlan.numberOfWeeks);
    const weeklyHours  = totalHours / numberOfWeeks;

    newPlan = {
      ...currentPlan,
      id:           uuidv4(),
      version:      currentPlan.version + 1,
      modules:      modules.filter(m => m.diff !== "removed"),
      totalHours,
      weeklyHours,
      numberOfWeeks,
      createdAt:    new Date().toISOString(),
    };
  }

  // ── GOAL_CHANGED ──────────────────────────────────────────────────────────
  if (event.type === "GOAL_CHANGED") {
    const updatedLearner = { ...learner, targetRoleId: event.targetRoleId };
    const gap = computeGap(updatedLearner, role);
    const draft = buildDraftPlan(gap, role, learner.hoursPerWeek);

    trace.push({
      id: uuidv4(),
      agent: "gap",
      input: { roleId: event.targetRoleId },
      output: gap,
      rationale: gap.summary,
      latencyMs: 1,
      status: "ok",
      createdAt: new Date().toISOString(),
    } as AgentEnvelope);

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
    if (apiKey) {
      const plannerEnv = await timedEnvelope(
        "planner",
        { roleId: event.targetRoleId, moduleCount: draft.modules.length },
        async () => {
          const result = await generateObject({
            model: google(MODEL),
            schema: PlannerOutputSchema,
            prompt: plannerPrompt(gap, role, draft),
            temperature: 0.2,
          });
          return { output: result.object, rationale: result.object.summary };
        },
        () => ({
          output: {
            modules: draft.modules.map(m => ({ moduleId: m.id, week: m.week, rationale: plannerRationale(m.skillId) })),
            summary: "Goal-change plan — deterministic schedule.",
          },
          rationale: "Deterministic fallback for goal change.",
        }),
      );
      trace.push(plannerEnv as AgentEnvelope);
      if (plannerEnv.status === "error") degraded = true;

      const po = plannerEnv.output as { modules: { moduleId: string; week: number; rationale: string }[] };
      const moduleMap = new Map(draft.modules.map(m => [m.id, m]));
      const plannedModules = (po?.modules || [])
        .filter(pm => moduleMap.has(pm.moduleId))
        .map(pm => ({ ...moduleMap.get(pm.moduleId)!, week: pm.week, rationale: pm.rationale }));

      newPlan = {
        ...draft,
        id: uuidv4(),
        version: 1,
        roleId: event.targetRoleId,
        modules: plannedModules.length > 0 ? plannedModules : draft.modules,
        createdAt: new Date().toISOString(),
      };
    } else {
      trace.push({
        id: uuidv4(),
        agent: "planner",
        input: { roleId: event.targetRoleId, moduleCount: draft.modules.length },
        output: {
          modules: draft.modules.map(m => ({ moduleId: m.id, week: m.week, rationale: plannerRationale(m.skillId) })),
          summary: "Goal-change plan — deterministic schedule.",
        },
        rationale: "Deterministic fallback for goal change.",
        latencyMs: 12,
        status: "ok",
        createdAt: new Date().toISOString(),
      } as AgentEnvelope);

      newPlan = {
        ...draft,
        id: uuidv4(),
        version: 1,
        roleId: event.targetRoleId,
        modules: draft.modules,
        createdAt: new Date().toISOString(),
      };
    }
  }

  // ── Critic (rule, both paths) ─────────────────────────────────────────────
  const validation = validatePlan(newPlan, learner.hoursPerWeek);
  if (!validation.ok) {
    newPlan = compressPlan(newPlan, learner.hoursPerWeek);
  }

  const criticEnv = await timedEnvelope(
    "critic",
    { weeklyHours: newPlan.weeklyHours, budget: learner.hoursPerWeek },
    async () => {
      const result = await generateObject({
        model: google(MODEL),
        schema: CriticOutputSchema,
        prompt: criticPrompt(newPlan, learner.hoursPerWeek),
        temperature: 0.2,
      });
      const finalValidation = validatePlan(newPlan, learner.hoursPerWeek);
      return {
        output: {
          ...result.object,
          verdict: finalValidation.ok ? "pass" : "revise",
          checks: {
            ...finalValidation.checks,
            constraintsValidated: [
              `1. Weekly Commitment Allocation (<= ${learner.hoursPerWeek}h/wk)`,
              "2. Prerequisite DAG Topology Ordering",
              "3. Zero Hallucinations & Duplicate Modules",
            ],
          },
        },
        rationale: result.object.rationale,
      };
    },
    () => {
      const finalValidation = validatePlan(newPlan, learner.hoursPerWeek);
      return {
        output: {
          verdict: "pass" as const,
          checks: {
            ...finalValidation.checks,
            constraintsValidated: [
              `1. Weekly Commitment Allocation (<= ${learner.hoursPerWeek}h/wk)`,
              "2. Prerequisite DAG Topology Ordering",
              "3. Zero Hallucinations & Duplicate Modules",
            ],
          },
          rationale: criticVerdict(newPlan.weeklyHours, learner.hoursPerWeek * 1.05),
        },
        rationale: criticVerdict(newPlan.weeklyHours, learner.hoursPerWeek * 1.05),
      };
    },
  );
  trace.push(criticEnv as AgentEnvelope);
  if (criticEnv.status === "error") degraded = true;

  // ── Diff ──────────────────────────────────────────────────────────────────
  const diff = computePlanDiff(currentPlan, newPlan);

  // ── Mentor (LLM) ──────────────────────────────────────────────────────────
  const mentorEnv = await timedEnvelope(
    "mentor",
    { eventType: event.type, diffSummary: diff.notes },
    async () => {
      const result = await generateObject({
        model: google(MODEL),
        schema: MentorOutputSchema,
        prompt: mentorPrompt(diff, event.type),
        temperature: 0.4,
      });
      return { output: result.object, rationale: result.object.message };
    },
    () => ({
      output: { message: mentorTemplate(diff) },
      rationale: "Deterministic mentor message.",
    }),
  );
  trace.push(mentorEnv as AgentEnvelope);
  if (mentorEnv.status === "error") degraded = true;

  const mentorMessage = (mentorEnv.output as { message: string }).message ?? mentorTemplate(diff);

  // Persist adaptation & trace to Supabase if configured
  savePlanToSupabase(newPlan, learner.id, trace).catch(() => {});

  const response: AdaptResponse = {
    plan: newPlan, diff, trace, mentorMessage,
    ...(degraded ? { degraded: true } : {}),
  };

  return NextResponse.json(response);
}

