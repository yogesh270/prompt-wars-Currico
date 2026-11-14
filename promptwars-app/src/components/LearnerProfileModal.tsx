"use client";

import { useState } from "react";
import type { Learner, LearnerSkill, RoleId, SkillLevel } from "@/lib/types";
import { ROLES, PRIYA_PERSONA } from "@/lib/seed";

interface LearnerProfileModalProps {
  currentLearner: Learner;
  isOpen: boolean;
  onClose: () => void;
  onSave: (learner: Learner, rawResumeText?: string) => void;
}

const CORE_SKILLS = [
  { id: "javascript",   name: "JavaScript",           role: "Full Stack / AI" },
  { id: "react",        name: "React",                role: "Full Stack" },
  { id: "typescript",   name: "TypeScript",           role: "Full Stack" },
  { id: "nextjs",       name: "Next.js",              role: "Full Stack" },
  { id: "nodejs",       name: "Node.js",              role: "Full Stack" },
  { id: "rest-api",     name: "REST API Design",      role: "Full Stack / Backend" },
  { id: "postgres",     name: "PostgreSQL",           role: "Full Stack / Data" },
  { id: "testing",      name: "Testing & QA",         role: "Full Stack" },
  { id: "cloud-deploy", name: "Cloud Deployment",     role: "Full Stack" },
  { id: "git",          name: "Git & Version Control",role: "Core" },
  { id: "sql",          name: "SQL",                  role: "Data / Backend" },
  { id: "html",         name: "HTML & CSS",           role: "Full Stack" },
  { id: "python",       name: "Python",               role: "AI / Data" },
  { id: "pandas",       name: "Pandas",               role: "Data Analyst" },
  { id: "statistics",   name: "Statistics",           role: "Data Analyst" },
  { id: "prompt-eng",   name: "Prompt Engineering",   role: "AI Backend" },
  { id: "vector-db",    name: "Vector Databases",     role: "AI Backend" },
  { id: "llm-apis",     name: "LLM APIs",             role: "AI Backend" },
];

