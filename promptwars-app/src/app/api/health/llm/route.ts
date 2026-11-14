import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { HealthCheckSchema } from "@/lib/schemas";

export const maxDuration = 60;

export async function GET() {
  const start = Date.now();
  const model = process.env.GOOGLE_GENERATIVE_AI_MODEL ?? "gemini-1.5-flash";

  try {
    const google = createGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "",
    });

    await generateObject({
      model: google(model),
      schema: HealthCheckSchema,
      prompt: 'Reply with { "status": "ok" }',
      temperature: 0,
    });

    return NextResponse.json({
      ok: true,
      model,
      latencyMs: Date.now() - start,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      model,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

