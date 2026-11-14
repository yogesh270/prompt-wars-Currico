# 5-Hour Zero-Infra Build — Architect's Runbook

**Verdict:** Approved. Dropping Postgres, `pgvector`, LangGraph, auth, and file uploads is the correct trade for a 5-hour demo. The deterministic core + 3 focused agents + a visible Critic loop still satisfies every line of the brief.

This runbook is the execution delta: the corrections that prevent late-stage failures, the exact contracts, and an hour-by-hour schedule with hard gates.

---

## 1. Corrections before hour 0

| # | Issue in the current plan | Fix |
|---|---|---|
| 1 | **API routes cannot read `localStorage`.** The server has no browser state. | Make the API **stateless**: the client sends `{ learner, plan, event }`; the server returns `{ plan, trace, diff }`; the client persists the result. This also makes replay trivial. |
| 2 | **`Output.object` is version-sensitive.** The AI SDK option name and behavior differ across releases. | Pin `ai` and the provider package in `package.json`. Validate one structured call on the **deployed URL** at hour 0 via `/api/health/llm`. If it fails, fall back to `generateObject` or JSON mode + `schema.parse()`. Do not discover this at hour 3. |
| 3 | **Vercel function timeouts.** Hobby defaults can be ~10s; 3 sequential LLM calls can exceed that. | Add `export const maxDuration = 60` and `export const dynamic = 'force-dynamic'` to both routes. Keep prompts and output schemas small. Pre-warm before the demo. Never promise "under 4 seconds"; design the UI for 2–10s. |
| 4 | **Replay must bypass the API entirely.** If the key or server is broken, a server-side replay still fails. | Implement replay in the client: `if (mode === 'replay') { setState(cache[scenario]); return; }`. No `fetch`. |
| 5 | **Live quiz generation and grading add latency and failure modes.** | Pre-author 3 MCQs per role in `seed.ts`. Grade deterministically from an answer key. Only the mentor explanation needs an LLM. This removes one agent call and a lot of UI risk. |
| 6 | **Data and UI dependencies are over-scoped.** 40 courses, shadcn, Recharts, React Flow, `pdfjs-dist` can consume the whole build. | 24 courses (8 per role), Tailwind + inline SVG, paste-text only. No chart or component libraries. |
| 7 | **The Critic rejection must be guaranteed, not hoped for.** | Rule first: `maxWeekHours > 1.1 × budget` → `revise`. For the demo, set Priya's budget to **5 h/week**, which forces the rejection. The LLM Critic adds flavor; the rule owns the verdict. |
| 8 | **"60% preserved" is hardcoded.** | Compute `preservedPct = keptHours / oldTotalHours` and display the real number. The story still works at 45% or 70%. |
| 9 | **Hydration mismatch risk.** Reading `localStorage` during the first render breaks Next.js hydration. | Initialize with the Priya persona, then load persisted state in `useEffect`. Render a stable skeleton until mounted. |

---

## 2. Final architecture

```
Browser (single page, localStorage)
  │  POST { learner, plan, event }
  ▼
Next.js route handlers (stateless, Node runtime, maxDuration=60)
  ├── /api/health/llm   pre-flight structured-output check
  ├── /api/plan         Profile (optional LLM) → Gap (code) → Planner (LLM)
  │                     → Critic (rule + optional LLM) → Plan v1
  └── /api/adapt        Assessor (code) → Planner (LLM) → Critic (rule)
                        → Mentor (LLM) → Plan v2 + diff
  │
  ▼
Static seed: 3 roles · 25 skills · 24 courses · 9 quiz questions
```

**Why 3 agents is enough:** they cover the four required jobs — analyze (Profile/Gap), recommend (Planner/Critic), evaluate (Assessor), guide (Mentor). The deterministic engine is the fourth worker and the source of correctness. Adding more agents adds trace noise, not credibility.

**The one rule:** the LLM selects IDs and writes rationale; code assembles the plan. Never let the model invent a course, URL, prerequisite, or hour estimate.

---

## 3. Contracts (`src/lib/types.ts`)

