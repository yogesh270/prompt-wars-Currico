import type { Module } from "@/lib/types";

interface RoadmapProps {
  modules: Module[];
  preservedPct?: number;
  weeklyBudget?: number;
}

const DIFF_STYLES: Record<string, string> = {
  kept:     "border-l-2 border-neutral-600 bg-neutral-900/60",
  added:    "border-l-2 border-emerald-500 bg-emerald-950/20",
  adjusted: "border-l-2 border-amber-500 bg-amber-950/20",
  removed:  "border-l-2 border-rose-500 opacity-40 bg-rose-950/10 line-through",
};

const DIFF_BADGE: Record<string, { label: string; className: string }> = {
  kept:     { label: "PRESERVED", className: "bg-neutral-800 text-neutral-300 border-neutral-700" },
  added:    { label: "ADAPTED", className: "bg-emerald-950/80 text-emerald-300 border-emerald-800 ring-1 ring-emerald-500/20" },
  adjusted: { label: "RESCHEDULED", className: "bg-amber-950/80 text-amber-300 border-amber-800" },
  removed:  { label: "TRIMMED", className: "bg-rose-950/80 text-rose-300 border-rose-800" },
};

export default function Roadmap({ modules, preservedPct, weeklyBudget = 5 }: RoadmapProps) {
  const activeModules = modules.filter(m => m.diff !== "removed");

  // Group modules by week
  const byWeek = new Map<number, Module[]>();
  for (const mod of activeModules) {
    if (!byWeek.has(mod.week)) byWeek.set(mod.week, []);
    byWeek.get(mod.week)!.push(mod);
  }
  const weeks = Array.from(byWeek.keys()).sort((a, b) => a - b);

  if (weeks.length === 0) {
    return (
      <div className="text-neutral-500 text-xs font-mono italic text-center py-12 border border-dashed border-neutral-800/80 rounded-2xl bg-neutral-950/40">
        No active curriculum generated yet. Click &ldquo;Generate Plan&rdquo; above.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Retention Banner */}
      {preservedPct !== undefined && (
        <div className="flex items-center justify-between text-xs bg-gradient-to-r from-neutral-900 via-neutral-900 to-indigo-950/40 border border-neutral-800 rounded-xl px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-neutral-300 font-medium">Prior Learning Retention:</span>
          </div>
          <span className="font-mono font-bold text-white bg-neutral-800/80 border border-neutral-700 px-2.5 py-0.5 rounded text-[11px]">
            {(preservedPct * 100).toFixed(0)}% Preserved
          </span>
        </div>
      )}

      {/* Week-by-Week Curriculum Cards */}
      <div className="space-y-4">
        {weeks.map(week => {
          const weekMods = byWeek.get(week) || [];
          const weekHours = weekMods.reduce((s, m) => s + m.hours, 0);
          const capacityPct = Math.min(100, Math.round((weekHours / weeklyBudget) * 100));
          const isAdaptedWeek = weekMods.some(m => m.diff === "added" || m.title.includes("[Remediation]"));

          return (
            <div
              key={week}
              className={`border rounded-2xl p-5 transition-all duration-300 ${
                isAdaptedWeek
                  ? "bg-neutral-950/90 border-indigo-700/60 shadow-lg shadow-indigo-950/30 ring-1 ring-indigo-500/10"
                  : "bg-neutral-950/70 border-neutral-800/80 hover:border-neutral-700/80"
              }`}
            >
              {/* Week Card Header with Capacity Progress */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-neutral-800/60 pb-3.5 mb-3.5">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-md bg-neutral-900 border border-neutral-800 flex items-center justify-center text-xs font-mono font-bold text-indigo-400">
                    {week}
                  </span>
                  <div>
                    <h4 className="text-xs font-bold text-white tracking-tight flex items-center gap-2">
                      <span>Week {week} Schedule</span>
                      {isAdaptedWeek && (
                        <span className="text-[10px] font-mono bg-purple-950/80 text-purple-300 border border-purple-800 px-2 py-0.2 rounded-full">
                          ⚡ Adaptive Revision
                        </span>
                      )}
                    </h4>
                  </div>
                </div>

                {/* Capacity Progress Bar */}
                <div className="flex items-center gap-3 self-end sm:self-auto">
                  <div className="w-28 bg-neutral-900 rounded-full h-1.5 overflow-hidden border border-neutral-800">
                    <div
                      style={{ width: `${capacityPct}%` }}
                      className={`h-full rounded-full transition-all duration-500 ${
                        capacityPct > 100
                          ? "bg-rose-500"
                          : capacityPct === 100
                          ? "bg-emerald-500"
                          : "bg-indigo-500"
                      }`}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-neutral-400 whitespace-nowrap">
                    <strong className="text-white">{weekHours}h</strong> / {weeklyBudget}h allocated ({capacityPct}%)
                  </span>
                </div>
              </div>

              {/* Modules List for this week */}
              <div className="space-y-2.5">
                {weekMods.map(mod => {
                  const isRemedial = mod.title.includes("[Remediation]") || mod.id.includes(":remedial");
                  const diffBadge = mod.diff ? DIFF_BADGE[mod.diff] : null;

                  return (
                    <div
                      key={mod.id}
                      className={`rounded-xl p-3.5 transition-all border border-neutral-800/80 ${
                        isRemedial
                          ? "bg-gradient-to-r from-purple-950/30 to-neutral-900/80 border-purple-800/60"
                          : mod.diff
                          ? DIFF_STYLES[mod.diff]
                          : "bg-neutral-900/60 hover:bg-neutral-900"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-white leading-snug">
                              {mod.title}
                            </span>

                            {/* Part badge if chunked */}
                            {mod.part && mod.part.total > 1 && (
                              <span className="text-[10px] font-mono bg-neutral-800 text-neutral-300 px-2 py-0.2 rounded border border-neutral-700">
                                Part {mod.part.current} of {mod.part.total}
                              </span>
                            )}

                            {/* Remediation highlight */}
                            {isRemedial && (
                              <span className="text-[10px] font-mono bg-purple-950 text-purple-300 border border-purple-700 px-2 py-0.2 rounded font-bold uppercase tracking-wider">
                                Adaptive Remediation
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
                            <p className="text-[11px] text-neutral-400 leading-relaxed">
                              {mod.rationale}
                            </p>
                          )}
                        </div>

                        {/* Module Hours Chip */}
                        <div className="shrink-0">
                          <span className="text-[11px] font-mono font-bold text-neutral-300 bg-neutral-950 border border-neutral-800 px-2.5 py-1 rounded-md">
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
