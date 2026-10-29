import React from 'react';
import {
  Play,
  GraduationCap,
  RefreshCw,
  Users2,
  Clock,
  Flame,
  CalendarCheck2,
  ArrowUpRight,
  Zap,
} from 'lucide-react';
import {
  NavTabId,
  ScheduledExam,
  StudentFriend,
  StudyTask,
  ThemeMode,
  UserProfileState,
} from '../types';

interface DashboardTabProps {
  theme: ThemeMode;
  profile: UserProfileState;
  tasks: StudyTask[];
  exams: ScheduledExam[];
  friends: StudentFriend[];
  onNavigateTab: (tab: NavTabId) => void;
  onSyncClassroom: () => void;
  isSyncingClassroom: boolean;
  onNudgeFriend: (friendName: string) => void;
  nudgedFriendName: string | null;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  theme,
  profile,
  tasks,
  exams,
  friends,
  onNavigateTab,
  onSyncClassroom,
  isSyncingClassroom,
  onNudgeFriend,
  nudgedFriendName,
}) => {
  const isLight = theme === 'warm';
  const hour = new Date().getHours();
  const timeGreeting =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const pendingTasks = tasks.filter((t) => !t.completed);
  const topFiveTasks = tasks.slice(0, 5);

  const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weeklyMinutesValues = daysOfWeek.map(
    (d) => profile.weeklyFocusLog[d] || 0
  );
  const totalWeeklyMinutes = weeklyMinutesValues.reduce((a, b) => a + b, 0);
  const maxDayMinutes = Math.max(240, ...weeklyMinutesValues);
  const weeklyGoalPct = Math.min(
    100,
    Math.round((totalWeeklyMinutes / (profile.weeklyGoalMinutes || 1500)) * 100)
  );

  const cleanExams = exams.filter(
    (ex) =>
      ex.id !== 'exam-physics' &&
      ex.id !== 'exam-maths' &&
      ex.id !== 'exam-chemistry'
  );
  const nearestExam = cleanExams[0];
  const examDiffMs = nearestExam
    ? Math.max(
        0,
        new Date(`${nearestExam.examDate}T${nearestExam.startTime}:00`).getTime() -
          Date.now()
      )
    : 0;
  const countdownDays = Math.floor(examDiffMs / 86400000);
  const countdownHours = Math.floor((examDiffMs % 86400000) / 3600000);
  const countdownMins = Math.floor((examDiffMs % 3600000) / 60000);

  const cardSurface = isLight
    ? 'bg-white border-[#E2E8F0] text-[#0F172A] shadow-[0_1px_2px_rgba(15,23,42,0.03)]'
    : 'bg-[#111827] border-white/10 text-[#F8FAFC]';
  const subtleSurface = isLight
    ? 'bg-[#F8FAFC] border-[#E2E8F0]'
    : 'bg-[#090D16] border-white/10';
  const mutedText = isLight ? 'text-[#64748B]' : 'text-[#94A3B8]';
  const primaryBtn = isLight
    ? 'bg-[#0F172A] hover:bg-[#1E293B] text-white'
    : 'bg-[#6366F1] hover:bg-[#4F46E5] text-white';

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Minimalist Hero Header & Metrics */}
      <section className={`rounded-2xl border p-6 ${cardSurface}`}>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-1.5">
            <div className={`text-xs font-medium ${mutedText}`}>
              Study Workspace
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {timeGreeting}
              {profile.displayName ? `, ${profile.displayName}` : ''}
            </h1>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:gap-4 shrink-0">
            <div className={`px-4 py-3 rounded-xl border ${subtleSurface}`}>
              <div className={`text-[11px] ${mutedText} flex items-center gap-1.5`}>
                <Flame className="w-3.5 h-3.5 text-amber-500" />
                Streak
              </div>
              <div className="text-lg font-bold font-mono-tabular mt-0.5">
                {profile.streak}d
              </div>
            </div>

            <div className={`px-4 py-3 rounded-xl border ${subtleSurface}`}>
              <div className={`text-[11px] ${mutedText} flex items-center gap-1.5`}>
                <Clock className="w-3.5 h-3.5 text-emerald-500" />
                Today
              </div>
              <div className="text-lg font-bold font-mono-tabular mt-0.5">
                {profile.todayStudyMinutes}m
              </div>
            </div>

            <div className={`px-4 py-3 rounded-xl border ${subtleSurface}`}>
              <div className={`text-[11px] ${mutedText} flex items-center gap-1.5`}>
                <CalendarCheck2 className="w-3.5 h-3.5 text-indigo-500" />
                Due Tasks
              </div>
              <div className="text-lg font-bold font-mono-tabular mt-0.5">
                {pendingTasks.length}
              </div>
            </div>
          </div>
        </div>

        {/* Clean Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mt-6 pt-5 border-t border-current/5">
          <button
            type="button"
            onClick={() => onNavigateTab('scholar')}
            className={`flex items-center justify-between px-4 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${primaryBtn}`}
          >
            <span className="flex items-center gap-2">
              <GraduationCap className="w-4 h-4" />
              AI Paper Examiner
            </span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab('focus')}
            className={`flex items-center justify-between px-4 py-2.5 rounded-xl text-xs font-medium border transition-colors whitespace-nowrap ${
              isLight
                ? 'border-[#E2E8F0] hover:bg-[#F8FAFC]'
                : 'border-white/10 hover:bg-white/5'
            }`}
          >
            <span className="flex items-center gap-2">
              <Play className="w-3.5 h-3.5" />
              Focus Timer
            </span>
            <ArrowUpRight className="w-3.5 h-3.5 opacity-60" />
          </button>

          <button
            type="button"
            onClick={onSyncClassroom}
            disabled={isSyncingClassroom}
            className={`flex items-center justify-between px-4 py-2.5 rounded-xl text-xs font-medium border transition-colors whitespace-nowrap ${
              isLight
                ? 'border-[#E2E8F0] hover:bg-[#F8FAFC]'
                : 'border-white/10 hover:bg-white/5'
            }`}
          >
            <span className="flex items-center gap-2">
              <RefreshCw
                className={`w-3.5 h-3.5 ${isSyncingClassroom ? 'animate-spin' : ''}`}
              />
              {isSyncingClassroom ? 'Syncing...' : 'Sync Classroom'}
            </span>
            <ArrowUpRight className="w-3.5 h-3.5 opacity-60" />
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab('friends')}
            className={`flex items-center justify-between px-4 py-2.5 rounded-xl text-xs font-medium border transition-colors whitespace-nowrap ${
              isLight
                ? 'border-[#E2E8F0] hover:bg-[#F8FAFC]'
                : 'border-white/10 hover:bg-white/5'
            }`}
          >
            <span className="flex items-center gap-2">
              <Users2 className="w-3.5 h-3.5" />
              Study Rooms
            </span>
            <ArrowUpRight className="w-3.5 h-3.5 opacity-60" />
          </button>
        </div>
      </section>

      {/* Main 2-Column Split: Weekly Focus & Next Exam */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <section
          className={`lg:col-span-7 rounded-2xl border p-6 flex flex-col justify-between ${cardSurface}`}
        >
          <div>
            <div className="flex items-center justify-between gap-4 mb-3">
              <div>
                <h2 className="text-sm font-semibold">Weekly Study Focus</h2>
                <p className={`text-xs ${mutedText}`}>
                  Daily minutes logged this week
                </p>
              </div>
              <div className="text-right font-mono-tabular">
                <div className="text-sm font-bold">
                  {totalWeeklyMinutes} / {profile.weeklyGoalMinutes}m ({weeklyGoalPct}%)
                </div>
              </div>
            </div>

            <div className="w-full h-1.5 rounded-full bg-current/10 overflow-hidden mb-6">
              <div
                className={`h-full transition-all ${
                  isLight ? 'bg-[#0F172A]' : 'bg-[#6366F1]'
                }`}
                style={{ width: `${weeklyGoalPct}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-7 gap-3 items-end h-40 pt-2">
            {daysOfWeek.map((day) => {
              const mins = profile.weeklyFocusLog[day] || 0;
              const heightPct = Math.max(
                8,
                Math.round((mins / maxDayMinutes) * 100)
              );
              return (
                <div
                  key={day}
                  className="flex flex-col items-center justify-end h-full gap-2"
                >
                  <span className={`text-[11px] font-mono-tabular ${mutedText}`}>
                    {mins}m
                  </span>
                  <div className="w-full bg-current/5 rounded-lg h-24 flex items-end overflow-hidden">
                    <div
                      className={`w-full rounded-lg transition-all ${
                        isLight ? 'bg-[#0F172A]' : 'bg-[#6366F1]'
                      }`}
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                  <span className={`text-xs font-medium ${mutedText}`}>
                    {day}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Next Exam Card */}
        <section
          className={`lg:col-span-5 rounded-2xl border p-6 flex flex-col justify-between ${cardSurface}`}
        >
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className={`text-xs font-medium ${mutedText}`}>
                Next Scheduled Exam
              </span>
              <button
                type="button"
                onClick={() => onNavigateTab('countdown')}
                className="text-xs font-medium underline hover:opacity-80 whitespace-nowrap"
              >
                All Exams
              </button>
            </div>

            {nearestExam ? (
              <>
                <h2 className="text-lg font-bold tracking-tight">
                  {nearestExam.subject}
                </h2>
                <p className={`text-xs mt-0.5 ${mutedText}`}>
                  {nearestExam.paperCode} · {nearestExam.examDate} ({nearestExam.startTime})
                </p>

                <div className="grid grid-cols-3 gap-3 my-5">
                  {[
                    { val: countdownDays, label: 'Days' },
                    { val: countdownHours, label: 'Hours' },
                    { val: countdownMins, label: 'Minutes' },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className={`p-3 rounded-xl border text-center ${subtleSurface}`}
                    >
                      <div className="text-xl font-bold font-mono-tabular">
                        {item.val}
                      </div>
                      <div className={`text-[11px] ${mutedText}`}>
                        {item.label}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className={`text-sm ${mutedText}`}>No upcoming exams scheduled.</p>
            )}
          </div>

          <button
            type="button"
            onClick={() => onNavigateTab('scholar')}
            className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold transition-all ${primaryBtn}`}
          >
            Practice {nearestExam?.subject || 'Past Paper'} with Examiner
          </button>
        </section>
      </div>

      {/* Bottom Row: Priority Tasks & Study Circle */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className={`lg:col-span-7 rounded-2xl border p-6 ${cardSurface}`}>
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-semibold">Upcoming Tasks</h2>
              <p className={`text-xs ${mutedText}`}>
                Priority study blocks and assignments
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('planner')}
              className="text-xs font-medium underline hover:opacity-80 whitespace-nowrap"
            >
              Open Planner
            </button>
          </div>

          <div className="divide-y divide-current/5">
            {topFiveTasks.map((task) => (
              <div
                key={task.id}
                className="py-3 flex items-center justify-between gap-4 text-sm"
              >
                <div className="min-w-0">
                  <div
                    className={`font-medium truncate ${
                      task.completed ? 'line-through opacity-50' : ''
                    }`}
                  >
                    {task.title}
                  </div>
                  <div className={`text-xs ${mutedText} mt-0.5`}>
                    {task.subject} · Due {task.dueDate} · {task.priority}
                  </div>
                </div>
                <span className={`font-mono-tabular text-xs font-medium shrink-0 ${mutedText}`}>
                  {task.estimatedMinutes}m
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className={`lg:col-span-5 rounded-2xl border p-6 ${cardSurface}`}>
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-semibold">Study Circle</h2>
              <p className={`text-xs ${mutedText}`}>
                Connect with classmates via 5-digit code
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('friends')}
              className="text-xs font-medium underline hover:opacity-80 whitespace-nowrap"
            >
              Manage
            </button>
          </div>

          {nudgedFriendName && (
            <div className="mb-3 px-3 py-2 rounded-xl text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
              Sent focus nudge to {nudgedFriendName}
            </div>
          )}

          <div className="space-y-3">
            {friends.length === 0 ? (
              <div className={`p-6 rounded-xl border text-center space-y-2 ${subtleSurface}`}>
                <div className="text-xs font-semibold">No study friends added yet</div>
                <p className={`text-xs ${mutedText}`}>
                  Share your 5-digit code (<strong>#{profile.friendCode}</strong>) or add classmates to study together.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigateTab('friends')}
                  className={`mt-1 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold ${primaryBtn}`}
                >
                  <Users2 className="w-3.5 h-3.5" />
                  Add Friends
                </button>
              </div>
            ) : (
              friends.map((friend) => (
                <div
                  key={friend.uid}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${subtleSurface}`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">
                      {friend.displayName}
                    </div>
                    <div className={`text-[11px] ${mutedText} font-mono-tabular`}>
                      #{friend.friendCode} · {friend.weeklyFocusMinutes}m/wk
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onNudgeFriend(friend.displayName)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                      isLight
                        ? 'border-[#E2E8F0] hover:bg-white'
                        : 'border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <Zap className="w-3 h-3 inline mr-1" />
                    Nudge
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
