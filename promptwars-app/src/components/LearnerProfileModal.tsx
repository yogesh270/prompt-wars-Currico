"use client";

import { useState } from "react";
import type { Learner, LearnerSkill, RoleId, SkillLevel } from "@/lib/types";
import { ROLES, SKILLS, PRIYA_PERSONA } from "@/lib/seed";

interface LearnerProfileModalProps {
  currentLearner: Learner;
  isOpen: boolean;
  onClose: () => void;
  onSave: (learner: Learner, rawResumeText?: string) => void;
}

const CORE_SKILLS = [
  { id: "javascript", name: "JavaScript", role: "Web / Full-Stack" },
  { id: "typescript", name: "TypeScript", role: "Web / Full-Stack" },
  { id: "react", name: "React", role: "Frontend" },
  { id: "nextjs", name: "Next.js", role: "Full-Stack" },
  { id: "nodejs", name: "Node.js", role: "Backend" },
  { id: "rest-api", name: "REST APIs", role: "Backend" },
  { id: "sql", name: "SQL", role: "Database" },
  { id: "postgres", name: "PostgreSQL", role: "Database" },
  { id: "git", name: "Git & GitHub", role: "DevOps / Core" },
  { id: "testing", name: "Testing (Jest)", role: "Quality" },
  { id: "html", name: "HTML & CSS", role: "Frontend" },
  { id: "cloud-deploy", name: "Cloud & Deploy", role: "DevOps" },
  { id: "python", name: "Python", role: "Data / AI" },
  { id: "fastapi", name: "FastAPI", role: "AI Backend" },
  { id: "prompt-eng", name: "Prompt Eng", role: "AI" },
  { id: "vector-db", name: "Vector DBs", role: "AI" },
];

const LEVEL_LABELS: Record<number, string> = {
  0: "0 · None",
  1: "1 · Novice",
  2: "2 · Intermediate",
  3: "3 · Proficient",
  4: "4 · Advanced",
};

