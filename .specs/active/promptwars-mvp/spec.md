# PromptWars × RTC Hackathon — 5-Hour Zero-Infra MVP Specification

> **Scope:** This spec covers the deterministic engine, three LLM agents, two API routes,
> single-screen UI, and replay mode for a Vercel-deployed Next.js application.
> Source of truth: `5H-BUILD.md` + resolved grill-me session (2026-11-14).

---

## 1. Overview

A single-page adaptive learning planner. Given a learner's skills and a target role, the system:
1. Computes a skill gap deterministically.
2. Generates a week-by-week learning plan via LLM Planner.
3. Runs a deterministic Critic that rejects plans exceeding 110% of the weekly budget.
4. Adapts the plan on two event types: `QUIZ_FAILED` (insert remediation + cut 20% -week load) and `GOAL_CHANGED` (replan preserving overlapping skills).
5. Shows a live agent trace and plan diff in the UI.next
6. Falls back to fully deterministic output if any LLM call fails, returning `degraded: true` — never a 500.

**Deployment target:** Vercel Hobby (Node runtime, `maxDuration = 60`).  
**Demo persona:** Priya — Full Stack role, 5 h/week budget.  
**Hard constraint:** Zero external databases, auth, file uploads. `localStorage` is the only persistence layer.

---

## 2. Functional Requirements

### 2A — Deterministic Engine (`src/lib/engine.ts`)

- **FR-001:** `computeGap(learner, role)` returns a `GapReport` where:
  - `readiness = Σ(min(current, required) × weight) / Σ(required × weight)` over all role requirements.
  - Each `GapItem.priority = (required − current) × weight`.
  - `missing` is sorted by `priority` descending; `strengths` by `weight` descending.

- **FR-002:** `buildDraftPlan(gaps, role)` returns a `Plan` where:
  - Modules are ordered by topological prerequisite order (prerequisites scheduled before dependents).
  - Each module's `week` is assigned by packing courses into weeks up to `budget` hours, then overflowing to the next week.
  - `plan.totalHours = Σ(module.hours)`.
  - `plan.weeklyHours = totalHours / numberOfWeeks` (average, not peak).
  - `plan.id` is a stable UUID generated at creation time.

- **FR-003:** `validatePlan(plan, budget)` returns `{ ok: boolean, issues: string[] }` where:
  - `ok = false` if `plan.weeklyHours > budget × 1.1`.
  - `ok = false` if any module's prerequisite `skillId` is not addressed by an earlier-week module.
  - `issues[]` contains a human-readable string for each violation.

- **FR-004:** `compressPlan(plan, budget)` returns a valid `Plan` by:
  - Incrementing `numberOfWeeks` and re-distributing module `week` assignments until `plan.weeklyHours ≤ budget`.
  - No modules are dropped — only week assignments change.
  - Returns the compressed plan with `version` incremented.

