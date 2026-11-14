"use client";

import { useState, useMemo } from "react";
import type { Learner, RoleId } from "@/lib/types";
import { QUIZ_QUESTIONS, ROLES, SKILLS } from "@/lib/seed";
import { saveLearnerToSupabase } from "@/lib/supabase";

interface DiagnosticQuizModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLearner: Learner;
  onAssessmentComplete: (updatedLearner: Learner, scorePct: number) => void;
}

export default function DiagnosticQuizModal({
  isOpen,
  onClose,
  currentLearner,
  onAssessmentComplete,
}: DiagnosticQuizModalProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const role = ROLES.find(r => r.id === currentLearner.targetRoleId) ?? ROLES[0];
  const questions = useMemo(
    () => QUIZ_QUESTIONS.filter(q => q.roleId === currentLearner.targetRoleId),
    [currentLearner.targetRoleId]
  );

  if (!isOpen) return null;

  const answeredCount = Object.keys(answers).length;
  const isComplete = answeredCount === questions.length;

  function handleSelect(questionId: string, option: string) {
    setAnswers(prev => ({ ...prev, [questionId]: option }));
  }

  function handleAutoFillHigh() {
    const filled: Record<string, string> = {};
    for (const q of questions) {
      filled[q.questionId] = q.answerKey;
    }
    setAnswers(filled);
  }

  function handleAutoFillLow() {
    const filled: Record<string, string> = {};
    questions.forEach((q, idx) => {
      // 1 correct (20%), 4 wrong
      if (idx === 0) {
        filled[q.questionId] = q.answerKey;
      } else {
        const wrongOption = q.options.find(opt => opt !== q.answerKey) ?? q.options[0];
        filled[q.questionId] = wrongOption;
      }
    });
    setAnswers(filled);
  }

  async function handleSubmit() {
    setIsSubmitting(true);

    try {
      let correctCount = 0;
      const skillScoreDeltas: Record<string, { correct: boolean; question: string }> = {};

      for (const q of questions) {
        const isCorrect = answers[q.questionId] === q.answerKey;
        if (isCorrect) correctCount++;
        skillScoreDeltas[q.skillId] = { correct: isCorrect, question: q.question };
      }

      const scorePct = Math.round((correctCount / questions.length) * 100);

      // Clone existing learner skills
      const skillMap = new Map(currentLearner.skills.map(s => [s.skillId, { ...s }]));

      // Apply assessment score adjustments (0 to 4 scale)
      for (const [skillId, delta] of Object.entries(skillScoreDeltas)) {
        const existing = skillMap.get(skillId);
        if (delta.correct) {
          // If correct, boost skill level to 3 or 4
          const newLevel = existing ? Math.min(4, Math.max(existing.level + 1, 3)) : 3;
          skillMap.set(skillId, {
            skillId,
            level: newLevel as any,
            confidence: 0.9,
            evidence: [
              ...(existing?.evidence || []),
              `Verified via Live Diagnostic Assessment (Score: ${scorePct}%)`,
            ],
          });
        } else {
          // If incorrect, drop skill level by 1 or cap at 1
          const newLevel = existing ? Math.max(0, existing.level - 1) : 0;
          skillMap.set(skillId, {
            skillId,
            level: newLevel as any,
            confidence: 0.4,
            evidence: [
              ...(existing?.evidence || []),
              `Identified deficiency in Live Diagnostic Assessment (${scorePct}%)`,
            ],
          });
        }
      }

      const updatedLearner: Learner = {
        ...currentLearner,
        skills: Array.from(skillMap.values()),
      };

      // Persist to Supabase learner_skills if configured
      await saveLearnerToSupabase(updatedLearner, `Live Diagnostic Quiz: ${correctCount}/${questions.length} correct`);

      // Trigger automatic pipeline replan in UI
      onAssessmentComplete(updatedLearner, scorePct);
      onClose();
    } catch (err) {
      console.error("Assessment evaluation error:", err);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-[#101014] border border-neutral-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden ring-1 ring-white/5">
        
        {/* Modal Header */}
        <div className="p-6 border-b border-neutral-800/80 flex items-center justify-between bg-neutral-950/60">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded bg-indigo-950 border border-indigo-700/60 flex items-center justify-center text-xs text-indigo-300">
                📝
              </span>
              <h3 className="text-base font-bold text-white tracking-tight">
                Live Diagnostic Assessment
              </h3>
              <span className="text-[10px] font-mono bg-indigo-950/80 border border-indigo-800 text-indigo-300 px-2 py-0.5 rounded">
                {role.title}
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-1">
              5 calibrated technical questions targeting active skill gaps. Scores calibrate readiness in real time.
            </p>
          </div>

          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white text-lg font-mono leading-none p-1.5 rounded-lg hover:bg-neutral-800/60 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Quick Testing Actions Toolbar */}
        <div className="bg-neutral-900/50 px-6 py-2.5 border-b border-neutral-800/60 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-neutral-400 font-mono text-[11px]">
            <span>Progress:</span>
            <span className="font-bold text-indigo-400">{answeredCount}/{questions.length} answered</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-mono text-neutral-500">Quick Test:</span>
            <button
              onClick={handleAutoFillHigh}
              className="text-[11px] font-mono bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/80 text-emerald-300 px-2 py-1 rounded transition-colors"
              title="Select all correct answers to test mastery upgrade"
            >
              ⚡ High Score (5/5)
            </button>
            <button
              onClick={handleAutoFillLow}
              className="text-[11px] font-mono bg-rose-950/60 hover:bg-rose-900/60 border border-rose-800/80 text-rose-300 px-2 py-1 rounded transition-colors"
              title="Select low score to test gap detection"
            >
              ⚠️ Low Score (1/5)
            </button>
          </div>
        </div>

        {/* Questions Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {questions.map((q, index) => {
            const skillName = SKILLS.find(s => s.id === q.skillId)?.name || q.skillId;
            const currentAnswer = answers[q.questionId];

            return (
              <div
                key={q.questionId}
                className="bg-neutral-950/70 border border-neutral-800/90 rounded-xl p-4 space-y-3 hover:border-neutral-700/80 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-neutral-900 border border-neutral-800 flex items-center justify-center text-[10px] font-mono font-bold text-neutral-400">
                      {index + 1}
                    </span>
                    <span className="text-[10px] font-mono uppercase bg-indigo-950/60 text-indigo-300 border border-indigo-800/60 px-2 py-0.5 rounded">
                      Skill: {skillName}
                    </span>
                  </div>

                  {currentAnswer && (
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/50 border border-emerald-800/50 px-2 py-0.5 rounded">
                      Answered
                    </span>
                  )}
                </div>

                <p className="text-xs font-semibold text-neutral-200 leading-snug">
                  {q.question}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {q.options.map(opt => {
                    const isSelected = currentAnswer === opt;
                    return (
                      <label
                        key={opt}
                        onClick={() => handleSelect(q.questionId, opt)}
                        className={`flex items-center gap-2.5 text-xs p-2.5 rounded-lg border transition-all cursor-pointer ${
                          isSelected
                            ? "bg-indigo-950/70 border-indigo-500/80 text-white font-medium shadow-sm shadow-indigo-950/40"
                            : "bg-neutral-900/60 border-neutral-800 text-neutral-300 hover:bg-neutral-900 hover:border-neutral-700"
                        }`}
                      >
                        <input
                          type="radio"
                          name={q.questionId}
                          value={opt}
                          checked={isSelected}
                          onChange={() => handleSelect(q.questionId, opt)}
                          className="accent-indigo-500 shrink-0"
                        />
                        <span className="leading-snug break-words">{opt}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-neutral-800/80 bg-neutral-950/80 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="text-xs font-mono text-neutral-400 hover:text-white px-4 py-2 rounded-xl border border-neutral-800 hover:bg-neutral-900 transition-colors"
          >
            Cancel
          </button>

          <button
            onClick={handleSubmit}
            disabled={!isComplete || isSubmitting}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold px-6 py-2.5 rounded-xl shadow-md shadow-indigo-600/30 transition-all flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
          >
            {isSubmitting && <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>}
            <span>{isSubmitting ? "Recalibrating Pipeline..." : `Submit Assessment (${answeredCount}/5)`}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
