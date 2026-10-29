import React, { useEffect, useState } from 'react';
import {
  Plus,
  CheckCircle2,
  Circle,
  AlertTriangle,
  ShieldCheck,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { ScheduledExam, ThemeMode } from '../types';

interface ExamCountdownTabProps {
  theme: ThemeMode;
  exams: ScheduledExam[];
  onAddExam: (exam: ScheduledExam) => void;
  onToggleTopic: (examId: string, topicId: string) => void;
}

const LEGACY_TEST_EXAM_IDS = new Set([
  'exam-physics',
  'exam-maths',
  'exam-chemistry',
]);

export const ExamCountdownTab: React.FC<ExamCountdownTabProps> = ({
  theme,
  exams,
  onAddExam,
  onToggleTopic,
}) => {
  const isLight = theme === 'warm';
  const [nowMs, setNowMs] = useState(Date.now());
  const [showAddForm, setShowAddForm] = useState(false);

  const [subject, setSubject] = useState('');
  const [examDate, setExamDate] = useState('2026-11-12');

  const cleanExams = exams.filter((ex) => !LEGACY_TEST_EXAM_IDS.has(ex.id));

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const handleCreateExam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) return;
    onAddExam({
      id: `exam-${Date.now()}`,
      board: 'General / All Curricula',
      subject: subject.trim(),
      paperCode: 'Scheduled Exam',
      examDate,
      startTime: '09:00',
      examHall: 'Main Hall',
      seatNumber: 'TBA',
      topics: [
        {
          id: `tp-${Date.now()}-1`,
          code: '',
          title: 'Core Concepts & Definitions',
          completed: false,
        },
        {
          id: `tp-${Date.now()}-2`,
          code: '',
          title: 'Structured Problem Solving & Past Papers',
          completed: false,
        },
      ],
    });
    setSubject('');
    setShowAddForm(false);
  };

  const cardSurface = isLight
    ? 'bg-white border-[#E2E8F0] text-[#0F172A] shadow-[0_1px_2px_rgba(15,23,42,0.03)]'
    : 'bg-[#111827] border-white/10 text-[#F8FAFC]';
  const inputSurface = isLight
    ? 'bg-[#F8FAFC] border-[#E2E8F0] text-[#0F172A] focus:bg-white focus:border-[#0F172A]'
    : 'bg-[#090D16] border-white/10 text-[#F8FAFC] focus:border-[#6366F1]';
  const mutedText = isLight ? 'text-[#64748B]' : 'text-[#94A3B8]';
  const primaryBtn = isLight
    ? 'bg-[#0F172A] hover:bg-[#1E293B] text-white'
    : 'bg-[#6366F1] hover:bg-[#4F46E5] text-white';

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Minimalist Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Exam Countdown</h1>
          <p className={`text-xs mt-1 ${mutedText}`}>
            Live examination timers and revision checklists
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddForm((s) => !s)}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all self-start sm:self-auto ${primaryBtn}`}
        >
          <Plus className="w-4 h-4" />
          <span>Add Exam</span>
          {showAddForm ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Collapsible Add Exam Drawer: ONLY Subject Name and Date */}
      {showAddForm && (
        <section className={`rounded-2xl border p-6 ${cardSurface}`}>
          <form
            onSubmit={handleCreateExam}
            className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs"
          >
            <div className="sm:col-span-7">
              <label
                htmlFor="exam-subject"
                className={`block font-medium mb-1.5 ${mutedText}`}
              >
                Subject Name
              </label>
              <input
                id="exam-subject"
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Biology"
                className={`w-full rounded-xl border px-3.5 py-2.5 outline-none ${inputSurface}`}
              />
            </div>

            <div className="sm:col-span-3">
              <label
                htmlFor="exam-date"
                className={`block font-medium mb-1.5 ${mutedText}`}
              >
                Date
              </label>
              <input
                id="exam-date"
                type="date"
                required
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className={`w-full rounded-xl border px-3.5 py-2.5 font-mono-tabular outline-none ${inputSurface}`}
              />
            </div>

            <div className="sm:col-span-2 flex items-end">
              <button
                type="submit"
                className={`w-full py-2.5 px-4 rounded-xl font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap ${primaryBtn}`}
              >
                <Plus className="w-4 h-4" />
                Save Exam
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Empty State or Exam Cards Grid */}
      {cleanExams.length === 0 ? (
        <section
          className={`rounded-2xl border p-12 text-center space-y-3 ${cardSurface}`}
        >
          <Clock className={`w-8 h-8 mx-auto ${mutedText}`} />
          <h2 className="text-base font-bold tracking-tight">
            No exams scheduled yet
          </h2>
          <p className={`text-xs max-w-md mx-auto ${mutedText}`}>
            Add your upcoming exams to track live countdown timers and revision checklists.
          </p>
          {!showAddForm && (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className={`mt-2 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${primaryBtn}`}
            >
              <Plus className="w-4 h-4" />
              Add Your First Exam
            </button>
          )}
        </section>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {cleanExams.map((exam) => {
          const targetMs = new Date(
            `${exam.examDate}T${exam.startTime}:00`
          ).getTime();
          const diff = Math.max(0, targetMs - nowMs);
          const days = Math.floor(diff / 86400000);
          const hours = Math.floor((diff % 86400000) / 3600000);
          const mins = Math.floor((diff % 3600000) / 60000);
          const secs = Math.floor((diff % 60000) / 1000);

          const urgency =
            days < 7
              ? {
                  label: 'Urgent',
                  textColor: 'text-red-600 dark:text-red-400',
                  icon: AlertTriangle,
                }
              : days <= 30
              ? {
                  label: 'Approaching',
                  textColor: 'text-amber-600 dark:text-amber-400',
                  icon: Clock,
                }
              : {
                  label: 'On Track',
                  textColor: 'text-emerald-600 dark:text-emerald-400',
                  icon: ShieldCheck,
                };

          const UrgencyIcon = urgency.icon;
          const completedTopics = exam.topics.filter((t) => t.completed).length;
          const masteryPct =
            exam.topics.length > 0
              ? Math.round((completedTopics / exam.topics.length) * 100)
              : 0;

          return (
            <section
              key={exam.id}
              className={`rounded-2xl border p-6 flex flex-col justify-between space-y-5 ${cardSurface}`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className={`font-mono-tabular font-medium ${mutedText}`}>
                    {exam.examDate}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 font-semibold ${urgency.textColor}`}
                  >
                    <UrgencyIcon className="w-3.5 h-3.5" />
                    {urgency.label}
                  </span>
                </div>

                <div>
                  <h2 className="text-lg font-bold tracking-tight">
                    {exam.subject}
                  </h2>
                </div>

                {/* Live 4-Unit Countdown */}
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    { val: days, unit: 'Days' },
                    { val: hours, unit: 'Hrs' },
                    { val: mins, unit: 'Min' },
                    { val: secs, unit: 'Sec' },
                  ].map((u) => (
                    <div
                      key={u.unit}
                      className={`p-2.5 rounded-xl border ${
                        isLight
                          ? 'bg-[#F8FAFC] border-[#E2E8F0]'
                          : 'bg-[#090D16] border-white/10'
                      }`}
                    >
                      <div className="text-lg font-bold font-mono-tabular">
                        {String(u.val).padStart(2, '0')}
                      </div>
                      <div className={`text-[10px] ${mutedText}`}>{u.unit}</div>
                    </div>
                  ))}
                </div>

                {/* Topic Checklist (Zero subject codes) */}
                <div className="pt-4 border-t border-current/5 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">Revision Progress</span>
                    <span className="font-mono-tabular font-semibold">
                      {completedTopics}/{exam.topics.length} ({masteryPct}%)
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-current/10 overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        isLight ? 'bg-[#0F172A]' : 'bg-[#6366F1]'
                      }`}
                      style={{ width: `${masteryPct}%` }}
                    />
                  </div>

                  <div className="space-y-1.5 pt-1">
                    {exam.topics.map((tp) => (
                      <button
                        key={tp.id}
                        type="button"
                        onClick={() => onToggleTopic(exam.id, tp.id)}
                        className="w-full flex items-start gap-2.5 text-left text-xs py-1.5 hover:opacity-80 transition-opacity"
                      >
                        {tp.completed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        ) : (
                          <Circle
                            className={`w-4 h-4 shrink-0 mt-0.5 ${mutedText}`}
                          />
                        )}
                        <span
                          className={
                            tp.completed ? 'line-through opacity-50' : ''
                          }
                        >
                          {tp.title}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          );
        })}
        </div>
      )}
    </div>
  );
};
