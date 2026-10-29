import React, { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard,
  GraduationCap,
  CalendarDays,
  Timer,
  AlarmClock,
  Flame,
  Users2,
  Grid,
  Settings,
  Eye,
  EyeOff,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Lock,
} from 'lucide-react';
import {
  CustomStudyTool,
  FriendRequestItem,
  HabitItem,
  NavTabId,
  ScheduledExam,
  SecurityThreatIncident,
  StudentFriend,
  StudyRoom,
  StudyTask,
  ThemeMode,
  UserProfileState,
} from './types';
import {
  createInitialHabits,
  createInitialUserProfile,
  INITIAL_EXAMS,
  INITIAL_GENUINE_FRIENDS,
  INITIAL_STUDY_ROOMS,
  INITIAL_STUDY_TASKS,
  INITIAL_STUDY_TOOLS,
} from './utils/initialData';
import {
  generateDeterministicFriendCode,
  isTestSubject,
  isTestSubjectHabit,
} from './utils/academicRules';
import {
  inspectPayloadForThreats,
  reportThreatIncident,
} from './utils/securityShield';
import {
  exportTaskToGoogleCalendar,
  fetchGoogleClassroomCoursework,
  getAccessToken,
  initAuth,
  persistResilientWorkspace,
  signInOrRegisterWithEmail,
  signInWithGoogleWorkspace,
  subscribeToRealFriendRequests,
  syncStudentPublicProfile,
} from './utils/firebaseClient';
import { EngezBrandLogo } from './components/EngezBrandLogo';
import { SecurityLockdownModal } from './components/SecurityLockdownModal';
import { AuthGateModal } from './components/AuthGateModal';
import { DashboardTab } from './components/DashboardTab';
import { AiScholarTab } from './components/AiScholarTab';
import { DailyPlannerTab } from './components/DailyPlannerTab';
import { FocusSoundscapesTab } from './components/FocusSoundscapesTab';
import { ExamCountdownTab } from './components/ExamCountdownTab';
import { HabitTrackerTab } from './components/HabitTrackerTab';
import { StudyFriendsTab } from './components/StudyFriendsTab';
import { StudyAppsTab } from './components/StudyAppsTab';
import { SettingsTab } from './components/SettingsTab';

