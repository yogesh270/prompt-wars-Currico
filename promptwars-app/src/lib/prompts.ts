import type { GapReport, Plan, PlanDiff, Learner, Role } from "./types";
import { COURSES } from "./seed";

// ─── Planner prompt ───────────────────────────────────────────────────────────

export function plannerPrompt(gap: GapReport, role: Role, draft: Plan): string {
  const courseList = draft.modules.map(m => ({
    moduleId: m.id,
    courseTitle: m.title,
    hours: m.hours,
    skillId: m.skillId,
  }));

  return `You are a learning plan scheduler.

ROLE: ${role.title}
LEARNER READINESS: ${(gap.readiness * 100).toFixed(0)}%
TOP GAPS: ${gap.missing.slice(0, 5).map(g => `${g.skillId}(priority:${g.priority})`).join(", ")}

AVAILABLE MODULES (use ONLY these moduleIds):
${JSON.stringify(courseList, null, 2)}

TASK: Assign each module to a week number. Week 1 starts immediately.
Return ONLY valid moduleIds from the list above.
Prioritise prerequisite skills in earlier weeks.

Return JSON: { modules: [{ moduleId, week, rationale }], summary }
Rationale per module: 1 sentence max. Summary: 2 sentences max.`;
}

// ─── Critic prompt ────────────────────────────────────────────────────────────

export function criticPrompt(plan: Plan, budget: number): string {
  return `You are a learning plan critic.

PLAN SUMMARY:
- Total hours: ${plan.totalHours}h
- Weekly average: ${plan.weeklyHours.toFixed(1)}h
- Weeks: ${plan.numberOfWeeks}
- Budget: ${budget}h/week (limit: ${(budget * 1.1).toFixed(1)}h)

MODULES:
${plan.modules.map(m => `Week ${m.week}: ${m.title} (${m.hours}h)`).join("\n")}

TASK: Review if this plan is realistic for the learner.
If weekly average > ${(budget * 1.1).toFixed(1)}h, verdict must be "revise".
Otherwise verdict can be "pass" with constructive feedback.

Return JSON: { verdict: "pass"|"revise", rationale }`;
}

// ─── Mentor prompt ────────────────────────────────────────────────────────────

export function mentorPrompt(diff: PlanDiff, eventType: string): string {
  return `You are a learning mentor explaining a plan change to a student.

WHAT CHANGED:
- Event: ${eventType}
- Hours kept: ${diff.keptHours}h (${(diff.preservedPct * 100).toFixed(0)}% of previous plan)
- Hours added: ${diff.addedHours}h
- Hours removed: ${diff.removedHours}h
- Hours rescheduled: ${diff.adjustedHours}h
- Notes: ${diff.notes.join("; ")}

Write a warm, encouraging 1-2 sentence message explaining what changed and why it helps the learner.
Keep it under 200 characters.

Return JSON: { message }`;
}

// ─── Profile prompt ───────────────────────────────────────────────────────────

export function profilePrompt(resumeText: string): string {
  const knownSkills = ["python", "javascript", "typescript", "html", "sql",
    "react", "nextjs", "nodejs", "rest-api", "git", "pandas", "numpy",
    "data-viz", "statistics", "excel", "ml-basics", "prompt-eng", "llm-apis",
    "vector-db", "fastapi", "docker", "cloud-deploy", "postgres", "nosql", "testing"];

  return `You are a skills extractor. Extract skills from this resume/text.

RESUME TEXT:
${resumeText.slice(0, 2000)}

KNOWN SKILL IDS (use ONLY these):
${knownSkills.join(", ")}

Rate each detected skill from 0-5:
0=no knowledge, 1=aware, 2=basic, 3=intermediate, 4=proficient, 5=expert

Return JSON: { skills: [{ skillId, level }] }
Only include skills mentioned or strongly implied in the text.`;
}

// ─── Fallback templates ───────────────────────────────────────────────────────

export function plannerRationale(skillId: string): string {
  return `Scheduled based on prerequisite order and skill priority for ${skillId}.`;
}

export function criticVerdict(weeklyHours: number, limit: number): string {
  if (weeklyHours > limit) {
    return `Plan rejected: ${weeklyHours.toFixed(1)}h/week exceeds ${limit.toFixed(1)}h limit. Compression applied.`;
  }
  return "Plan accepted. Weekly average is within budget.";
}

export function mentorTemplate(diff: PlanDiff): string {
  const pct = (diff.preservedPct * 100).toFixed(0);
  const added = diff.addedHours > 0 ? `${diff.addedHours}h of new content added. ` : "";
  return `${added}${pct}% of your previous learning is preserved in the updated plan.`;
}