export default function LearnerProfileModal({
  currentLearner,
  isOpen,
  onClose,
  onSave,
}: LearnerProfileModalProps) {
  const [activeTab, setActiveTab] = useState<"matrix" | "resume">("matrix");
  const [name, setName] = useState(currentLearner.name);
  const [targetRoleId, setTargetRoleId] = useState<RoleId>(currentLearner.targetRoleId);
  const [hoursPerWeek, setHoursPerWeek] = useState(currentLearner.hoursPerWeek);
  const [resumeText, setResumeText] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  // Initialize local skill levels
  const [skillsMap, setSkillsMap] = useState<Record<string, SkillLevel>>(() => {
    const map: Record<string, SkillLevel> = {};
    for (const s of currentLearner.skills) {
      map[s.skillId] = s.level;
    }
    return map;
  });

  if (!isOpen) return null;

  function handleSkillChange(skillId: string, level: SkillLevel) {
    setSkillsMap(prev => ({ ...prev, [skillId]: level }));
  }

  function handleLoadPreset(presetType: "priya" | "backend" | "zero") {
    if (presetType === "priya") {
      setName(PRIYA_PERSONA.name);
      setTargetRoleId(PRIYA_PERSONA.targetRoleId);
      setHoursPerWeek(PRIYA_PERSONA.hoursPerWeek);
      const map: Record<string, SkillLevel> = {};
      for (const s of PRIYA_PERSONA.skills) {
        map[s.skillId] = s.level;
      }
      setSkillsMap(map);
    } else if (presetType === "backend") {
      setName("Devon");
      setTargetRoleId("full-stack");
      setHoursPerWeek(6);
      setSkillsMap({
        python: 3,
        sql: 3,
        git: 2,
        html: 1,
        javascript: 1,
        "rest-api": 2,
        postgres: 2,
      });
    } else {
      setName("Alex");
      setTargetRoleId("full-stack");
      setHoursPerWeek(5);
      setSkillsMap({});
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setResumeText(text);
      setActiveTab("resume");
    } catch {
      setExtractError("Unable to read local file text.");
    }
  }

  async function handleExtractResume() {
    if (!resumeText.trim()) {
      setExtractError("Please paste or upload resume text first.");
      return;
    }

    setIsExtracting(true);
    setExtractError(null);

    try {
      const res = await fetch("/api/profile/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText }),
      });

      if (!res.ok) {
        throw new Error(`Profile extractor returned status ${res.status}`);
      }

      const data = await res.json();
      if (data.skills && Array.isArray(data.skills)) {
        const updated = { ...skillsMap };
        for (const s of data.skills) {
          updated[s.skillId] = Math.min(4, Math.max(0, s.level)) as SkillLevel;
        }
        setSkillsMap(updated);
        setActiveTab("matrix");
      }
    } catch (err) {
      console.error("Resume Extraction Error:", err);
      setExtractError(err instanceof Error ? err.message : "Failed to extract skills from resume.");
    } finally {
      setIsExtracting(false);
    }
  }

  function handleSaveAndApply() {
    const updatedSkills: LearnerSkill[] = Object.entries(skillsMap)
      .filter(([_, level]) => level > 0)
      .map(([skillId, level]) => ({
        skillId,
        level,
        confidence: 0.8,
        evidence: ["User matrix calibration"],
      }));

    const updatedLearner: Learner = {
      ...currentLearner,
      name: name.trim() || "Custom Learner",
      targetRoleId,
      hoursPerWeek,
      skills: updatedSkills,
    };

    onSave(updatedLearner, resumeText.trim() || undefined);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-xl flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-[#151923] border border-white/10 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden ring-1 ring-white/10">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between bg-[#0E1117]">
          <div>
            <h2 className="text-base font-bold text-[#F8FAFC] tracking-tight flex items-center gap-2">
              <span>Learner Profile & Skill Ingestion</span>
              <span className="text-[10px] bg-[#6366F1]/15 border border-[#6366F1]/30 text-[#6366F1] font-mono px-2 py-0.5 rounded font-semibold">
                Adaptive Core
              </span>
            </h2>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Customize baseline proficiency or ingest resume text to generate a personalized roadmap.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[#94A3B8] hover:text-[#F8FAFC] text-lg font-mono leading-none p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tab switcher & Presets */}
        <div className="px-6 py-3 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-3 bg-[#07080C]">
          <div className="flex items-center gap-1 bg-[#151923] p-1 rounded-lg border border-white/10">
            <button
              onClick={() => setActiveTab("matrix")}
              className={`text-xs px-3 py-1 rounded-md font-medium transition-all ${
                activeTab === "matrix"
                  ? "bg-[#6366F1] text-white shadow-sm font-semibold"
                  : "text-[#94A3B8] hover:text-[#F8FAFC]"
              }`}
            >
              Skill Matrix Editor
            </button>
            <button
              onClick={() => setActiveTab("resume")}
              className={`text-xs px-3 py-1 rounded-md font-medium transition-all ${
                activeTab === "resume"
                  ? "bg-[#6366F1] text-white shadow-sm font-semibold"
                  : "text-[#94A3B8] hover:text-[#F8FAFC]"
              }`}
            >
              Resume / Text Ingestion
            </button>
          </div>

          {/* Quick Presets */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[#94A3B8] font-mono text-[11px]">Presets:</span>
            <button
              onClick={() => handleLoadPreset("priya")}
              className="text-[11px] font-mono px-2 py-1 rounded bg-[#151923] border border-white/10 text-[#94A3B8] hover:border-[#6366F1] hover:text-[#F8FAFC] transition-colors"
            >
              Priya (Demo)
            </button>
            <button
              onClick={() => handleLoadPreset("backend")}
              className="text-[11px] font-mono px-2 py-1 rounded bg-[#151923] border border-white/10 text-[#94A3B8] hover:border-[#6366F1] hover:text-[#F8FAFC] transition-colors"
            >
              Python Switcher
            </button>
            <button
              onClick={() => handleLoadPreset("zero")}
              className="text-[11px] font-mono px-2 py-1 rounded bg-[#151923] border border-white/10 text-[#94A3B8] hover:border-[#6366F1] hover:text-[#F8FAFC] transition-colors"
            >
              Beginner
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-[#07080C]">
          {/* Top Profile Metadata Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 card-surface p-4 rounded-xl">
            <div>
              <label className="text-[11px] font-mono text-[#94A3B8] uppercase tracking-wider block mb-1">
                Learner Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Priya or Alex"
                className="w-full bg-[#07080C] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-[#F8FAFC] focus:outline-none focus:border-[#6366F1] font-medium"
              />
            </div>

            <div>
              <label className="text-[11px] font-mono text-[#94A3B8] uppercase tracking-wider block mb-1">
                Target Role
              </label>
              <select
                value={targetRoleId}
                onChange={e => setTargetRoleId(e.target.value as RoleId)}
                className="w-full bg-[#07080C] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-[#06B6D4] focus:outline-none focus:border-[#6366F1] font-medium"
              >
                {ROLES.map(r => (
                  <option key={r.id} value={r.id} className="bg-[#07080C] text-[#F8FAFC]">
                    {r.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-mono tabular-nums text-[#94A3B8] uppercase tracking-wider block mb-1">
                Weekly Budget: <span className="text-[#06B6D4] font-bold">{hoursPerWeek}h/wk</span>
              </label>
              <input
                type="range"
                min={2}
                max={20}
                step={1}
                value={hoursPerWeek}
                onChange={e => setHoursPerWeek(Number(e.target.value))}
                className="w-full accent-[#6366F1] cursor-pointer mt-1"
              />
            </div>
          </div>

          {/* TAB 1: Skill Matrix Editor */}
          {activeTab === "matrix" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase tracking-wider text-[#94A3B8] font-semibold">
                  Competency Matrix (0 = None · 4 = Advanced)
                </span>
                <span className="text-[11px] font-mono tabular-nums text-[#94A3B8]">
                  {Object.values(skillsMap).filter(v => v > 0).length} of {CORE_SKILLS.length} skills active
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CORE_SKILLS.map(skill => {
                  const currentLevel = skillsMap[skill.id] ?? 0;
                  return (
                    <div
                      key={skill.id}
                      className="card-surface rounded-xl p-3 flex flex-col justify-between hover:border-white/20 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="text-xs font-semibold text-[#F8FAFC] block">{skill.name}</span>
                          <span className="text-[10px] text-[#94A3B8] font-mono">{skill.role}</span>
                        </div>
                        <span className={`text-[11px] font-mono tabular-nums font-bold px-2 py-0.5 rounded border ${
                          currentLevel >= 3
                            ? "bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30"
                            : currentLevel > 0
                            ? "bg-[#06B6D4]/15 text-[#06B6D4] border-[#06B6D4]/30"
                            : "bg-white/[0.04] text-[#94A3B8] border-white/10"
                        }`}>
                          Level {currentLevel}
                        </span>
                      </div>

                      {/* Slider / Level Buttons */}
                      <div className="flex items-center gap-1">
                        {[0, 1, 2, 3, 4].map(lvl => (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => handleSkillChange(skill.id, lvl as SkillLevel)}
                            className={`flex-1 text-[10px] font-mono tabular-nums py-1 rounded transition-all ${
                              currentLevel === lvl
                                ? "bg-[#6366F1] text-white font-bold shadow-sm shadow-[#6366F1]/30"
                                : "bg-[#151923] text-[#94A3B8] hover:bg-white/[0.08] hover:text-[#F8FAFC]"
                            }`}
                          >
                            {lvl}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: Resume Ingestion */}
          {activeTab === "resume" && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-white/15 hover:border-[#6366F1] rounded-xl p-5 text-center transition-colors bg-[#07080C]">
                <input
                  type="file"
                  id="resume-file"
                  accept=".txt,.md,.pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <label htmlFor="resume-file" className="cursor-pointer block space-y-1.5">
                  <span className="text-2xl block">📄</span>
                  <span className="text-xs font-semibold text-[#F8FAFC] block">
                    Upload Resume or Bio (.txt, .md)
                  </span>
                  <span className="text-[11px] text-[#94A3B8] block">
                    Click to browse or drag and drop your text resume
                  </span>
                </label>
              </div>

              <div>
                <label className="text-[11px] font-mono text-[#94A3B8] uppercase tracking-wider block mb-1.5">
                  Or Paste Resume / GitHub Bio Text
                </label>
                <textarea
                  rows={6}
                  value={resumeText}
                  onChange={e => setResumeText(e.target.value)}
                  placeholder="Paste work experience, skills summary, or GitHub README markdown here..."
                  className="w-full bg-[#07080C] border border-white/10 rounded-xl p-3 text-xs text-[#F8FAFC] focus:outline-none focus:border-[#6366F1] font-mono leading-relaxed"
                />
              </div>

              {extractError && (
                <div className="text-xs text-[#F43F5E] bg-[#F43F5E]/10 border border-[#F43F5E]/30 p-2.5 rounded-lg">
                  ⚠️ {extractError}
                </div>
              )}

              <button
                type="button"
                onClick={handleExtractResume}
                disabled={isExtracting || !resumeText.trim()}
                className="w-full btn-indigo-glow disabled:opacity-40 text-xs font-semibold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isExtracting && <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>}
                {isExtracting ? "Extracting Skill Matrix via AI..." : "🔍 Analyze & Extract Baseline Skills"}
              </button>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-white/[0.08] bg-[#0E1117] flex items-center justify-between gap-3">
          <div className="text-[11px] text-[#94A3B8] font-mono tabular-nums">
            {hoursPerWeek}h/week · {ROLES.find(r => r.id === targetRoleId)?.title}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="text-xs px-4 py-2 rounded-lg border border-white/10 text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-white/[0.04] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveAndApply}
              className="btn-indigo-glow text-xs font-semibold px-5 py-2 rounded-lg transition-all cursor-pointer active:scale-95"
            >
              Save Profile & Synthesize Roadmap →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
