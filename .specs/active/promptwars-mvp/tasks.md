# PromptWars × RTC MVP — Gate-Ordered Task Breakdown

> Tasks are strictly sequenced to the 5-hour schedule in `5H-BUILD.md`.
> Each task has a clear input, output, acceptance criteria reference, and
> a verifiable done-condition. No task depends on a later gate.

---

## Gate 0 — `00:00–00:30` Scaffold, Deploy, Prove LLM Path

**Goal:** Production URL returns `{ ok: true }` from `/api/health/llm` in incognito.

---

### TASK-001 — Bootstrap Next.js Project
- **Input:** Empty directory `c:\Users\yoges\Documents\GitHub\Prompt-Wars`
- **Command:** `npx create-next-app@latest . --typescript --tailwind --app --src-dir --no-eslint --yes`
- **Install:** `npm install ai @ai-sdk/openai zod` (or `@ai-sdk/google`)
- **Pin versions** in `package.json`: `"ai": "^3.x"`, provider package, `"zod": "^3.x"`.
- **Done:** `npm run dev` starts without errors. *(Trace: none — scaffolding)*

### TASK-002 — Create `/api/health/llm` Route
- **File:** `src/app/api/health/llm/route.ts`
- **Contract:** See `contracts.md §5 GET /api/health/llm`
- **Implementation checklist:**
  - [ ] `export const maxDuration = 60`
  - [ ] `export const dynamic = "force-dynamic"`
  - [ ] One `generateObject` call with `HealthCheckSchema`
  - [ ] `try/catch` → returns `{ ok: false, error }` on failure, never 500
  - [ ] Returns `{ ok: true, model, latencyMs }` on success
- **Done:** `curl http://localhost:3000/api/health/llm` returns `{ ok: true }`. *(Trace: FR-009, AC-012)*

### TASK-003 — First Vercel Deploy + Env Var
- **Steps:**
  1. `npx vercel --prod --yes`
  2. Add `OPENAI_API_KEY` (or `GOOGLE_GENERATIVE_AI_API_KEY`) in Vercel dashboard → Environment Variables → Production.
  3. Redeploy: `npx vercel --prod --yes`
- **Verify:** Open `<prod-url>/api/health/llm` in incognito. Must return `{ ok: true }`.
- **Done:** `AC-012` passes on the production URL. **This is the only hard blocker.**

> [!IMPORTANT]
> **GATE 0 CHECK:** If `AC-012` fails after TASK-003, stop all feature work. Debug deployment / model access. Do not proceed.

---

## Gate 1 — `00:30–01:15` Seed + Deterministic Engine

**Goal:** `npx tsx scripts/check-engine.ts` prints a valid v1 plan that is rejected at 5 h/week and accepted after compression.

---

### TASK-004 — Type Definitions
- **File:** `src/lib/types.ts`
- **Action:** Copy the full interface block from `contracts.md §1` verbatim.
- **Done:** `npx tsc --noEmit` passes with zero errors. *(Trace: all FRs)*

### TASK-005 — Seed Data (`src/lib/seed.ts`)
- **Exports:** `ROLES`, `SKILLS`, `COURSES`, `QUIZ_QUESTIONS`, `PRIYA_PERSONA`
- **Quantities:** 3 roles (cut to 2 if behind schedule per cut-list), 25 skills, 24 courses (8/role), 9 MCQs (3/role).
- **Priya persona:** `{ id: 'priya', name: 'Priya', targetRoleId: 'full-stack', hoursPerWeek: 5, skills: [python:3, sql:2, html:2], completedModuleIds: [] }`
- **Validation:** Every `Course.skills[]` entry must be a valid `Skill.id`. Every `RoleRequirement.skillId` must exist in `SKILLS`. Every `QuizQuestion.skillId` must exist in `SKILLS`.
- **Done:** TypeScript compiles without errors; no `any`. *(Trace: AC-001)*

### TASK-006 — `computeGap()` Implementation
- **File:** `src/lib/engine.ts`
- **Formula:** `readiness = Σ(min(current,required)×weight) / Σ(required×weight)`
- **Formula:** `priority = (required − current) × weight`
- **Sorting:** `missing` → priority DESC; `strengths` → weight DESC
- **Done:** Unit assert: `computeGap(PRIYA_PERSONA, FULL_STACK_ROLE).readiness` is in `[0.3, 0.5]` and `missing.length >= 3`. *(Trace: FR-001, AC-001)*

