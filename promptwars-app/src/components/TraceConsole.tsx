"use client";

import { useState } from "react";
import type { AgentEnvelope } from "@/lib/types";

interface TraceConsoleProps {
  trace: AgentEnvelope[];
}

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  ok:    { label: "VERIFIED", className: "bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30" },
  warn:  { label: "REVISED",  className: "bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/30" },
  error: { label: "FALLBACK", className: "bg-[#F43F5E]/15 text-[#F43F5E] border-[#F43F5E]/30" },
};

const AGENT_META: Record<string, { label: string; icon: string; description: string }> = {
  profile:  { label: "Profile Ingestion",   icon: "🧠", description: "Skill matrix baseline extraction" },
  gap:      { label: "Gap Analyst",         icon: "🔍", description: "Prerequisite DAG differential" },
  planner:  { label: "Adaptive Planner",    icon: "📅", description: "Topological schedule synthesis" },
  critic:   { label: "Constraint Critic",   icon: "⚖️", description: "Hard invariant & capacity verification" },
  assessor: { label: "Competency Assessor", icon: "📝", description: "Diagnostic evaluation & remediation" },
  mentor:   { label: "Adaptive Mentor",     icon: "🎓", description: "Learner guidance & transition narrative" },
};

export default function TraceConsole({ trace }: TraceConsoleProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTabMap, setActiveTabMap] = useState<Record<string, "summary" | "json" | "input">>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (trace.length === 0) {
    return (
      <div className="card-surface text-[#94A3B8] text-xs font-mono italic px-4 py-16 text-center border-dashed border-white/10 rounded-2xl">
        Multi-agent coordination telemetry will stream here upon curriculum synthesis.
      </div>
    );
  }

  function handleToggle(id: string) {
    setExpandedId(prev => (prev === id ? null : id));
  }

  function setTab(envelopeId: string, tab: "summary" | "json" | "input") {
    setActiveTabMap(prev => ({ ...prev, [envelopeId]: tab }));
  }

  function handleCopyJson(envelope: AgentEnvelope) {
    navigator.clipboard.writeText(JSON.stringify(envelope, null, 2));
    setCopiedId(envelope.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="space-y-3">
      {trace.map((env, index) => {
        const isExpanded = expandedId === env.id;
        const meta = AGENT_META[env.agent] ?? { label: env.agent, icon: "🤖", description: "Autonomous Agent" };
        const statusBadge = STATUS_BADGES[env.status] ?? STATUS_BADGES.ok;
        const currentTab = activeTabMap[env.id] || "summary";
        const outputObj = env.output as any;
        const checks = outputObj?.checks;
        const ruleIssues = outputObj?.ruleIssues as string[] | undefined;
        const isCritic = env.agent === "critic";

        return (
          <div
            key={env.id}
            className={`border rounded-xl transition-all duration-200 overflow-hidden ${
              isExpanded
                ? "bg-[#151923] border-[#6366F1]/60 shadow-[0_0_24px_rgba(99,102,241,0.15)] ring-1 ring-[#6366F1]/20"
                : "card-surface hover:border-white/20"
            }`}
          >
            {/* Clickable Header Card */}
            <div
              onClick={() => handleToggle(env.id)}
              className="p-3.5 flex items-center justify-between gap-3 cursor-pointer select-none"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-[#07080C] border border-white/10 flex items-center justify-center text-sm shrink-0">
                  {meta.icon}
                </span>
                <div className="truncate">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[#F8FAFC] tracking-tight">
                      {meta.label}
                    </span>
                    <span className="text-[10px] font-mono tabular-nums text-[#94A3B8]">
                      #{index + 1}
                    </span>
                    {outputObj?.version && (
                      <span className="text-[9px] font-mono bg-[#6366F1]/15 text-[#6366F1] border border-[#6366F1]/30 px-1.5 py-0.2 rounded font-semibold">
                        {outputObj.version}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-[#94A3B8] block truncate">
                    {meta.description}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${statusBadge.className}`}>
                  {statusBadge.label}
                </span>
                <span className="text-[10px] font-mono tabular-nums text-[#06B6D4] bg-[#07080C] px-1.5 py-0.5 rounded border border-white/10">
                  {env.latencyMs}ms
                </span>
                <span className="text-xs text-[#94A3B8] font-mono">
                  {isExpanded ? "▲" : "▼"}
                </span>
              </div>
            </div>

            {/* Expandable Body */}
            {isExpanded && (
              <div className="border-t border-white/[0.08] bg-[#07080C]/80 p-4 space-y-3.5 animate-in fade-in duration-150">
                
                {/* Rationale Banner */}
                <div className="bg-[#0E1117] border border-white/[0.08] rounded-lg p-3">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#94A3B8] block mb-1">
                    Agent Decision Rationale
                  </span>
                  <p className="text-xs text-[#F8FAFC] leading-relaxed">
                    {env.rationale}
                  </p>
                </div>

                {/* Critic Invariant Checks Badge Section */}
                {isCritic && (
                  <div className="bg-[#0E1117] border border-white/[0.08] rounded-lg p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[#06B6D4] font-bold flex items-center gap-1.5">
                        <span>⚖️</span>
                        <span>Hard Constraint Verification</span>
                      </span>
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.2 rounded border ${
                        env.status === "ok" ? "bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30" : "bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/30"
                      }`}>
                        {env.status === "ok" ? "ALL INVARIANTS PASS" : "REVISION REQUIRED"}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs font-mono">
                      {/* Check 1: Weekly Hours */}
                      <div className="flex items-center justify-between p-2 rounded bg-[#07080C] border border-white/[0.06]">
                        <div className="flex items-center gap-2">
                          <span className={checks?.weekly_hours_cap?.status === "FAIL" || checks?.weeklyBudgetPass === false ? "text-[#F43F5E]" : "text-[#10B981]"}>
                            {checks?.weekly_hours_cap?.status === "FAIL" || checks?.weeklyBudgetPass === false ? "✕" : "✓"}
                          </span>
                          <span className="text-[#F8FAFC]">1. Weekly Capacity Cap</span>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                          checks?.weekly_hours_cap?.status === "FAIL" || checks?.weeklyBudgetPass === false
                            ? "bg-[#F43F5E]/15 text-[#F43F5E] border border-[#F43F5E]/30"
                            : "bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30"
                        }`}>
                          {checks?.weekly_hours_cap?.status === "FAIL" || checks?.weeklyBudgetPass === false ? "FAIL (> Budget)" : "PASS (≤ Budget)"}
                        </span>
                      </div>

                      {/* Check 2: DAG Prereq Order */}
                      <div className="flex items-center justify-between p-2 rounded bg-[#07080C] border border-white/[0.06]">
                        <div className="flex items-center gap-2">
                          <span className={checks?.dagOrderPass === false ? "text-[#F43F5E]" : "text-[#10B981]"}>
                            {checks?.dagOrderPass === false ? "✕" : "✓"}
                          </span>
                          <span className="text-[#F8FAFC]">2. Prerequisite DAG Order</span>
                        </div>
                        <span className="text-[10px] bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 px-2 py-0.5 rounded font-bold">
                          PASS (Sequenced)
                        </span>
                      </div>

                      {/* Check 3: Zero Hallucinations */}
                      <div className="flex items-center justify-between p-2 rounded bg-[#07080C] border border-white/[0.06]">
                        <div className="flex items-center gap-2">
                          <span className={checks?.zeroHallucinationsPass === false ? "text-[#F43F5E]" : "text-[#10B981]"}>
                            {checks?.zeroHallucinationsPass === false ? "✕" : "✓"}
                          </span>
                          <span className="text-[#F8FAFC]">3. Zero Hallucinations</span>
                        </div>
                        <span className="text-[10px] bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 px-2 py-0.5 rounded font-bold">
                          PASS (Canonical)
                        </span>
                      </div>
                    </div>

                    {/* Rule Issues if rejected */}
                    {ruleIssues && ruleIssues.length > 0 && (
                      <div className="bg-[#F43F5E]/10 border border-[#F43F5E]/30 p-2.5 rounded text-[11px] text-[#F43F5E] space-y-1 font-mono">
                        <span className="font-bold block">Identified Invariant Violations:</span>
                        {ruleIssues.map((issue, i) => (
                          <div key={i} className="flex items-start gap-1.5">
                            <span>•</span>
                            <span>{issue}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Sub-tab Navigation */}
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setTab(env.id, "summary")}
                      className={`text-[11px] font-mono px-2 py-0.5 rounded transition-colors ${
                        currentTab === "summary"
                          ? "bg-[#6366F1]/20 text-[#6366F1] font-bold border border-[#6366F1]/40"
                          : "text-[#94A3B8] hover:text-[#F8FAFC]"
                      }`}
                    >
                      Decision Contract
                    </button>
                    <button
                      onClick={() => setTab(env.id, "json")}
                      className={`text-[11px] font-mono px-2 py-0.5 rounded transition-colors ${
                        currentTab === "json"
                          ? "bg-[#6366F1]/20 text-[#6366F1] font-bold border border-[#6366F1]/40"
                          : "text-[#94A3B8] hover:text-[#F8FAFC]"
                      }`}
                    >
                      Output (JSON)
                    </button>
                    <button
                      onClick={() => setTab(env.id, "input")}
                      className={`text-[11px] font-mono px-2 py-0.5 rounded transition-colors ${
                        currentTab === "input"
                          ? "bg-[#6366F1]/20 text-[#6366F1] font-bold border border-[#6366F1]/40"
                          : "text-[#94A3B8] hover:text-[#F8FAFC]"
                      }`}
                    >
                      Input Payload
                    </button>
                  </div>

                  <button
                    onClick={() => handleCopyJson(env)}
                    className="text-[10px] font-mono text-[#94A3B8] hover:text-[#F8FAFC] px-2 py-0.5 rounded border border-white/10 hover:bg-white/[0.04] transition-colors"
                  >
                    {copiedId === env.id ? "✓ Copied" : "Copy Payload"}
                  </button>
                </div>

                {/* Tab 1: Decision Contract Summary */}
                {currentTab === "summary" && (
                  <div className="text-xs font-mono bg-[#07080C] p-3 rounded-lg border border-white/[0.08] text-[#F8FAFC] space-y-2 max-h-56 overflow-y-auto">
                    {outputObj?.verdict && (
                      <div className="flex items-center gap-2">
                        <span className="text-[#94A3B8]">Critic Verdict:</span>
                        <strong className={outputObj.verdict === "pass" ? "text-[#10B981] font-bold" : "text-[#F59E0B] font-bold"}>
                          {outputObj.verdict.toUpperCase()}
                        </strong>
                      </div>
                    )}
                    {outputObj?.summary && (
                      <div>
                        <span className="text-[#94A3B8] block mb-0.5">Decision Summary:</span>
                        <p className="text-[#F8FAFC] text-[11px] leading-relaxed bg-[#0E1117] p-2 rounded border border-white/[0.08]">
                          {outputObj.summary}
                        </p>
                      </div>
                    )}
                    {outputObj?.action && (
                      <div className="flex items-center gap-2">
                        <span className="text-[#94A3B8]">Action:</span>
                        <span className="text-[#06B6D4] font-bold">{outputObj.action}</span>
                      </div>
                    )}
                    {outputObj?.score !== undefined && (
                      <div className="flex items-center gap-2">
                        <span className="text-[#94A3B8]">Diagnostic Score:</span>
                        <span className="text-[#06B6D4] font-bold tabular-nums">{(outputObj.score * 100).toFixed(0)}%</span>
                      </div>
                    )}
                    {outputObj?.readiness !== undefined && (
                      <div className="flex items-center gap-2">
                        <span className="text-[#94A3B8]">Evaluated Readiness:</span>
                        <span className="text-[#10B981] font-bold tabular-nums">{(outputObj.readiness * 100).toFixed(1)}%</span>
                      </div>
                    )}
                    {outputObj?.masteryPenalty && (
                      <div className="text-[#F43F5E] text-[11px]">
                        ⚠️ {outputObj.masteryPenalty}
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 2: Decision Contract JSON */}
                {currentTab === "json" && (
                  <pre className="text-[10px] font-mono tabular-nums bg-[#07080C] p-3 rounded-lg border border-white/[0.08] text-[#94A3B8] overflow-x-auto max-h-56 leading-relaxed">
                    {JSON.stringify(env.output, null, 2)}
                  </pre>
                )}

                {/* Tab 3: Input Parameters */}
                {currentTab === "input" && (
                  <pre className="text-[10px] font-mono tabular-nums bg-[#07080C] p-3 rounded-lg border border-white/[0.08] text-[#94A3B8] overflow-x-auto max-h-56 leading-relaxed">
                    {JSON.stringify(env.input, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
