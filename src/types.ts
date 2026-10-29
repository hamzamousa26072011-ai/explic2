export type ThemeMode = 'warm' | 'space';

export type NavTabId =
  | 'dashboard'
  | 'scholar'
  | 'planner'
  | 'focus'
  | 'countdown'
  | 'habits'
  | 'friends'
  | 'apps'
  | 'settings';

export type ExamBoard =
  | 'General / All Curricula'
  | 'Cambridge CAIE'
  | 'Pearson Edexcel'
  | 'Oxford AQA';

export type QualificationLevel =
  | 'All Levels'
  | 'High School'
  | 'University'
  | 'IGCSE'
  | 'GCSE'
  | 'O-Level'
  | 'AS-Level'
  | 'A-Level';

export interface QuestionMarkLedgerItem {
  questionNumber: string;
  subQuestion?: string;
  maxMarks: number;
  awardedMarks: number;
  markingPointRationale: string;
  studentEvidence: string;
  reasonForLostMarks?: string;
  markSchemeRequirement: string;
  examinerWording?: string;
  confidence: 'High' | 'Moderate' | 'Ambiguous - Flagged';
  status: 'correct' | 'partial' | 'incorrect';
  highlightColor: '#70E0A0' | '#FFD580' | '#FF8888';
  yAnchorRatio: number; // 0.18 to 0.85 vertical ratio on page
  pageNumber: number;
  pass1Awarded: number;
  pass2Awarded: number;
  pass3Locked: number;
}

export interface ExaminerEvaluationResult {
  evaluationId: string;
  timestamp: string;
  board: ExamBoard;
  qualification: QualificationLevel;
  subject: string;
  syllabusCode: string;
  paperComponent: string;
  variant: string;
  session: string;
  totalAwarded: number;
  totalAvailable: number;
  percentage: number;
  provisionalGrade: string;
  gradeScaleUsed: '9-1' | 'A*-G' | 'A*-E';
  gradeThresholdBasis: string;
  sourceVerificationNotes: string[];
  aoBreakdown: {
    ao1: { awarded: number; max: number; label: string };
    ao2: { awarded: number; max: number; label: string };
    ao3: { awarded: number; max: number; label: string };
  };
  passSummary: {
    pass1Summary: string;
    pass2Verification: string;
    pass3Moderation: string;
    consensusNotes: string;
  };
  ledger: QuestionMarkLedgerItem[];
  lostMarksBreakdown: QuestionMarkLedgerItem[];
  priorityRevisionTopics: string[];
  whatsappSummary: string;
  annotatedPdfBase64?: string;
  ocrTranscription?: string;
  extractedMarkScheme?: string;
}

export interface StudyTask {
  id: string;
  title: string;
  subject: string;
  dueDate: string; // YYYY-MM-DD
  dueTime: string; // HH:mm
  priority: 'Urgent' | 'High' | 'Medium' | 'Low';
  estimatedMinutes: number;
  completed: boolean;
  source: 'manual' | 'classroom';
  courseName?: string;
  submissionState?: 'TURNED_IN' | 'RETURNED' | 'NEW';
  alternateLink?: string;
}

export interface DailyPlanTimeBlock {
  id: string;
  timeSlot: string; // e.g. "09:00 - 09:45"
  title: string;
  durationMinutes: number;
  blockType: 'deep_work' | 'review' | 'break';
  coachingNote: string;
  completed?: boolean;
}

export interface VoiceTaskAnalysis {
  workloadSummary: string;
  totalEstimatedMinutes: number;
  priorityRationale: string;
  focusStrategy: string;
}

export interface VoiceDailyPlanResult {
  transcript: string;
  assistantReply?: string;
  extractedTasks: Array<{
    title: string;
    subject?: string;
    dueDate: string;
    estimatedMinutes: number;
    priority: 'Urgent' | 'High' | 'Medium' | 'Low';
  }>;
  analysis: VoiceTaskAnalysis;
  dailyPlan: DailyPlanTimeBlock[];
  modelUsed: string;
}

export interface PlannerChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  extractedTasks?: Array<{
    title: string;
    subject?: string;
    dueDate: string;
    estimatedMinutes: number;
    priority: 'Urgent' | 'High' | 'Medium' | 'Low';
  }>;
}


export interface StopwatchLap {
  lapNumber: number;
  splitMs: number;
  totalMs: number;
  recordedAt: string;
}

export interface SyllabusTopicItem {
  id: string;
  code: string;
  title: string;
  completed: boolean;
}

export interface ScheduledExam {
  id: string;
  board: ExamBoard;
  subject: string;
  paperCode: string;
  examDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  examHall: string;
  seatNumber: string;
  topics: SyllabusTopicItem[];
}

export interface HabitItem {
  id: string;
  name: string;
  icon: string;
  frequency: 'Daily' | 'Weekdays' | 'Custom';
  colorTag: string;
  isoWeek: string; // e.g., 2026-W43
  completedDays: Record<string, boolean>; // Mon..Sun -> boolean
  currentStreak: number;
  bestStreak: number;
}

export interface StudentFriend {
  uid: string;
  displayName: string;
  username: string;
  friendCode: string; // 5-digit numeric e.g. "58392"
  status: 'Studying ⚡' | 'Online' | 'Resting';
  weeklyFocusMinutes: number;
  streak: number;
  level: number;
  xp: number;
  gradeYear?: string;
}

export interface FriendRequestItem {
  id: string;
  fromUid: string;
  fromName: string;
  fromCode: string;
  toUid: string;
  toCode: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
}

export interface StudyRoom {
  id: string;
  roomCode: string; // 5-digit numeric
  name: string;
  subject: string;
  weeklyTargetMinutes: number;
  ownerId: string;
  members: StudentFriend[];
}

export interface CustomStudyTool {
  id: string;
  name: string;
  category: 'Mathematics' | 'Sciences' | 'Past Papers' | 'Reference' | 'Custom';
  url: string;
  description: string;
  iconName: string;
  embeddable: boolean;
}

export interface UserProfileState {
  uid: string;
  displayName: string;
  username: string;
  email: string;
  friendCode: string;
  gradeYear: string;
  targetSession: string;
  xp: number;
  level: number;
  streak: number;
  todayStudyMinutes: number;
  weeklyGoalMinutes: number;
  weeklyFocusLog: Record<string, number>; // Mon..Sun
  status: 'Studying ⚡' | 'Online' | 'Resting';
  isGuest: boolean;
  twoStepVerified?: boolean;
}

export interface SecurityThreatIncident {
  incidentId: string;
  timestamp: string;
  vectorType: 'SQL_INJECTION' | 'XSS_PAYLOAD' | 'PROTOTYPE_POLLUTION';
  payloadSnippet: string;
  sourceAction: string;
  quarantined: boolean;
}
