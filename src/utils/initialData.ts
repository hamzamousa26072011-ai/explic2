import {
  CustomStudyTool,
  HabitItem,
  ScheduledExam,
  StudentFriend,
  StudyRoom,
  StudyTask,
  UserProfileState,
} from '../types';
import {
  generateDeterministicFriendCode,
  getIsoWeekIdentifier,
} from './academicRules';

export interface PastPaperCatalogItem {
  id: string;
  board: 'Cambridge CAIE' | 'Pearson Edexcel' | 'Oxford AQA';
  qualification: 'IGCSE' | 'GCSE' | 'O-Level' | 'AS-Level' | 'A-Level';
  subject: string;
  syllabusCode: string;
  paperComponent: string;
  variant: string;
  session: string;
  maxMarks: number;
  sampleStudentScript: string;
  sampleMarkScheme: string;
}

export const PAST_PAPER_CATALOG: PastPaperCatalogItem[] = [
  {
    id: 'caie-physics-p4',
    board: 'Cambridge CAIE',
    qualification: 'IGCSE',
    subject: 'Physics',
    syllabusCode: '',
    paperComponent: 'Extended Theory Paper',
    variant: '1',
    session: 'May/June 2026',
    maxMarks: 10,
    sampleStudentScript: `Q1(a): Acceleration a = (v - u) / t = (24 - 0) / 6.0 = 4.0 m/s^2
Q2(b): Resultant F = m * a = 1200 * 4.0 = 4800. Driving thrust = 4800 + 600 = 5400
Q3(c): Energy is lost as heat and sound to the surroundings as the vehicle moves along the track.`,
    sampleMarkScheme: `Q1(a): a = (v-u)/t [M1]; 24/6.0 [M1]; 4.0 m/s^2 [A1] (Total 3)
Q2(b): F_res = 1200 * 4.0 = 4800 N [M1]; F_drive = 4800 + 600 [M1]; 5400 [A1]; unit N [B1] (Total 4)
Q3(c): Kinetic/chemical energy store decreases [B1]; mechanical work done against friction/air resistance [B1]; thermal store of surroundings/brakes increases [B1] (Total 3)`,
  },
  {
    id: 'caie-chemistry-p4',
    board: 'Cambridge CAIE',
    qualification: 'IGCSE',
    subject: 'Chemistry',
    syllabusCode: '',
    paperComponent: 'Extended Theory Paper',
    variant: '1',
    session: 'May/June 2026',
    maxMarks: 8,
    sampleStudentScript: `Q1(a): Isotopes are atoms of the same element with equal protons and different neutrons.
Q2(b): n(HCl) = 0.025 * 2.0 = 0.050 mol -> n(Mg) = 0.025 mol. Ionic: H+ + OH- -> H2O
Q3(c): Increasing temperature shifts equilibrium to the right because particles collide faster.`,
    sampleMarkScheme: `Q1(a): Same number of protons [B1]; different number of neutrons [B1] (Total 2)
Q2(b): Moles HCl = 0.050 [M1]; Moles Mg = 0.025 [M1]; H+(aq) + OH-(aq) -> H2O(l) with state symbols [A1] (Total 3)
Q3(c): Forward reaction is exothermic [B1]; increasing temperature shifts equilibrium to the left [B1]; decreases equilibrium yield [B1] (Total 3)`,
  },
  {
    id: 'caie-maths-p4',
    board: 'Cambridge CAIE',
    qualification: 'IGCSE',
    subject: 'Mathematics',
    syllabusCode: '',
    paperComponent: 'Extended Calculator Paper',
    variant: '1',
    session: 'May/June 2026',
    maxMarks: 10,
    sampleStudentScript: `Q1(a): Compound amount A = 4500 * (1 + 0.045)^3 = $5135.25
Q2(b): 2x^2 + 5x - 9 = 0 -> x = (-5 +- sqrt(25 - 4(2)(-9))) / 4 -> x = 1.2 or x = -3.7
Q3(c): dy/dx = 6x^2 - 12x = 6x(x - 2) = 0 -> stationary points at x = 0 and x = 2.`,
    sampleMarkScheme: `Q1(a): 4500 * 1.045^3 [M1]; 5135.25 [A2] (Total 3)
Q2(b): Discriminant 25 - 4(2)(-9) = 97 [M1]; (-5 +- sqrt(97))/4 [M1]; x = 1.21 and x = -3.71 to 2 d.p. [A2] (Total 4)
Q3(c): dy/dx = 6x^2 - 12x [M1]; x = 0, x = 2 [A1]; d^2y/dx^2 = 12x - 12 > 0 at x=2 proving minimum [B1] (Total 3)`,
  },
  {
    id: 'edexcel-maths-2h',
    board: 'Pearson Edexcel',
    qualification: 'IGCSE',
    subject: 'Mathematics',
    syllabusCode: '',
    paperComponent: 'Higher Tier Paper',
    variant: '2H',
    session: 'May/June 2026',
    maxMarks: 10,
    sampleStudentScript: `Q1(a): A = 4500 * 1.045^3 = 5135.25
Q2(b): x = (-5 +- sqrt(97))/4 -> x = 1.2 or x = -3.7
Q3(c): dy/dx = 6x^2 - 12x = 0 -> x = 0, 2`,
    sampleMarkScheme: `Standard Edexcel Higher Tier mark scheme (9-1 scale).`,
  },
  {
    id: 'aqa-chemistry-p1',
    board: 'Oxford AQA',
    qualification: 'IGCSE',
    subject: 'Chemistry',
    syllabusCode: '',
    paperComponent: 'Core & Extension Paper',
    variant: '1',
    session: 'May/June 2026',
    maxMarks: 8,
    sampleStudentScript: `Q1(a): Atoms of the same element with same atomic number and different mass number.
Q2(b): Moles = 0.025 * 2.0 = 0.050 mol. H+ + OH- -> H2O
Q3(c): Equilibrium moves right on heating.`,
    sampleMarkScheme: `Oxford AQA Core & Extension mark scheme (9-1 scale).`,
  },
];

