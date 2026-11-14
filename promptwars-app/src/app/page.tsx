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
      } catch {
        dispatch({ type: "SET_ERROR", payload: "Replay data not yet loaded." });
      }
      return;
    }

    dispatch({ type: "SET_LOADING", payload: true });
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ learner: state.learner }),
      });
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}: ${res.statusText}`);
      }
      const data: PlanResponse = await res.json();
      dispatch({ type: "SET_PLAN_RESPONSE", payload: data });
    } catch (err) {
      console.error("Plan Generation Error:", err);
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
      } catch {
        dispatch({ type: "SET_ERROR", payload: "Replay data not yet loaded." });
      }
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
      if (!res.ok) throw new Error(`Adapt returned status ${res.status}`);
      const data: AdaptResponse = await res.json();
      dispatch({ type: "SET_ADAPT_RESPONSE", payload: data });
    } catch (err) {
      console.error("Quiz Adapt Error:", err);
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Adaptation failed" });
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
      } catch {
        dispatch({ type: "SET_ERROR", payload: "Replay data not yet loaded." });
      }
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
      if (!res.ok) throw new Error(`Adapt returned status ${res.status}`);
      const data: AdaptResponse = await res.json();
      dispatch({ type: "SET_ADAPT_RESPONSE", payload: data });
    } catch (err) {
      console.error("Quiz Submit Error:", err);
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Quiz evaluation failed" });
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

    if (state.mode === "replay") {
      try {
        const { replayCache } = await import("@/data/replay");
        dispatch({ type: "SET_ADAPT_RESPONSE", payload: replayCache.afterGoalChange });
        dispatch({ type: "SET_LEARNER", payload: { targetRoleId: newRoleId } });
      } catch {
        dispatch({ type: "SET_ERROR", payload: "Replay data not loaded." });
      }
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
      if (!res.ok) throw new Error(`Role change returned status ${res.status}`);
      const data: AdaptResponse = await res.json();
      dispatch({ type: "SET_ADAPT_RESPONSE", payload: data });
    } catch (err) {
      console.error("Role Change Error:", err);
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Role switch adaptation failed" });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }

  // ── Readiness Calculation ───────────────────────────────────────────────────
  const readiness = state.gap?.readiness ?? 0;
  const r = 36;
  const circ = 2 * Math.PI * r;
  const arc = circ * readiness;
  const quizQuestions = QUIZ_QUESTIONS.filter(q => q.roleId === state.learner.targetRoleId);

  if (!state.mounted) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-neutral-400 font-mono text-sm">
          <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-ping"></span>
          Initializing Currico...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-indigo-500 selection:text-white">
      {/* ── Top Navigation Bar ── */}
      <header className="border-b border-neutral-800/80 bg-neutral-900/50 backdrop-blur-md sticky top-0 z-40 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center font-black text-white text-base shadow-lg shadow-indigo-500/20">
              C
            </span>
            <div className="leading-tight">
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-neutral-200 to-neutral-400 bg-clip-text text-transparent">
                Currico
              </span>
              <span className="text-[10px] text-indigo-400 font-mono block uppercase tracking-wider">
                Adaptive Core
              </span>
            </div>
          </div>

          <div className="h-5 w-px bg-neutral-800 hidden sm:block"></div>

          {/* Persona Display */}
          <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded-md">
            <span className="text-xs text-neutral-400">Learner:</span>
            <span className="text-xs font-semibold text-neutral-200">{state.learner.name}</span>
          </div>

          {/* Goal Selector */}
          <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded-md">
            <span className="text-xs text-neutral-400">Target Role:</span>
            <select
              value={state.learner.targetRoleId}
              onChange={e => handleRoleChange(e.target.value as RoleId)}
              className="bg-transparent text-xs font-semibold text-indigo-300 focus:outline-none cursor-pointer"
            >
              {ROLES.map(r => (
                <option key={r.id} value={r.id} className="bg-neutral-900 text-neutral-200">
                  {r.title}
                </option>
              ))}
            </select>
          </div>

          {/* Budget Slider */}
          <div className="flex items-center gap-3 bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded-md">
            <span className="text-xs text-neutral-400">Weekly Commitment:</span>
            <input
              type="range"
              min={2}
              max={20}
              step={1}
              value={state.learner.hoursPerWeek}
              onChange={e => dispatch({ type: "SET_LEARNER", payload: { hoursPerWeek: Number(e.target.value) } })}
              className="w-20 accent-indigo-500 cursor-pointer"
            />
            <span className="text-xs font-mono font-bold text-indigo-400 w-8">{state.learner.hoursPerWeek} h</span>
          </div>
        </div>

        {/* Right Action Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => dispatch({ type: "SET_MODE", payload: state.mode === "live" ? "replay" : "live" })}
            className={`text-xs px-3 py-1.5 rounded-md border font-mono transition-all flex items-center gap-2 ${
              state.mode === "replay"
                ? "bg-amber-950/60 border-amber-600/60 text-amber-300 shadow-sm shadow-amber-900/30"
                : "bg-neutral-900 border-neutral-700/70 text-neutral-300 hover:border-neutral-500"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${state.mode === "live" ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`}></span>
            {state.mode === "live" ? "LIVE ENGINE" : "REPLAY CACHE"}
          </button>

          <button
            onClick={() => { clearRuns(); dispatch({ type: "RESET_DEMO" }); }}
            className="text-xs px-3 py-1.5 rounded-md border border-neutral-800 bg-neutral-900/80 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700 transition-colors"
          >
            Reset
          </button>
        </div>
      </header>

      {/* ── Notification Banner (Error / Warning) ── */}
      {state.error && (
        <div className="bg-rose-950/70 border-b border-rose-800/80 px-6 py-2.5 text-xs font-medium text-rose-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{state.error}</span>
          </div>
          <button onClick={() => dispatch({ type: "SET_ERROR", payload: "" })} className="text-rose-400 hover:text-rose-200">
            Dismiss
          </button>
        </div>
      )}

      {/* ── Main Two-Column Layout ── */}
      <main className="grid grid-cols-1 lg:grid-cols-[1fr_420px] min-h-[calc(100vh-65px)]">

        {/* ── Left Pane: Roadmap & Readiness ── */}
        <div className="p-8 border-r border-neutral-800/60 space-y-8 overflow-y-auto">

          {/* Readiness & Gap Hero Box */}
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-6 shadow-sm flex flex-col sm:flex-row items-center gap-6">
            {/* SVG Ring */}
            <div className="relative shrink-0">
              <svg width="100" height="100" viewBox="0 0 100 100" className="rotate-[-90deg]">
                <circle cx="50" cy="50" r={r} fill="none" stroke="#262626" strokeWidth="8" />
                <circle
                  cx="50" cy="50" r={r} fill="none"
                  stroke={readiness > 0.6 ? "#10b981" : readiness > 0.3 ? "#6366f1" : "#f43f5e"}
                  strokeWidth="8"
                  strokeDasharray={`${arc} ${circ - arc}`}
                  strokeLinecap="round"
                  className="transition-all duration-700 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-lg font-black tracking-tight text-white font-mono">
                  {(readiness * 100).toFixed(0)}%
                </span>
                <span className="text-[9px] uppercase tracking-wider text-neutral-400 font-semibold">Match</span>
              </div>
            </div>

            <div className="space-y-1.5 flex-1 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">
                  {state.learner.name}&apos;s Skill Baseline
                </h2>
                <span className="text-[11px] bg-indigo-950/80 border border-indigo-700/60 text-indigo-300 font-mono px-2 py-0.5 rounded">
                  {ROLES.find(r => r.id === state.learner.targetRoleId)?.title}
                </span>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed max-w-xl">
                {state.gap?.summary ?? "Click Generate Plan to execute DAG gap evaluation and multi-agent synthesis."}
              </p>
            </div>
          </div>

          {/* Skill Pills (Gaps vs Strengths) */}
          {state.gap && (
            <div className="space-y-3 bg-neutral-900/30 border border-neutral-800/60 rounded-xl p-5">
              <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider block">
                Evaluated Skill Matrix
              </span>
              <div className="flex flex-wrap gap-2">
                {state.gap.missing.map(g => (
                  <span
                    key={g.skillId}
                    className="text-xs bg-rose-950/40 text-rose-300 border border-rose-800/60 rounded-md px-2.5 py-1 font-mono flex items-center gap-1.5"
                  >
                    <span className="text-rose-400">×</span>
                    <span>{g.skillId}</span>
                    <span className="text-[10px] text-rose-400/80">({g.current}→{g.required})</span>
                  </span>
                ))}
                {state.gap.strengths.map(g => (
                  <span
                    key={g.skillId}
                    className="text-xs bg-emerald-950/40 text-emerald-300 border border-emerald-800/60 rounded-md px-2.5 py-1 font-mono flex items-center gap-1.5"
                  >
                    <span className="text-emerald-400">✓</span>
                    <span>{g.skillId}</span>
                    <span className="text-[10px] text-emerald-400/80">(Met)</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Action Trigger Area */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleGenerate}
              disabled={state.loading}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold px-5 py-2.5 rounded-lg shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
            >
              {state.loading && <span className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>}
              {state.loading ? "Synthesizing Plan..." : state.plan ? "Re-generate Plan" : "Generate Plan"}
            </button>

            {state.plan && (
              <>
                <button
                  onClick={handleSimulateQuizFail}
                  disabled={state.loading}
                  className="bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-200 text-xs font-medium px-4 py-2.5 rounded-lg border border-neutral-700 transition-all active:scale-95 cursor-pointer"
                >
                  ⚡ Simulate Quiz Failure
                </button>
                <button
                  onClick={() => setShowQuiz(true)}
                  disabled={state.loading}
                  className="bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-200 text-xs font-medium px-4 py-2.5 rounded-lg border border-neutral-700 transition-all active:scale-95 cursor-pointer"
                >
                  📝 Take Live Assessment
                </button>
              </>
            )}
          </div>

          {/* Mentor Directive Banner */}
          {state.mentorMessage && (
            <div className="bg-gradient-to-r from-indigo-950/60 via-purple-950/40 to-neutral-900 border border-indigo-700/60 rounded-xl p-4 shadow-sm space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-400 font-semibold block">
                Mentor Feedback
              </span>
              <p className="text-xs text-indigo-200 leading-relaxed">
                {state.mentorMessage}
              </p>
            </div>
          )}

          {/* Diff Summary Badges */}
          {state.diff && (
            <div className="flex items-center gap-3 bg-neutral-900/60 border border-neutral-800 p-3.5 rounded-xl text-xs flex-wrap">
              <span className="text-[11px] font-mono text-neutral-400">Plan Delta:</span>
              <span className="bg-emerald-950/60 text-emerald-300 border border-emerald-800/80 px-2.5 py-0.5 rounded font-mono font-medium">
                +{state.diff.addedHours}h added
              </span>
              <span className="bg-neutral-800 text-neutral-200 border border-neutral-700 px-2.5 py-0.5 rounded font-mono font-medium">
                {state.diff.keptHours}h preserved ({(state.diff.preservedPct * 100).toFixed(0)}%)
              </span>
              {state.diff.removedHours > 0 && (
                <span className="bg-rose-950/60 text-rose-300 border border-rose-800/80 px-2.5 py-0.5 rounded font-mono font-medium">
                  -{state.diff.removedHours}h trimmed
                </span>
              )}
            </div>
          )}

          {/* Roadmap Module View */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
              <h3 className="text-xs font-mono uppercase tracking-wider text-neutral-400 font-semibold">
                Curriculum Schedule
              </h3>
              {state.plan && (
                <span className="text-xs font-mono text-neutral-500">
                  {state.plan.totalHours}h Total · {state.plan.numberOfWeeks} Weeks · v{state.plan.version}
                </span>
              )}
            </div>

            <Roadmap
              modules={state.plan?.modules ?? []}
              preservedPct={state.diff?.preservedPct}
            />
          </div>
        </div>

        {/* ── Right Pane: Real-time Multi-Agent Trace Console ── */}
        <div className="bg-neutral-950/90 p-6 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
            <div>
              <h3 className="text-xs font-mono uppercase tracking-wider text-neutral-200 font-bold">
                Agent Coordination Trace
              </h3>
              <p className="text-[11px] text-neutral-500">Observable telemetry & decision contracts</p>
            </div>
            <span className="text-[11px] font-mono bg-neutral-900 border border-neutral-800 px-2 py-0.5 rounded text-neutral-400">
              {state.trace.length} Envelopes
            </span>
          </div>

          <TraceConsole trace={state.trace} />
        </div>
      </main>

      {/* ── Assessment Quiz Modal ── */}
      {showQuiz && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 max-w-lg w-full space-y-5 shadow-2xl">
            <div className="border-b border-neutral-800 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Live Skill Evaluation</h3>
                <p className="text-xs text-neutral-400">
                  Assessing core competency for {ROLES.find(r => r.id === state.learner.targetRoleId)?.title}
                </p>
              </div>
              <button
                onClick={() => setShowQuiz(false)}
                className="text-neutral-400 hover:text-white text-lg font-mono leading-none"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
              {quizQuestions.map(q => (
                <div key={q.questionId} className="bg-neutral-950/60 border border-neutral-800/80 p-4 rounded-xl space-y-2.5">
                  <p className="text-xs font-semibold text-neutral-200">{q.question}</p>
                  <div className="space-y-1.5">
                    {q.options.map(opt => (
                      <label
                        key={opt}
                        className="flex items-center gap-2.5 text-xs text-neutral-300 p-2 rounded-lg hover:bg-neutral-800/50 cursor-pointer border border-transparent hover:border-neutral-700/50 transition-colors"
                      >
                        <input
                          type="radio"
                          name={q.questionId}
                          value={opt}
                          checked={quizAnswers[q.questionId] === opt}
                          onChange={() => setQuizAnswers(prev => ({ ...prev, [q.questionId]: opt }))}
                          className="accent-indigo-500"
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleQuizSubmit}
                disabled={state.loading}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-5 py-2.5 rounded-lg flex-1 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              >
                Submit & Trigger Adaptation
              </button>
              <button
                onClick={() => setShowQuiz(false)}
                className="border border-neutral-800 hover:bg-neutral-800 text-neutral-400 text-xs px-4 py-2.5 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