export default function LearnerProfileModal({
  currentLearner,
  isOpen,
  onClose,
  onSave,
}: LearnerProfileModalProps) {
  const [activeTab, setActiveTab] = useState<"matrix" | "resume">("matrix");
  const [name, setName] = useState(currentLearner.name || "Custom Learner");
  const [targetRoleId, setTargetRoleId] = useState<RoleId>(currentLearner.targetRoleId);
  const [hoursPerWeek, setHoursPerWeek] = useState(currentLearner.hoursPerWeek);
  const [skillsMap, setSkillsMap] = useState<Record<string, SkillLevel>>(() => {
    const map: Record<string, SkillLevel> = {};
    for (const s of currentLearner.skills) {
      map[s.skillId] = s.level;
    }
    return map;
  });

  const [resumeText, setResumeText] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");

  if (!isOpen) return null;

  function handleSkillChange(skillId: string, level: SkillLevel) {
    setSkillsMap(prev => ({ ...prev, [skillId]: level }));
  }

  function handleLoadPreset(preset: "priya" | "zero" | "backend") {
    if (preset === "priya") {
      setName(PRIYA_PERSONA.name);
      setTargetRoleId(PRIYA_PERSONA.targetRoleId);
      setHoursPerWeek(PRIYA_PERSONA.hoursPerWeek);
      const map: Record<string, SkillLevel> = {};
      for (const s of PRIYA_PERSONA.skills) {
        map[s.skillId] = s.level;
      }
      setSkillsMap(map);
    } else if (preset === "zero") {
      setName("Beginner Student");
      setHoursPerWeek(5);
      const map: Record<string, SkillLevel> = {};
      for (const s of CORE_SKILLS) {
        map[s.id] = 0;
      }
      setSkillsMap(map);
    } else if (preset === "backend") {
      setName("Alex (Python Switcher)");
      setTargetRoleId("full-stack");
      setHoursPerWeek(5);
      setSkillsMap({
        python: 4,
        sql: 3,
        postgres: 3,
        git: 2,
        html: 2,
        javascript: 1,
        typescript: 0,
        react: 0,
        nextjs: 0,
        nodejs: 1,
        "rest-api": 2,
        testing: 1,
        "cloud-deploy": 1,
      });
    }
  }

  async function handleExtractResume() {
    if (!resumeText.trim()) return;
    setIsExtracting(true);
    setExtractError("");

    try {
      const res = await fetch("/api/profile/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: resumeText }),
      });

      if (!res.ok) throw new Error("Extraction failed");
      const data = await res.json();

      if (data.extractedName && data.extractedName !== "Custom Learner") {
        setName(data.extractedName);
      }

      if (data.skills && Array.isArray(data.skills)) {
        const updated: Record<string, SkillLevel> = { ...skillsMap };
        for (const s of data.skills) {
          updated[s.skillId] = s.level;
        }
        setSkillsMap(updated);
        setActiveTab("matrix");
      }
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Failed to extract skills");
    } finally {
      setIsExtracting(false);
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setResumeText(content);
      }
    };
    reader.readAsText(file);
  }

  function handleSaveAndApply() {
    const skills: LearnerSkill[] = Object.entries(skillsMap)
      .filter(([_, level]) => level > 0)
      .map(([skillId, level]) => ({
        skillId,
        level,
        confidence: 0.9,
        evidence: ["User manual profile configuration"],
      }));

    const updatedLearner: Learner = {
      id: name === PRIYA_PERSONA.name ? "priya" : `learner_${name.toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
      name: name.trim() || "Custom Learner",
      targetRoleId,
      hoursPerWeek,
      completedModuleIds: [],
      skills,
    };

    onSave(updatedLearner, resumeText);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-[#101014] border border-neutral-800 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-800/80 flex items-center justify-between bg-neutral-900/40">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <span>Learner Profile & Skill Ingestion</span>
              <span className="text-[10px] bg-indigo-950/80 border border-indigo-700/60 text-indigo-300 font-mono px-2 py-0.5 rounded">
                Adaptive Core
              </span>
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Customize baseline proficiency or ingest resume text to generate a personalized roadmap.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white text-lg font-mono leading-none p-1.5 rounded-lg hover:bg-neutral-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tab switcher & Presets */}
        <div className="px-6 py-3 border-b border-neutral-800/60 flex flex-wrap items-center justify-between gap-3 bg-[#0d0d10]">
          <div className="flex items-center gap-1 bg-neutral-900/80 p-1 rounded-lg border border-neutral-800">
            <button
              onClick={() => setActiveTab("matrix")}
              className={`text-xs px-3 py-1 rounded-md font-medium transition-all ${
                activeTab === "matrix"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              Skill Matrix Editor
            </button>
            <button
              onClick={() => setActiveTab("resume")}
              className={`text-xs px-3 py-1 rounded-md font-medium transition-all ${
                activeTab === "resume"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              Resume / Text Ingestion
            </button>
          </div>

          {/* Quick Presets */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-neutral-500 font-mono text-[11px]">Presets:</span>
            <button
              onClick={() => handleLoadPreset("priya")}
              className="text-[11px] font-mono px-2 py-1 rounded bg-neutral-800/80 border border-neutral-700 text-neutral-300 hover:border-indigo-500 transition-colors"
            >
              Priya (Demo)
            </button>
            <button
              onClick={() => handleLoadPreset("backend")}
              className="text-[11px] font-mono px-2 py-1 rounded bg-neutral-800/80 border border-neutral-700 text-neutral-300 hover:border-indigo-500 transition-colors"
            >
              Python Switcher
            </button>
            <button
              onClick={() => handleLoadPreset("zero")}
              className="text-[11px] font-mono px-2 py-1 rounded bg-neutral-800/80 border border-neutral-700 text-neutral-300 hover:border-indigo-500 transition-colors"
            >
              Beginner
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Top Profile Metadata Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-neutral-900/40 p-4 rounded-xl border border-neutral-800/70">
            <div>
              <label className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider block mb-1">
                Learner Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Priya or Alex"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-medium"
              />
            </div>

            <div>
              <label className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider block mb-1">
                Target Role
              </label>
              <select
                value={targetRoleId}
                onChange={e => setTargetRoleId(e.target.value as RoleId)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-indigo-300 focus:outline-none focus:border-indigo-500 font-medium"
              >
                {ROLES.map(r => (
                  <option key={r.id} value={r.id} className="bg-neutral-950 text-white">
                    {r.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider block mb-1">
                Weekly Budget: <span className="text-indigo-400 font-bold">{hoursPerWeek}h/wk</span>
              </label>
              <input
                type="range"
                min={2}
                max={20}
                step={1}
                value={hoursPerWeek}
                onChange={e => setHoursPerWeek(Number(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer mt-1"
              />
            </div>
          </div>

          {/* TAB 1: Skill Matrix Editor */}
          {activeTab === "matrix" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase tracking-wider text-neutral-400 font-semibold">
                  Competency Matrix (0 = None · 4 = Advanced)
                </span>
                <span className="text-[11px] text-neutral-500">
                  {Object.values(skillsMap).filter(v => v > 0).length} of {CORE_SKILLS.length} skills active
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CORE_SKILLS.map(skill => {
                  const currentLevel = skillsMap[skill.id] ?? 0;
                  return (
                    <div
                      key={skill.id}
                      className="bg-neutral-950/60 border border-neutral-800/80 rounded-xl p-3 flex flex-col justify-between hover:border-neutral-700 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="text-xs font-semibold text-white block">{skill.name}</span>
                          <span className="text-[10px] text-neutral-500 font-mono">{skill.role}</span>
                        </div>
                        <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded border ${
                          currentLevel >= 3
                            ? "bg-emerald-950/80 text-emerald-300 border-emerald-800"
                            : currentLevel > 0
                            ? "bg-indigo-950/80 text-indigo-300 border-indigo-800"
                            : "bg-neutral-900 text-neutral-500 border-neutral-800"
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
                            className={`flex-1 text-[10px] font-mono py-1 rounded transition-all ${
                              currentLevel === lvl
                                ? "bg-indigo-600 text-white font-bold shadow-sm"
                                : "bg-neutral-900 text-neutral-400 hover:bg-neutral-800"
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
              <div className="border-2 border-dashed border-neutral-800 hover:border-indigo-500/80 rounded-xl p-5 text-center transition-colors bg-neutral-950/40">
                <input
                  type="file"
                  id="resume-file"
                  accept=".txt,.md,.pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <label htmlFor="resume-file" className="cursor-pointer block space-y-1.5">
                  <span className="text-2xl block">📄</span>
                  <span className="text-xs font-semibold text-neutral-200 block">
                    Upload Resume or Bio (.txt, .md)
                  </span>
                  <span className="text-[11px] text-neutral-500 block">
                    Click to browse or drag and drop your text resume
                  </span>
                </label>
              </div>

              <div>
                <label className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider block mb-1.5">
                  Or Paste Resume / GitHub Bio Text
                </label>
                <textarea
                  rows={6}
                  value={resumeText}
                  onChange={e => setResumeText(e.target.value)}
                  placeholder="Paste work experience, skills summary, or GitHub README markdown here..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-xs text-neutral-200 focus:outline-none focus:border-indigo-500 font-mono leading-relaxed"
                />
              </div>

              {extractError && (
                <div className="text-xs text-rose-400 bg-rose-950/40 border border-rose-800/80 p-2.5 rounded-lg">
                  ⚠️ {extractError}
                </div>
              )}

              <button
                type="button"
                onClick={handleExtractResume}
                disabled={isExtracting || !resumeText.trim()}
                className="w-full bg-indigo-600/90 hover:bg-indigo-600 disabled:opacity-40 text-white text-xs font-semibold py-2.5 rounded-xl transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isExtracting && <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>}
                {isExtracting ? "Extracting Skill Matrix via AI..." : "🔍 Analyze & Extract Baseline Skills"}
              </button>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-neutral-800/80 bg-neutral-900/40 flex items-center justify-between gap-3">
          <div className="text-[11px] text-neutral-500 font-mono">
            {hoursPerWeek}h/week · {ROLES.find(r => r.id === targetRoleId)?.title}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="text-xs px-4 py-2 rounded-lg border border-neutral-800 text-neutral-400 hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveAndApply}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-5 py-2 rounded-lg shadow-md shadow-indigo-600/25 transition-all cursor-pointer active:scale-95"
            >
              Save Profile & Synthesize Roadmap →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
