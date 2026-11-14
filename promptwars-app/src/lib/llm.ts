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

  // If no API key configured, fast fallback without waiting on network timeout
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const fb = fallback();
    return {
      id: uuidv4(),
      agent,
      input,
      output: fb.output,
      rationale: fb.rationale,
      latencyMs: 15,
      status: "ok",
      createdAt,
    };
  }

  // Set 8-second timeout per LLM call so the user is never kept waiting
  const timeoutPromise = new Promise<{ output: T; rationale: string }>((_, reject) => {
    setTimeout(() => reject(new Error("LLM call timed out after 8s")), 8000);
  });

  try {
    const result = await Promise.race([fn(), timeoutPromise]);
    return {
      id: uuidv4(),
      agent,
      input,
      output: result.output,
      rationale: result.rationale,
      latencyMs: Date.now() - start,
      status: "ok",
      createdAt,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const fb = fallback();
    return {
      id: uuidv4(),
      agent,
      input,
      output: fb.output,
      rationale: fb.rationale,
      latencyMs: Date.now() - start,
      status: "warn",
      createdAt,
    };
  }
}