### TASK-007 — `buildDraftPlan()` Implementation
- **File:** `src/lib/engine.ts`
- **Algorithm:**
  1. For each `GapItem` in `missing` (priority DESC): find the best matching `Course` covering that `skillId` and not already included.
  2. Topological sort: if `Course.skills` requires a prerequisite skill, schedule that course's module to an earlier week.
  3. Pack modules into weeks: accumulate hours; if adding next module exceeds `budget`, start a new week.
  4. Compute `totalHours`, `weeklyHours = totalHours / numberOfWeeks`, `numberOfWeeks = max(week)`.
- **Done:** For Priya, `buildDraftPlan(gap, role, 5).weeklyHours > 5.5`. *(Trace: FR-002, AC-002)*

### TASK-008 — `validatePlan()` Implementation
- **File:** `src/lib/engine.ts`
- **Rule 1:** `if (plan.weeklyHours > budget * 1.1) issues.push('Weekly average Xh exceeds budget limit Yh')`
- **Rule 2:** For each module, verify its `skillId`'s prerequisites are addressed by an earlier-week module.
- **Done:** `validatePlan(priyaDraftPlan, 5).ok === false`. *(Trace: FR-003, AC-003)*

### TASK-009 — `compressPlan()` Implementation
- **File:** `src/lib/engine.ts`
- **Algorithm:** Increment `numberOfWeeks`; re-assign module weeks by re-packing (same topological order, same budget-per-week cap). Repeat until `weeklyHours ≤ budget`. Increment `plan.version`.
- **Invariant:** `compressedPlan.modules.length === draftPlan.modules.length` (never drop modules).
- **Done:** `validatePlan(compressPlan(priyaDraftPlan, 5), 5).ok === true`. *(Trace: FR-004, AC-004)*

### TASK-010 — `computePlanDiff()` Implementation
- **File:** `src/lib/engine.ts`
- **Identity key:** `module.courseId`
- **Logic:** Compare old and new module lists by `courseId`. Classify each as `kept/adjusted/removed/added`. Sum hours. Compute `preservedPct = keptHours / oldPlan.totalHours`.
- **Done:** `computePlanDiff(priyaDraft, compressedPlan).preservedPct` is a computed number, not hardcoded. *(Trace: FR-005, AC-005)*

### TASK-011 — `gradeQuiz()` + Remediation Functions
- **File:** `src/lib/engine.ts`
- **`gradeQuiz`:** Compare `answers[questionId]` to `QUIZ_QUESTIONS.find(q => q.questionId === questionId).answerKey`. Missing keys → incorrect. `passed = score > 0.5`.
- **`insertRemediationModules`:** For each `weakSkillId`, find the first course covering it not already in the plan, create a module at `atWeek`, append to list.
- **`reduceWeekLoad`:** Sum hours in `week`. Target = `Σ × 0.8` rounded down to 0.5. Remove lowest-priority modules (by `GapItem.priority` desc — lowest first) until at or below target.
- **Done:** `gradeQuiz(roleId, allWrong).passed === false && weakSkillIds.length === 3`. *(Trace: FR-006, AC-006)*

### TASK-012 — Engine Check Script
- **File:** `scripts/check-engine.ts`
- **Assertions (use `console.assert` or throw on failure):**
  ```ts
  assert(gap.readiness >= 0.3 && gap.readiness <= 0.5, 'readiness in range');
  assert(gap.missing.length >= 3, 'has gaps');
  assert(validate(draft, 5).ok === false, 'v1 rejected');
  assert(validate(compress(draft, 5), 5).ok === true, 'v2 accepted');
  assert(compress(draft, 5).modules.length === draft.modules.length, 'no modules dropped');
  assert(diff.preservedPct > 0 && diff.preservedPct < 1, 'preservedPct computed');
  assert(grade(roleId, allWrong).passed === false, 'quiz fails at 0 correct');
  assert(grade(roleId, twoCorrect).passed === true, 'quiz passes at 2 correct');
  ```
- **Done:** `npx tsx scripts/check-engine.ts` exits 0 with no assertion errors. *(Trace: AC-001–AC-006)*

> [!IMPORTANT]
> **GATE 1 CHECK:** All assertions in `check-engine.ts` must pass before touching any API route.

---

## Gate 2 — `01:15–02:15` API Routes + Prompts

**Goal:** A `POST` to the production URL returns a typed `PlanResponse` with a Critic rejection + revision in the trace.

---

