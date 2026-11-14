"use client";

import type { Module, ModuleDiff } from "@/lib/types";

interface RoadmapProps {
  modules: Module[];
  preservedPct?: number;
  weeklyBudget?: number;
}

const DIFF_STYLES: Record<ModuleDiff, string> = {
  kept:     "border-white/[0.08] bg-[#0E1117]/80 hover:border-white/20",
  added:    "border-[#F59E0B]/40 bg-[#F59E0B]/10 shadow-sm shadow-[#F59E0B]/10",
  adjusted: "border-[#06B6D4]/40 bg-[#06B6D4]/10 shadow-sm shadow-[#06B6D4]/10",
  removed:  "border-[#F43F5E]/40 bg-[#F43F5E]/10 opacity-60 line-through",
};

const DIFF_BADGE: Record<ModuleDiff, { label: string; className: string }> = {
  kept:     { label: "Preserved",   className: "bg-white/[0.06] text-[#94A3B8] border-white/10" },
  added:    { label: "New Module",  className: "bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/30" },
  adjusted: { label: "Rescheduled", className: "bg-[#06B6D4]/15 text-[#06B6D4] border-[#06B6D4]/30" },
  removed:  { label: "Trimmed",     className: "bg-[#F43F5E]/15 text-[#F43F5E] border-[#F43F5E]/30" },
};

export default function Roadmap({ modules, weeklyBudget = 5 }: RoadmapProps) {
  if (modules.length === 0) {
    return (
      <div className="card-surface rounded-2xl p-16 text-center border-dashed border-white/10">
        <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center mx-auto mb-3 text-lg text-[#94A3B8]">
          📅
        </div>
        <p className="text-sm font-medium text-[#F8FAFC]">No curriculum plan active</p>
        <p className="text-xs text-[#94A3B8] mt-1">
          Click &ldquo;Generate Plan&rdquo; or customize your baseline skill matrix to synthesize an adaptive roadmap.
        </p>
      </div>
    );
  }

  // Group modules by week
  const byWeek = new Map<number, Module[]>();
  for (const m of modules) {
    const list = byWeek.get(m.week) ?? [];
    list.push(m);
    byWeek.set(m.week, list);
  }

  const weeks = Array.from(byWeek.keys()).sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4">
        {weeks.map(week => {
          const weekMods = byWeek.get(week) || [];
          const weekHours = weekMods.reduce((s, m) => s + m.hours, 0);
          const capacityPct = Math.min(100, Math.round((weekHours / weeklyBudget) * 100));
          const isAdaptedWeek = weekMods.some(m => m.diff === "added" || m.title.includes("[Remediation]") || m.isRemedial);

          return (
            <div
              key={week}
              className={`rounded-2xl p-5 transition-all duration-300 card-surface ${
                isAdaptedWeek
                  ? "border-[#6366F1]/50 shadow-[0_0_24px_rgba(99,102,241,0.15)] ring-1 ring-[#6366F1]/20"
                  : "hover:border-white/20"
              }`}
            >
              {/* Week Card Header with Capacity Progress */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-white/[0.08] pb-3.5 mb-3.5">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-md bg-[#151923] border border-white/10 flex items-center justify-center text-xs font-mono font-bold text-[#06B6D4] tabular-nums">
                    {week}
                  </span>
                  <div>
                    <h4 className="text-xs font-bold text-[#F8FAFC] tracking-tight flex items-center gap-2">
                      <span>Week {week} Schedule</span>
                      {isAdaptedWeek && (
                        <span className="text-[10px] font-mono bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/30 px-2 py-0.2 rounded-full">
                          ⚡ Adaptive Revision
                        </span>
                      )}
                    </h4>
                  </div>
                </div>

                {/* Capacity Progress Bar */}
                <div className="flex items-center gap-3 self-end sm:self-auto">
                  <div className="w-28 bg-[#151923] rounded-full h-1.5 overflow-hidden border border-white/10">
                    <div
                      style={{ width: `${capacityPct}%` }}
                      className={`h-full rounded-full transition-all duration-500 ${
                        capacityPct > 100
                          ? "bg-[#F43F5E]"
                          : capacityPct === 100
                          ? "bg-[#10B981]"
                          : "bg-[#06B6D4]"
                      }`}
                    />
                  </div>
                  <span className="text-[11px] font-mono tabular-nums text-[#94A3B8] whitespace-nowrap">
                    <strong className="text-[#F8FAFC]">{weekHours}h</strong> / {weeklyBudget}h allocated ({capacityPct}%)
                  </span>
                </div>
              </div>

              {/* Modules List for this week */}
              <div className="space-y-2.5">
                {weekMods.map(mod => {
                  const isRemedial = mod.isRemedial || mod.title.includes("[Remediation]") || mod.id.includes(":remedial");
                  const diffBadge = mod.diff ? DIFF_BADGE[mod.diff] : null;

                  return (
                    <div
                      key={mod.id}
                      className={`rounded-xl p-3.5 transition-all border ${
                        isRemedial
                          ? "bg-gradient-to-r from-[#F59E0B]/15 via-[#0E1117] to-[#0E1117] border-[#F59E0B]/40 shadow-sm shadow-[#F59E0B]/10"
                          : mod.diff
                          ? DIFF_STYLES[mod.diff]
                          : "bg-[#151923]/60 border-white/[0.08] hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-[#F8FAFC] leading-snug">
                              {mod.title}
                            </span>

                            {/* Part badge if chunked */}
                            {mod.part && mod.part.total > 1 && (
                              <span className="text-[10px] font-mono tabular-nums bg-white/[0.06] text-[#94A3B8] px-2 py-0.2 rounded border border-white/10">
                                Part {mod.part.current} of {mod.part.total}
                              </span>
                            )}

                            {/* Remediation highlight */}
                            {isRemedial && (
                              <span className="text-[10px] font-mono bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/40 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider shadow-sm shadow-[#F59E0B]/20 flex items-center gap-1.5 animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]"></span>
                                ADAPTED
                              </span>
                            )}

                            {/* Diff badge */}
                            {diffBadge && !isRemedial && (
                              <span className={`text-[10px] font-mono px-2 py-0.2 rounded border font-semibold ${diffBadge.className}`}>
                                {diffBadge.label}
                              </span>
                            )}
                          </div>

                          {mod.rationale && (
                            <p className="text-[11px] text-[#94A3B8] leading-relaxed">
                              {mod.rationale}
                            </p>
                          )}
                        </div>

                        {/* Module Hours Chip */}
                        <div className="shrink-0">
                          <span className="text-[11px] font-mono tabular-nums font-bold text-[#F8FAFC] bg-[#151923] border border-white/10 px-2.5 py-1 rounded-md">
                            {mod.hours}h
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
