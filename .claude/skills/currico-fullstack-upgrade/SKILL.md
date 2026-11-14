---
name: currico-fullstack-upgrade
description: Upgrade Currico from demo persona to full-stack adaptive learning platform with Supabase persistence, custom learner ingestion, chunked module scheduling, strict Critic validation, and high-craft UI.
---

# Currico Fullstack Upgrade Skill (`currico-fullstack-upgrade`)

This skill standardizes upgrading Currico from a static demo persona (`Priya`) into an interactive, Supabase-backed, production-ready adaptive curriculum platform.

---

## 1. Custom Learner Profile Ingestion

### Goals
- Allow users to test any custom background without being locked to the preset Priya persona.
- Retain Priya as a 1-click quick-demo preset.
- Ingestion methods:
  1. **Resume / Profile Text Parser:** Parse raw resume, LinkedIn summary, or GitHub bio text (`.pdf`, `.txt`, `.md`, or copy-paste). Extract skill proficiencies on a `0` to `4` scale using fast regex heuristic mapping combined with optional LLM structured output.
  2. **Interactive Manual Matrix:** Sliders/pills (`0` to `4`) for all core role skills:
     `react`, `typescript`, `nextjs`, `nodejs`, `javascript`, `rest-api`, `postgres`, `testing`, `cloud-deploy`, `git`, `sql`, `html`.
- **Auto-Pipeline Trigger:** Saving a profile immediately dispatches `handleGenerate()` to synthesize a fresh adaptive roadmap.

---

## 2. Planner & Critic Hard Constraints (Eliminating `WARN` Flags)

### Module Chunking Algorithm
When a course exceeds the user's weekly commitment `budget` (e.g. `10h` course vs `5h` budget):
1. **Never schedule a course whose duration exceeds the weekly budget into a single week.**
2. Split the course into deterministic sequential chunks:
   - Example for a `10h` course with a `5h` budget:
     - `Part 1 (5h)` in Week $N$
     - `Part 2 (5h)` in Week $N+1$
   - Example for a `12h` course with a `5h` budget:
     - `Part 1 (5h)` in Week $N$
     - `Part 2 (5h)` in Week $N+1$
     - `Part 3 (2h)` in Week $N+2$
3. Chunks inherit the prerequisite DAG of the parent course: `Part 1` must strictly precede `Part 2`.

### Critic Verification Loop
Before emitting `status: 'ok'`, the Critic agent must verify three invariant constraints:
1. **Weekly Budget Invariant:**
   $$\sum_{m \in \text{Week } w} m.\text{hours} \le \text{budget} \times 1.05 \quad \forall w$$
   and $\text{weeklyHours} \le \text{budget}$.
2. **Prerequisite DAG Order Invariant:**
   For all dependencies $(A \to B)$, module $A$ must be scheduled in a week prior to or strictly earlier than $B$, and all parts of $A$ must precede $B$.
3. **Zero Hallucination Invariant:**
   Every scheduled module must originate from the approved `COURSES` registry. No phantom courses or unapproved URLs are permitted.

If any invariant fails:
- Critic marks envelope `verdict: 'revise'`.
- Invokes `compressPlan()` to auto-chunk and redistribute modules.
- Re-verifies until all 3 constraints pass.

---

## 3. Supabase Relational Persistence Layer

### Relational Schema (`supabase/migrations/001_currico_schema.sql`)
1. `learners` table: stores learner ID, name, target role, weekly hours, and raw resume text.
2. `learner_skills` table: stores normalized skill baseline (`current_level`, `target_level`).
3. `curriculum_plans` table: stores versioned plan snapshot, total hours, weeks, and `schedule_json`.
4. `agent_traces` table: stores multi-agent telemetry envelopes (`agent_name`, `status`, `latency_ms`, payload).

### Offline-First Fallback
- Check for `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- If missing or unconfigured, log a graceful fallback message and maintain state seamlessly in memory and `localStorage`. The platform never crashes when Supabase is disconnected.

---

## 4. UI & Visual Craft Specifications

1. **Dark Dashboard Aesthetic:**
   - Backgrounds: `#09090b` (zinc-950) with card surfaces `#111114` / `#18181b`.
   - Crisp `1px` borders (`border-neutral-800`), glowing status rings, and typography with monospace telemetry tags.
2. **Visual Weekly Capacity Bar:**
   - Display allocated hours per week: e.g. `5h / 5h allocated (100%)`.
   - Subtle progress bar indicator on each week card showing fill percentage.
3. **Adaptive Animation & Badges:**
   - Newly inserted remediation modules highlight with an `ADAPTED` / `REMEDIATION` badge.
   - Preserved modules display a clear `KEPT` or `RETAINED` badge with computed retention percentage.
4. **Interactive Coordination Trace:**
   - Expandable telemetry envelopes with live latency counters, agent roles, input/output inspection, and constraint verification checklists.

---

## 5. Verification Protocol
1. Run engine verification: `npx tsx --tsconfig scripts/tsconfig.json scripts/check-engine.ts`.
2. Run TypeScript build: `npm run build`.
3. Test custom learner ingestion: upload/matrix edit -> auto-generates chunked plan within weekly hours limit.
4. Test quiz failure adaptation: verify remediation modules appear with `ADAPTED` badges and next-week load sheds 20%.
