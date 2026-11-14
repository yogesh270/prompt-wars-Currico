import { v4 as uuidv4 } from "uuid";
import type {
  Learner, Role, GapReport, GapItem, Plan, Module,
  PlanDiff, RoleId,
} from "./types";
import { SKILLS, COURSES, QUIZ_QUESTIONS } from "./seed";

// ─── computeGap ───────────────────────────────────────────────────────────────

export function computeGap(learner: Learner, role: Role): GapReport {
  let numerator = 0;
  let denominator = 0;
  const missing: GapItem[] = [];
  const strengths: GapItem[] = [];

  for (const req of role.requirements) {
    const ls = learner.skills.find(s => s.skillId === req.skillId);
    const current = ls?.level ?? 0;
    const required = req.level;
    const weight = req.weight;

    numerator   += Math.min(current, required) * weight;
    denominator += required * weight;

    const item: GapItem = {
      skillId:  req.skillId,
      current,
      required,
      weight,
      priority: (required - current) * weight,
    };

    if (current < required) missing.push(item);
    else                    strengths.push(item);
  }

  const readiness = denominator === 0 ? 0 : numerator / denominator;

  missing.sort((a, b) => b.priority - a.priority);
  strengths.sort((a, b) => b.weight - a.weight);

  const topGaps = missing.slice(0, 3).map(g => {
    const skill = SKILLS.find(s => s.id === g.skillId);
    return skill?.name ?? g.skillId;
  }).join(", ");

  const summary =
    `Readiness: ${(readiness * 100).toFixed(0)}%. ` +
    `Top gaps: ${topGaps || "none"}. ` +
    `Strengths: ${strengths.length} skill(s) at or above target.`;

  return { readiness, missing, strengths, summary };
}

// ─── buildDraftPlan ───────────────────────────────────────────────────────────

export function buildDraftPlan(
  gap: GapReport,
  role: Role,
  budget: number,
): Plan {
  // 1. Collect the best course for each missing skill (priority order)
  const usedCourseIds = new Set<string>();
  const orderedModules: Omit<Module, "week">[] = [];

  for (const gapItem of gap.missing) {
    const course = COURSES.find(
      c => !usedCourseIds.has(c.id) && c.skills.includes(gapItem.skillId)
    );
    if (!course) continue;
    usedCourseIds.add(course.id);
    orderedModules.push({
      id:        `${gapItem.skillId}:${course.id}`,
      skillId:   gapItem.skillId,
      courseId:  course.id,
      title:     course.title,
      hours:     course.hours,
      rationale: `Addresses the "${gapItem.skillId}" gap (priority ${gapItem.priority}).`,
      status:    "todo",
    });
  }

  // 2. Topological sort by prerequisites
  const topoSorted = topoSort(orderedModules);

  // 3. Pack into weeks
  const modules: Module[] = [];
  let currentWeek = 1;
  let weekHours   = 0;

  for (const mod of topoSorted) {
    if (weekHours + mod.hours > budget && weekHours > 0) {
      currentWeek++;
      weekHours = 0;
    }
    modules.push({ ...mod, week: currentWeek });
    weekHours += mod.hours;
  }

  const totalHours    = modules.reduce((s, m) => s + m.hours, 0);
  const numberOfWeeks = currentWeek;
  const weeklyHours   = numberOfWeeks === 0 ? 0 : totalHours / numberOfWeeks;

  return {
    id:           uuidv4(),
    version:      1,
    roleId:       role.id,
    modules,
    totalHours,
    weeklyHours,
    numberOfWeeks,
    createdAt:    new Date().toISOString(),
  };
}