const NAV_ITEMS: Array<{
  id: NavTabId;
  label: string;
  shortLabel: string;
  icon: React.FC<{ className?: string }>;
}> = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    shortLabel: 'Home',
    icon: LayoutDashboard,
  },
  {
    id: 'scholar',
    label: 'AI Examiner',
    shortLabel: 'Examiner',
    icon: GraduationCap,
  },
  {
    id: 'planner',
    label: 'Daily Planner',
    shortLabel: 'Planner',
    icon: CalendarDays,
  },
  {
    id: 'focus',
    label: 'Focus & Audio',
    shortLabel: 'Focus',
    icon: Timer,
  },
  {
    id: 'countdown',
    label: 'Exam Countdown',
    shortLabel: 'Exams',
    icon: AlarmClock,
  },
  {
    id: 'habits',
    label: 'Habit Tracker',
    shortLabel: 'Habits',
    icon: Flame,
  },
  {
    id: 'friends',
    label: 'Study Friends',
    shortLabel: 'Friends',
    icon: Users2,
  },
  {
    id: 'apps',
    label: 'Study Tools',
    shortLabel: 'Tools',
    icon: Grid,
  },
  {
    id: 'settings',
    label: 'Settings',
    shortLabel: 'Settings',
    icon: Settings,
  },
];

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>('warm');
  const [activeTab, setActiveTab] = useState<NavTabId>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [profile, setProfile] = useState<UserProfileState>(() =>
    createInitialUserProfile()
  );
  const [tasks, setTasks] = useState<StudyTask[]>(INITIAL_STUDY_TASKS);
  const [exams, setExams] = useState<ScheduledExam[]>(INITIAL_EXAMS);
  const [habits, setHabits] = useState<HabitItem[]>(() =>
    createInitialHabits()
  );
  const [friends, setFriends] = useState<StudentFriend[]>(
    INITIAL_GENUINE_FRIENDS
  );
  const [incomingRequests, setIncomingRequests] = useState<FriendRequestItem[]>(
    []
  );
  const [rooms, setRooms] = useState<StudyRoom[]>(INITIAL_STUDY_ROOMS);
  const [studyTools, setStudyTools] =
    useState<CustomStudyTool[]>(INITIAL_STUDY_TOOLS);

  const [securityIncident, setSecurityIncident] =
    useState<SecurityThreatIncident | null>(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [isSyncingClassroom, setIsSyncingClassroom] = useState(false);
  const [nudgedFriendName, setNudgedFriendName] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') return false;
      try {
        const saved = localStorage.getItem('explic_verified_session');
        if (saved) return false;
      } catch {}
    }
    return true;
  });
  const wakeLockSentinelRef = useRef<any>(null);

  // Purge any cached localStorage entries containing personal data, test habits, or subject codes
  useEffect(() => {
    try {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith('engez_workspace_')) {
          localStorage.removeItem(key);
        }
      });
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') {
        setProfile((prev) => ({
          ...prev,
          isGuest: false,
          twoStepVerified: true,
        }));
      }
      const savedVerified = localStorage.getItem('explic_verified_session');
      if (savedVerified) {
        const parsed = JSON.parse(savedVerified);
        if (parsed && parsed.email) {
          setProfile((prev) => ({
            ...prev,
            uid: parsed.uid || prev.uid,
            displayName: parsed.displayName || prev.displayName,
            email: parsed.email,
            isGuest: false,
            twoStepVerified: true,
          }));
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    let unsubRequests: (() => void) | null = null;
    const unsubAuth = initAuth((user) => {
      if (user) {
        const code = generateDeterministicFriendCode(
          user.uid || 'scholar-workspace'
        );
        const updatedProfile: UserProfileState = {
          ...profile,
          uid: user.uid,
          displayName: user.displayName || profile.displayName || 'Scholar',
          username: 'scholar',
          email: user.email || profile.email || '',
          gradeYear: '',
          targetSession: '',
          friendCode: code,
          isGuest: false,
          twoStepVerified: true,
        };
        setProfile(updatedProfile);
        setIsAuthModalOpen(false);
        syncStudentPublicProfile(updatedProfile).catch(() => {});

        if (unsubRequests) unsubRequests();
        unsubRequests = subscribeToRealFriendRequests(user.uid, (reqs) => {
          setIncomingRequests(reqs.filter((r) => !isTestSubject(r.fromName)));
        });
      }
    });

    return () => {
      unsubAuth();
      if (unsubRequests) unsubRequests();
    };
  }, []);

  const handleSelectNavTab = (tabId: NavTabId) => {
    setActiveTab(tabId);
    if ((tabId === 'scholar' || tabId === 'planner') && profile.isGuest) {
      setIsAuthModalOpen(true);
    }
  };

  useEffect(() => {
    const bundle = {
      profile,
      tasks,
      exams,
      habits: habits.filter((h) => !isTestSubjectHabit(h.name)),
      friends: friends.filter(
        (f) => !isTestSubject(f.displayName) && !isTestSubject(f.username)
      ),
      rooms,
      studyTools,
    };
    persistResilientWorkspace(profile.uid, bundle).catch(() => {});
  }, [profile, tasks, exams, habits, friends, rooms, studyTools]);

  const handleTriggerSecurityLockdown = (
    input: string,
    sourceAction: string
  ): boolean => {
    const threat = inspectPayloadForThreats(input, sourceAction);
    if (threat) {
      setSecurityIncident(threat);
      reportThreatIncident(threat).catch(() => {});
      return true;
    }
    return false;
  };

  const handleToggleWakeLock = async () => {
    if (wakeLockActive) {
      try {
        await wakeLockSentinelRef.current?.release();
      } catch {}
      wakeLockSentinelRef.current = null;
      setWakeLockActive(false);
      return;
    }

    try {
      if ('wakeLock' in navigator && (navigator as any).wakeLock?.request) {
        wakeLockSentinelRef.current = await (
          navigator as any
        ).wakeLock.request('screen');
      }
      setWakeLockActive(true);
    } catch {
      setWakeLockActive(true);
    }
  };

  const handleSyncGoogleClassroom = async () => {
    setIsSyncingClassroom(true);
    try {
      let token = getAccessToken();
      if (!token) {
        try {
          const res = await signInWithGoogleWorkspace();
          token = res.accessToken;
        } catch {}
      }

      if (token) {
        const fetched = await fetchGoogleClassroomCoursework(token);
        if (fetched.length > 0) {
          setTasks((prev) => {
            const manualOnly = prev.filter((t) => t.source === 'manual');
            return [...fetched, ...manualOnly];
          });
        }
      }
    } catch {
      // Preserve existing synchronized tasks gracefully
    } finally {
      setIsSyncingClassroom(false);
    }
  };

  const handleExportTaskToCalendar = async (task: StudyTask) => {
    let token = getAccessToken();
    if (!token) {
      try {
        const res = await signInWithGoogleWorkspace();
        token = res.accessToken;
      } catch {
        return;
      }
    }
    if (token) {
      await exportTaskToGoogleCalendar(token, task).catch(() => {});
    }
  };

  const handleAwardFocusXp = (xpAmount: number, minutesAdded = 0) => {
    setProfile((prev) => {
      const nextXp = prev.xp + xpAmount;
      const nextLevel = Math.max(1, Math.floor(nextXp / 400) + 1);
      const nextSun = (prev.weeklyFocusLog.Sun || 0) + minutesAdded;
      return {
        ...prev,
        xp: nextXp,
        level: nextLevel,
        todayStudyMinutes: prev.todayStudyMinutes + minutesAdded,
        weeklyFocusLog: {
          ...prev.weeklyFocusLog,
          Sun: nextSun,
        },
      };
    });
  };

  const isLight = theme === 'warm';

  return (
    <div
      className={`min-h-screen relative flex flex-col lg:flex-row transition-colors duration-300 ${
        isLight
          ? 'bg-[#F8FAFC] text-[#0F172A]'
          : 'bg-[#090D16] text-[#F8FAFC]'
      }`}
    >
      {/* Security Intrusion Lockdown Modal */}
      <SecurityLockdownModal
        incident={securityIncident}
        onReleaseQuarantine={() => setSecurityIncident(null)}
      />

      {/* Sign-In & Two-Step Verification Modal */}
      <AuthGateModal
        isOpen={isAuthModalOpen}
        theme={theme}
        canDismiss={!profile.isGuest}
        onClose={() => setIsAuthModalOpen(false)}
        onGoogleSignIn={async () => {
          const res = await signInWithGoogleWorkspace();
          if (res.user) {
            const code = generateDeterministicFriendCode(res.user.uid);
            const verifiedData = {
              uid: res.user.uid,
              displayName: res.user.displayName || 'Scholar',
              email: res.user.email || '',
              friendCode: code,
            };
            try {
              localStorage.setItem(
                'explic_verified_session',
                JSON.stringify(verifiedData)
              );
            } catch {}
            setProfile((prev) => ({
              ...prev,
              ...verifiedData,
              isGuest: false,
              twoStepVerified: true,
            }));
            setIsAuthModalOpen(false);
          }
        }}
        onCompleteTwoStepAuth={async ({ email, displayName }) => {
          const uid = `verified-${generateDeterministicFriendCode(email)}`;
          const friendCode = generateDeterministicFriendCode(uid);
          const verifiedData = {
            uid,
            displayName: displayName || email.split('@')[0],
            email,
            friendCode,
          };
          try {
            localStorage.setItem(
              'explic_verified_session',
              JSON.stringify(verifiedData)
            );
          } catch {}
          setProfile((prev) => ({
            ...prev,
            ...verifiedData,
            isGuest: false,
            twoStepVerified: true,
          }));
          setIsAuthModalOpen(false);
        }}
      />

      {/* Minimalist Left Sidebar (Desktop >= 1024px) */}
      <aside
        className={`hidden lg:flex flex-col justify-between z-20 shrink-0 border-r transition-all duration-300 ${
          sidebarCollapsed ? 'w-20' : 'w-64'
        } ${
          isLight
            ? 'bg-white border-[#E2E8F0]'
            : 'bg-[#111827] border-white/8'
        }`}
      >
        <div className="p-4 space-y-6">
          <div className="flex items-center justify-between px-1">
            <EngezBrandLogo theme={theme} collapsed={sidebarCollapsed} />
          </div>

          {!sidebarCollapsed && (
            <div
              className={`p-3.5 rounded-2xl border text-xs space-y-2 ${
                isLight
                  ? 'bg-[#F8FAFC] border-[#E2E8F0]'
                  : 'bg-[#090D16] border-white/8'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold truncate">
                  {profile.displayName || 'Scholar'}
                </div>
                <span className="font-mono-tabular text-[11px] opacity-70">
                  #{profile.friendCode}
                </span>
              </div>
              <div
                className={`text-[11px] flex items-center justify-between gap-2 ${
                  isLight ? 'text-[#64748B]' : 'text-[#94A3B8]'
                }`}
              >
                <span className="truncate">Level {profile.level}</span>
                <span className="font-mono-tabular whitespace-nowrap shrink-0">
                  {profile.xp} XP
                </span>
              </div>
              <div className="w-full h-1 rounded-full bg-current/10 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    isLight ? 'bg-[#0F172A]' : 'bg-[#6366F1]'
                  }`}
                  style={{ width: `${(profile.xp % 400) / 4}%` }}
                />
              </div>
            </div>
          )}

          <nav aria-label="Main Navigation" className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectNavTab(item.id)}
                  className={`group w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] whitespace-nowrap ${
                    isActive
                      ? isLight
                        ? 'bg-[#0F172A] text-white font-semibold shadow-[0_6px_16px_rgba(15,23,42,0.16)] translate-x-0.5'
                        : 'bg-[#6366F1] text-white font-semibold shadow-[0_6px_18px_rgba(99,102,241,0.28)] translate-x-0.5'
                      : isLight
                      ? 'text-[#475569] hover:text-[#0F172A] hover:bg-[#F8FAFC] hover:translate-x-0.5'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-white/5 hover:translate-x-0.5'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                      isActive ? 'scale-110' : 'group-hover:scale-105'
                    }`}
                  />
                  {!sidebarCollapsed && (
                    <span className="truncate">{item.label}</span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Controls */}
        <div className="p-4 border-t border-current/5 space-y-2 text-xs">
          <button
            type="button"
            onClick={handleToggleWakeLock}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border font-medium whitespace-nowrap transition-colors ${
              isLight
                ? 'border-[#E2E8F0] hover:bg-[#F8FAFC]'
                : 'border-white/10 hover:bg-white/5'
            }`}
          >
            <span className="flex items-center gap-2">
              {wakeLockActive ? (
                <Eye className="w-4 h-4 text-emerald-500" />
              ) : (
                <EyeOff className="w-4 h-4 opacity-50" />
              )}
              {!sidebarCollapsed &&
                (wakeLockActive ? 'Wake Lock On' : 'Wake Lock')}
            </span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTheme(isLight ? 'space' : 'warm')}
              aria-label="Toggle Light and Dark theme"
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border font-medium whitespace-nowrap transition-colors ${
                isLight
                  ? 'border-[#E2E8F0] hover:bg-[#F8FAFC]'
                  : 'border-white/10 hover:bg-white/5'
              }`}
            >
              {isLight ? (
                <>
                  <Moon className="w-4 h-4" />
                  {!sidebarCollapsed && 'Dark Mode'}
                </>
              ) : (
                <>
                  <Sun className="w-4 h-4" />
                  {!sidebarCollapsed && 'Light Mode'}
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setSidebarCollapsed((c) => !c)}
              aria-label={
                sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'
              }
              className={`p-2 rounded-xl border transition-colors ${
                isLight
                  ? 'border-[#E2E8F0] hover:bg-[#F8FAFC]'
                  : 'border-white/10 hover:bg-white/5'
              }`}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 z-10 pb-20 lg:pb-0">
        {/* Clean Minimalist Top Bar */}
        <header
          className={`flex items-center justify-between gap-8 px-6 py-3.5 border-b sticky top-0 z-20 backdrop-blur-md ${
            isLight
              ? 'bg-white/85 border-[#E2E8F0]'
              : 'bg-[#111827]/85 border-white/8'
          }`}
        >
          <div className="lg:hidden">
            <EngezBrandLogo theme={theme} />
          </div>

          <nav
            aria-label="Quick Workspace Navigation"
            className="hidden md:flex items-center gap-2 text-xs font-medium"
          >
            {[
              { id: 'dashboard', label: 'Dashboard' },
              { id: 'scholar', label: 'AI Examiner' },
              { id: 'planner', label: 'Planner' },
              { id: 'focus', label: 'Focus' },
              { id: 'apps', label: 'Study Tools' },
            ].map((nav) => (
              <button
                key={nav.id}
                type="button"
                onClick={() => handleSelectNavTab(nav.id as NavTabId)}
                className={`px-3 py-1.5 rounded-lg transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] whitespace-nowrap shrink-0 ${
                  activeTab === nav.id
                    ? isLight
                      ? 'bg-[#0F172A]/8 text-[#0F172A] font-semibold'
                      : 'bg-white/10 text-white font-semibold'
                    : isLight
                    ? 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
                    : 'text-[#94A3B8] hover:text-white hover:bg-white/5'
                }`}
              >
                {nav.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            {profile.isGuest ? (
              <button
                id="header-signin-btn"
                type="button"
                onClick={() => setIsAuthModalOpen(true)}
                className={`px-3.5 py-2 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-all whitespace-nowrap ${
                  isLight
                    ? 'border-[#CBD5E1] bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#0F172A]'
                    : 'border-white/15 bg-white/5 hover:bg-white/10 text-white'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                <span>Sign In / 2-Step Verify</span>
              </button>
            ) : (
              <span
                className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
                  isLight
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>{profile.displayName || 'Verified'}</span>
              </span>
            )}

            <button
              type="button"
              onClick={() => handleSelectNavTab('scholar')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                isLight
                  ? 'bg-[#0F172A] hover:bg-[#1E293B] text-white'
                  : 'bg-[#6366F1] hover:bg-[#4F46E5] text-white'
              }`}
            >
              Evaluate Paper
            </button>
          </div>
        </header>

        {/* Smooth Animated Tab Viewport */}
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8 overflow-x-hidden">
          <div key={activeTab} className="animate-tab-enter">
              {activeTab === 'dashboard' && (
                <DashboardTab
                  theme={theme}
                  profile={profile}
                  tasks={tasks}
                  exams={exams}
                  friends={friends.filter(
                    (f) =>
                      !isTestSubject(f.displayName) &&
                      !isTestSubject(f.username)
                  )}
                  onNavigateTab={handleSelectNavTab}
                  onSyncClassroom={handleSyncGoogleClassroom}
                  isSyncingClassroom={isSyncingClassroom}
                  onNudgeFriend={(name) => {
                    setNudgedFriendName(name);
                    setTimeout(() => setNudgedFriendName(null), 2800);
                  }}
                  nudgedFriendName={nudgedFriendName}
                />
              )}

              {activeTab === 'scholar' && (
                <div className="space-y-4">
                  {profile.isGuest && (
                    <div
                      className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isLight
                          ? 'bg-indigo-50/80 border-indigo-200 text-[#0F172A]'
                          : 'bg-indigo-950/30 border-indigo-500/30 text-white'
                      }`}
                    >
                      <div className="flex items-center gap-3 text-xs">
                        <Lock className="w-4 h-4 text-indigo-500 shrink-0" />
                        <span>
                          <strong>Sign In Required for AI Examiner:</strong> Sign in with Google or complete Two-Step Email Verification to unlock AI Past Paper Marking.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsAuthModalOpen(true)}
                        className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 ${
                          isLight
                            ? 'bg-[#0F172A] text-white'
                            : 'bg-[#6366F1] text-white'
                        }`}
                      >
                        Sign In / Verify Now
                      </button>
                    </div>
                  )}
                  <AiScholarTab
                    theme={theme}
                    onTriggerSecurityLockdown={handleTriggerSecurityLockdown}
                    onAwardFocusXp={(xp) => handleAwardFocusXp(xp, 0)}
                  />
                </div>
              )}

              {activeTab === 'planner' && (
                <DailyPlannerTab
                  theme={theme}
                  tasks={tasks}
                  isSignedIn={!profile.isGuest}
                  onRequireSignIn={() => setIsAuthModalOpen(true)}
                  onAddTask={(newTask) => {
                    if (
                      handleTriggerSecurityLockdown(
                        newTask.title,
                        'Daily Planner Task Creation'
                      )
                    )
                      return;
                    setTasks((prev) => [
                      {
                        ...newTask,
                        id: `task-${Date.now()}-${Math.random()
                          .toString(36)
                          .slice(2, 7)}`,
                      },
                      ...prev,
                    ]);
                  }}
                  onToggleTask={(id) =>
                    setTasks((prev) =>
                      prev.map((t) =>
                        t.id === id ? { ...t, completed: !t.completed } : t
                      )
                    )
                  }
                  onDeleteTask={(id) =>
                    setTasks((prev) => prev.filter((t) => t.id !== id))
                  }
                  onMarkAllDone={() =>
                    setTasks((prev) =>
                      prev.map((t) => ({ ...t, completed: true }))
                    )
                  }
                  onClearCompleted={() =>
                    setTasks((prev) => prev.filter((t) => !t.completed))
                  }
                  onSortByDeadline={() =>
                    setTasks((prev) =>
                      [...prev].sort((a, b) =>
                        a.dueDate.localeCompare(b.dueDate)
                      )
                    )
                  }
                  onSyncClassroom={handleSyncGoogleClassroom}
                  isSyncingClassroom={isSyncingClassroom}
                  onExportToCalendar={handleExportTaskToCalendar}
                />
              )}

              {activeTab === 'focus' && (
                <FocusSoundscapesTab
                  theme={theme}
                  wakeLockActive={wakeLockActive}
                  onToggleWakeLock={handleToggleWakeLock}
                  onCompleteFocusSession={(mins, xp) =>
                    handleAwardFocusXp(xp, mins)
                  }
                />
              )}

              {activeTab === 'countdown' && (
                <ExamCountdownTab
                  theme={theme}
                  exams={exams}
                  onAddExam={(ex) => setExams((prev) => [...prev, ex])}
                  onToggleTopic={(examId, topicId) =>
                    setExams((prev) =>
                      prev.map((ex) =>
                        ex.id !== examId
                          ? ex
                          : {
                              ...ex,
                              topics: ex.topics.map((tp) =>
                                tp.id === topicId
                                  ? { ...tp, completed: !tp.completed }
                                  : tp
                              ),
                            }
                      )
                    )
                  }
                />
              )}

              {activeTab === 'habits' && (
                <HabitTrackerTab
                  theme={theme}
                  habits={habits}
                  onAddHabit={(hab) => setHabits((prev) => [...prev, hab])}
                  onToggleHabitDay={(habitId, day) =>
                    setHabits((prev) =>
                      prev.map((h) => {
                        if (h.id !== habitId) return h;
                        const nextVal = !h.completedDays[day];
                        const nextStreak = nextVal
                          ? h.currentStreak + 1
                          : Math.max(0, h.currentStreak - 1);
                        return {
                          ...h,
                          completedDays: { ...h.completedDays, [day]: nextVal },
                          currentStreak: nextStreak,
                          bestStreak: Math.max(h.bestStreak, nextStreak),
                        };
                      })
                    )
                  }
                  onDeleteHabit={(habitId) =>
                    setHabits((prev) => prev.filter((h) => h.id !== habitId))
                  }
                />
              )}

              {activeTab === 'friends' && (
                <StudyFriendsTab
                  theme={theme}
                  profile={profile}
                  friends={friends}
                  incomingRequests={incomingRequests}
                  rooms={rooms}
                  onAddFriendByCode={(queryStr) => {
                    if (isTestSubject(queryStr)) return;
                    const code = /^[0-9]{5}$/.test(queryStr)
                      ? queryStr
                      : generateDeterministicFriendCode(queryStr);
                    const newFriend: StudentFriend = {
                      uid: `scholar-${code}`,
                      displayName:
                        /^[0-9]{5}$/.test(queryStr)
                          ? `Scholar #${code}`
                          : queryStr,
                      username: `scholar_${code}`,
                      friendCode: code,
                      status: 'Online',
                      weeklyFocusMinutes: 120,
                      streak: 1,
                      level: 1,
                      xp: 200,
                    };
                    if (!isTestSubject(newFriend.displayName)) {
                      setFriends((prev) =>
                        prev.some((f) => f.friendCode === code)
                          ? prev
                          : [...prev, newFriend]
                      );
                    }
                  }}
                  onAcceptFriendRequest={(req) => {
                    setIncomingRequests((prev) =>
                      prev.filter((r) => r.id !== req.id)
                    );
                    if (!isTestSubject(req.fromName)) {
                      setFriends((prev) => [
                        ...prev,
                        {
                          uid: req.fromUid,
                          displayName: req.fromName,
                          username: req.fromName
                            .toLowerCase()
                            .replace(/\s+/g, '_'),
                          friendCode: req.fromCode,
                          status: 'Online',
                          weeklyFocusMinutes: 120,
                          streak: 1,
                          level: 1,
                          xp: 200,
                        },
                      ]);
                    }
                  }}
                  onCreateRoom={(name, subject, targetMins) => {
                    const roomCode = generateDeterministicFriendCode(
                      `${name}-${Date.now()}`
                    );
                    setRooms((prev) => [
                      {
                        id: `room-${Date.now()}`,
                        roomCode,
                        name,
                        subject,
                        weeklyTargetMinutes: targetMins,
                        ownerId: profile.uid,
                        members: friends.slice(0, 2),
                      },
                      ...prev,
                    ]);
                  }}
                  onJoinRoomByCode={(code) => {
                    const cleanCode =
                      code.replace(/\D/g, '').slice(0, 5) || '58392';
                    if (!rooms.some((r) => r.roomCode === cleanCode)) {
                      setRooms((prev) => [
                        {
                          id: `room-${cleanCode}`,
                          roomCode: cleanCode,
                          name: `Study Room #${cleanCode}`,
                          subject: 'Combined Revision',
                          weeklyTargetMinutes: 1500,
                          ownerId: 'scholar-syndicate',
                          members: friends,
                        },
                        ...prev,
                      ]);
                    }
                  }}
                />
              )}

              {activeTab === 'apps' && (
                <StudyAppsTab
                  theme={theme}
                  tools={studyTools}
                  onAddCustomTool={(tool) =>
                    setStudyTools((prev) => [...prev, tool])
                  }
                />
              )}

              {activeTab === 'settings' && (
                <SettingsTab
                  theme={theme}
                  profile={profile}
                  onUpdateProfile={(updates) =>
                    setProfile((prev) => ({ ...prev, ...updates }))
                  }
                  onGoogleLogin={async () => {
                    const res = await signInWithGoogleWorkspace();
                    if (res.user) {
                      setProfile((prev) => ({
                        ...prev,
                        uid: res.user.uid,
                        displayName: prev.displayName,
                        email: '',
                        isGuest: false,
                      }));
                    }
                  }}
                  onEmailAuth={async (params) => {
                    const u = await signInOrRegisterWithEmail(params);
                    setProfile((prev) => ({
                      ...prev,
                      uid: u.uid,
                      displayName: params.displayName || prev.displayName,
                      email: '',
                      isGuest: false,
                    }));
                  }}
                />
              )}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation Dock (< 1024px) */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className={`lg:hidden fixed bottom-0 inset-x-0 z-30 border-t px-2 py-1.5 flex items-center justify-around backdrop-blur-md ${
          isLight
            ? 'bg-white/95 border-[#E2E8F0]'
            : 'bg-[#111827]/95 border-white/10'
        }`}
      >
        {[
          NAV_ITEMS[0],
          NAV_ITEMS[1],
          NAV_ITEMS[2],
          NAV_ITEMS[3],
          NAV_ITEMS[5],
          NAV_ITEMS[8],
        ].map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl text-[11px] font-semibold whitespace-nowrap ${
                isActive
                  ? isLight
                    ? 'text-[#0F172A]'
                    : 'text-[#6366F1]'
                  : isLight
                  ? 'text-[#64748B]'
                  : 'text-[#94A3B8]'
              }`}
            >
              <Icon className="w-4 h-4 mb-0.5" />
              <span>{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
