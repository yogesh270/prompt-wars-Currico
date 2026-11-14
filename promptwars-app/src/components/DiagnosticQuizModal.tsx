"use client";

import { useState, useMemo } from "react";
import type { Learner } from "@/lib/types";
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
    <div className="fixed inset-0 bg-black/85 backdrop-blur-xl flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-[#151923] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden ring-1 ring-white/10">
        
        {/* Modal Header */}
        <div className="p-6 border-b border-white/[0.08] flex items-center justify-between bg-[#0E1117]/80">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-[#6366F1]/15 border border-[#6366F1]/30 flex items-center justify-center text-sm text-[#6366F1]">
                📝
              </span>
              <h3 className="text-base font-bold text-[#F8FAFC] tracking-tight">
                Live Diagnostic Assessment
              </h3>
              <span className="text-[10px] font-mono bg-[#6366F1]/15 border border-[#6366F1]/30 text-[#6366F1] px-2 py-0.5 rounded font-semibold">
                {role.title}
              </span>
            </div>
            <p className="text-xs text-[#94A3B8] mt-1">
              5 calibrated technical questions targeting active skill gaps. Scores recalibrate your readiness in real time.
            </p>
          </div>

          <button
            onClick={onClose}
            className="text-[#94A3B8] hover:text-[#F8FAFC] text-lg font-mono leading-none p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Quick Testing Actions Toolbar */}
        <div className="bg-[#0E1117] px-6 py-2.5 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-[#94A3B8] font-mono tabular-nums text-[11px]">
            <span>Progress:</span>
            <span className="font-bold text-[#06B6D4]">{answeredCount}/{questions.length} answered</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-mono text-[#94A3B8]">Quick Test:</span>
            <button
              onClick={handleAutoFillHigh}
              className="text-[11px] font-mono bg-[#10B981]/15 hover:bg-[#10B981]/25 border border-[#10B981]/30 text-[#10B981] px-2.5 py-1 rounded transition-colors font-medium"
              title="Select all correct answers to test mastery upgrade"
            >
              ⚡ High Score (5/5)
            </button>
            <button
              onClick={handleAutoFillLow}
              className="text-[11px] font-mono bg-[#F43F5E]/15 hover:bg-[#F43F5E]/25 border border-[#F43F5E]/30 text-[#F43F5E] px-2.5 py-1 rounded transition-colors font-medium"
              title="Select low score to test gap detection"
            >
              ⚠️ Low Score (1/5)
            </button>
          </div>
        </div>

        {/* Questions Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 bg-[#07080C]">
          {questions.map((q, index) => {
            const skillName = SKILLS.find(s => s.id === q.skillId)?.name || q.skillId;
            const currentAnswer = answers[q.questionId];

            return (
              <div
                key={q.questionId}
                className="card-surface rounded-xl p-4 space-y-3 hover:border-white/20 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-[#151923] border border-white/10 flex items-center justify-center text-[10px] font-mono font-bold text-[#06B6D4] tabular-nums">
                      {index + 1}
                    </span>
                    <span className="text-[10px] font-mono uppercase bg-[#06B6D4]/15 text-[#06B6D4] border border-[#06B6D4]/30 px-2 py-0.5 rounded font-semibold">
                      Skill: {skillName}
                    </span>
                  </div>

                  {currentAnswer && (
                    <span className="text-[10px] font-mono text-[#10B981] bg-[#10B981]/15 border border-[#10B981]/30 px-2 py-0.5 rounded font-semibold">
                      Answered
                    </span>
                  )}
                </div>

                <p className="text-xs font-semibold text-[#F8FAFC] leading-snug">
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
                            ? "bg-[#6366F1]/20 border-[#6366F1] text-[#F8FAFC] font-medium shadow-[0_0_12px_rgba(99,102,241,0.2)]"
                            : "bg-[#07080C]/80 border-white/[0.08] text-[#94A3B8] hover:bg-[#151923] hover:border-white/20 hover:text-[#F8FAFC]"
                        }`}
                      >
                        <input
                          type="radio"
                          name={q.questionId}
                          value={opt}
                          checked={isSelected}
                          onChange={() => handleSelect(q.questionId, opt)}
                          className="accent-[#6366F1] shrink-0"
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
        <div className="p-4 border-t border-white/[0.08] bg-[#0E1117] flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="text-xs font-mono text-[#94A3B8] hover:text-[#F8FAFC] px-4 py-2 rounded-xl border border-white/10 hover:bg-white/[0.04] transition-colors"
          >
            Cancel
          </button>

          <button
            onClick={handleSubmit}
            disabled={!isComplete || isSubmitting}
            className="btn-indigo-glow disabled:opacity-40 text-xs font-semibold px-6 py-2.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
          >
            {isSubmitting && <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>}
            <span>{isSubmitting ? "Recalibrating Pipeline..." : `Submit Assessment (${answeredCount}/5)`}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
