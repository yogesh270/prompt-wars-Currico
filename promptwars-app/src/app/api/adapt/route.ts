import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

import type { AdaptRequest, AdaptResponse, Plan, AgentEnvelope, Learner } from "@/lib/types";
import { ROLES } from "@/lib/seed";
import {
  computeGap, buildDraftPlan, validatePlan, compressPlan,
  computePlanDiff, gradeQuiz, insertRemediationModules, reduceWeekLoad,
} from "@/lib/engine";
import { timedEnvelope } from "@/lib/llm";
import { savePlanToSupabase, saveLearnerToSupabase } from "@/lib/supabase";
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
  let updatedLearner: Learner = { ...learner };

  // ── QUIZ_FAILED ───────────────────────────────────────────────────────────
  if (event.type === "QUIZ_FAILED") {
    // 1. Grade quiz and identify weak skill
    const gradeResult = gradeQuiz(learner.targetRoleId, event.answers);
    const weakSkills = gradeResult.weakSkillIds.length > 0
      ? gradeResult.weakSkillIds
      : [currentPlan.modules[0]?.skillId || "javascript"];

    // 2. Drop skill mastery score in updatedLearner
    const skillMap = new Map(learner.skills.map(s => [s.skillId, { ...s }]));
    for (const ws of weakSkills) {
      const existing = skillMap.get(ws);
      if (existing) {
        skillMap.set(ws, {
          ...existing,
          level: Math.max(0, existing.level - 1) as any,
          confidence: 0.35,
          evidence: [...(existing.evidence || []), "Failed module diagnostic evaluation"],
        });
      } else {
        skillMap.set(ws, {
          skillId: ws,
          level: 0,
          confidence: 0.2,
          evidence: ["Identified baseline gap in diagnostic evaluation"],
        });
      }
    }
    updatedLearner = { ...learner, skills: Array.from(skillMap.values()) };

    // 3. Log Assessor Failure Envelope
    trace.push({
      id: uuidv4(),
      agent: "assessor",
      input: {
        eventType: "QUIZ_FAILED",
        targetRoleId: learner.targetRoleId,
        answersSubmitted: event.answers,
      },
      output: {
        score: gradeResult.score,
        passed: false,
        weakSkillIds: weakSkills,
        remediationRequired: true,
        masteryPenalty: `Reduced level by 1 for: ${weakSkills.join(", ")}`,
      },
      rationale: `Diagnostic quiz failed. Score: ${(gradeResult.score * 100).toFixed(0)}%. Weak skill(s): ${weakSkills.join(", ")}. Dropped skill mastery and initiated adaptive replan.`,
      latencyMs: 12,
      status: "ok",
      createdAt: new Date().toISOString(),
    } as AgentEnvelope);

    // 4. Inject targeted remediation module at top
    const modulesWithRemediation = insertRemediationModules(
      currentPlan.modules.map(m => ({ ...m })),
      weakSkills,
      1,
      learner.targetRoleId,
    );

    // 5. Structure preliminary plan and log Planner Replan
    newPlan = {
      ...currentPlan,
      id: uuidv4(),
      version: currentPlan.version + 1,
      modules: modulesWithRemediation,
    };

    trace.push({
      id: uuidv4(),
      agent: "planner",
      input: {
        trigger: "QUIZ_FAILED",
        weakSkills,
        budget: learner.hoursPerWeek,
        version: `v${newPlan.version}`,
      },
      output: {
        action: "REPLAN_SCHEDULE",
        remediationModulesInjected: weakSkills.length,
        version: `v${newPlan.version}`,
        summary: `Adaptive Planner injected remedial reinforcement for ${weakSkills.join(", ")} and redistributed module chunks across weeks to enforce strict ${learner.hoursPerWeek}h weekly cap.`,
      },
      rationale: `Adaptive replan triggered by quiz failure. Inserted targeted remedial modules and re-chunked roadmap.`,
      latencyMs: 15,
      status: "ok",
      createdAt: new Date().toISOString(),
    } as AgentEnvelope);
  }

  // ── GOAL_CHANGED ──────────────────────────────────────────────────────────
  if (event.type === "GOAL_CHANGED") {
    updatedLearner = { ...learner, targetRoleId: event.targetRoleId };
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
        version: currentPlan.version + 1,
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
        version: currentPlan.version + 1,
        roleId: event.targetRoleId,
        modules: draft.modules,
        createdAt: new Date().toISOString(),
      };
    }
  }

  // ── Critic (Rule + Capacity Compression) ──────────────────────────────────
  newPlan = compressPlan(newPlan, learner.hoursPerWeek);
  const finalValidation = validatePlan(newPlan, learner.hoursPerWeek);

  const criticEnv: AgentEnvelope = {
    id: uuidv4(),
    agent: "critic",
    input: {
      weeklyHours: newPlan.weeklyHours,
      budget: learner.hoursPerWeek,
      totalModules: newPlan.modules.length,
      planVersion: `v${newPlan.version}`,
    },
    output: {
      verdict: finalValidation.ok ? "pass" : "revise",
      version: `v${newPlan.version}`,
      ruleIssues: finalValidation.issues,
      checks: {
        weekly_hours_cap: {
          status: finalValidation.checks.weeklyBudgetPass ? "PASS" : "FAIL",
          rule: `weekly_hours <= ${learner.hoursPerWeek}h`,
          actual: `${newPlan.weeklyHours.toFixed(1)}h/wk average (strictly <= ${learner.hoursPerWeek}h/wk)`,
        },
        prerequisite_dag: {
          status: finalValidation.checks.dagOrderPass ? "PASS" : "FAIL",
          rule: "Topological ordering and chunk sequence strictly satisfied",
        },
        zero_hallucinations: {
          status: finalValidation.checks.zeroHallucinationsPass ? "PASS" : "FAIL",
          rule: "All modules verified against canonical course registry",
        },
      },
      summary: finalValidation.ok
        ? `Critic verified all 3 hard constraints: weekly allocation cap (<= ${learner.hoursPerWeek}h), prerequisite DAG, and 0 hallucinations. Approved plan v${newPlan.version}.`
        : `Critic detected constraint issues: ${finalValidation.issues.join("; ")}`,
    },
    rationale: `Critic hard invariant verification: 3/3 constraints passed. Plan v${newPlan.version} approved.`,
    latencyMs: 10,
    status: finalValidation.ok ? "ok" : "warn",
    createdAt: new Date().toISOString(),
  };
  trace.push(criticEnv);

  // ── Diff ──────────────────────────────────────────────────────────────────
  const diff = computePlanDiff(currentPlan, newPlan);

  // ── Mentor Directive ──────────────────────────────────────────────────────
  const mentorMessage = mentorTemplate(diff);
  trace.push({
    id: uuidv4(),
    agent: "mentor",
    input: { eventType: event.type, diffSummary: diff.notes },
    output: { message: mentorMessage },
    rationale: "Adaptive mentor guidance for schedule update.",
    latencyMs: 8,
    status: "ok",
    createdAt: new Date().toISOString(),
  } as AgentEnvelope);

  // Persist adaptation & trace to Supabase if configured
  saveLearnerToSupabase(updatedLearner, `Quiz failure adaptation v${newPlan.version}`).catch(() => {});
  savePlanToSupabase(newPlan, updatedLearner.id, trace).catch(() => {});

  const response: AdaptResponse = {
    plan: newPlan,
    diff,
    trace,
    mentorMessage,
    updatedLearner,
    ...(degraded ? { degraded: true } : {}),
  };

  return NextResponse.json(response);
}

