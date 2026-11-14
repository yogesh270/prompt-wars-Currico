# PromptWars × RTC MVP — Zero-Placeholder Contracts

> All interfaces, schemas, and function signatures are implementation-ready.
> No `any`, no `TODO`, no placeholder types.
> Source: `spec.md` + resolved grill-me session (2026-11-14).

---

## 1. TypeScript Interfaces (`src/lib/types.ts`)

```ts
// ─── Primitives ───────────────────────────────────────────────────────────────

export type SkillLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type RoleId = "full-stack" | "data-analyst" | "ai-backend";
export type AgentName =
  | "profile" | "gap" | "planner" | "critic" | "assessor" | "mentor";
export type ModuleDiff = "kept" | "added" | "adjusted" | "removed";
export type AgentStatus = "ok" | "warn" | "error";
export type AdaptEventType = "QUIZ_FAILED" | "GOAL_CHANGED";

// ─── Seed Entities ────────────────────────────────────────────────────────────

export interface Skill {
  id: string;
  name: string;
  prereqs: string[];   // skillId[] — ordered prerequisites
  aliases: string[];
}

export interface RoleRequirement {
  skillId: string;
  level: SkillLevel;
  weight: number;      // 1–5; used in readiness formula and priority
  mustHave: boolean;
}

export interface Role {
  id: RoleId;
  title: string;
  requirements: RoleRequirement[];
}

export interface Course {
  id: string;
  title: string;
  provider: string;
  url: string;
  skills: string[];        // skillId[] this course covers
  level: SkillLevel;
  hours: number;
  format: "course" | "video" | "project" | "docs";
}

export interface QuizQuestion {
  questionId: string;
  roleId: RoleId;
  skillId: string;         // which skill this question tests
  question: string;
  options: string[];       // exactly 4 options
  answerKey: string;       // must match one of options exactly
}

// ─── Learner ──────────────────────────────────────────────────────────────────

export interface LearnerSkill {
  skillId: string;
  level: SkillLevel;
  confidence: number;      // 0–1
  evidence: string[];
}

export interface Learner {
  id: string;
  name: string;
  skills: LearnerSkill[];
  targetRoleId: RoleId;
  hoursPerWeek: number;    // e.g. 5 for Priya
  completedModuleIds: string[];  // module.id values
}

// ─── Gap Analysis ─────────────────────────────────────────────────────────────

export interface GapItem {
  skillId: string;
  current: number;         // learner's current level (0–5)
  required: number;        // role's required level (0–5)
  weight: number;          // role requirement weight (1–5)
  priority: number;        // = (required − current) × weight
}

export interface GapReport {
  readiness: number;       // = Σ(min(current,required)×weight) / Σ(required×weight)
  missing: GapItem[];      // skills where current < required, sorted by priority DESC
  strengths: GapItem[];    // skills where current >= required, sorted by weight DESC
  summary: string;
}

// ─── Plan ─────────────────────────────────────────────────────────────────────

export interface Module {
  id: string;              // stable: `${skillId}:${courseId}`
  skillId: string;
  courseId: string;
  title: string;
  week: number;            // 1-indexed
  hours: number;
  rationale: string;
  status: "todo" | "in-progress" | "done";
  diff?: ModuleDiff;       // set by computePlanDiff(); absent on v1
}

export interface Plan {
  id: string;              // UUID, stable across versions
  version: number;         // increments on each compression / adaptation
  roleId: RoleId;
  modules: Module[];
  totalHours: number;      // = Σ(module.hours)
  weeklyHours: number;     // = totalHours / numberOfWeeks (average)
  numberOfWeeks: number;   // = max(module.week)
  createdAt: string;       // ISO-8601
}

export interface PlanDiff {
  keptHours: number;       // Σ hours of modules with diff="kept"
  addedHours: number;      // Σ hours of modules with diff="added"
  adjustedHours: number;   // Σ hours of modules with diff="adjusted"
  removedHours: number;    // Σ hours of modules with diff="removed"
  preservedPct: number;    // = keptHours / oldPlan.totalHours  (0–1)
  notes: string[];
}

// ─── Agent Envelopes ──────────────────────────────────────────────────────────

export interface AgentEnvelope<T = unknown> {
  id: string;              // UUID
  agent: AgentName;
  input: unknown;
  output: T;
  rationale: string;
  latencyMs: number;
  status: AgentStatus;
  createdAt: string;       // ISO-8601
}

export interface AgentErrorOutput {
  fallback: true;
  reason: string;
}

// ─── API Request / Response ───────────────────────────────────────────────────

export type AdaptEvent =
  | { type: "QUIZ_FAILED"; answers: Record<string, string> }  // questionId → chosen option
  | { type: "GOAL_CHANGED"; targetRoleId: RoleId };

export interface PlanRequest {
  learner: Learner;
  resumeText?: string;
}

export interface AdaptRequest {
  learner: Learner;
  currentPlan: Plan;
  event: AdaptEvent;
}

export interface PlanResponse {
  plan: Plan;
  gap: GapReport;
  trace: AgentEnvelope[];
  degraded?: boolean;      // true if any LLM call fell back to deterministic
}

export interface AdaptResponse {
  plan: Plan;
  diff: PlanDiff;
  trace: AgentEnvelope[];
  mentorMessage: string;
  degraded?: boolean;
}

export interface HealthResponse {
  ok: boolean;
  model: string;
  latencyMs: number;
  error?: string;
}

// ─── Client State ─────────────────────────────────────────────────────────────

export interface RunRecord {
  planId: string;          // = plan.id; key for localStorage
  learner: Learner;
  plan: Plan;
  trace: AgentEnvelope[];
}

export interface AppState {
  learner: Learner;
  plan: Plan | null;
  gap: GapReport | null;
  diff: PlanDiff | null;
  trace: AgentEnvelope[];
  mentorMessage: string;
  mode: "live" | "replay";
  mounted: boolean;
  loading: boolean;
  error: string | null;
}

export type AppAction =
  | { type: "SET_MOUNTED" }
  | { type: "SET_MODE"; payload: "live" | "replay" }
  | { type: "SET_LEARNER"; payload: Partial<Learner> }
  | { type: "SET_PLAN_RESPONSE"; payload: PlanResponse }
  | { type: "SET_ADAPT_RESPONSE"; payload: AdaptResponse }
  | { type: "SET_STATE"; payload: Omit<AppState, "mounted" | "loading" | "error"> }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string }
  | { type: "RESET_DEMO" };

// ─── Replay Cache ─────────────────────────────────────────────────────────────

export interface ReplayCache {
  initial: PlanResponse;
  afterQuizFail: AdaptResponse;
  afterGoalChange: AdaptResponse;
}
```

