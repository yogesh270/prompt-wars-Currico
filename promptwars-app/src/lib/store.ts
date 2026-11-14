"use client";

import type { AppState, AppAction, Learner } from "./types";
import { PRIYA_PERSONA } from "./seed";

// ─── Initial State ────────────────────────────────────────────────────────────

export const initialState: AppState = {
  learner:       PRIYA_PERSONA,
  plan:          null,
  gap:           null,
  diff:          null,
  trace:         [],
  mentorMessage: "",
  mode:          "live",
  mounted:       false,
  loading:       false,
  error:         null,
};

// ─── Reducer ──────────────────────────────────────────────────────────────────

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_MOUNTED":
      return { ...state, mounted: true };

    case "SET_MODE":
      return { ...state, mode: action.payload };

    case "SET_LEARNER":
      return { ...state, learner: { ...state.learner, ...action.payload } };

    case "SET_PLAN_RESPONSE":
      return {
        ...state,
        plan:  action.payload.plan,
        gap:   action.payload.gap,
        trace: action.payload.trace,
        diff:  null,
        mentorMessage: "",
        error: null,
      };

    case "SET_ADAPT_RESPONSE":
      return {
        ...state,
        plan:          action.payload.plan,
        diff:          action.payload.diff,
        trace:         action.payload.trace,
        mentorMessage: action.payload.mentorMessage,
        error:         null,
      };

    case "SET_STATE":
      return {
        ...state,
        ...action.payload,
        mounted: state.mounted,
        loading: false,
        error:   null,
      };

    case "SET_LOADING":
      return { ...state, loading: action.payload, error: null };

    case "SET_ERROR":
      return { ...state, loading: false, error: action.payload };

    case "RESET_DEMO":
      return {
        ...initialState,
        mounted: state.mounted,
        mode:    state.mode,
      };

    default:
      return state;
  }
}

// ─── localStorage persistence ─────────────────────────────────────────────────

const LS_KEY = "pw-runs";
const MAX_RUNS = 3;

type StoredRun = {
  planId: string;
  learner: Learner;
  plan: NonNullable<AppState["plan"]>;
  trace: AppState["trace"];
};

export function persistRun(state: AppState): void {
  if (!state.plan) return;
  try {
    const raw = localStorage.getItem(LS_KEY);
    const runs: StoredRun[] = raw ? JSON.parse(raw) : [];

    const newRun: StoredRun = {
      planId:  state.plan.id,
      learner: state.learner,
      plan:    state.plan,
      trace:   state.trace,
    };

    // Replace existing run with same planId or append
    const idx = runs.findIndex(r => r.planId === state.plan!.id);
    if (idx >= 0) runs[idx] = newRun;
    else runs.push(newRun);

    // Keep last MAX_RUNS
    const trimmed = runs.slice(-MAX_RUNS);
    localStorage.setItem(LS_KEY, JSON.stringify(trimmed));
  } catch (err) {
    if (err instanceof DOMException && err.name === "QuotaExceededError") {
      // Evict oldest run and retry once
      try {
        const raw = localStorage.getItem(LS_KEY);
        const runs: StoredRun[] = raw ? JSON.parse(raw) : [];
        runs.shift();
        localStorage.setItem(LS_KEY, JSON.stringify(runs));
        persistRun(state);
      } catch {
        // silent fail
      }
    }
  }
}

export function loadLatestRun(): Partial<AppState> | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const runs: StoredRun[] = JSON.parse(raw);
    if (runs.length === 0) return null;
    const latest = runs[runs.length - 1];
    return { learner: latest.learner, plan: latest.plan, trace: latest.trace };
  } catch {
    return null;
  }
}

export function clearRuns(): void {
  try { localStorage.removeItem(LS_KEY); } catch { /* noop */ }
}

