"use client";

import { useReducer, useEffect, useState } from "react";
import type {
  Learner, PlanResponse, AdaptResponse, RoleId
} from "@/lib/types";
import { ROLES, PRIYA_PERSONA, QUIZ_QUESTIONS } from "@/lib/seed";
import { appReducer, initialState, persistRun, loadLatestRun, clearRuns } from "@/lib/store";
import Roadmap from "@/components/Roadmap";
import TraceConsole from "@/components/TraceConsole";

export default function Home() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [showQuiz, setShowQuiz] = useState(false);

  // ── Hydration ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const saved = loadLatestRun();
    if (saved) {
      dispatch({ type: "SET_STATE", payload: { ...initialState, ...saved, mode: "live" } });
    }
    dispatch({ type: "SET_MOUNTED" });
  }, []);

  // ── Persist on change ──────────────────────────────────────────────────────
  useEffect(() => {
    if (state.mounted && state.plan) persistRun(state);
  }, [state.plan?.id, state.mounted]);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (state.mode === "replay") {
      try {
        const { replayCache } = await import("@/data/replay");
        dispatch({ type: "SET_PLAN_RESPONSE", payload: replayCache.initial });
      } catch { dispatch({ type: "SET_ERROR", payload: "Replay data not yet recorded — run a live session first." }); }
      return;
    }
    dispatch({ type: "SET_LOADING", payload: true });
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ learner: state.learner }),
      });
      const data: PlanResponse = await res.json();
      dispatch({ type: "SET_PLAN_RESPONSE", payload: data });
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Failed to generate plan" });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }

  async function handleSimulateQuizFail() {
    if (!state.plan) return;
    const questions = QUIZ_QUESTIONS.filter(q => q.roleId === state.learner.targetRoleId);
    const wrongAnswers: Record<string, string> = {};
    for (const q of questions) {
      wrongAnswers[q.questionId] = q.options.find(o => o !== q.answerKey) ?? q.options[0];
    }

    if (state.mode === "replay") {
      try {
        const { replayCache } = await import("@/data/replay");
        dispatch({ type: "SET_ADAPT_RESPONSE", payload: replayCache.afterQuizFail });
      } catch { dispatch({ type: "SET_ERROR", payload: "Replay data not yet recorded." }); }
      return;
    }

    dispatch({ type: "SET_LOADING", payload: true });
    try {
      const res = await fetch("/api/adapt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          learner: state.learner,
          currentPlan: state.plan,
          event: { type: "QUIZ_FAILED", answers: wrongAnswers },
        }),
      });
      const data: AdaptResponse = await res.json();
      dispatch({ type: "SET_ADAPT_RESPONSE", payload: data });
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Adapt failed" });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }

  async function handleQuizSubmit() {
    if (!state.plan) return;
    setShowQuiz(false);

    if (state.mode === "replay") {
      try {
        const { replayCache } = await import("@/data/replay");
        dispatch({ type: "SET_ADAPT_RESPONSE", payload: replayCache.afterQuizFail });
      } catch { dispatch({ type: "SET_ERROR", payload: "Replay data not yet recorded." }); }
      return;
    }

    dispatch({ type: "SET_LOADING", payload: true });
    try {
      const res = await fetch("/api/adapt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          learner: state.learner,
          currentPlan: state.plan,
          event: { type: "QUIZ_FAILED", answers: quizAnswers },
        }),
      });
      const data: AdaptResponse = await res.json();
      dispatch({ type: "SET_ADAPT_RESPONSE", payload: data });
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Quiz submit failed" });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }

  async function handleRoleChange(newRoleId: RoleId) {
    if (newRoleId === state.learner.targetRoleId) return;
    if (!state.plan) {
      dispatch({ type: "SET_LEARNER", payload: { targetRoleId: newRoleId } });
      return;
    }
    if (!confirm(`Switch goal to ${ROLES.find(r => r.id === newRoleId)?.title}? This will rebuild your plan.`)) return;

    if (state.mode === "replay") {
      try {
        const { replayCache } = await import("@/data/replay");
        dispatch({ type: "SET_ADAPT_RESPONSE", payload: replayCache.afterGoalChange });
        dispatch({ type: "SET_LEARNER", payload: { targetRoleId: newRoleId } });
      } catch { dispatch({ type: "SET_ERROR", payload: "Replay data not yet recorded." }); }
      return;
    }

    dispatch({ type: "SET_LOADING", payload: true });
    dispatch({ type: "SET_LEARNER", payload: { targetRoleId: newRoleId } });
    try {
      const res = await fetch("/api/adapt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          learner: { ...state.learner, targetRoleId: newRoleId },
          currentPlan: state.plan,
          event: { type: "GOAL_CHANGED", targetRoleId: newRoleId },
        }),
      });
      const data: AdaptResponse = await res.json();
      dispatch({ type: "SET_ADAPT_RESPONSE", payload: data });
    } catch (err) {
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Role switch failed" });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }

  // ── Readiness Ring SVG ─────────────────────────────────────────────────────
  const readiness = state.gap?.readiness ?? 0;
  const r = 36;
  const circ = 2 * Math.PI * r;
  const arc = circ * readiness;
  const quizQuestions = QUIZ_QUESTIONS.filter(q => q.roleId === state.learner.targetRoleId);

  if (!state.mounted) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-500 text-sm">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* ── Header ── */}
      <header className="border-b border-zinc-800 px-6 py-3 flex flex-wrap items-center gap-4">
        <span className="font-bold text-lg tracking-tight">PromptWars</span>

        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">Learner:</span>
          <span className="text-sm font-medium">{state.learner.name}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">Goal:</span>
          <select
            value={state.learner.targetRoleId}
            onChange={e => handleRoleChange(e.target.value as RoleId)}
            className="bg-zinc-800 text-sm text-white rounded px-2 py-1 border border-zinc-700"
          >
            {ROLES.map(r => (
              <option key={r.id} value={r.id}>{r.title}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">h/week:</span>
          <input
            type="range" min={2} max={20} step={1}
            value={state.learner.hoursPerWeek}
            onChange={e => dispatch({ type: "SET_LEARNER", payload: { hoursPerWeek: Number(e.target.value) } })}
            className="w-24 accent-indigo-500"
          />
          <span className="text-sm font-mono w-6">{state.learner.hoursPerWeek}</span>
        </div>

        <button
          onClick={() => dispatch({ type: "SET_MODE", payload: state.mode === "live" ? "replay" : "live" })}
          className={`ml-auto text-xs px-3 py-1 rounded-full border font-mono ${
            state.mode === "replay"
              ? "bg-amber-900 border-amber-600 text-amber-300"
              : "bg-zinc-800 border-zinc-600 text-zinc-300"
          }`}
        >
          {state.mode === "live" ? "● LIVE" : "⏪ REPLAY"}
        </button>

        <button
          onClick={() => { clearRuns(); dispatch({ type: "RESET_DEMO" }); }}
          className="text-xs px-3 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-white"
        >
          Reset demo
        </button>
      </header>

      {state.error && (
        <div className="bg-red-900/50 border-b border-red-700 px-6 py-2 text-sm text-red-300">
          ⚠ {state.error}
        </div>
      )}

      <main className="grid grid-cols-1 lg:grid-cols-[1fr_380px] min-h-[calc(100vh-64px)]">
        {/* ── Left Panel ── */}
        <div className="border-r border-zinc-800 p-6 overflow-y-auto">
          {/* Readiness ring */}
          <div className="flex items-center gap-6 mb-6">
            <svg width="88" height="88" viewBox="0 0 88 88" className="shrink-0">
              <circle cx="44" cy="44" r={r} fill="none" stroke="#27272a" strokeWidth="8" />
              <circle
                cx="44" cy="44" r={r} fill="none"
                stroke={readiness > 0.6 ? "#22c55e" : readiness > 0.35 ? "#f59e0b" : "#ef4444"}
                strokeWidth="8"
                strokeDasharray={`${arc} ${circ - arc}`}
                strokeLinecap="round"
                strokeDashoffset={circ / 4}
                transform="rotate(-90 44 44)"
              />
              <text x="44" y="48" textAnchor="middle" fill="white" fontSize="14" fontWeight="600">
                {(readiness * 100).toFixed(0)}%
              </text>
            </svg>
            <div>
              <h2 className="text-lg font-semibold">{state.learner.name}'s Readiness</h2>
              <p className="text-sm text-zinc-400 max-w-xs">
                {state.gap?.summary ?? "Generate a plan to see your gap analysis."}
              </p>
            </div>
          </div>

          {/* Skill pills */}
          {state.gap && (
            <div className="mb-6 space-y-2">
              <div className="flex flex-wrap gap-2">
                {state.gap.missing.slice(0, 6).map(g => (
                  <span key={g.skillId} className="text-xs bg-red-900/50 text-red-300 border border-red-800 rounded-full px-2.5 py-0.5">
                    ✗ {g.skillId} ({g.current}→{g.required})
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {state.gap.strengths.slice(0, 4).map(g => (
                  <span key={g.skillId} className="text-xs bg-green-900/50 text-green-300 border border-green-800 rounded-full px-2.5 py-0.5">
                    ✓ {g.skillId}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3 mb-6">
            <button
              onClick={handleGenerate}
              disabled={state.loading}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
            >
              {state.loading ? "Generating…" : state.plan ? "Regenerate Plan" : "Generate Plan"}
            </button>

            {state.plan && (
              <>
                <button
                  onClick={handleSimulateQuizFail}
                  disabled={state.loading}
                  className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-sm text-white px-4 py-2 rounded-lg"
                >
                  Simulate failed assessment
                </button>
                <button
                  onClick={() => setShowQuiz(true)}
                  disabled={state.loading}
                  className="border border-zinc-600 hover:border-zinc-400 text-sm text-zinc-300 px-4 py-2 rounded-lg"
                >
                  Take quiz
                </button>
              </>
            )}
          </div>

          {/* Mentor message */}
          {state.mentorMessage && (
            <div className="bg-indigo-900/40 border border-indigo-700 rounded-lg px-4 py-3 mb-5 text-sm text-indigo-200">
              🎓 {state.mentorMessage}
            </div>
          )}

          {/* Diff summary */}
          {state.diff && (
            <div className="flex gap-3 mb-5 text-xs flex-wrap">
              <span className="bg-green-900/50 text-green-300 border border-green-800 px-2 py-1 rounded">
                +{state.diff.addedHours}h added
              </span>
              <span className="bg-zinc-700 text-zinc-300 border border-zinc-600 px-2 py-1 rounded">
                {state.diff.keptHours}h kept ({(state.diff.preservedPct * 100).toFixed(0)}%)
              </span>
              {state.diff.removedHours > 0 && (
                <span className="bg-red-900/50 text-red-300 border border-red-800 px-2 py-1 rounded">
                  -{state.diff.removedHours}h removed
                </span>
              )}
            </div>
          )}

          <Roadmap
            modules={state.plan?.modules ?? []}
            preservedPct={state.diff?.preservedPct}
          />
        </div>

        {/* ── Right Panel ── */}
        <div className="p-4 overflow-y-auto">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Agent Trace
          </h2>
          <TraceConsole trace={state.trace} />
        </div>
      </main>

      {/* ── Quiz Modal ── */}
      {showQuiz && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-lg w-full">
            <h2 className="text-lg font-semibold mb-4">
              Quiz — {ROLES.find(r => r.id === state.learner.targetRoleId)?.title}
            </h2>
            <div className="space-y-5 mb-6">
              {quizQuestions.map(q => (
                <div key={q.questionId}>
                  <p className="text-sm font-medium mb-2">{q.question}</p>
                  <div className="space-y-1">
                    {q.options.map(opt => (
                      <label key={opt} className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                        <input
                          type="radio"
                          name={q.questionId}
                          value={opt}
                          checked={quizAnswers[q.questionId] === opt}
                          onChange={() => setQuizAnswers(prev => ({ ...prev, [q.questionId]: opt }))}
                          className="accent-indigo-500"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={handleQuizSubmit} disabled={state.loading}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-5 py-2 rounded-lg flex-1">
                Submit Quiz
              </button>
              <button onClick={() => setShowQuiz(false)}
                className="border border-zinc-700 text-zinc-400 text-sm px-4 py-2 rounded-lg">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