---

## 2. Engine Function Signatures (`src/lib/engine.ts`)

```ts
import type {
  Learner, Role, Plan, GapReport, PlanDiff, Module
} from "./types";

/**
 * Compute skill gap between learner and role.
 * readiness = Σ(min(current,required)×weight) / Σ(required×weight)
 * GapItem.priority = (required − current) × weight
 */
export function computeGap(learner: Learner, role: Role): GapReport;

/**
 * Build a draft plan from gap items.
 * - Orders modules by topological prerequisite order.
 * - Packs courses into weeks up to `budget` hours, overflowing to next week.
 * - Sets totalHours, weeklyHours (avg), numberOfWeeks.
 */
export function buildDraftPlan(
  gap: GapReport,
  role: Role,
  budget: number,
): Plan;

/**
 * Validate a plan against the learner's budget.
 * Returns ok=false if weeklyHours > budget × 1.1 or any prerequisite is violated.
 */
export function validatePlan(
  plan: Plan,
  budget: number,
): { ok: boolean; issues: string[] };

/**
 * Compress a plan by extending numberOfWeeks until weeklyHours ≤ budget.
 * Does NOT drop any modules. Increments plan.version.
 */
export function compressPlan(plan: Plan, budget: number): Plan;

/**
 * Compute a diff between two plan versions.
 * Identity key: module.courseId
 * preservedPct = keptHours / oldPlan.totalHours
 */
export function computePlanDiff(oldPlan: Plan, newPlan: Plan): PlanDiff;

/**
 * Grade a quiz deterministically from the seed answer key.
 * passed = score > 0.5 (≥2/3 correct)
 * weakSkillIds: skillId for each wrong answer
 */
export function gradeQuiz(
  roleId: import("./types").RoleId,
  answers: Record<string, string>,   // questionId → chosen option string
): { score: number; passed: boolean; weakSkillIds: string[] };

/**
 * Insert remediation modules for weak skills at the given week.
 * Returns the updated module list (does not mutate input).
 */
export function insertRemediationModules(
  modules: Module[],
  weakSkillIds: string[],
  atWeek: number,
  roleId: import("./types").RoleId,
): Module[];

/**
 * Reduce total hours in the specified week by 20%.
 * Removes lowest-priority modules from that week until
 * weekHours ≤ originalWeekHours × 0.8, rounded down to nearest 0.5h.
 * Returns updated module list (does not mutate input).
 */
export function reduceWeekLoad(
  modules: Module[],
  week: number,
  reductionFactor?: number,   // default 0.8
): Module[];
```

---

## 3. LLM Wrapper (`src/lib/llm.ts`)

```ts
import type { AgentEnvelope, AgentErrorOutput, AgentName } from "./types";

/**
 * Wraps an async LLM call in an AgentEnvelope.
 * On success: status="ok", output=result, rationale from LLM.
 * On failure: status="error", output={ fallback: true, reason }, rationale="deterministic fallback: <reason>".
 * Never throws. Always returns a completed envelope.
 */
export async function timedEnvelope<T>(
  agent: AgentName,
  input: unknown,
  fn: () => Promise<{ output: T; rationale: string }>,
  fallback: () => { output: T; rationale: string },
): Promise<AgentEnvelope<T | AgentErrorOutput>>;
```

---

## 4. Zod Schemas (`src/lib/schemas.ts`)

