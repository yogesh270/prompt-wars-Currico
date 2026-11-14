"use client";

import { useReducer, useEffect, useState, useCallback } from "react";
import type {
  Learner, PlanResponse, AdaptResponse, RoleId
} from "@/lib/types";
import { ROLES, PRIYA_PERSONA, QUIZ_QUESTIONS } from "@/lib/seed";
import { computeGap } from "@/lib/engine";
import { appReducer, initialState, persistRun, loadLatestRun, clearRuns } from "@/lib/store";
import { isSupabaseConfigured, saveLearnerToSupabase, savePlanToSupabase } from "@/lib/supabase";
import Roadmap from "@/components/Roadmap";
import TraceConsole from "@/components/TraceConsole";
import LearnerProfileModal from "@/components/LearnerProfileModal";
import DiagnosticQuizModal from "@/components/DiagnosticQuizModal";

export default function Home() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [showQuiz, setShowQuiz] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

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
    if (state.mounted && state.plan) {
      persistRun(state);
      // Also persist to Supabase if credentials exist
      if (isSupabaseConfigured) {
        savePlanToSupabase(state.plan, state.learner.id, state.trace).catch(() => {});
      }
    }
  }, [state.plan?.id, state.mounted]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleGenerate = useCallback(async (customLearner?: Learner) => {
    const activeLearner = customLearner || state.learner;

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
        body: JSON.stringify({ learner: activeLearner }),
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
  }, [state.mode, state.learner]);

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

      const role = ROLES.find(r => r.id === state.learner.targetRoleId);
      if (data.updatedLearner && role) {
        const updatedGap = computeGap(data.updatedLearner, role);
        dispatch({
          type: "SET_PLAN_RESPONSE",
          payload: { plan: data.plan, gap: updatedGap, trace: data.trace },
        });
        dispatch({ type: "SET_ADAPT_RESPONSE", payload: data });
        dispatch({ type: "SET_LEARNER", payload: data.updatedLearner });
      } else {
        dispatch({ type: "SET_ADAPT_RESPONSE", payload: data });
      }
    } catch (err) {
      console.error("Quiz Adapt Error:", err);
      dispatch({ type: "SET_ERROR", payload: err instanceof Error ? err.message : "Adaptation failed" });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }

  function handleAssessmentComplete(updatedLearner: Learner, scorePct: number) {
    const role = ROLES.find(r => r.id === updatedLearner.targetRoleId);
    if (role) {
      const updatedGap = computeGap(updatedLearner, role);
      dispatch({ type: "SET_LEARNER", payload: updatedLearner });
      if (state.plan) {
        dispatch({
          type: "SET_PLAN_RESPONSE",
          payload: { plan: state.plan, gap: updatedGap, trace: state.trace },
        });
      }
    }
    handleGenerate(updatedLearner);
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

  function handleSaveCustomProfile(updatedLearner: Learner, rawResumeText?: string) {
    dispatch({ type: "SET_LEARNER", payload: updatedLearner });
    // Persist to Supabase if available
    saveLearnerToSupabase(updatedLearner, rawResumeText).catch(() => {});
    // Auto-trigger multi-agent curriculum pipeline
    handleGenerate(updatedLearner);
  }

  function handleResetToPriya() {
    dispatch({ type: "SET_LEARNER", payload: PRIYA_PERSONA });
    handleGenerate(PRIYA_PERSONA);
  }

  // ── Readiness Calculation ───────────────────────────────────────────────────
  const readiness = state.gap?.readiness ?? 0;
  const r = 36;
  const circ = 2 * Math.PI * r;
  const arc = circ * readiness;

  if (!state.mounted) {
    return (
      <div className="min-h-screen bg-[#07080C] flex items-center justify-center">
        <div className="flex items-center gap-3 text-[#94A3B8] font-mono text-sm">
          <span className="w-2.5 h-2.5 bg-[#6366F1] rounded-full animate-ping"></span>
          Initializing Currico Adaptive Core...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07080C] text-[#F8FAFC] font-sans selection:bg-[#6366F1] selection:text-white">
      {/* ── Top Navigation Bar ── */}
      <header className="border-b border-white/[0.08] bg-[#0E1117]/90 backdrop-blur-xl sticky top-0 z-40 px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[#6366F1] to-[#4F46E5] flex items-center justify-center font-black text-white text-sm shadow-[0_0_20px_rgba(99,102,241,0.3)]">
              C
            </span>
            <div className="leading-tight">
              <span className="font-bold text-base tracking-tight text-[#F8FAFC] flex items-center gap-2">
                <span>Currico</span>
                <span className="text-[10px] bg-[#6366F1]/15 text-[#6366F1] font-mono px-1.5 py-0.2 rounded border border-[#6366F1]/30 font-semibold">
                  v2.0
                </span>
              </span>
            </div>
          </div>

          <div className="h-4 w-px bg-white/10 hidden md:block"></div>

          {/* Clickable Custom Learner Pill */}
          <button
            onClick={() => setShowProfileModal(true)}
            title="Click to customize baseline skills or upload resume"
            className="flex items-center gap-2 bg-[#07080C] border border-white/10 hover:border-[#6366F1]/60 px-3 py-1.5 rounded-lg transition-colors cursor-pointer group shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          >
            <span className="text-xs text-[#94A3B8]">Learner:</span>
            <span className="text-xs font-semibold text-[#F8FAFC] group-hover:text-[#6366F1] flex items-center gap-1.5">
              <span>{state.learner.name}</span>
              <span className="text-[10px] text-[#94A3B8] group-hover:text-[#06B6D4] font-mono">✎ Edit</span>
            </span>
          </button>

          {/* Quick Priya Reset Pill if custom learner */}
          {state.learner.name !== PRIYA_PERSONA.name && (
            <button
              onClick={handleResetToPriya}
              className="text-[11px] font-mono text-[#94A3B8] hover:text-[#F8FAFC] bg-[#07080C] border border-white/10 px-2 py-1 rounded-md transition-colors"
            >
              Reset to Priya Preset
            </button>
          )}

          {/* Goal Selector */}
          <div className="flex items-center gap-2 bg-[#07080C] border border-white/10 px-3 py-1.5 rounded-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <span className="text-xs text-[#94A3B8]">Target Role:</span>
            <select
              value={state.learner.targetRoleId}
              onChange={e => handleRoleChange(e.target.value as RoleId)}
              className="bg-transparent text-xs font-semibold text-[#06B6D4] focus:outline-none cursor-pointer"
            >
              {ROLES.map(r => (
                <option key={r.id} value={r.id} className="bg-[#0E1117] text-[#F8FAFC]">
                  {r.title}
                </option>
              ))}
            </select>
          </div>

          {/* Budget Slider */}
          <div className="flex items-center gap-2.5 bg-[#07080C] border border-white/10 px-3 py-1.5 rounded-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <span className="text-xs text-[#94A3B8]">Commitment:</span>
            <input
              type="range"
              min={2}
              max={20}
              step={1}
              value={state.learner.hoursPerWeek}
              onChange={e => dispatch({ type: "SET_LEARNER", payload: { hoursPerWeek: Number(e.target.value) } })}
              className="w-16 accent-[#6366F1] cursor-pointer"
            />
            <span className="text-xs font-mono tabular-nums font-bold text-[#06B6D4] w-7">{state.learner.hoursPerWeek}h</span>
          </div>
        </div>

        {/* Right Action Controls */}
        <div className="flex items-center gap-3">
          {/* Supabase Status Pill */}
          <span className={`text-[10px] font-mono px-2.5 py-1 rounded-md border flex items-center gap-1.5 font-semibold ${
            isSupabaseConfigured
              ? "bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30"
              : "bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/30"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isSupabaseConfigured ? "bg-[#10B981]" : "bg-[#F59E0B]"}`}></span>
            {isSupabaseConfigured ? "DB: SUPABASE LIVE" : "DB: LOCAL FALLBACK"}
          </span>

          {/* Live / Replay Toggle */}
          <button
            onClick={() => dispatch({ type: "SET_MODE", payload: state.mode === "live" ? "replay" : "live" })}
            className={`text-xs px-3 py-1.5 rounded-lg border font-mono transition-all flex items-center gap-2 cursor-pointer ${
              state.mode === "replay"
                ? "bg-[#F59E0B]/15 border-[#F59E0B]/40 text-[#F59E0B]"
                : "bg-[#07080C] border-white/10 text-[#94A3B8] hover:border-white/20 hover:text-[#F8FAFC]"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${state.mode === "live" ? "bg-[#10B981] animate-pulse" : "bg-[#F59E0B]"}`}></span>
            {state.mode === "live" ? "LIVE ENGINE" : "REPLAY CACHE"}
          </button>

          <button
            onClick={() => { clearRuns(); dispatch({ type: "RESET_DEMO" }); }}
            className="text-xs px-3 py-1.5 rounded-lg border border-white/10 bg-[#07080C] text-[#94A3B8] hover:text-[#F8FAFC] hover:border-white/20 transition-colors cursor-pointer"
          >
            Reset
          </button>
        </div>
      </header>

      {/* ── Notification Banner (Error / Warning) ── */}
      {state.error && (
        <div className="bg-[#F43F5E]/15 border-b border-[#F43F5E]/30 px-6 py-2.5 text-xs font-medium text-[#F43F5E] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{state.error}</span>
          </div>
          <button onClick={() => dispatch({ type: "SET_ERROR", payload: "" })} className="text-[#F43F5E] hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* ── Main Two-Column Layout ── */}
      <main className="grid grid-cols-1 lg:grid-cols-[1fr_420px] min-h-[calc(100vh-61px)]">

        {/* ── Left Pane: Roadmap & Readiness ── */}
        <div className="p-8 border-r border-white/[0.08] space-y-7 overflow-y-auto">

          {/* Readiness & Gap Hero Box */}
          <div className="card-surface rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row items-center gap-6">
            {/* SVG Ring */}
            <div className="relative shrink-0">
              <svg width="96" height="96" viewBox="0 0 96 96" className="rotate-[-90deg]">
                <circle cx="48" cy="48" r={r} fill="none" stroke="#151923" strokeWidth="8" />
                <circle
                  cx="48" cy="48" r={r} fill="none"
                  stroke={readiness > 0.6 ? "#10B981" : readiness > 0.3 ? "#06B6D4" : "#F43F5E"}
                  strokeWidth="8"
                  strokeDasharray={`${arc} ${circ - arc}`}
                  strokeLinecap="round"
                  className="transition-all duration-700 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-lg font-black tracking-tight text-[#F8FAFC] font-mono tabular-nums">
                  {(readiness * 100).toFixed(0)}%
                </span>
                <span className="text-[9px] uppercase tracking-wider text-[#94A3B8] font-semibold">Match</span>
              </div>
            </div>

            <div className="space-y-2 flex-1 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <h2 className="text-base font-bold text-[#F8FAFC] tracking-tight">
                  {state.learner.name}&apos;s Skill Baseline
                </h2>
                <span className="text-[11px] bg-[#6366F1]/15 border border-[#6366F1]/30 text-[#6366F1] font-mono px-2 py-0.5 rounded font-semibold">
                  {ROLES.find(r => r.id === state.learner.targetRoleId)?.title}
                </span>
              </div>
              <p className="text-xs text-[#94A3B8] leading-relaxed max-w-xl">
                {state.gap?.summary ?? "Click Generate Plan to execute DAG gap evaluation and multi-agent synthesis."}
              </p>
              <div className="pt-1">
                <button
                  onClick={() => setShowProfileModal(true)}
                  className="text-[11px] font-mono text-[#06B6D4] hover:underline cursor-pointer"
                >
                  Edit Baseline Skills & Commitment →
                </button>
              </div>
            </div>
          </div>

          {/* Skill Pills (Gaps vs Strengths) */}
          {state.gap && (
            <div className="space-y-3 card-surface rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-[#94A3B8] uppercase tracking-wider block">
                  Skill Deficiency & Coverage Matrix
                </span>
                <span className="text-[11px] text-[#94A3B8] font-mono tabular-nums">
                  {state.gap.missing.length} Gaps · {state.gap.strengths.length} Met
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {state.gap.missing.map(g => (
                  <span
                    key={g.skillId}
                    className="text-xs bg-[#F43F5E]/10 text-[#F43F5E] border border-[#F43F5E]/30 rounded-lg px-2.5 py-1 font-mono tabular-nums flex items-center gap-1.5"
                  >
                    <span>×</span>
                    <span>{g.skillId}</span>
                    <span className="text-[10px] opacity-80">({g.current}→{g.required})</span>
                  </span>
                ))}
                {state.gap.strengths.map(g => (
                  <span
                    key={g.skillId}
                    className="text-xs bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/30 rounded-lg px-2.5 py-1 font-mono tabular-nums flex items-center gap-1.5"
                  >
                    <span>✓</span>
                    <span>{g.skillId}</span>
                    <span className="text-[10px] opacity-80">(Met)</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Action Trigger Area */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => handleGenerate()}
              disabled={state.loading}
              className="btn-indigo-glow disabled:opacity-50 text-xs font-semibold px-5 py-2.5 rounded-xl transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
            >
              {state.loading && <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>}
              {state.loading ? "Synthesizing Plan..." : state.plan ? "Re-generate Plan" : "Generate Plan"}
            </button>

            <button
              onClick={() => setShowProfileModal(true)}
              className="bg-[#0E1117] hover:bg-[#151923] text-[#F8FAFC] text-xs font-medium px-4 py-2.5 rounded-xl border border-white/10 hover:border-white/20 transition-all cursor-pointer"
            >
              Upload Resume / Custom Profile
            </button>

            {state.plan && (
              <>
                <button
                  onClick={handleSimulateQuizFail}
                  disabled={state.loading}
                  className="bg-[#0E1117] hover:bg-[#151923] disabled:opacity-50 text-[#F59E0B] text-xs font-medium px-4 py-2.5 rounded-xl border border-[#F59E0B]/30 hover:border-[#F59E0B]/60 transition-all active:scale-95 cursor-pointer shadow-sm shadow-[#F59E0B]/10"
                >
                  ⚡ Simulate Quiz Failure
                </button>
                <button
                  onClick={() => setShowQuiz(true)}
                  disabled={state.loading}
                  className="bg-[#0E1117] hover:bg-[#151923] disabled:opacity-50 text-[#06B6D4] text-xs font-medium px-4 py-2.5 rounded-xl border border-[#06B6D4]/30 hover:border-[#06B6D4]/60 transition-all active:scale-95 cursor-pointer shadow-sm shadow-[#06B6D4]/10"
                >
                  📝 Take Live Assessment
                </button>
              </>
            )}
          </div>

          {/* Mentor Directive Banner */}
          {state.mentorMessage && (
            <div className="bg-gradient-to-r from-[#6366F1]/15 via-[#0E1117] to-[#0E1117] border border-[#6366F1]/30 rounded-xl p-4 shadow-sm space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#06B6D4] font-semibold block">
                Adaptive Mentor Directive
              </span>
              <p className="text-xs text-[#F8FAFC] leading-relaxed">
                {state.mentorMessage}
              </p>
            </div>
          )}

          {/* Diff Summary Badges */}
          {state.diff && (
            <div className="flex items-center gap-3 card-surface p-3.5 rounded-xl text-xs flex-wrap font-mono tabular-nums">
              <span className="text-[11px] text-[#94A3B8]">Plan Adaptation Delta:</span>
              <span className="bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 px-2.5 py-0.5 rounded font-medium">
                +{state.diff.addedHours}h added
              </span>
              <span className="bg-white/[0.06] text-[#F8FAFC] border border-white/10 px-2.5 py-0.5 rounded font-medium">
                {state.diff.keptHours}h preserved ({(state.diff.preservedPct * 100).toFixed(0)}%)
              </span>
              {state.diff.removedHours > 0 && (
                <span className="bg-[#F43F5E]/15 text-[#F43F5E] border border-[#F43F5E]/30 px-2.5 py-0.5 rounded font-medium">
                  -{state.diff.removedHours}h trimmed
                </span>
              )}
            </div>
          )}

          {/* Roadmap Module View */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
              <h3 className="text-xs font-mono uppercase tracking-wider text-[#94A3B8] font-semibold">
                Curriculum Schedule & Capacity
              </h3>
              {state.plan && (
                <span className="text-xs font-mono tabular-nums text-[#94A3B8]">
                  {state.plan.totalHours}h Total · {state.plan.numberOfWeeks} Weeks · v{state.plan.version}
                </span>
              )}
            </div>

            <Roadmap
              modules={state.plan?.modules ?? []}
              preservedPct={state.diff?.preservedPct}
              weeklyBudget={state.learner.hoursPerWeek}
            />
          </div>
        </div>

        {/* ── Right Pane: Real-time Multi-Agent Trace Console ── */}
        <div className="bg-[#07080C] p-6 overflow-y-auto space-y-4 border-l border-white/[0.08]">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
            <div>
              <h3 className="text-xs font-mono uppercase tracking-wider text-[#F8FAFC] font-bold">
                Agent Coordination Telemetry
              </h3>
              <p className="text-[11px] text-[#94A3B8]">Real-time decision contracts & invariant validation</p>
            </div>
            <span className="text-[11px] font-mono tabular-nums bg-[#0E1117] border border-white/10 px-2.5 py-0.5 rounded text-[#06B6D4]">
              {state.trace.length} Envelopes
            </span>
          </div>

          <TraceConsole trace={state.trace} />
        </div>
      </main>

      {/* ── Custom Learner Profile Modal ── */}
      <LearnerProfileModal
        currentLearner={state.learner}
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        onSave={handleSaveCustomProfile}
      />

      {/* ── Live Diagnostic Assessment Modal ── */}
      <DiagnosticQuizModal
        isOpen={showQuiz}
        onClose={() => setShowQuiz(false)}
        currentLearner={state.learner}
        onAssessmentComplete={handleAssessmentComplete}
      />
    </div>
  );
}
