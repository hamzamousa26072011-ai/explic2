import React, { useState } from 'react';
import { Flame, Plus, Check, Trash2 } from 'lucide-react';
import { HabitItem, ThemeMode } from '../types';
import {
  getIsoWeekIdentifier,
  isTestSubjectHabit,
} from '../utils/academicRules';

interface HabitTrackerTabProps {
  theme: ThemeMode;
  habits: HabitItem[];
  onAddHabit: (habit: HabitItem) => void;
  onToggleHabitDay: (habitId: string, day: string) => void;
  onDeleteHabit?: (habitId: string) => void;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const HabitTrackerTab: React.FC<HabitTrackerTabProps> = ({
  theme,
  habits,
  onAddHabit,
  onToggleHabitDay,
  onDeleteHabit,
}) => {
  const isLight = theme === 'warm';
  const currentIsoWeek = getIsoWeekIdentifier(new Date());

  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState<'Daily' | 'Weekdays' | 'Custom'>(
    'Daily'
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filter out any test or pre-populated habits
  const cleanHabits = habits.filter((h) => !isTestSubjectHabit(h.name));

  const handleCreateHabit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (isTestSubjectHabit(name)) {
      setErrorMsg('Please enter a real study habit.');
      return;
    }
    setErrorMsg(null);
    onAddHabit({
      id: `hab-${Date.now()}`,
      name: name.trim(),
      icon: 'Flame',
      frequency,
      colorTag: '#4F46E5',
      isoWeek: currentIsoWeek,
      completedDays: {
        Mon: false,
        Tue: false,
        Wed: false,
        Thu: false,
        Fri: false,
        Sat: false,
        Sun: false,
      },
      currentStreak: 0,
      bestStreak: 0,
    });
    setName('');
  };

  const totalCheckboxes = cleanHabits.length * 7;
  const checkedCount = cleanHabits.reduce(
    (sum, h) => sum + DAYS.filter((d) => h.completedDays[d]).length,
    0
  );
  const consistencyRate =
    totalCheckboxes > 0 ? Math.round((checkedCount / totalCheckboxes) * 100) : 0;

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
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Minimalist Header & Quick Add Bar */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Habit Tracker</h1>
          <p className={`text-xs mt-1 ${mutedText}`}>
            Weekly consistency matrix ({currentIsoWeek})
          </p>
        </div>

        {cleanHabits.length > 0 && (
          <div className="flex items-center gap-3">
            <div className="text-right font-mono-tabular">
              <span className="text-lg font-bold">{consistencyRate}%</span>
              <span className={`text-xs ml-1.5 ${mutedText}`}>weekly completion</span>
            </div>
          </div>
        )}
      </div>

      {/* Clean Single-Row Habit Creator */}
      <section className={`rounded-2xl border p-5 ${cardSurface}`}>
        {errorMsg && (
          <div className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs">
            {errorMsg}
          </div>
        )}

        <form
          onSubmit={handleCreateHabit}
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 text-xs"
        >
          <input
            id="habit-name-input"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Add a new study habit (e.g. Daily past paper practice)..."
            className={`flex-1 rounded-xl border px-3.5 py-2.5 outline-none transition-colors ${inputSurface}`}
          />

          <select
            id="habit-freq-select"
            aria-label="Habit Frequency"
            value={frequency}
            onChange={(e) =>
              setFrequency(e.target.value as 'Daily' | 'Weekdays' | 'Custom')
            }
            className={`sm:w-44 rounded-xl border px-3 py-2.5 outline-none transition-colors ${inputSurface}`}
          >
            <option value="Daily">Daily</option>
            <option value="Weekdays">Weekdays</option>
            <option value="Custom">Custom</option>
          </select>

          <button
            type="submit"
            className={`py-2.5 px-5 rounded-xl font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap transition-all ${primaryBtn}`}
          >
            <Plus className="w-4 h-4" />
            Add Habit
          </button>
        </form>
      </section>

      {/* Weekly 7-Day Matrix or Minimalist Empty State */}
      <section className={`rounded-2xl border overflow-hidden ${cardSurface}`}>
        {cleanHabits.length === 0 ? (
          <div className="py-16 px-6 text-center space-y-2">
            <div
              className={`w-10 h-10 rounded-2xl mx-auto flex items-center justify-center ${
                isLight ? 'bg-slate-100 text-slate-600' : 'bg-white/5 text-slate-400'
              }`}
            >
              <Flame className="w-5 h-5" />
            </div>
            <h2 className="text-sm font-semibold">No habits tracked yet</h2>
            <p className={`text-xs max-w-sm mx-auto ${mutedText}`}>
              Your habit tracker is completely clean. Add your own personal study habits above to track your daily streak.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr
                  className={`border-b ${
                    isLight
                      ? 'border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B]'
                      : 'border-white/10 bg-white/2 text-[#94A3B8]'
                  }`}
                >
                  <th className="py-3.5 px-5 font-medium">Habit</th>
                  {DAYS.map((day) => (
                    <th key={day} className="py-3.5 px-2 text-center font-medium">
                      {day}
                    </th>
                  ))}
                  <th className="py-3.5 px-5 text-right font-medium">Streak</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-current/5">
                {cleanHabits.map((habit) => (
                  <tr key={habit.id} className="hover:bg-current/2 transition-colors">
                    <td className="py-4 px-5">
                      <div className="font-semibold text-sm">{habit.name}</div>
                      <div className={`text-[11px] mt-0.5 ${mutedText}`}>
                        {habit.frequency}
                      </div>
                    </td>
                    {DAYS.map((day) => {
                      const done = Boolean(habit.completedDays[day]);
                      return (
                        <td key={day} className="py-4 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => onToggleHabitDay(habit.id, day)}
                            aria-label={`Toggle ${habit.name} for ${day}`}
                            className={`w-8 h-8 rounded-xl inline-flex items-center justify-center border transition-all ${
                              done
                                ? primaryBtn
                                : isLight
                                ? 'border-[#E2E8F0] bg-[#F8FAFC] hover:border-slate-400'
                                : 'border-white/10 bg-[#090D16] hover:border-white/30'
                            }`}
                          >
                            {done && <Check className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                      );
                    })}
                    <td className="py-4 px-5 text-right font-mono-tabular">
                      <div className="inline-flex items-center gap-3">
                        <span>
                          <strong className="font-semibold">{habit.currentStreak}d</strong>
                          <span className={mutedText}> / {habit.bestStreak}d</span>
                        </span>
                        {onDeleteHabit && (
                          <button
                            type="button"
                            onClick={() => onDeleteHabit(habit.id)}
                            aria-label={`Remove ${habit.name}`}
                            className={`p-1.5 rounded-lg opacity-50 hover:opacity-100 hover:text-red-500 transition-opacity`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