```ts
import { z } from "zod";

export const PlannerOutputSchema = z.object({
  modules: z.array(z.object({
    moduleId: z.string(),        // must be `${skillId}:${courseId}` from seed
    week: z.number().int().positive(),
    rationale: z.string().max(120),
  })),
  summary: z.string().max(300),
});

export const CriticOutputSchema = z.object({
  verdict: z.enum(["pass", "revise"]),
  rationale: z.string().max(200),
});

export const MentorOutputSchema = z.object({
  message: z.string().max(200),
});

export const ProfileOutputSchema = z.object({
  skills: z.array(z.object({
    skillId: z.string(),
    level: z.number().int().min(0).max(5),
  })),
});

export const HealthCheckSchema = z.object({
  status: z.literal("ok"),
});

export type PlannerOutput = z.infer<typeof PlannerOutputSchema>;
export type CriticOutput  = z.infer<typeof CriticOutputSchema>;
export type MentorOutput  = z.infer<typeof MentorOutputSchema>;
export type ProfileOutput = z.infer<typeof ProfileOutputSchema>;
```

---

## 5. Route Contracts

### `POST /api/plan` (`src/app/api/plan/route.ts`)

```
export const maxDuration = 60;
export const dynamic = "force-dynamic";

Request body (JSON):  PlanRequest  = { learner: Learner, resumeText?: string }
Response (HTTP 200):  PlanResponse = { plan, gap, trace, degraded? }

Pipeline:
  1. [optional] Profile agent (LLM)   — only if resumeText present
     fallback: use learner.skills as-is
  2. Gap agent (deterministic)         — computeGap(learner, role)
  3. Draft (deterministic)             — buildDraftPlan(gap, role, budget)
  4. Planner agent (LLM)               — returns PlannerOutput; hydrate from seed
     fallback: buildDraftPlan output + template rationales
  5. Critic agent (rule)               — validatePlan(plan, budget)
     If ok=false AND attempts < 2:
       5a. compressPlan(plan, budget)
       5b. Planner retry (LLM)         — max 1 retry
       5c. Critic rule re-check
     fallback for LLM critic: deterministic rule verdict only
  6. Assemble PlanResponse; set degraded=true if any envelope.status="error"
```

### `POST /api/adapt` (`src/app/api/adapt/route.ts`)

```
export const maxDuration = 60;
export const dynamic = "force-dynamic";

Request body (JSON):  AdaptRequest   = { learner, currentPlan, event }
Response (HTTP 200):  AdaptResponse  = { plan, diff, trace, mentorMessage, degraded? }

Pipeline (QUIZ_FAILED):
  1. Assessor (deterministic) — gradeQuiz(roleId, event.answers)
  2. insertRemediationModules(currentPlan.modules, weakSkillIds, firstIncompleteWeek + 1, roleId)
  3. reduceWeekLoad(modules, firstIncompleteWeek + 1, 0.8)
  4. Planner retry (LLM, optional)   — reorder/rationale only; fallback: keep order
  5. Critic (rule)                   — validatePlan(newPlan, budget)
  6. Mentor (LLM)                    — 2-sentence explanation; fallback: template
  7. computePlanDiff(currentPlan, newPlan)
  8. Return AdaptResponse

Pipeline (GOAL_CHANGED):
  1. computeGap(learner with new targetRoleId, newRole)
  2. buildDraftPlan(gap, newRole, budget)
  3. Planner (LLM)                   — fallback: buildDraftPlan output
  4. Critic (rule)                   — validatePlan + optional compressPlan
  5. Mentor (LLM)                    — fallback: template from diff
  6. computePlanDiff(currentPlan, newPlan)
  7. Return AdaptResponse
```

### `GET /api/health/llm` (`src/app/api/health/llm/route.ts`)

```
Response (HTTP 200 always): HealthResponse = { ok, model, latencyMs, error? }
On LLM failure: ok=false, error=err.message — never 500.
```

---

## 6. Deterministic Fallback Templates

```ts
// Planner fallback rationale (per module)
const plannerRationale = (skillId: string) =>
  `Scheduled based on prerequisite order and skill priority for ${skillId}.`;

// Critic fallback
const criticPass    = "Plan accepted. Weekly average is within budget.";
const criticRevise  = (weeklyHours: number, limit: number) =>
  `Plan rejected: ${weeklyHours.toFixed(1)}h/week exceeds ${limit.toFixed(1)}h limit. Compression applied.`;

// Mentor fallback
const mentorTemplate = (diff: PlanDiff) =>
  `${diff.addedHours > 0 ? diff.addedHours + 'h of new content added. ' : ''}` +
  `${(diff.preservedPct * 100).toFixed(0)}% of your previous learning is preserved.`;
```

---

## 7. `src/data/replay.ts` Contract

```ts
import type { ReplayCache } from "@/lib/types";

export const replayCache: ReplayCache = {
  initial: { ... } satisfies PlanResponse,
  afterQuizFail: { ... } satisfies AdaptResponse,
  afterGoalChange: { ... } satisfies AdaptResponse,
};
```

> [!IMPORTANT]
> `replay.ts` MUST be regenerated after every breaking API change.
> Use `satisfies` (not `as`) to catch type drift at compile time.