export const HISTORIC_SCHOLAR_QUOTES = [
  {
    quote:
      'In examination scripts, clarity of working is not merely presentation—it is the visible architecture of scientific reasoning.',
    author: 'Ibn al-Haytham (Alhazen), Book of Optics',
  },
  {
    quote:
      'Method marks reward the courage to formulate the principle accurately even before the final number emerges.',
    author: 'Cambridge Senior Principal Moderator',
  },
  {
    quote:
      'Precision in units and significant figures separates the casual reader from the disciplined scholar.',
    author: 'Al-Khwarizmi, Compendious Book on Calculation',
  },
];

export function createInitialUserProfile(): UserProfileState {
  const uid = 'guest-workspace-user';
  return {
    uid,
    displayName: '',
    username: 'scholar',
    email: '',
    friendCode: generateDeterministicFriendCode('scholar-workspace'),
    gradeYear: '',
    targetSession: '',
    xp: 0,
    level: 1,
    streak: 1,
    todayStudyMinutes: 0,
    weeklyGoalMinutes: 1500,
    weeklyFocusLog: {
      Mon: 0,
      Tue: 0,
      Wed: 0,
      Thu: 0,
      Fri: 0,
      Sat: 0,
      Sun: 0,
    },
    status: 'Online',
    isGuest: true,
  };
}

// Strictly empty by default — zero test subjects or pre-populated tasks in the planner
export const INITIAL_STUDY_TASKS: StudyTask[] = [];

// Strictly empty by default — zero test subjects or pre-populated exams in the exam countdown
export const INITIAL_EXAMS: ScheduledExam[] = [];

// Strictly empty by default — zero test habits or pre-populated placeholders
export function createInitialHabits(): HabitItem[] {
  return [];
}

// Strictly empty by default — zero simulated or test subject student profiles
export const INITIAL_GENUINE_FRIENDS: StudentFriend[] = [];

export const INITIAL_STUDY_ROOMS: StudyRoom[] = [
  {
    id: 'room-stem',
    roomCode: '58392',
    name: 'STEM Revision Room',
    subject: 'Physics & Extended Maths',
    weeklyTargetMinutes: 1500,
    ownerId: 'guest-workspace-user',
    members: [],
  },
];

export const INITIAL_STUDY_TOOLS: CustomStudyTool[] = [
  {
    id: 'tool-casio-991es',
    name: 'Casio fx-991ES PLUS',
    category: 'Mathematics',
    url: 'internal://casio-fx-991es-plus',
    description:
      'Natural-V.P.A.M. scientific calculator with 2-line textbook display, exact fractions (S⇔D), trigonometry, logs, and constants.',
    iconName: 'Calculator',
    embeddable: true,
  },
];