```ts
export type SkillLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type RoleId = "full-stack" | "data-analyst" | "ai-backend";
export type AgentName =
  | "profile" | "gap" | "planner" | "critic" | "assessor" | "mentor";

export interface Skill {
  id: string;
  name: string;
  prereqs: string[];
  aliases: string[];
}

export interface RoleRequirement {
  skillId: string;
  level: SkillLevel;
  weight: number;      // 1–5
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
  skills: string[];
  level: SkillLevel;
  hours: number;
  format: "course" | "video" | "project" | "docs";
}

export interface LearnerSkill {
  skillId: string;
  level: SkillLevel;
  confidence: number;  // 0–1
  evidence: string[];
}

export interface Learner {
  id: string;
  name: string;
  skills: LearnerSkill[];
  targetRoleId: RoleId;
  hoursPerWeek: number;
  completedModuleIds: string[];
}

export interface GapItem {
  skillId: string;
  current: number;
  required: number;
  weight: number;
  priority: number;
}

export interface GapReport {
  readiness: number;   // 0–1
  missing: GapItem[];
  strengths: GapItem[];
  summary: string;
}

export interface Module {
  id: string;          // stable: `${skillId}:${courseId}`
  skillId: string;
  courseId: string;
  title: string;
  week: number;
  hours: number;
  rationale: string;
  status: "todo" | "in-progress" | "done";
  diff?: "kept" | "added" | "adjusted" | "removed";
}

export interface Plan {
  id: string;
  version: number;
  roleId: RoleId;
  modules: Module[];
  totalHours: number;
  weeklyHours: number;
  createdAt: string;
}

export interface PlanDiff {
  keptHours: number;
  addedHours: number;
  adjustedHours: number;
  removedHours: number;
  preservedPct: number;   // keptHours / previousTotalHours
  notes: string[];
}

export interface AgentEnvelope<T = unknown> {
  id: string;
  agent: AgentName;
  input: unknown;
  output: T;
  rationale: string;
  latencyMs: number;
  status: "ok" | "warn" | "error";
  createdAt: string;
}

export interface PlanResponse {
  plan: Plan;
  gap: GapReport;
  trace: AgentEnvelope[];
  degraded?: boolean;
}

export interface AdaptResponse {
  plan: Plan;
  diff: PlanDiff;
  trace: AgentEnvelope[];
  mentorMessage: string;
  degraded?: boolean;
}

export type AdaptEvent =
  | { type: "QUIZ_FAILED"; answers: Record<string, string> }
  | { type: "GOAL_CHANGED"; targetRoleId: RoleId };
```

**API shape**

```
POST /api/plan
body:    { learner: Learner, resumeText?: string }
returns: PlanResponse

POST /api/adapt
body:    { learner: Learner, currentPlan: Plan, event: AdaptEvent }
returns: AdaptResponse

GET /api/health/llm
returns: { ok: boolean, model: string, latencyMs: number, error?: string }
```

---

## 4. LLM budget and fallbacks

| Route | Call | Purpose | If it fails |
|---|---|---|---|
| `/api/plan` | Profile extract (optional) | Resume text → skill IDs + levels | Use the persona's pre-filled skills |
| `/api/plan` | Planner | Assign modules to weeks + one-line rationales | Use the deterministic schedule + template rationales |
| `/api/plan` | Critic | Qualitative review of the plan | Use the deterministic rule verdict + template rationale |
| `/api/plan` | Planner retry (max 1) | Compress a rejected plan | Use `compressPlan()` deterministically |
| `/api/adapt` | Mentor | 2-sentence explanation of the change | Use a template built from the diff |

- **Live plan:** 2–4 calls. **Adapt:** 0–1 call.
- One fast model for everything, temperature `0.2`, `maxOutputTokens` 800–1200, 20s timeout, one retry.
- On any failure, return a valid deterministic response with `degraded: true` and an error envelope in the trace. **Never return a 500 to the UI.**
- Keep output schemas small: the Planner returns `{ modules: [{ moduleId, week, rationale }], summary }`, not full course objects. Hydrate from `seed.ts` on the server.

---

## 5. Hour-by-hour schedule (with hard gates)

