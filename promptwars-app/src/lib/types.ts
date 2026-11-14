// ─── Primitives ───────────────────────────────────────────────────────────────

export type SkillLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type RoleId = "full-stack" | "data-analyst" | "ai-backend";
export type AgentName =
  | "profile" | "gap" | "planner" | "critic" | "assessor" | "mentor";
export type ModuleDiff = "kept" | "added" | "adjusted" | "removed";
export type AgentStatus = "ok" | "warn" | "error";

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
  skillId: string;
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
  hoursPerWeek: number;
  completedModuleIds: string[];
}

// ─── Gap Analysis ─────────────────────────────────────────────────────────────

export interface GapItem {
  skillId: string;
  current: number;
  required: number;
  weight: number;
  priority: number;        // = (required − current) × weight
}

export interface GapReport {
  readiness: number;       // = Σ(min(current,required)×weight) / Σ(required×weight)
  missing: GapItem[];      // sorted by priority DESC
  strengths: GapItem[];    // sorted by weight DESC
  summary: string;
}

// ─── Plan ─────────────────────────────────────────────────────────────────────

export interface Module {
  id: string;              // `${skillId}:${courseId}` or `${skillId}:${courseId}:p1`
  skillId: string;
  courseId: string;
  title: string;
  week: number;
  hours: number;
  rationale: string;
  status: "todo" | "in-progress" | "done";
  diff?: ModuleDiff;
  part?: { current: number; total: number };
}

export interface Plan {
  id: string;              // UUID
  version: number;
  roleId: RoleId;
  modules: Module[];
  totalHours: number;
  weeklyHours: number;     // = totalHours / numberOfWeeks
  numberOfWeeks: number;
  createdAt: string;
}

export interface PlanDiff {
  keptHours: number;
  addedHours: number;
  adjustedHours: number;
  removedHours: number;
  preservedPct: number;    // = keptHours / oldPlan.totalHours
  notes: string[];
}

// ─── Agent Envelopes ──────────────────────────────────────────────────────────

export interface AgentEnvelope<T = unknown> {
  id: string;
  agent: AgentName;
  input: unknown;
  output: T;
  rationale: string;
  latencyMs: number;
  status: AgentStatus;
  createdAt: string;
}

export interface AgentErrorOutput {
  fallback: true;
  reason: string;
}

// ─── API ──────────────────────────────────────────────────────────────────────

export type AdaptEvent =
  | { type: "QUIZ_FAILED"; answers: Record<string, string> }
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
  degraded?: boolean;
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
  planId: string;
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