### TASK-013 — LLM Wrapper (`src/lib/llm.ts`)
- **Export:** `timedEnvelope<T>(agent, input, fn, fallback)` — see `contracts.md §3`.
- **Behavior:**
  - Start timer.
  - `try { result = await fn() }` → envelope with `status='ok'`.
  - `catch (err) { result = fallback() }` → envelope with `status='error'`, `output={ fallback: true, reason: err.message }`.
  - Never throws.
- **Done:** `timedEnvelope` can be imported and called; TypeScript compiles. *(Trace: FR-011)*

### TASK-014 — Zod Schemas (`src/lib/schemas.ts`)
- **Action:** Copy schema block from `contracts.md §4` verbatim.
- **Done:** All schemas parse their target shapes without errors; `npx tsc --noEmit` passes. *(Trace: FR-007, FR-008)*

### TASK-015 — Prompt Templates (`src/lib/prompts.ts`)
- **Exports:** `plannerPrompt(gap, role, draft)`, `criticPrompt(plan, budget)`, `mentorPrompt(diff, event)`, `profilePrompt(resumeText)`.
- **Constraints:** Each prompt + expected output fits within 1200 tokens. Prompts instruct the model to use only `moduleId` values from the provided course list (injected as a JSON array). No invented URLs, titles, or hours.
- **Done:** Each function returns a string; TypeScript compiles; no `any`. *(Trace: FR-007, FR-008)*

### TASK-016 — `/api/plan` Route
- **File:** `src/app/api/plan/route.ts`
- **Headers:** `export const maxDuration = 60; export const dynamic = "force-dynamic";`
- **Pipeline:** Profile → Gap → Draft → Planner → Critic → optional retry (see `contracts.md §5`).
- **Error handling:** Every LLM call via `timedEnvelope`. No try/catch at route level needed — all errors contained. Return `NextResponse.json(planResponse)` always with status 200.
- **Done:** `curl -X POST <prod>/api/plan -d '{ "learner": <priya> }'` returns a `PlanResponse` with `trace[].agent` values including `"planner"` and `"critic"`. *(Trace: FR-007, AC-008)*

### TASK-017 — `/api/adapt` Route
- **File:** `src/app/api/adapt/route.ts`
- **Headers:** `export const maxDuration = 60; export const dynamic = "force-dynamic";`
- **Pipeline QUIZ_FAILED:** Grade → insert remediation → reduce week load → Planner (opt) → Critic → Mentor → diff (see `contracts.md §5`).
- **Pipeline GOAL_CHANGED:** computeGap → buildDraftPlan → Planner → Critic → Mentor → diff.
- **Done:** `curl -X POST <prod>/api/adapt -d '{ ... QUIZ_FAILED ... }'` returns `AdaptResponse` with `diff.preservedPct` a real number and `mentorMessage` non-empty. *(Trace: FR-008, AC-007)*

### TASK-018 — LLM Fallback Verification
- **Test:** Temporarily make the Planner call throw (e.g. wrong API key). Verify:
  - Response is HTTP 200.
  - `body.degraded === true`.
  - `body.trace` contains an envelope with `agent: 'planner', status: 'error'`.
  - `body.plan` is a valid deterministic plan (not null/undefined).
- **Restore** correct key afterward.
- **Done:** `AC-009` passes. *(Trace: FR-011, FR-012)*

> [!IMPORTANT]
> **GATE 2 CHECK:** Both routes must respond correctly on the **production Vercel URL** (not just localhost). Test with `curl` before touching the UI.

---

## Gate 3 — `02:15–03:30` Single-Screen Command Center

**Goal:** Full flow is clickable on localhost: generate → quiz fail → v2 diff → role switch → v3 diff.

---

### TASK-019 — App State (`src/lib/store.ts`)
- **Exports:** `useAppStore()` hook returning `{ state: AppState, dispatch: Dispatch<AppAction> }`.
- **Reducer:** Handles all `AppAction` variants from `contracts.md §1`.
- **Initial state:** Priya persona, `plan: null`, `mode: 'live'`, `mounted: false`.
- **Persistence `useEffect`:** `useEffect(() => { persist(state) }, [state])` — saves last 3 runs keyed by `plan.id`.
- **Hydration `useEffect`:** `useEffect(() => { load(); setMounted(true); }, [])`.
- **localStorage quota guard:** Catch `QuotaExceededError` → evict oldest run → retry once. *(Trace: EC-005)*
- **Done:** Store exports compile; no hydration warning on cold load. *(Trace: FR-013, FR-014, AC-011)*

