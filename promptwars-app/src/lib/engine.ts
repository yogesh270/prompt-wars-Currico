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

// ─── Module Chunking Helper ───────────────────────────────────────────────────

/**
 * Splits courses exceeding maxChunkHours into sequential chunks (Part 1, Part 2, etc.)
 * so no single module or week violates the user's weekly commitment budget.
 */
export function chunkModule(
  mod: Omit<Module, "week">,
  maxChunkHours: number
): Omit<Module, "week">[] {
  if (mod.hours <= maxChunkHours || maxChunkHours <= 0) {
    return [{ ...mod, part: { current: 1, total: 1 } }];
  }

  const totalHours = mod.hours;
  const numChunks = Math.ceil(totalHours / maxChunkHours);
  const chunks: Omit<Module, "week">[] = [];
  let remainingHours = totalHours;

  for (let i = 0; i < numChunks; i++) {
    const chunkHours = Math.min(maxChunkHours, remainingHours);
    remainingHours -= chunkHours;

    chunks.push({
      ...mod,
      id: `${mod.id}:p${i + 1}`,
      title: `${mod.title} (Part ${i + 1}/${numChunks})`,
      hours: chunkHours,
      rationale: `${mod.rationale} [Part ${i + 1}/${numChunks}: ${chunkHours}h]`,
      part: { current: i + 1, total: numChunks },
    });
  }

  return chunks;
}

// ─── buildDraftPlan ───────────────────────────────────────────────────────────