### Hour 0:00–0:30 — Scaffold, deploy, prove the LLM path

- `npx create-next-app@latest` — TypeScript, Tailwind, App Router, `src/`, no ESLint prompt delays.
- Install `ai`, `@ai-sdk/openai` (or `@ai-sdk/google`), `zod`.
- Create `/api/health/llm` with a tiny Zod schema and one structured call.
- Deploy immediately: `npx vercel --prod --yes`.
- Add the API key in the Vercel dashboard (not only `.env.local`), then redeploy.
- Add `export const maxDuration = 60` to the route.

**Gate:** the production URL returns `{ ok: true }` from `/api/health/llm` in incognito. If not, stop feature work and fix deployment/model access. This is the only true blocker.

### Hour 0:30–1:15 — Seed + deterministic engine

Files: `src/lib/seed.ts`, `src/lib/types.ts`, `src/lib/engine.ts`, `scripts/check-engine.ts`.

- 3 roles, 25 skills, prerequisite DAG, 24 courses, 9 MCQs (3 per role), Priya persona.
- `computeGap(learner, role)` → readiness + sorted missing skills.
- `buildDraftPlan(gaps, role)` → topological order + course mapping + hours.
- `validatePlan(plan, budget)` → `{ ok, issues }` with the 110% rule and prerequisite check.
- `compressPlan(plan, budget)` → extend weeks / shed optional modules until valid.
- `computePlanDiff(oldPlan, newPlan)` → kept/added/adjusted/removed + `preservedPct`.
- `gradeQuiz(roleId, answers)` → score + per-skill results.

Run `npx tsx scripts/check-engine.ts` (or a temporary `/api/health/engine` route) and assert Priya's readiness, gap list, plan weeks, and 5h/week critic rejection.

**Gate:** the engine prints a valid v1 plan that is rejected at 5 h/week and accepted after compression.

### Hour 1:15–2:15 — API routes and prompts

Files: `src/app/api/plan/route.ts`, `src/app/api/adapt/route.ts`, `src/lib/llm.ts`, `src/lib/prompts.ts`.

- `/api/plan`: profile (only if `resumeText`) → gap → draft → planner → critic → optional retry → response.
- `/api/adapt`: grade (QUIZ_FAILED) or recompute (GOAL_CHANGED) → planner → critic → diff → mentor.
- Wrap every step in `timedEnvelope()` so the trace records latency automatically.
- Test both routes with `curl` locally **and on the production URL** before touching the UI.

**Gate:** a POST to production returns a typed plan, gap report, and a trace containing a Critic rejection + revision.

### Hour 2:15–3:30 — Single-screen command center

Files: `src/app/page.tsx`, `src/components/TraceConsole.tsx`, `src/components/Roadmap.tsx`, `src/components/QuizModal.tsx`, `src/lib/store.ts`.

- Header: persona select, role dropdown, hours slider, `Live/Replay` toggle, `Reset demo`.
- Left: readiness ring (inline SVG), have/need skill pills, roadmap grouped by week, diff badges, `Take quiz` button.
- Right: trace accordion with agent name, latency, rationale, expandable JSON.
- Quiz: 3 radio-button MCQs, submit → `/api/adapt` with `QUIZ_FAILED`.
- Role switch: confirm → `/api/adapt` with `GOAL_CHANGED`.
- Persist `{ learner, plan, trace }` to `localStorage` **in `useEffect` only**. Cap stored runs to the last 3.

**Gate:** the full flow is clickable on localhost: generate → quiz fail → v2 diff → role switch → v3 diff.

### Hour 3:30–4:15 — Adaptation polish + replay cache

- Record one successful live run; copy the exact JSON into `src/data/replay.ts` typed as `satisfies PlanResponse` / `AdaptResponse`.
- Replay branch bypasses fetch completely.
- Add a `Reset demo` action that restores Priya and clears plans.
- Verify the diff tags and the computed `preservedPct` (do not hardcode 60%).

**Gate:** with DevTools set to **Offline**, the replay toggle still completes all three demo beats.

### Hour 4:15–4:45 — Production hardening

