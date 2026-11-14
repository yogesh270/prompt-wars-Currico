import type { Module } from "@/lib/types";

interface RoadmapProps {
  modules: Module[];
  preservedPct?: number;
}

const DIFF_STYLES: Record<string, string> = {
  kept:     "border-l-2 border-zinc-500",
  added:    "border-l-2 border-green-400",
  adjusted: "border-l-2 border-yellow-400",
  removed:  "border-l-2 border-red-400 opacity-40",
};

const DIFF_BADGE: Record<string, string> = {
  kept:     "bg-zinc-700 text-zinc-300",
  added:    "bg-green-900 text-green-300",
  adjusted: "bg-yellow-900 text-yellow-300",
  removed:  "bg-red-900 text-red-300",
};

export default function Roadmap({ modules, preservedPct }: RoadmapProps) {
  const activeModules = modules.filter(m => m.diff !== "removed");

  // Group by week
  const byWeek = new Map<number, Module[]>();
  for (const mod of activeModules) {
    if (!byWeek.has(mod.week)) byWeek.set(mod.week, []);
    byWeek.get(mod.week)!.push(mod);
  }
  const weeks = Array.from(byWeek.keys()).sort((a, b) => a - b);

  if (weeks.length === 0) {
    return (
      <div className="text-zinc-500 text-sm italic text-center py-8">
        Generate a plan to see your roadmap.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {preservedPct !== undefined && (
        <div className="text-sm text-zinc-400 bg-zinc-800 rounded px-3 py-2">
          <span className="text-white font-semibold">
            {(preservedPct * 100).toFixed(0)}%
          </span>{" "}
          of your previous learning preserved
        </div>
      )}
      {weeks.map(week => (
        <div key={week}>
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
            Week {week}
          </h3>
          <div className="space-y-2">
            {byWeek.get(week)!.map(mod => (
              <div
                key={mod.id}
                className={`bg-zinc-800 rounded-lg px-3 py-2.5 ${mod.diff ? DIFF_STYLES[mod.diff] : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm text-white leading-snug">{mod.title}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-zinc-400">{mod.hours}h</span>
                    {mod.diff && (
                      <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${DIFF_BADGE[mod.diff]}`}>
                        {mod.diff}
                      </span>
                    )}
                  </div>
                </div>
                {mod.rationale && (
                  <p className="text-xs text-zinc-500 mt-1 leading-snug">{mod.rationale}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