// Topological sort of modules based on skill prerequisites
function topoSort(modules: Omit<Module, "week">[]): Omit<Module, "week">[] {
  const result: Omit<Module, "week">[] = [];
  const placed = new Set<string>();

  const findSkillDeps = (skillId: string): string[] => {
    const skill = SKILLS.find(s => s.id === skillId);
    return skill?.prereqs ?? [];
  };

  const place = (mod: Omit<Module, "week">, depth = 0): void => {
    if (placed.has(mod.id) || depth > 50) return;
    // Place all prerequisite modules first
    for (const prereqSkill of findSkillDeps(mod.skillId)) {
      const prereqMod = modules.find(m => m.skillId === prereqSkill);
      if (prereqMod && !placed.has(prereqMod.id)) {
        place(prereqMod, depth + 1);
      }
    }
    if (!placed.has(mod.id)) {
      placed.add(mod.id);
      result.push(mod);
    }
  };

  for (const mod of modules) place(mod);
  return result;
}

// ─── validatePlan ─────────────────────────────────────────────────────────────

export function validatePlan(
  plan: Plan,
  budget: number,
): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  const limit = budget * 1.1;

  if (plan.weeklyHours > limit) {
    issues.push(
      `Weekly average ${plan.weeklyHours.toFixed(1)}h exceeds budget limit ${limit.toFixed(1)}h`
    );
  }

  // Check prerequisite ordering
  const scheduledSkillsByWeek = new Map<number, Set<string>>();
  for (const mod of plan.modules) {
    if (!scheduledSkillsByWeek.has(mod.week)) {
      scheduledSkillsByWeek.set(mod.week, new Set());
    }
    scheduledSkillsByWeek.get(mod.week)!.add(mod.skillId);
  }

  for (const mod of plan.modules) {
    const skill = SKILLS.find(s => s.id === mod.skillId);
    if (!skill) continue;
    for (const prereq of skill.prereqs) {
      const prereqMod = plan.modules.find(m => m.skillId === prereq);
      if (prereqMod && prereqMod.week >= mod.week) {
        issues.push(
          `Module "${mod.title}" (week ${mod.week}) requires "${prereq}" but it's scheduled in week ${prereqMod.week}`
        );
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

// ─── compressPlan ─────────────────────────────────────────────────────────────

export function compressPlan(plan: Plan, budget: number): Plan {
  // Compute target number of weeks needed for average ≤ budget
  // We need: totalHours / targetWeeks ≤ budget
  // → targetWeeks ≥ ceil(totalHours / budget)
  const targetWeeks = Math.min(52, Math.ceil(plan.totalHours / budget));

  // Redistribute: re-pack in topological order spreading across targetWeeks
  const topoOrder = topoSort(plan.modules.map(m => ({ ...m })));

  // Distribute modules across targetWeeks: assign module to current week,
  // start new week if adding it would exceed budget (but always place it somewhere)
  const repacked: Module[] = [];
  let currentWeek = 1;
  let weekHours   = 0;

  for (const mod of topoOrder) {
    // Start a new week if: current week is over budget AND we haven't exceeded targetWeeks
    if (weekHours > 0 && weekHours + mod.hours > budget && currentWeek < targetWeeks) {
      currentWeek++;
      weekHours = 0;
    }
    repacked.push({ ...mod, week: currentWeek });
    weekHours += mod.hours;
  }

  const finalWeeks  = Math.max(currentWeek, targetWeeks);
  const totalHours  = repacked.reduce((s, m) => s + m.hours, 0);
  const weeklyHours = totalHours / finalWeeks;

  return {
    ...plan,
    version:      plan.version + 1,
    modules:      repacked,
    weeklyHours,
    numberOfWeeks: finalWeeks,
  };
}

// ─── computePlanDiff ──────────────────────────────────────────────────────────

export function computePlanDiff(oldPlan: Plan, newPlan: Plan): PlanDiff {
  const oldMap = new Map(oldPlan.modules.map(m => [m.courseId, m]));
  const newMap = new Map(newPlan.modules.map(m => [m.courseId, m]));

  let keptHours     = 0;
  let addedHours    = 0;
  let adjustedHours = 0;
  let removedHours  = 0;
  const notes: string[] = [];

  // Tag new plan modules
  for (const newMod of newPlan.modules) {
    const oldMod = oldMap.get(newMod.courseId);
    if (!oldMod) {
      newMod.diff = "added";
      addedHours += newMod.hours;
    } else if (oldMod.week === newMod.week) {
      newMod.diff = "kept";
      keptHours += newMod.hours;
    } else {
      newMod.diff = "adjusted";
      adjustedHours += newMod.hours;
    }
  }

  // Find removed modules (in old but not in new)
  for (const oldMod of oldPlan.modules) {
    if (!newMap.has(oldMod.courseId)) {
      removedHours += oldMod.hours;
    }
  }

  const preservedPct = oldPlan.totalHours === 0
    ? 1
    : keptHours / oldPlan.totalHours;

  if (addedHours > 0)   notes.push(`${addedHours}h of new content added`);
  if (removedHours > 0) notes.push(`${removedHours}h removed`);
  if (adjustedHours > 0) notes.push(`${adjustedHours}h rescheduled`);

  return { keptHours, addedHours, adjustedHours, removedHours, preservedPct, notes };
}

// ─── gradeQuiz ────────────────────────────────────────────────────────────────

export function gradeQuiz(
  roleId: RoleId,
  answers: Record<string, string>,
): { score: number; passed: boolean; weakSkillIds: string[] } {
  const questions = QUIZ_QUESTIONS.filter(q => q.roleId === roleId);
  if (questions.length === 0) return { score: 1, passed: true, weakSkillIds: [] };

  let correct = 0;
  const weakSkillIds: string[] = [];

  for (const q of questions) {
    const answer = answers[q.questionId]; // undefined = not answered → wrong
    if (answer === q.answerKey) {
      correct++;
    } else {
      weakSkillIds.push(q.skillId);
    }
  }

  const score  = correct / questions.length;
  const passed = score > 0.5; // ≥2/3 correct

  return { score, passed, weakSkillIds };
}

// ─── insertRemediationModules ─────────────────────────────────────────────────

export function insertRemediationModules(
  modules: Module[],
  weakSkillIds: string[],
  atWeek: number,
  roleId: RoleId,
): Module[] {
  const existing = new Set(modules.map(m => m.courseId));
  const result = [...modules];

  for (const skillId of weakSkillIds) {
    // Find a remediation course covering this skill not already in plan
    const course = COURSES.find(c => c.skills.includes(skillId) && !existing.has(c.id));
    if (!course) continue;
    existing.add(course.id);
    result.push({
      id:        `${skillId}:${course.id}`,
      skillId,
      courseId:  course.id,
      title:     `[Remediation] ${course.title}`,
      week:      atWeek,
      hours:     Math.min(course.hours, 3), // cap remediation at 3h
      rationale: `Inserted because quiz indicated weakness in "${skillId}".`,
      status:    "todo",
      diff:      "added",
    });
  }

  return result;
}

// ─── reduceWeekLoad ───────────────────────────────────────────────────────────

export function reduceWeekLoad(
  modules: Module[],
  week: number,
  reductionFactor = 0.8,
): Module[] {
  const weekModules = modules.filter(m => m.week === week && m.diff !== "added");
  const otherModules = modules.filter(m => m.week !== week || m.diff === "added");

  const originalHours = weekModules.reduce((s, m) => s + m.hours, 0);
  const target = Math.floor((originalHours * reductionFactor) / 0.5) * 0.5;

  // Sort by priority ASC (remove lowest priority first)
  // Approximate priority from hours (smaller hours = lower priority in this context)
  const sorted = [...weekModules].sort((a, b) => a.hours - b.hours);

  let currentHours = originalHours;
  const kept: Module[] = [];
  const removed: Module[] = [];

  for (const mod of sorted) {
    if (currentHours <= target) {
      kept.push(mod);
    } else {
      currentHours -= mod.hours;
      removed.push({ ...mod, diff: "removed" });
    }
  }

  // Reverse: keep higher-priority (more hours) modules
  return [...otherModules, ...kept, ...removed];
}