- `npm run build` locally. Fix TypeScript errors. If ESLint is blocking, set `eslint.ignoreDuringBuilds = true` (acceptable for a hackathon; keep TS checks on).
- Deploy. Test in incognito on the production URL.
- Check: cold start, `maxDuration`, env vars, no `NEXT_PUBLIC_` API key.
- Pre-warm the routes with one real request.

**Gate:** the full 3-minute demo runs on the production URL without touching localhost.

### Hour 4:45–5:00 — Freeze and rehearse

- Record a backup video of the production run.
- Rehearse twice with a timer. If over 3 minutes, cut the trace JSON expansion, not the adaptation beat.
- Prepare one sentence: *"The graph guarantees correctness; the agents make it adapt."*

---

## 6. Solo cut list (one builder)

In priority order, cut these before touching the deterministic core:

1. Resume paste → persona switcher only.
2. Quiz modal → a `Simulate failed assessment` button.
3. LLM Critic → deterministic verdict + templated rationale (still a visible Critic trace).
4. Third role → two roles (Full Stack, Data Analyst) are enough.
5. Trace accordion → a simple scrollable list of agent cards.
6. Goal-change animation → diff badges only.

**Never cut:** the deterministic gap/plan, the adaptation diff, the live deployment, replay mode.

---

## 7. Three-minute demo script

| Time | Beat | Evidence |
|---|---|---|
| 0:00–0:20 | Hook | "Universities know grades, not skills. Priya has Python, SQL, and HTML — here is the gap to Full Stack." |
| 0:20–0:50 | Generate | Priya persona, Full Stack, **5 h/week**. Show readiness 42%, gap pills, roadmap. |
| 0:50–1:30 | Critic loop | Trace shows Planner v1 rejected (`10h/week > 5.5h limit`), Planner v2 compressed to 8 weeks, Critic passes. |
| 1:30–2:10 | Fail forward | Take quiz, miss 2 of 3. Assessor scores 33%, inserts JS remediation, cuts next week 20%, shows v2 diff + mentor line. |
| 2:10–2:40 | Change the dream | Switch to Data Analyst. Show computed "Python/SQL preserved" percentage and the new statistics/visualization modules. |
| 2:40–3:00 | Close | "Deterministic graph + three agents + event-driven adaptation. The plan is correct; the agents make it personal." |

**Backup:** replay toggle + recorded video + a screenshot of each state.

---

## 8. Pre-flight checklist

- [ ] Production URL loads in incognito.
- [ ] `/api/health/llm` returns `ok: true`.
- [ ] `npm run build` passes.
- [ ] Env vars exist in Vercel, not just `.env.local`.
- [ ] `maxDuration = 60` on `/api/plan` and `/api/adapt`.
- [ ] Replay works with the network offline.
- [ ] `Reset demo` restores Priya.
- [ ] The computed preserved percentage is displayed (no hardcoded 60%).
- [ ] Quiz failure threshold is unambiguous (3 questions: ≤1 correct fails).
- [ ] Trace shows a real Critic rejection and revision.
- [ ] Backup video recorded.
- [ ] Phone hotspot available.

---

## 9. What can still sink the demo

| Risk | Mitigation |
|---|---|
| Model/provider mismatch or missing key | Hour-0 deployed health check; provider adapter in one file |
| Structured output parse failure | Small schemas, ID-only outputs, retry once, deterministic fallback |
| Vercel timeout | `maxDuration = 60`, small prompts, pre-warm, staged progress UI |
| Cold start during judging | Pre-warm both routes 2 minutes before the pitch |
| `localStorage` hydration error | Load persisted state in `useEffect`, stable initial render |
| Replay cache type drift | `satisfies` the response types; regenerate after final API changes |
| Judge asks "is this real AI?" | Toggle Live, show the trace with real latencies and tool outputs |
| Scope creep at hour 3 | Re-read the cut list; protect the adaptation diff |

---

## 10. The one thing to protect

If you are behind, cut the trace console before you cut the **plan diff**. The diff — "here is what changed and why" — is the actual requirement. The trace is how judges believe it, but the diff is what they score.
