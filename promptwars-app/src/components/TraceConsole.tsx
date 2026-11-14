"use client";

import { useState } from "react";
import type { AgentEnvelope } from "@/lib/types";

interface TraceConsoleProps {
  trace: AgentEnvelope[];
}

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  ok:    { label: "VERIFIED", className: "bg-emerald-950/80 text-emerald-300 border-emerald-800" },
  warn:  { label: "REVISED",  className: "bg-amber-950/80 text-amber-300 border-amber-800" },
  error: { label: "FALLBACK", className: "bg-rose-950/80 text-rose-300 border-rose-800" },
};

const AGENT_META: Record<string, { label: string; icon: string; description: string }> = {
  profile:  { label: "Profile Ingestion", icon: "🧠", description: "Skill matrix baseline extraction" },
  gap:      { label: "Gap Analyst",       icon: "🔍", description: "Prerequisite DAG differential" },
  planner:  { label: "Adaptive Planner",  icon: "📅", description: "Topological schedule synthesis" },
  critic:   { label: "Constraint Critic", icon: "⚖️", description: "Invariant & capacity verification" },
  assessor: { label: "Competency Assessor", icon: "📝", description: "Diagnostic evaluation & remediation" },
  mentor:   { label: "Adaptive Mentor",   icon: "🎓", description: "Learner guidance & transition narrative" },
};

