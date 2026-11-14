import type { AgentEnvelope } from "@/lib/types";

interface TraceConsoleProps {
  trace: AgentEnvelope[];
}

const STATUS_COLORS: Record<string, string> = {
  ok:    "text-green-400",
  warn:  "text-yellow-400",
  error: "text-red-400",
};

const AGENT_LABELS: Record<string, string> = {
  profile:  "🧠 Profile",
  gap:      "🔍 Gap Analyst",
  planner:  "📅 Planner",
  critic:   "⚖️ Critic",
  assessor: "📝 Assessor",
  mentor:   "🎓 Mentor",
};

export default function TraceConsole({ trace }: TraceConsoleProps) {
  if (trace.length === 0) {
    return (
      <div className="text-zinc-500 text-sm italic px-4 py-8 text-center">
        Agent trace will appear here after generation.
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
      {trace.map((env) => (
        <details key={env.id} className="bg-zinc-800 rounded-lg border border-zinc-700">
          <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none">
            <span className="text-sm font-medium text-white min-w-[130px]">
              {AGENT_LABELS[env.agent] ?? env.agent}
            </span>
            <span className={`text-xs font-mono ${STATUS_COLORS[env.status] ?? "text-zinc-400"}`}>
              {env.status.toUpperCase()}
            </span>
            <span className="text-xs text-zinc-400 ml-auto">{env.latencyMs}ms</span>
          </summary>
          <div className="px-4 pb-4 pt-2 border-t border-zinc-700 space-y-2">
            <p className="text-sm text-zinc-300">{env.rationale}</p>
            <details className="text-xs">
              <summary className="text-zinc-500 cursor-pointer hover:text-zinc-300">
                View JSON output
              </summary>
              <pre className="mt-2 p-2 bg-zinc-900 rounded text-zinc-300 overflow-x-auto text-xs">
                {JSON.stringify(env.output, null, 2)}
              </pre>
            </details>
          </div>
        </details>
      ))}
    </div>
  );
}

