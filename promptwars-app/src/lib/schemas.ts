import { z } from "zod";

export const PlannerOutputSchema = z.object({
  modules: z.array(z.object({
    moduleId: z.string(), // must be `${skillId}:${courseId}` from seed
    week:     z.number().int().positive(),
    rationale: z.string().max(120),
  })),
  summary: z.string().max(300),
});

export const CriticOutputSchema = z.object({
  verdict:   z.enum(["pass", "revise"]),
  rationale: z.string().max(200),
});

export const MentorOutputSchema = z.object({
  message: z.string().max(200),
});

export const ProfileOutputSchema = z.object({
  skills: z.array(z.object({
    skillId: z.string(),
    level:   z.number().int().min(0).max(5),
  })),
});

export const HealthCheckSchema = z.object({
  status: z.literal("ok"),
});

export type PlannerOutput = z.infer<typeof PlannerOutputSchema>;
export type CriticOutput  = z.infer<typeof CriticOutputSchema>;
export type MentorOutput  = z.infer<typeof MentorOutputSchema>;
export type ProfileOutput = z.infer<typeof ProfileOutputSchema>;

