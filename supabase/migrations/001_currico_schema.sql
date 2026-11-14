-- Currico Adaptive Core: Supabase Schema Migration 001
-- Enables storage for custom learners, baseline skill matrix, generated plans, and multi-agent coordination traces

-- 1. Learners Table
CREATE TABLE IF NOT EXISTS public.learners (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    target_role TEXT NOT NULL,
    weekly_hours INTEGER NOT NULL DEFAULT 5,
    raw_resume_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Learner Skills Matrix Table
CREATE TABLE IF NOT EXISTS public.learner_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id TEXT NOT NULL REFERENCES public.learners(id) ON DELETE CASCADE,
    skill_name TEXT NOT NULL,
    current_level INTEGER NOT NULL DEFAULT 0,
    target_level INTEGER NOT NULL DEFAULT 3,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_learner_skill UNIQUE(learner_id, skill_name)
);

-- 3. Curriculum Plans Table
CREATE TABLE IF NOT EXISTS public.curriculum_plans (
    id TEXT PRIMARY KEY,
    learner_id TEXT NOT NULL REFERENCES public.learners(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    total_hours NUMERIC(6, 2) NOT NULL,
    total_weeks INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    schedule_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Agent Traces Table
CREATE TABLE IF NOT EXISTS public.agent_traces (
    id TEXT PRIMARY KEY,
    plan_id TEXT REFERENCES public.curriculum_plans(id) ON DELETE CASCADE,
    agent_name TEXT NOT NULL,
    status TEXT NOT NULL,
    latency_ms INTEGER NOT NULL,
    envelope_payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.learners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learner_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_traces ENABLE ROW LEVEL SECURITY;

-- Allow public read/write access for hackathon / client demonstration
CREATE POLICY "Allow public read access on learners" ON public.learners FOR SELECT USING (true);
CREATE POLICY "Allow public insert/update on learners" ON public.learners FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow public read access on learner_skills" ON public.learner_skills FOR SELECT USING (true);
CREATE POLICY "Allow public insert/update on learner_skills" ON public.learner_skills FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow public read access on curriculum_plans" ON public.curriculum_plans FOR SELECT USING (true);
CREATE POLICY "Allow public insert/update on curriculum_plans" ON public.curriculum_plans FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow public read access on agent_traces" ON public.agent_traces FOR SELECT USING (true);
CREATE POLICY "Allow public insert/update on agent_traces" ON public.agent_traces FOR ALL USING (true) WITH CHECK (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_learner_skills_learner ON public.learner_skills(learner_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_plans_learner ON public.curriculum_plans(learner_id);
CREATE INDEX IF NOT EXISTS idx_agent_traces_plan ON public.agent_traces(plan_id);