- **FR-005:** `computePlanDiff(oldPlan, newPlan)` returns a `PlanDiff` where:
  - Identity key: `module.courseId` (stable across plan versions).
  - `kept`: same `courseId` in both plans, same `week`.
  - `adjusted`: same `courseId`, different `week`.
  - `removed`: `courseId` in `oldPlan` not found in `newPlan`.
  - `added`: `courseId` in `newPlan` not found in `oldPlan`.
  - `keptHours = Σ(hours of kept modules from oldPlan)`.
  - `preservedPct = keptHours / oldPlan.totalHours` (denominator is always the **old** plan's total).
  - Each diffed module has `Module.diff` set to `"kept" | "adjusted" | "removed" | "added"`.

- **FR-006:** `gradeQuiz(roleId, answers)` returns `{ score: number, passed: boolean, weakSkillIds: string[] }` where:
  - Answer key is from `src/lib/seed.ts` (3 MCQs per role, pre-authored).
  - `score = correctCount / 3` (0, 0.33, 0.67, or 1.0).
  - `passed = score > 0.5` (i.e. ≥ 2 of 3 correct).
  - `weakSkillIds`: the `skillId` mapped to each incorrectly-answered question.

### 2B — API Routes

- **FR-007:** `POST /api/plan` accepts `{ learner: Learner, resumeText?: string }` and returns `PlanResponse`.
  - Pipeline: Profile (optional LLM, only if `resumeText`) → Gap (deterministic) → Draft (deterministic) → Planner (LLM) → Critic (rule + optional LLM) → optional retry via `compressPlan()`.
  - If Critic rejects, run Planner once more on the compressed draft. Max 1 retry.

- **FR-008:** `POST /api/adapt` accepts `{ learner: Learner, currentPlan: Plan, event: AdaptEvent }` and returns `AdaptResponse`.
  - `QUIZ_FAILED` pipeline: Grade (deterministic) → insert remediation modules at `week = currentWeek + 1` → reduce next-week total hours by 20% (round down to nearest 0.5 h, applied by removing lowest-priority modules from that week until ≤ 80% of original) → Planner (LLM, optional) → Critic (rule) → Mentor (LLM) → diff.
  - `GOAL_CHANGED` pipeline: re-run Gap for new role → `buildDraftPlan()` → Planner (LLM) → Critic (rule) → Mentor (LLM) → diff.

- **FR-009:** `GET /api/health/llm` returns `{ ok: boolean, model: string, latencyMs: number, error?: string }`.
  - Makes one structured LLM call with a minimal Zod schema.
  - Must return `200` even on failure (`ok: false` in body).

- **FR-010:** Both `/api/plan` and `/api/adapt` export `maxDuration = 60` and `dynamic = 'force-dynamic'`.

### 2C — LLM Failure Containment

- **FR-011:** Every LLM call is wrapped in `timedEnvelope(agentName, fn)` which:
  - Records `latencyMs` from start to completion.
  - On any exception, sets `status: 'error'`, `output: { fallback: true, reason: err.message }`, `rationale: 'deterministic fallback: <reason>'`.
  - Continues the pipeline with the deterministic fallback value.
  - Returns the error envelope in `trace[]`.
  - Sets `degraded: true` on the final `PlanResponse` or `AdaptResponse`.
  - **Never** throws to the route handler; the route handler always returns `200`.

- **FR-012:** Deterministic fallbacks:
  - **Planner:** `buildDraftPlan(gaps, role)` output + template rationale (`"Scheduled based on prerequisite order and skill priority."`).
  - **Critic:** apply `validatePlan(plan, budget)` rule + template verdict (`"Plan accepted."` / `"Plan exceeds weekly budget; compression applied."`).
  - **Mentor:** template string built from `PlanDiff`: `"<added> modules added, <removed> removed. ${(preservedPct*100).toFixed(0)}% of your previous learning preserved."`.

### 2D — Client / UI

- **FR-013:** Page initializes with the Priya persona as the default state. `localStorage` is read in `useEffect` only. A skeleton is rendered until `mounted === true`.

- **FR-014:** State managed via `useReducer` with `AppAction` union type. `store.ts` exports `{ state, dispatch }`. A `useEffect` watching `state` persists `{ learner, plan, trace }` keyed by `plan.id` (UUID). Only the last 3 runs are stored; oldest is evicted on overflow.

- **FR-015:** `Live / Replay` toggle:
  - **Live:** calls `/api/plan` and `/api/adapt` via `fetch`.
  - **Replay:** `dispatch({ type: 'SET_STATE', payload: replayCache[scenario] })` — synchronous, no fetch, no network. Data lives in `src/data/replay.ts` typed as `satisfies PlanResponse`.

- **FR-016:** `Reset demo` action restores the Priya persona and clears all plans/traces from state and localStorage.

- **FR-017:** Quiz flow: 3 radio-button MCQs → submit → `POST /api/adapt` with `{ type: 'QUIZ_FAILED', answers }`. Solo cut: replace with a `Simulate failed assessment` button that auto-submits pre-wrong answers.

- **FR-018:** Role switch: confirm dialog → `POST /api/adapt` with `{ type: 'GOAL_CHANGED', targetRoleId }`.

- **FR-019:** UI renders diff badges (`kept` / `added` / `adjusted` / `removed`) on each module row and displays the computed `preservedPct` as a percentage. Never hardcodes 60%.

---

## 3. User Stories

- **US-001:** As Priya (5 h/week), I want to see my Full Stack skill gap so that I know what to learn.
- **US-002:** As Priya, I want the system to reject an overloaded plan and show me a compressed version so that my schedule is realistic.
- **US-003:** As Priya, I want to take a quiz, fail it, and see my plan adapted with remediation so that weak skills are reinforced.
- **US-004:** As Priya, I want to switch to Data Analyst and see which prior learning is preserved so that I understand the cost of changing goals.
- **US-005:** As a demo presenter, I want offline replay that never touches the network so that the demo survives a broken internet connection.
- **US-006:** As a judge, I want to see the agent trace with real latencies so that I can verify the system is live AI, not a mock.

---

## 4. Data Specifications

### Seed Data (`src/lib/seed.ts`)
- 3 roles: `full-stack`, `data-analyst`, `ai-backend` (cuttable to 2 per solo cut-list).
- 25 skills with prerequisite DAG (`prereqs: string[]`).
- 24 courses (8 per role), each with `{ id, title, provider, url, skills[], level, hours, format }`.
- 9 MCQs (3 per role): `{ questionId, roleId, skillId, question, options: string[], answerKey: string }`.
- Priya persona: `{ id: 'priya', name: 'Priya', targetRoleId: 'full-stack', hoursPerWeek: 5, skills: [...], completedModuleIds: [] }`.

### LLM Output Schemas (Zod, enforced server-side)
```ts
// Planner output
const PlannerOutputSchema = z.object({
  modules: z.array(z.object({
    moduleId: z.string(),   // must match `${skillId}:${courseId}` from seed
    week: z.number().int().positive(),
    rationale: z.string().max(120),
  })),
  summary: z.string().max(300),
});

// Critic output (optional LLM flavour)
const CriticOutputSchema = z.object({
  verdict: z.enum(['pass', 'revise']),
  rationale: z.string().max(200),
});

// Mentor output
const MentorOutputSchema = z.object({
  message: z.string().max(200),
});

// Profile output (optional, only when resumeText provided)
const ProfileOutputSchema = z.object({
  skills: z.array(z.object({
    skillId: z.string(),
    level: z.number().int().min(0).max(5),
  })),
});
```

### API Payload Shapes
```
POST /api/plan   body: { learner: Learner, resumeText?: string }
POST /api/adapt  body: { learner: Learner, currentPlan: Plan, event: AdaptEvent }
GET  /api/health/llm  → { ok: boolean, model: string, latencyMs: number, error?: string }
```

---

## 5. Acceptance Criteria

- **AC-001:** `computeGap(priya, fullStackRole)` returns `readiness` between 0.3–0.5 (Priya's partial Python/HTML coverage), `missing.length ≥ 3`, sorted by `priority` descending. *(Trace: FR-001)*

- **AC-002:** `buildDraftPlan(gaps, fullStackRole)` for Priya with 5 h/week produces a plan where `plan.weeklyHours > 5.5` (triggering rejection) and no module appears before its prerequisite. *(Trace: FR-002, FR-003)*

- **AC-003:** `validatePlan(draftPlan, 5)` returns `{ ok: false, issues: ['Weekly average Xh exceeds budget limit 5.5h'] }`. *(Trace: FR-003)*

- **AC-004:** `compressPlan(draftPlan, 5)` returns a plan where `validatePlan(compressedPlan, 5).ok === true` and `compressedPlan.modules.length === draftPlan.modules.length` (no modules dropped). *(Trace: FR-004)*

- **AC-005:** `computePlanDiff(oldPlan, newPlan)` where newPlan is the GOAL_CHANGED Data Analyst plan: `diff.preservedPct` is computed dynamically (Python/SQL skill modules retained as `kept`), not hardcoded. *(Trace: FR-005)*

- **AC-006:** `gradeQuiz('full-stack', allWrongAnswers)` returns `{ score: 0, passed: false, weakSkillIds: [3 skill IDs] }`. `gradeQuiz('full-stack', twoCorrectAnswers)` returns `{ passed: true }`. *(Trace: FR-006)*

- **AC-007:** After `QUIZ_FAILED` with all wrong answers: `adaptResponse.plan.modules` contains at least 1 new remediation module per weak skill inserted at `week = currentWeek + 1`, and next-week hours ≤ 80% of original next-week hours. *(Trace: FR-008)*

- **AC-008:** `POST /api/plan` for Priya returns `PlanResponse` with `trace` containing at minimum: a `critic` envelope with `status: 'ok'` and evidence of a prior rejection (v1 Planner envelope present), plus a `planner` retry envelope. *(Trace: FR-007)*

- **AC-009:** When the Planner LLM throws, `POST /api/plan` returns HTTP `200` with `{ degraded: true }` and a trace entry with `agent: 'planner', status: 'error'`. *(Trace: FR-011, FR-012)*

- **AC-010:** With DevTools set to Offline, toggling to Replay and clicking through all 3 demo beats (generate → quiz fail → goal change) completes without any network request. *(Trace: FR-015)*

- **AC-011:** On first render, the DOM matches the SSR output (Priya default state). After `useEffect`, `localStorage` state is applied and `mounted === true`. No hydration mismatch warning in console. *(Trace: FR-013)*

- **AC-012:** `GET /api/health/llm` returns HTTP `200` with `{ ok: true, model: string, latencyMs: number }` on the production Vercel URL in incognito. *(Trace: FR-009)*

---

## 6. Edge Cases

- **EC-001:** Planner LLM returns a `moduleId` not present in `seed.ts` → server discards the unknown module, logs a warning envelope, and continues with only valid module IDs. If too few modules remain to form a valid plan, falls back to `buildDraftPlan()`.

- **EC-002:** `compressPlan()` reaches `numberOfWeeks = 52` (1 year) and `weeklyHours` is still > budget → this means `totalHours > 52 × budget`. In practice this cannot happen with 24 courses and 5 h/week budget; treat as invariant violation and return plan at `numberOfWeeks = 52` with a warning issue.

- **EC-003:** `gradeQuiz()` receives an `answers` map with missing keys (learner skipped a question) → missing answers are scored as incorrect.

- **EC-004:** `computePlanDiff()` called with two plans of the same `id` (no change) → returns `{ keptHours: totalHours, addedHours: 0, removedHours: 0, adjustedHours: 0, preservedPct: 1.0, notes: [] }`.

- **EC-005:** `localStorage` quota exceeded during persist → catch `QuotaExceededError`, evict oldest run, retry once. If still failing, skip persistence silently (do not crash the UI).

- **EC-006:** LLM Critic returns `verdict: 'revise'` on the compressed plan (second pass) → Critic rule overrides: if `validatePlan(compressedPlan, budget).ok === true`, mark Critic as `pass` regardless. Deterministic rule is authoritative.

- **EC-007:** Vercel function reaches 60s timeout mid-execution → Next.js terminates the function; client receives a 504. The UI must handle non-200 responses with an error state and offer a retry button. This is the only case a 500/504 is acceptable.

---

## 7. Assumptions & Open Questions

- **A-001 [LOCKED]:** Readiness formula is weighted skill coverage (FR-001). ✅
- **A-002 [LOCKED]:** `weeklyHours` = `totalHours / numberOfWeeks` (average, not peak). ✅
- **A-003 [LOCKED]:** `compressPlan()` extends weeks only, never drops modules. ✅
- **A-004 [LOCKED]:** `preservedPct` denominator = `oldPlan.totalHours`. ✅
- **A-005 [LOCKED]:** Module identity for diff = `courseId`. ✅
- **A-006 [LOCKED]:** `gradeQuiz` threshold = `score > 0.5` (≥2/3 correct). ✅
- **A-007 [LOCKED]:** QUIZ_FAILED: insert remediation at `week+1`, reduce next-week hours by 20% via module removal. ✅
- **A-008 [LOCKED]:** State = `useReducer`. Persistence in `useEffect`. ✅
- **A-009 [LOCKED]:** Replay = synchronous dispatch from `src/data/replay.ts`, no fetch. ✅
- **A-010 [LOCKED]:** LLM Planner returns `{ moduleId, week, rationale }[]`; server hydrates from seed. ✅
- **OQ-001 [OPEN]:** Which LLM provider/model? (`@ai-sdk/openai` → `gpt-4o-mini`, or `@ai-sdk/google` → `gemini-flash`?) — decide at Hour 0 based on key availability.
- **OQ-002 [OPEN]:** `currentWeek` for QUIZ_FAILED remediation insertion — is it the learner's current progress week (tracked in `Learner.completedModuleIds`), or always week 1 for the demo? For the demo, default to the first incomplete week.