### TASK-020 — Page Layout (`src/app/page.tsx`)
- **Structure (Tailwind only, no component libraries):**
  ```
  <Header>  persona select | role dropdown | hours slider | Live/Replay toggle | Reset demo
  <Main>
    <Left>  readiness ring (inline SVG) | skill pills | <Roadmap/> | "Take quiz" / "Simulate fail" button
    <Right> <TraceConsole/>
  ```
- **Skeleton:** Render until `state.mounted === true`. After mount, show real data.
- **Done:** Page renders without console errors on cold load. *(Trace: FR-013, AC-011)*

### TASK-021 — Roadmap Component (`src/components/Roadmap.tsx`)
- **Input:** `{ modules: Module[], diff?: PlanDiff }`
- **Renders:** Modules grouped by `week`, each showing `title`, `hours`, `rationale`, and `diff` badge (`kept/added/adjusted/removed`) if `module.diff` is set.
- **Never hardcodes** `preservedPct`. Reads from `state.diff.preservedPct`. Formats as `${(preservedPct * 100).toFixed(0)}%`.
- **Done:** Diff badges appear after `QUIZ_FAILED` and `GOAL_CHANGED` responses. *(Trace: FR-019, AC-005)*

### TASK-022 — Trace Console (`src/components/TraceConsole.tsx`)
- **Input:** `{ trace: AgentEnvelope[] }`
- **Renders:** Scrollable list of agent cards showing `agent`, `latencyMs`, `status` (colour-coded: ok=green, warn=amber, error=red), `rationale`. Expandable JSON of `output`.
- **Solo cut fallback:** If behind schedule, render as a simple list of `<pre>` blocks (no accordion).
- **Done:** Trace cards visible after a live plan generation. *(Trace: AC-008)*

### TASK-023 — Quiz / Simulate Flow
- **Primary:** `QuizModal` with 3 radio-button MCQs → submit → `POST /api/adapt { QUIZ_FAILED }`.
- **Solo cut:** A single `Simulate failed assessment` button that dispatches `{ type: 'QUIZ_FAILED', answers: { allWrong } }` and POSTs.
- **On response:** Dispatch `SET_ADAPT_RESPONSE`; Roadmap re-renders with diff badges.
- **Done:** Clicking simulate → 3-second loading → v2 plan with diff visible. *(Trace: FR-017, AC-007)*

### TASK-024 — Role Switch Flow
- **Trigger:** Role dropdown change → confirm dialog.
- **On confirm:** `POST /api/adapt { GOAL_CHANGED, targetRoleId }` → dispatch `SET_ADAPT_RESPONSE`.
- **Done:** Switching to Data Analyst shows new modules + `preservedPct` from diff. *(Trace: FR-018, AC-005)*

> [!IMPORTANT]
> **GATE 3 CHECK:** Click through all 3 beats on localhost. All diff badges and `preservedPct` must be real computed values.

---

## Gate 4 — `03:30–04:15` Replay Cache + Polish

**Goal:** With DevTools set to Offline, the replay toggle completes all three demo beats.

---

### TASK-025 — Record Replay Data
- **Action:** Run one full live session (generate → quiz fail → goal change). Copy the exact JSON responses from the network tab into `src/data/replay.ts`.
- **File contract:**
  ```ts
  import type { ReplayCache } from "@/lib/types";
  export const replayCache: ReplayCache = {
    initial: { ... } satisfies PlanResponse,
    afterQuizFail: { ... } satisfies AdaptResponse,
    afterGoalChange: { ... } satisfies AdaptResponse,
  };
  ```
- **Done:** `npx tsc --noEmit` passes with `satisfies` check. *(Trace: FR-015)*

### TASK-026 — Replay Toggle Implementation
- **In `page.tsx`:** When `state.mode === 'replay'`, the generate / quiz / role-switch buttons dispatch `SET_STATE` from `replayCache` synchronously (no `fetch`).
- **Guard:** No `fetch` calls are made in replay mode. *(EC-007 does not apply in replay)*
- **Done:** `AC-010` — offline replay completes all 3 beats without network errors. *(Trace: FR-015, AC-010)*

### TASK-027 — Reset Demo Action
- **Reducer case `RESET_DEMO`:** Restore `state.learner = PRIYA_PERSONA`; `state.plan = null`; `state.trace = []`; `state.diff = null`.
- **localStorage:** Clear all stored runs.
- **Done:** Clicking "Reset demo" returns the UI to the Priya default state. *(Trace: FR-016)*

### TASK-028 — `preservedPct` Audit
- **Verify:** No hardcoded `0.6` or `60%` anywhere in the codebase (`git grep "0\.6\|60%"`).
- **Verify:** `Roadmap.tsx` reads `state.diff.preservedPct` and formats dynamically.
- **Done:** Audit passes. *(Trace: FR-019, AC-005)*

