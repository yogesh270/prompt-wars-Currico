import { v4 as uuidv4 } from "uuid";
import type { AgentEnvelope, AgentName, AgentErrorOutput } from "./types";

export async function timedEnvelope<T>(
  agent: AgentName,
  input: unknown,
  fn: () => Promise<{ output: T; rationale: string }>,
  fallback: () => { output: T; rationale: string },
): Promise<AgentEnvelope<T | AgentErrorOutput>> {
  const start = Date.now();
  const createdAt = new Date().toISOString();

  try {
    const result = await fn();
    return {
      id:        uuidv4(),
      agent,
      input,
      output:    result.output,
      rationale: result.rationale,
      latencyMs: Date.now() - start,
      status:    "ok",
      createdAt,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const fb = fallback();
    return {
      id:        uuidv4(),
      agent,
      input,
      output:    { fallback: true, reason } as AgentErrorOutput,
      rationale: `deterministic fallback: ${reason}`,
      latencyMs: Date.now() - start,
      status:    "error",
      createdAt,
    };
  }
}