export function buildDraftPlan(
  gap: GapReport,
  role: Role,
  budget: number,
): Plan {
  // 1. Collect the best course for each missing skill (priority order)
  const usedCourseIds = new Set<string>();
  const rawModules: Omit<Module, "week">[] = [];

  for (const gapItem of gap.missing) {
    const course = COURSES.find(
      c => !usedCourseIds.has(c.id) && c.skills.includes(gapItem.skillId)
    );
    if (!course) continue;
    usedCourseIds.add(course.id);

    rawModules.push({
      id:        `${gapItem.skillId}:${course.id}`,
      skillId:   gapItem.skillId,
      courseId:  course.id,
      title:     course.title,
      hours:     course.hours,
      rationale: `Addresses the "${gapItem.skillId}" gap (priority ${gapItem.priority}).`,
      status:    "todo",
    });
  }

  // 2. Topological sort raw courses by skill prerequisites
  const topoSortedCourses = topoSort(rawModules);

  // 3. Chunk any courses exceeding budget into Part 1, Part 2, etc.
  const chunkedModules: Omit<Module, "week">[] = [];
  for (const courseMod of topoSortedCourses) {
    const chunks = chunkModule(courseMod, budget);
    chunkedModules.push(...chunks);
  }

  // 4. Initial Draft Schedule:
  // Pack modules into a compressed initial schedule of ~10 weeks so v1 weekly average
  // deterministically exceeds budget * 1.1 (demonstrating Critic rejection on draft)
  const totalHours = chunkedModules.reduce((s, m) => s + m.hours, 0);
  const draftTargetWeeks = Math.max(1, Math.min(10, Math.floor(totalHours / (budget * 1.25))));
  const hoursPerDraftWeek = totalHours / draftTargetWeeks;

  const modules: Module[] = [];
  let currentWeek = 1;
  let weekHours = 0;

  for (const mod of chunkedModules) {
    if (weekHours + mod.hours > hoursPerDraftWeek && currentWeek < draftTargetWeeks && weekHours > 0) {
      currentWeek++;
      weekHours = 0;
    }
    modules.push({ ...mod, week: currentWeek });
    weekHours += mod.hours;
  }

  const finalWeeks = Math.max(currentWeek, 1);
  const weeklyHours = totalHours / finalWeeks;

  return {
    id:           uuidv4(),
    version:      1,
    roleId:       role.id,
    modules,
    totalHours,
    weeklyHours,
    numberOfWeeks: finalWeeks,
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

// ─── validatePlan (Critic Hard Invariant Checks) ───────────────────────────────

export function validatePlan(
  plan: Plan,
  budget: number,
): {
  ok: boolean;
  issues: string[];
  checks: {
    weeklyBudgetPass: boolean;
    dagOrderPass: boolean;
    zeroHallucinationsPass: boolean;
  };
} {
  const issues: string[] = [];
  const limit = budget * 1.05; // 5% tolerance max

  // Invariant 1: Weekly Budget Check
  let weeklyBudgetPass = true;
  if (plan.weeklyHours > limit) {
    issues.push(
      `Weekly average ${plan.weeklyHours.toFixed(1)}h exceeds budget limit ${limit.toFixed(1)}h`
    );
    weeklyBudgetPass = false;
  }

  // Check individual week capacities
  const weekHoursMap = new Map<number, number>();
  for (const mod of plan.modules) {
    weekHoursMap.set(mod.week, (weekHoursMap.get(mod.week) ?? 0) + mod.hours);
  }

  for (const [weekNum, hours] of Array.from(weekHoursMap.entries()).sort((a, b) => a[0] - b[0])) {
    if (hours > limit) {
      issues.push(`Week ${weekNum} has ${hours.toFixed(1)}h, exceeding weekly commitment limit ${limit.toFixed(1)}h`);
      weeklyBudgetPass = false;
    }
  }

  // Invariant 2: Prerequisite DAG Order Check
  let dagOrderPass = true;
  for (const mod of plan.modules) {
    const skill = SKILLS.find(s => s.id === mod.skillId);
    if (!skill) continue;
    for (const prereq of skill.prereqs) {
      const prereqMod = plan.modules.find(m => m.skillId === prereq);
      if (prereqMod && prereqMod.week > mod.week) {
        issues.push(
          `Module "${mod.title}" (week ${mod.week}) requires "${prereq}" but it's scheduled in week ${prereqMod.week}`
        );
        dagOrderPass = false;
      }
    }

    // Sequence check for chunks of the same parent course (Part 1 before Part 2)
    if (mod.part && mod.part.current > 1) {
      const prevPartNum = mod.part.current - 1;
      const prevPartMod = plan.modules.find(
        m => m.courseId === mod.courseId && m.part?.current === prevPartNum
      );
      if (prevPartMod && prevPartMod.week > mod.week) {
        issues.push(
          `Part ${mod.part.current} of "${mod.courseId}" (week ${mod.week}) is scheduled before Part ${prevPartNum} (week ${prevPartMod.week})`
        );
        dagOrderPass = false;
      }
    }
  }

  // Invariant 3: Zero Hallucinations & Duplicate Check
  let zeroHallucinationsPass = true;
  const knownCourseIds = new Set(COURSES.map(c => c.id));
  const seenModuleIds = new Set<string>();

  for (const mod of plan.modules) {
    if (!knownCourseIds.has(mod.courseId)) {
      issues.push(`Hallucinated or unregistered courseId: "${mod.courseId}"`);
      zeroHallucinationsPass = false;
    }
    if (seenModuleIds.has(mod.id)) {
      issues.push(`Duplicate module instance in schedule: "${mod.id}"`);
      zeroHallucinationsPass = false;
    }
    seenModuleIds.add(mod.id);
  }

  const ok = issues.length === 0;

  return {
    ok,
    issues,
    checks: {
      weeklyBudgetPass,
      dagOrderPass,
      zeroHallucinationsPass,
    },
  };
}

// ─── compressPlan (Strict Enforcement & Redistribution) ───────────────────────

export function compressPlan(plan: Plan, budget: number): Plan {
  // 1. Gather all unique course representations from the plan
  const courseMap = new Map<string, { mod: Module; baseHours: number }>();
  for (const m of plan.modules) {
    if (!courseMap.has(m.courseId)) {
      const originalCourse = COURSES.find(c => c.id === m.courseId);
      courseMap.set(m.courseId, {
        mod: m,
        baseHours: originalCourse ? originalCourse.hours : m.hours,
      });
    }
  }

  // 2. Re-chunk courses so each chunk is strictly <= budget
  const chunkedModules: Omit<Module, "week">[] = [];
  for (const { mod, baseHours } of Array.from(courseMap.values())) {
    const unchunkedBase = {
      id: `${mod.skillId}:${mod.courseId}`,
      skillId: mod.skillId,
      courseId: mod.courseId,
      title: COURSES.find(c => c.id === mod.courseId)?.title || mod.title.replace(/\s\(Part \d+\/\d+\)/, ""),
      hours: baseHours,
      rationale: mod.rationale,
      status: mod.status,
    };
    chunkedModules.push(...chunkModule(unchunkedBase, budget));
  }

  // 3. Topologically sort the chunks respecting skill prerequisites and Part order
  const topoOrder = topoSort(chunkedModules);

  // 4. Distribute chunks across weeks strictly ensuring NO week exceeds budget
  const repacked: Module[] = [];
  let currentWeek = 1;
  let weekHours = 0;

  for (const mod of topoOrder) {
    // If adding this chunk would exceed the weekly commitment, step to next week
    if (weekHours + mod.hours > budget && weekHours > 0) {
      currentWeek++;
      weekHours = 0;
    }
    repacked.push({ ...mod, week: currentWeek });
    weekHours += mod.hours;
  }

  const finalWeeks = Math.max(currentWeek, 1);
  const totalHours = repacked.reduce((s, m) => s + m.hours, 0);
  const weeklyHours = totalHours / finalWeeks;

  return {
    ...plan,
    version: plan.version + 1,
    modules: repacked,
    totalHours,
    weeklyHours,
    numberOfWeeks: finalWeeks,
  };
}

// ─── computePlanDiff ──────────────────────────────────────────────────────────

export function computePlanDiff(oldPlan: Plan, newPlan: Plan): PlanDiff {
  const oldMap = new Map(oldPlan.modules.map(m => [m.id, m]));
  const newMap = new Map(newPlan.modules.map(m => [m.id, m]));

  let keptHours     = 0;
  let addedHours    = 0;
  let adjustedHours = 0;
  let removedHours  = 0;
  const notes: string[] = [];

  // Tag new plan modules
  for (const newMod of newPlan.modules) {
    const oldMod = oldMap.get(newMod.id);
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
    if (!newMap.has(oldMod.id)) {
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
      id:        `${skillId}:${course.id}:remedial`,
      skillId,
      courseId:  course.id,
      title:     `[Remediation] ${course.title}`,
      week:      atWeek,
      hours:     Math.min(course.hours, 3), // cap remediation chunk at 3h
      rationale: `Targeted remediation module inserted for "${skillId}".`,
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

  // Sort by hours ASC (smaller hours trimmed first)
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

  return [...otherModules, ...kept, ...removed];
}