> [!IMPORTANT]
> **GATE 4 CHECK:** Set Chrome DevTools → Network → Offline. Toggle to Replay. Click all 3 demo beats. Zero network errors.

---

## Gate 5 — `04:15–04:45` Production Hardening

**Goal:** Full 3-minute demo runs on the production URL without touching localhost.

---

### TASK-029 — Local Build Check
- **Command:** `npm run build`
- **On TypeScript error:** Fix it. No `// @ts-ignore` on engine or API files.
- **On ESLint error:** Set `eslint.ignoreDuringBuilds = true` in `next.config.ts` (acceptable for hackathon).
- **Done:** Build exits 0. *(Trace: none — quality gate)*

### TASK-030 — Production Deploy + Verification
- **Command:** `npx vercel --prod --yes`
- **Checklist:**
  - [ ] `GET /api/health/llm` → `{ ok: true }` in incognito. *(AC-012)*
  - [ ] `POST /api/plan` (Priya) → `PlanResponse` with `trace.some(e => e.agent === 'critic')`. *(AC-008)*
  - [ ] `POST /api/adapt` (QUIZ_FAILED) → `AdaptResponse` with `diff.preservedPct` a number. *(AC-007)*
  - [ ] No `NEXT_PUBLIC_` API key in browser network tab.
  - [ ] `maxDuration = 60` on both routes (verify via Vercel function logs).
- **Done:** All checklist items pass on the prod URL. *(Trace: AC-007, AC-008, AC-012)*

### TASK-031 — Pre-warm Routes
- **Action:** 2 minutes before the demo pitch, send one real `POST /api/plan` and one `POST /api/adapt` to the production URL.
- **Done:** Both routes respond under 15 seconds (cold start resolved). *(Trace: §9 risks)*

---

## Gate 6 — `04:45–05:00` Freeze and Rehearse

**Goal:** Demo rehearsed twice under 3 minutes; backup video recorded.

---

### TASK-032 — Backup Video
- **Action:** Screen-record one complete 3-minute demo on the production URL.
- **Done:** Video file saved locally. *(Trace: §8 pre-flight)*

### TASK-033 — Demo Rehearsal
- **Script:** Follow `5H-BUILD.md §7` beat-by-beat.
- **If over 3 minutes:** Cut trace JSON expansion (not the diff). Accelerate the hook narration.
- **Done:** Two clean runs under 3 minutes each. *(Trace: §7)*

---

## Traceability Index

| FR | AC | Tasks |
|---|---|---|
| FR-001 | AC-001 | TASK-006 |
| FR-002 | AC-002 | TASK-007 |
| FR-003 | AC-003 | TASK-008 |
| FR-004 | AC-004 | TASK-009 |
| FR-005 | AC-005 | TASK-010, TASK-021, TASK-028 |
| FR-006 | AC-006 | TASK-011 |
| FR-007 | AC-008 | TASK-015, TASK-016 |
| FR-008 | AC-007 | TASK-017 |
| FR-009 | AC-012 | TASK-002, TASK-003, TASK-030 |
| FR-010 | — | TASK-016, TASK-017 |
| FR-011 | AC-009 | TASK-013, TASK-018 |
| FR-012 | AC-009 | TASK-013, TASK-018 |
| FR-013 | AC-011 | TASK-019, TASK-020 |
| FR-014 | — | TASK-019 |
| FR-015 | AC-010 | TASK-025, TASK-026 |
| FR-016 | — | TASK-027 |
| FR-017 | AC-007 | TASK-023 |
| FR-018 | AC-005 | TASK-024 |
| FR-019 | AC-005 | TASK-021, TASK-028 |

---

## Solo Cut Triggers

| If behind at hour... | Cut this | Keep this |
|---|---|---|
| 2:15 | Resume paste → persona switcher only | Engine, both API routes |
| 2:45 | Quiz modal → Simulate button | Adaptation diff |
| 3:00 | LLM Critic → deterministic verdict + trace entry | Critic rule itself |
| 3:30 | Third role (ai-backend) | Full-stack + Data Analyst |
| 3:45 | Trace accordion → simple scrollable list | Plan diff badges |
| 4:00 | Goal-change animation → diff badges only | `preservedPct` display |

> [!CAUTION]
> **Never cut:** deterministic engine, adaptation diff, live deployment, replay mode.
> These are the scored deliverables.

