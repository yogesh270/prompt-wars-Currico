import { NextResponse } from "next/server";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { ProfileOutputSchema } from "@/lib/schemas";
import { profilePrompt } from "@/lib/prompts";
import type { LearnerSkill, SkillLevel } from "@/lib/types";

export const maxDuration = 60;

const MODEL = process.env.GOOGLE_GENERATIVE_AI_MODEL ?? "gemini-1.5-flash";

// Fast heuristic keyword parser for instant offline / no-API-key extraction
function heuristicSkillExtraction(text: string): LearnerSkill[] {
  const lower = text.toLowerCase();
  const detected: LearnerSkill[] = [];

  const skillPatterns: Record<string, { patterns: RegExp[]; defaultLevel: SkillLevel; advancedPattern?: RegExp }> = {
    javascript: {
      patterns: [/\bjavascript\b/, /\bjs\b/, /\bes6\b/, /\bfrontend\b/],
      defaultLevel: 2,
      advancedPattern: /\b(senior|lead|architect|5\+ years|expert)\b.*javascript/i,
    },
    typescript: {
      patterns: [/\btypescript\b/, /\bts\b/],
      defaultLevel: 2,
      advancedPattern: /\b(generics|strict mode|senior|production)\b.*typescript/i,
    },
    react: {
      patterns: [/\breact\b/, /\breactjs\b/, /\bhooks\b/, /\bredux\b/],
      defaultLevel: 2,
      advancedPattern: /\b(senior react|custom hooks|next\.js|5\+ years react)\b/i,
    },
    nextjs: {
      patterns: [/\bnext\.?js\b/, /\bapp router\b/, /\bssr\b/],
      defaultLevel: 2,
    },
    nodejs: {
      patterns: [/\bnode\.?js\b/, /\bexpress\b/, /\bbackend\b/],
      defaultLevel: 2,
    },
    "rest-api": {
      patterns: [/\brest\b/, /\brestful\b/, /\bapi design\b/, /\bendpoints\b/],
      defaultLevel: 2,
    },
    sql: {
      patterns: [/\bsql\b/, /\bqueries\b/, /\bdatabase\b/],
      defaultLevel: 2,
      advancedPattern: /\b(indexing|subqueries|optimization|joins)\b/i,
    },
    postgres: {
      patterns: [/\bpostgres\b/, /\bpostgresql\b/, /\bpsql\b/],
      defaultLevel: 2,
    },
    git: {
      patterns: [/\bgit\b/, /\bgithub\b/, /\bgitlab\b/, /\bpull requests\b/],
      defaultLevel: 2,
    },
    testing: {
      patterns: [/\bjest\b/, /\bcypress\b/, /\bplaywright\b/, /\bunit testing\b/, /\bqa\b/],
      defaultLevel: 2,
    },
    html: {
      patterns: [/\bhtml\b/, /\bcss\b/, /\btailwind\b/, /\bresponsive\b/],
      defaultLevel: 3,
    },
    "cloud-deploy": {
      patterns: [/\bvercel\b/, /\baws\b/, /\bdocker\b/, /\bci\/cd\b/, /\bcloud\b/],
      defaultLevel: 2,
    },
    python: {
      patterns: [/\bpython\b/, /\bflask\b/, /\bdjango\b/],
      defaultLevel: 3,
    },
    pandas: {
      patterns: [/\bpandas\b/, /\bdataframe\b/],
      defaultLevel: 2,
    },
    statistics: {
      patterns: [/\bstatistics\b/, /\bhypothesis\b/, /\bmath\b/],
      defaultLevel: 2,
    },
    fastapi: {
      patterns: [/\bfastapi\b/, /\bpydantic\b/],
      defaultLevel: 2,
    },
    "prompt-eng": {
      patterns: [/\bprompt engineering\b/, /\bllm\b/, /\bgpt\b/, /\bgemini\b/],
      defaultLevel: 3,
    },
  };

  for (const [skillId, rule] of Object.entries(skillPatterns)) {
    const hasMatch = rule.patterns.some(p => p.test(lower));
    if (hasMatch) {
      let level: SkillLevel = rule.defaultLevel;
      if (rule.advancedPattern && rule.advancedPattern.test(lower)) {
        level = Math.min(4, level + 1) as SkillLevel;
      }
      detected.push({
        skillId,
        level,
        confidence: 0.85,
        evidence: ["Detected in uploaded profile / resume"],
      });
    }
  }

  return detected;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { text = "" } = body;

    if (!text.trim()) {
      return NextResponse.json({ skills: [], extractedName: "" }, { status: 400 });
    }

    // Try extracting Learner Name from first lines if present (e.g. "John Doe - Software Engineer")
    const firstLines = text.slice(0, 300).split("\n").map((l: string) => l.trim()).filter(Boolean);
    let extractedName = "";
    if (firstLines.length > 0) {
      const candidate = firstLines[0].replace(/[#*|]/g, "").trim();
      if (candidate.length > 2 && candidate.length < 35 && !candidate.toLowerCase().includes("resume")) {
        extractedName = candidate;
      }
    }

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;

    // Fast deterministic fallback if no API key
    if (!apiKey) {
      const heuristicSkills = heuristicSkillExtraction(text);
      return NextResponse.json({
        skills: heuristicSkills,
        extractedName: extractedName || "Custom Learner",
        method: "heuristic",
      });
    }

    // Try LLM Extraction
    try {
      const google = createGoogleGenerativeAI({ apiKey });
      const result = await generateObject({
        model: google(MODEL),
        schema: ProfileOutputSchema,
        prompt: profilePrompt(text),
        temperature: 0.1,
      });

      const skills: LearnerSkill[] = result.object.skills.map(s => ({
        skillId: s.skillId,
        level: Math.min(4, Math.max(0, s.level)) as SkillLevel,
        confidence: 0.9,
        evidence: ["Extracted via Gemini from resume/profile text"],
      }));

      return NextResponse.json({
        skills,
        extractedName: extractedName || "Custom Learner",
        method: "llm",
      });
    } catch {
      // Graceful fallback to heuristic
      const heuristicSkills = heuristicSkillExtraction(text);
      return NextResponse.json({
        skills: heuristicSkills,
        extractedName: extractedName || "Custom Learner",
        method: "heuristic_fallback",
      });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Profile extraction failed" },
      { status: 500 }
    );
  }
}