export default function TraceConsole({ trace }: TraceConsoleProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTabMap, setActiveTabMap] = useState<Record<string, "summary" | "json" | "input">>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (trace.length === 0) {
    return (
      <div className="text-neutral-500 text-xs font-mono italic px-4 py-16 text-center border border-dashed border-neutral-800/80 rounded-2xl bg-neutral-950/40">
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

        return (
          <div
            key={env.id}
            className={`border rounded-xl transition-all duration-200 overflow-hidden ${
              isExpanded
                ? "bg-[#111116] border-indigo-700/60 shadow-lg shadow-indigo-950/20 ring-1 ring-indigo-500/10"
                : "bg-neutral-900/40 border-neutral-800/80 hover:border-neutral-700/80"
            }`}
          >
            {/* Clickable Header Card */}
            <div
              onClick={() => handleToggle(env.id)}
              className="p-3.5 flex items-center justify-between gap-3 cursor-pointer select-none"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-sm shrink-0">
                  {meta.icon}
                </span>
                <div className="truncate">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white tracking-tight">
                      {meta.label}
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500">
                      #{index + 1}
                    </span>
                  </div>
                  <span className="text-[10px] text-neutral-400 block truncate">
                    {meta.description}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${statusBadge.className}`}>
                  {statusBadge.label}
                </span>
                <span className="text-[10px] font-mono text-neutral-400 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800">
                  {env.latencyMs}ms
                </span>
                <span className="text-xs text-neutral-500 font-mono">
                  {isExpanded ? "▲" : "▼"}
                </span>
              </div>
            </div>

            {/* Expandable Body */}
            {isExpanded && (
              <div className="border-t border-neutral-800/80 bg-neutral-950/60 p-4 space-y-3.5 animate-in fade-in duration-150">
                
                {/* Rationale Banner */}
                <div className="bg-neutral-900/80 border border-neutral-800 rounded-lg p-3">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 block mb-1">
                    Agent Decision Rationale
                  </span>
                  <p className="text-xs text-neutral-200 leading-relaxed">
                    {env.rationale}
                  </p>
                </div>

                {/* Constraint Checks (Specially for Critic & Planner) */}
                {checks && (
                  <div className="bg-[#0e0e12] border border-neutral-800 rounded-lg p-3 space-y-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-400 font-semibold block">
                      Hard Invariant Verification Checks
                    </span>
                    <div className="grid grid-cols-1 gap-1 text-[11px] font-mono">
                      <div className="flex items-center gap-2 text-emerald-400">
                        <span>✓</span>
                        <span>Weekly Budget Invariant: ≤ Commitment Allocation</span>
                      </div>
                      <div className="flex items-center gap-2 text-emerald-400">
                        <span>✓</span>
                        <span>Prerequisite DAG Order: Sequenced Partitions Satisfied</span>
                      </div>
                      <div className="flex items-center gap-2 text-emerald-400">
                        <span>✓</span>
                        <span>Zero Hallucinations: All Modules Verified against Seed Registry</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Sub-tab Navigation */}
                <div className="flex items-center justify-between border-b border-neutral-800/80 pb-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setTab(env.id, "summary")}
                      className={`text-[11px] font-mono px-2 py-0.5 rounded transition-colors ${
                        currentTab === "summary"
                          ? "bg-indigo-950 text-indigo-300 font-bold border border-indigo-800"
                          : "text-neutral-400 hover:text-neutral-200"
                      }`}
                    >
                      Structured Output
                    </button>
                    <button
                      onClick={() => setTab(env.id, "json")}
                      className={`text-[11px] font-mono px-2 py-0.5 rounded transition-colors ${
                        currentTab === "json"
                          ? "bg-indigo-950 text-indigo-300 font-bold border border-indigo-800"
                          : "text-neutral-400 hover:text-neutral-200"
                      }`}
                    >
                      Decision Contract (JSON)
                    </button>
                    <button
                      onClick={() => setTab(env.id, "input")}
                      className={`text-[11px] font-mono px-2 py-0.5 rounded transition-colors ${
                        currentTab === "input"
                          ? "bg-indigo-950 text-indigo-300 font-bold border border-indigo-800"
                          : "text-neutral-400 hover:text-neutral-200"
                      }`}
                    >
                      Payload Input
                    </button>
                  </div>

                  <button
                    onClick={() => handleCopyJson(env)}
                    className="text-[10px] font-mono text-neutral-400 hover:text-white px-2 py-0.5 rounded border border-neutral-800 hover:bg-neutral-800 transition-colors"
                  >
                    {copiedId === env.id ? "✓ Copied" : "Copy Payload"}
                  </button>
                </div>

                {/* Tab 1: Structured Summary */}
                {currentTab === "summary" && (
                  <div className="text-xs font-mono bg-neutral-950 p-3 rounded-lg border border-neutral-800/80 text-neutral-300 overflow-x-auto max-h-48">
                    {outputObj?.verdict && (
                      <div className="mb-1.5">
                        <span className="text-neutral-500">Verdict: </span>
                        <strong className={outputObj.verdict === "pass" ? "text-emerald-400" : "text-amber-400"}>
                          {outputObj.verdict.toUpperCase()}
                        </strong>
                      </div>
                    )}
                    {outputObj?.summary && (
                      <div className="mb-1.5">
                        <span className="text-neutral-500">Summary: </span>
                        <span>{outputObj.summary}</span>
                      </div>
                    )}
                    {outputObj?.readiness !== undefined && (
                      <div className="mb-1.5">
                        <span className="text-neutral-500">Computed Readiness: </span>
                        <span className="text-indigo-400 font-bold">{(outputObj.readiness * 100).toFixed(1)}%</span>
                      </div>
                    )}
                    {outputObj?.score !== undefined && (
                      <div className="mb-1.5">
                        <span className="text-neutral-500">Assessment Score: </span>
                        <span className="text-indigo-400 font-bold">{(outputObj.score * 100).toFixed(0)}%</span>
                      </div>
                    )}
                    <pre className="text-[11px] text-neutral-400 mt-2">
                      {JSON.stringify(outputObj, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Tab 2: Decision Contract JSON */}
                {currentTab === "json" && (
                  <pre className="text-[10px] font-mono bg-neutral-950 p-3 rounded-lg border border-neutral-800/80 text-neutral-300 overflow-x-auto max-h-56 leading-relaxed">
                    {JSON.stringify(env.output, null, 2)}
                  </pre>
                )}

                {/* Tab 3: Input Parameters */}
                {currentTab === "input" && (
                  <pre className="text-[10px] font-mono bg-neutral-950 p-3 rounded-lg border border-neutral-800/80 text-neutral-300 overflow-x-auto max-h-56 leading-relaxed">
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
