#!/usr/bin/env node
// Gate 1 verification script — run with: npx tsx --tsconfig scripts/tsconfig.json scripts/check-engine.ts

import { PRIYA_PERSONA, ROLES, QUIZ_QUESTIONS } from "../src/lib/seed";
import {
  computeGap, buildDraftPlan, validatePlan,
  compressPlan, computePlanDiff, gradeQuiz,
} from "../src/lib/engine";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS  ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

console.log("\n══════════════════════════════════════════════");
console.log("  PromptWars Engine Check — Gate 1");
console.log("══════════════════════════════════════════════\n");

const role = ROLES.find(r => r.id === "full-stack")!;
const budget = PRIYA_PERSONA.hoursPerWeek; // 5

console.log("Priya:", PRIYA_PERSONA.name, "| Goal:", role.title, "| Budget:", budget, "h/week\n");

// ── 1. computeGap ────────────────────────────────────────────────────────────
console.log("── computeGap ──");
const gap = computeGap(PRIYA_PERSONA, role);
console.log(`   readiness: ${(gap.readiness * 100).toFixed(1)}%`);
console.log(`   missing: ${gap.missing.map(g => g.skillId).join(", ")}`);
console.log(`   strengths: ${gap.strengths.map(g => g.skillId).join(", ")}`);

assert(gap.readiness >= 0.2 && gap.readiness <= 0.6, `readiness in [0.20, 0.60]`, `got ${gap.readiness.toFixed(3)}`);
assert(gap.missing.length >= 3, `at least 3 missing skills`, `got ${gap.missing.length}`);
assert(
  gap.missing.every((g, i) => i === 0 || gap.missing[i-1].priority >= g.priority),
  "missing sorted by priority DESC"
);
assert(
  gap.missing.every(g => g.priority === (g.required - g.current) * g.weight),
  "priority = (required - current) * weight"
);
console.log();

// ── 2. buildDraftPlan ─────────────────────────────────────────────────────────
console.log("── buildDraftPlan ──");
const draft = buildDraftPlan(gap, role, budget);
console.log(`   modules: ${draft.modules.length}`);
console.log(`   totalHours: ${draft.totalHours}h`);
console.log(`   weeklyHours: ${draft.weeklyHours.toFixed(2)}h (limit: ${(budget * 1.1).toFixed(1)}h)`);
console.log(`   numberOfWeeks: ${draft.numberOfWeeks}`);

assert(draft.modules.length > 0, "draft has modules");
assert(draft.totalHours > 0, "totalHours > 0");
assert(
  Math.abs(draft.weeklyHours - draft.totalHours / draft.numberOfWeeks) < 0.01,
  "weeklyHours = totalHours / numberOfWeeks"
);
assert(draft.weeklyHours > budget * 1.1, `v1 weekly hours (${draft.weeklyHours.toFixed(2)}) > ${(budget * 1.1).toFixed(1)}h — will be rejected`);
console.log();

// ── 3. validatePlan ───────────────────────────────────────────────────────────
console.log("── validatePlan ──");
const v1Check = validatePlan(draft, budget);
console.log(`   ok: ${v1Check.ok}`);
console.log(`   issues: ${v1Check.issues.join("; ") || "(none)"}`);

assert(!v1Check.ok, "v1 draft correctly REJECTED (ok=false)");
assert(v1Check.issues.length > 0, "has at least 1 issue");
console.log();

// ── 4. compressPlan ───────────────────────────────────────────────────────────
console.log("── compressPlan ──");
const compressed = compressPlan(draft, budget);
const v2Check = validatePlan(compressed, budget);
console.log(`   version: ${compressed.version}`);
console.log(`   weeklyHours after: ${compressed.weeklyHours.toFixed(2)}h`);
console.log(`   numberOfWeeks: ${compressed.numberOfWeeks}`);
console.log(`   modules count: ${compressed.modules.length}`);

assert(v2Check.ok, `compressed plan ACCEPTED (ok=true), weeklyHours=${compressed.weeklyHours.toFixed(2)}`);
assert(compressed.modules.length === draft.modules.length, "no modules dropped during compression");
assert(compressed.version === draft.version + 1, "version incremented");
console.log();

// ── 5. computePlanDiff ────────────────────────────────────────────────────────
console.log("── computePlanDiff (draft → compressed) ──");
const diff = computePlanDiff(draft, compressed);
console.log(`   keptHours: ${diff.keptHours}`);
console.log(`   adjustedHours: ${diff.adjustedHours}`);
console.log(`   preservedPct: ${(diff.preservedPct * 100).toFixed(1)}%`);

assert(diff.preservedPct >= 0 && diff.preservedPct <= 1, `preservedPct in [0,1]`, `got ${diff.preservedPct.toFixed(3)}`);
assert(
  draft.totalHours === 0 || Math.abs(diff.preservedPct - diff.keptHours / draft.totalHours) < 0.001,
  "preservedPct = keptHours / oldPlan.totalHours"
);
console.log();

// ── 6. gradeQuiz ─────────────────────────────────────────────────────────────
console.log("── gradeQuiz ──");

const fsQuestions = QUIZ_QUESTIONS.filter(q => q.roleId === "full-stack");

// All wrong
const allWrong: Record<string, string> = {};
for (const q of fsQuestions) {
  allWrong[q.questionId] = q.options.find(o => o !== q.answerKey) ?? q.options[0];
}
const failResult = gradeQuiz("full-stack", allWrong);
console.log(`   all-wrong score: ${(failResult.score * 100).toFixed(0)}%, passed: ${failResult.passed}`);
assert(!failResult.passed, "all-wrong → passed=false");
assert(failResult.weakSkillIds.length === 3, "all-wrong → 3 weakSkillIds");

// Two correct
const twoCorrect: Record<string, string> = {};
for (let i = 0; i < fsQuestions.length; i++) {
  const q = fsQuestions[i];
  twoCorrect[q.questionId] = i < 2 ? q.answerKey : (q.options.find(o => o !== q.answerKey) ?? q.options[0]);
}
const passResult = gradeQuiz("full-stack", twoCorrect);
console.log(`   two-correct score: ${(passResult.score * 100).toFixed(0)}%, passed: ${passResult.passed}`);
assert(passResult.passed, "two-correct → passed=true");
assert(passResult.weakSkillIds.length === 1, "two-correct → 1 weakSkillId");

// Missing answers treated as wrong
const missingResult = gradeQuiz("full-stack", {});
assert(!missingResult.passed, "missing answers → passed=false");
console.log();

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("══════════════════════════════════════════════");
console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
console.log("══════════════════════════════════════════════\n");

if (failed > 0) {
  console.error(`Gate 1 FAILED — fix the ${failed} failing assertion(s) above.\n`);
  process.exit(1);
} else {
  console.log("🎉  Gate 1 PASSED — engine is ready. Proceed to API routes.\n");
}
