import { createClient } from "@supabase/supabase-js";
import type { Learner, Plan, AgentEnvelope } from "./types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl.startsWith("http") &&
  !supabaseUrl.includes("your-project")
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;

/**
 * Persist learner profile & skill baseline into Supabase
 */
export async function saveLearnerToSupabase(
  learner: Learner,
  rawResumeText?: string
): Promise<boolean> {
  if (!supabase) return false;

  try {
    // 1. Upsert learner record
    const { error: learnerError } = await supabase
      .from("learners")
      .upsert({
        id: learner.id,
        name: learner.name,
        target_role: learner.targetRoleId,
        weekly_hours: learner.hoursPerWeek,
        raw_resume_text: rawResumeText || null,
        created_at: new Date().toISOString(),
      }, { onConflict: "id" });

    if (learnerError) {
      console.warn("[Supabase] Failed to upsert learner:", learnerError.message);
      return false;
    }

    // 2. Upsert learner skills
    if (learner.skills && learner.skills.length > 0) {
      const skillRows = learner.skills.map(s => ({
        learner_id: learner.id,
        skill_name: s.skillId,
        current_level: s.level,
        target_level: 4, // default role expectation
        updated_at: new Date().toISOString(),
      }));

      const { error: skillsError } = await supabase
        .from("learner_skills")
        .upsert(skillRows, { onConflict: "learner_id,skill_name" });

      if (skillsError) {
        console.warn("[Supabase] Failed to upsert learner skills:", skillsError.message);
      }
    }

    return true;
  } catch (err) {
    console.warn("[Supabase] Error saving learner:", err);
    return false;
  }
}

/**
 * Persist generated curriculum plan & multi-agent traces into Supabase
 */
export async function savePlanToSupabase(
  plan: Plan,
  learnerId: string,
  traces: AgentEnvelope[] = []
): Promise<boolean> {
  if (!supabase) return false;

  try {
    // 1. Save plan
    const { error: planError } = await supabase
      .from("curriculum_plans")
      .upsert({
        id: plan.id,
        learner_id: learnerId,
        version: plan.version,
        total_hours: plan.totalHours,
        total_weeks: plan.numberOfWeeks,
        status: "active",
        schedule_json: plan.modules,
        created_at: plan.createdAt || new Date().toISOString(),
      }, { onConflict: "id" });

    if (planError) {
      console.warn("[Supabase] Failed to upsert plan:", planError.message);
      return false;
    }

    // 2. Save agent trace envelopes
    if (traces && traces.length > 0) {
      const traceRows = traces.map(t => ({
        id: t.id,
        plan_id: plan.id,
        agent_name: t.agent,
        status: t.status,
        latency_ms: t.latencyMs,
        envelope_payload: {
          input: t.input,
          output: t.output,
          rationale: t.rationale,
        },
        created_at: t.createdAt || new Date().toISOString(),
      }));

      const { error: traceError } = await supabase
        .from("agent_traces")
        .upsert(traceRows, { onConflict: "id" });

      if (traceError) {
        console.warn("[Supabase] Failed to upsert agent traces:", traceError.message);
      }
    }

    return true;
  } catch (err) {
    console.warn("[Supabase] Error saving plan to Supabase:", err);
    return false;
  }
}
