import {
  DailyPlanTimeBlock,
  ExamBoard,
  QualificationLevel,
  QuestionMarkLedgerItem,
  VoiceDailyPlanResult,
} from '../types';

const BANNED_TEST_NAMES = new Set([
  'sarah',
  'karim',
  'nour',
  'youssef el-masri',
  'youssef_caie',
  'mariam al-qasimi',
  'mariam_stem',
  'omar abdelrahman',
  'omar_physics',
  'layla hassan',
  'layla_med',
  'ahmed test',
  'test',
  'test user',
  'test subject',
  'john doe',
  'jane doe',
  'placeholder',
  'mock student',
  'demo friend',
  'sample student',
]);

const BANNED_TEST_HABITS = new Set([
  'test habit',
  'sample habit',
  'dummy habit',
  'test subject',
  'foo',
  'bar',
  'asdf',
  'solve 2 past paper section b questions',
  'review active recall flashcards (20 mins)',
  'log mark scheme error ledger',
  'hydration & eye-rest protocol',
]);

/**
 * Deterministic 5-digit numeric friend code generator (10000 - 99999)
 */
export function generateDeterministicFriendCode(seedString: string): string {
  const clean = (seedString || 'engez-scholar').trim();
  let hash = 2166136261;
  for (let i = 0; i < clean.length; i++) {
    hash ^= clean.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const positive = Math.abs(hash);
  const fiveDigit = 10000 + (positive % 90000);
  return String(fiveDigit);
}

/**
 * Checks if a UID belongs to the local guest sandbox to prevent unauthenticated Firestore writes.
 */
export function isGuestUid(uid: string | null | undefined): boolean {
  if (!uid) return true;
  return (
    uid === 'guest-workspace-user' ||
    uid.startsWith('guest-') ||
    uid === 'anonymous'
  );
}

/**
 * Recursively sanitizes objects for Firestore storage:
 * - Converts undefined to null
 * - Strips empty keys or keys starting with $ or __
 * - Preserves Firestore FieldValue / serverTimestamp sentinel objects
 */
export function cleanForFirestore<T>(input: T): T {
  if (input === undefined) {
    return null as unknown as T;
  }
  if (input === null || typeof input !== 'object') {
    return input;
  }
  if (input instanceof Date) {
    return input;
  }
  // Preserve Firestore FieldValue sentinels (which have _methodName)
  if ('_methodName' in (input as Record<string, unknown>)) {
    return input;
  }
  if (Array.isArray(input)) {
    return input.map((item) => cleanForFirestore(item)) as unknown as T;
  }
  const output: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
    if (!key || key.startsWith('__') || key.startsWith('$')) continue;
    output[key] = val === undefined ? null : cleanForFirestore(val);
  }
  return output as T;
}

/**
 * Strict filter purging simulated placeholder names (Sarah, Karim, Nour, etc.)
 */
export function isTestSubject(nameOrUsername: string | null | undefined): boolean {
  if (!nameOrUsername) return true;
  const normalized = nameOrUsername.trim().toLowerCase().replace(/^@/, '');
  if (!normalized) return true;
  if (BANNED_TEST_NAMES.has(normalized)) return true;
  for (const banned of BANNED_TEST_NAMES) {
    if (normalized === banned || normalized.startsWith(`${banned} `)) {
      return true;
    }
  }
  return false;
}

/**
 * Purges test subject habits
 */
export function isTestSubjectHabit(habitName: string | null | undefined): boolean {
  if (!habitName) return true;
  const normalized = habitName.trim().toLowerCase();
  return BANNED_TEST_HABITS.has(normalized);
}

/**
 * Computes the ISO-8601 week identifier (e.g. "2026-W43") so habit matrices never reset prematurely.
 */
export function getIsoWeekIdentifier(dateInput: Date = new Date()): string {
  const date = new Date(Date.UTC(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Evaluates official 2026 grade boundaries and returns provisional grade + scale
 */
export function calculateProvisionalGrade(
  board: ExamBoard,
  qualification: QualificationLevel,
  percentage: number
): { grade: string; scale: '9-1' | 'A*-G' | 'A*-E'; basis: string } {
  const pct = Math.max(0, Math.min(100, Math.round(percentage)));

  if (qualification === 'AS-Level' || qualification === 'A-Level') {
    const scale = 'A*-E';
    let grade = 'U';
    if (qualification === 'A-Level' && pct >= 86) grade = 'A* (Provisional)';
    else if (pct >= 76) grade = 'A (Provisional)';
    else if (pct >= 66) grade = 'B (Provisional)';
    else if (pct >= 56) grade = 'C (Provisional)';
    else if (pct >= 46) grade = 'D (Provisional)';
    else if (pct >= 38) grade = 'E (Provisional)';
    return {
      grade,
      scale,
      basis: `${board} ${qualification} typical component raw-mark threshold calibration (${pct}%). Labelled provisional pending official component weighting.`,
    };
  }

  if (board === 'Pearson Edexcel' || board === 'Oxford AQA' || qualification === 'GCSE') {
    const scale = '9-1';
    let grade = 'U';
    if (pct >= 85) grade = '9 (Provisional)';
    else if (pct >= 76) grade = '8 (Provisional)';
    else if (pct >= 67) grade = '7 (Provisional)';
    else if (pct >= 57) grade = '6 (Provisional)';
    else if (pct >= 47) grade = '5 (Provisional)';
    else if (pct >= 38) grade = '4 (Provisional)';
    else if (pct >= 28) grade = '3 (Provisional)';
    else if (pct >= 19) grade = '2 (Provisional)';
    else if (pct >= 10) grade = '1 (Provisional)';
    return {
      grade,
      scale,
      basis: `${board} ${qualification} 9–1 qualification threshold calibration (${pct}%). Component score treated as provisional indicator.`,
    };
  }

  // Cambridge CAIE IGCSE / O-Level default A*-G
  const scale = 'A*-G';
  let grade = 'U';
  if (pct >= 84) grade = 'A* (Provisional)';
  else if (pct >= 73) grade = 'A (Provisional)';
  else if (pct >= 62) grade = 'B (Provisional)';
  else if (pct >= 50) grade = 'C (Provisional)';
  else if (pct >= 40) grade = 'D (Provisional)';
  else if (pct >= 32) grade = 'E (Provisional)';
  else if (pct >= 24) grade = 'F (Provisional)';
  else if (pct >= 16) grade = 'G (Provisional)';

  return {
    grade,
    scale,
    basis: `Cambridge International ${qualification} A*–G raw component threshold calibration (${pct}%). Provisional component-level estimate.`,
  };
}

/**
 * Formats Output D — WhatsApp summary strictly following the specification
 */
export function formatWhatsAppSummary(params: {
  subject: string;
  board: string;
  paperComponent: string;
  awarded: number;
  available: number;
  percentage: number;
  estimatedGrade: string;
  lostMarks: QuestionMarkLedgerItem[];
  priorityTopics: string[];
}): string {
  const lostLines =
    params.lostMarks.length > 0
      ? params.lostMarks
          .map(
            (q) =>
              `Q${q.questionNumber}${q.subQuestion ? `(${q.subQuestion})` : ''}: ${
                q.reasonForLostMarks || 'Missing mark scheme point'
              } — Fix: ${q.examinerWording || q.markSchemeRequirement}`
          )
          .join('\n\n')
      : 'None — Full marks awarded across all evaluated questions.';

  const topicLines =
    params.priorityTopics.length > 0
      ? params.priorityTopics.map((t) => `${t}`).join('\n\n')
      : 'Maintain current syllabus consolidation';

  return `EXAM REPORT — ${params.subject.toUpperCase()}
Board: ${params.board}
Paper: ${params.paperComponent}
Score: ${params.awarded} / ${params.available} (${params.percentage}%)
Estimated grade: ${params.estimatedGrade}
Marks lost:

${lostLines}
Priority revision topics:

${topicLines}
Annotated PDF: Attached & ready for download in Explic Examiner`;
}

/**
 * Infers an academic subject label from a task description.
 */
export function inferSubjectFromTaskTitle(title: string): string {
  const lower = (title || '').toLowerCase();
  if (lower.includes('physic') || lower.includes('mechanics') || lower.includes('electricity') || lower.includes('kinematics')) return 'Physics';
  if (lower.includes('chem') || lower.includes('organic') || lower.includes('stoichiom') || lower.includes('titration')) return 'Chemistry';
  if (lower.includes('bio') || lower.includes('cell') || lower.includes('genetics') || lower.includes('enz')) return 'Biology';
  if (lower.includes('math') || lower.includes('calc') || lower.includes('algebra') || lower.includes('trig') || lower.includes('geometry')) return 'Mathematics';
  if (lower.includes('english') || lower.includes('essay') || lower.includes('literature')) return 'English';
  if (lower.includes('computer') || lower.includes('coding') || lower.includes('algorithm') || lower.includes('cs')) return 'Computer Science';
  if (lower.includes('econ') || lower.includes('business')) return 'Economics';
  return 'General Study';
}

/**
 * Parses spoken task transcript (and/or existing planner tasks) into structured tasks,
 * conversational AI coaching reply, workload analysis, and a reliable time-blocked daily schedule.
 */
export function buildVoiceDailyPlanFromText(
  spokenText: string,
  defaultDate = '2026-10-26',
  existingTasks: Array<{
    title: string;
    subject?: string;
    dueDate?: string;
    estimatedMinutes?: number;
    priority?: 'Urgent' | 'High' | 'Medium' | 'Low';
    completed?: boolean;
  }> = []
): VoiceDailyPlanResult {
  const cleaned = (spokenText || '').trim();

  // Check if user is asking to plan existing tasks without dictating new ones
  const isPlanExistingOnly =
    !cleaned ||
    /^(?:plan my (?:existing |current )?tasks|go through my tasks|schedule my tasks|build (?:a )?(?:daily )?plan(?: from my tasks)?|organize my day)$/i.test(
      cleaned
    );

  const rawSegments = isPlanExistingOnly
    ? []
    : cleaned
        .split(
          /(?:,|\band then\b|\bafter that\b|\bfollowed by\b|\bas well as\b|\band also\b|\band\b|\bthen\b|\balso\b|\bplus\b|\bnext\b|;|\n|\.)+/i
        )
        .map((s) =>
          s
            .replace(
              /^(?:hey(?:\s+ai)?|hi(?:\s+there)?|hello|um+|uh+|so|well|okay|ok|basically|today|right now|first of all|firstly|secondly|lastly|finally|i really need to|i need to|i have to|i've got to|i got to|i want to|i would like to|i should|can you help me|please|let's|first|second|next|add|make sure i|don't forget to|remember to|going to|gonna)\s+/gi,
              ''
            )
            .replace(
              /^(?:i really need to|i need to|i have to|i want to|i should|to)\s+/gi,
              ''
            )
            .trim()
        )
        .filter(
          (s) =>
            s.length >= 3 &&
            !/^(?:my main tasks|my tasks|plan my day|help me plan|that's all|thank you|thanks)$/i.test(
              s
            )
        );

  const extractedTasks = rawSegments.map((seg, idx) => {
    const lower = seg.toLowerCase();

    // Parse explicit duration if mentioned (e.g. "for 60 minutes", "for an hour", "takes 2 hours", "half an hour")
    let estimatedMinutes = 45;
    const hrMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:hour|hr|hrs|hours)/);
    const minMatch = lower.match(/(\d+)\s*(?:minute|min|mins|minutes)/);
    if (hrMatch) {
      estimatedMinutes = Math.min(
        180,
        Math.max(15, Math.round(parseFloat(hrMatch[1]) * 60))
      );
    } else if (minMatch) {
      estimatedMinutes = Math.min(180, Math.max(15, parseInt(minMatch[1], 10)));
    } else if (lower.includes('an hour') || lower.includes('one hour')) {
      estimatedMinutes = 60;
    } else if (lower.includes('half an hour') || lower.includes('half hour')) {
      estimatedMinutes = 30;
    } else if (
      lower.includes('past paper') ||
      lower.includes('mock') ||
      lower.includes('full paper')
    ) {
      estimatedMinutes = 60;
    } else if (
      lower.includes('review') ||
      lower.includes('flashcard') ||
      lower.includes('summary') ||
      lower.includes('notes')
    ) {
      estimatedMinutes = 30;
    }

    // Strip trailing duration phrases from the clean task title so the title looks like a real task
    const cleanTitleRaw = seg
      .replace(
        /\s*(?:for|which takes|taking|about|around)\s+(?:\d+(?:\.\d+)?\s*(?:hour|hr|hrs|hours|minute|min|mins|minutes)|an hour|one hour|half an hour|half hour).*$/i,
        ''
      )
      .replace(/\s*\(\d+\s*(?:mins?|minutes?|hrs?|hours?)\)\s*$/i, '')
      .trim();

    const finalTitle =
      (cleanTitleRaw || seg).charAt(0).toUpperCase() +
      (cleanTitleRaw || seg).slice(1);

    const priority: 'Urgent' | 'High' | 'Medium' | 'Low' =
      lower.includes('urgent') ||
      lower.includes('exam') ||
      lower.includes('past paper') ||
      lower.includes('tomorrow') ||
      lower.includes('important')
        ? 'Urgent'
        : idx === 0
        ? 'High'
        : 'Medium';

    return {
      title: finalTitle,
      subject: inferSubjectFromTaskTitle(finalTitle),
      dueDate: defaultDate,
      estimatedMinutes,
      priority,
    };
  });

  // Combine newly extracted tasks with active existing tasks (avoiding exact title duplicates)
  const pendingExisting = (existingTasks || [])
    .filter((t) => !t.completed && t.title && t.title.trim())
    .map((t) => ({
      title: t.title.trim(),
      subject: t.subject || inferSubjectFromTaskTitle(t.title),
      dueDate: t.dueDate || defaultDate,
      estimatedMinutes: Math.max(15, Number(t.estimatedMinutes) || 45),
      priority: (t.priority || 'High') as 'Urgent' | 'High' | 'Medium' | 'Low',
    }));

  const seenTitles = new Set(
    extractedTasks.map((t) => t.title.toLowerCase())
  );
  const combinedTasksForPlan = [
    ...extractedTasks,
    ...pendingExisting.filter((t) => !seenTitles.has(t.title.toLowerCase())),
  ];

  const tasksToSchedule =
    combinedTasksForPlan.length > 0
      ? combinedTasksForPlan
      : [
          {
            title: 'Core Concept Active Recall & Past Paper Practice',
            subject: 'General Study',
            dueDate: defaultDate,
            estimatedMinutes: 45,
            priority: 'High' as const,
          },
        ];

  // Sort tasks for the schedule by priority weight (Urgent -> High -> Medium -> Low)
  const priorityRank: Record<string, number> = {
    Urgent: 0,
    High: 1,
    Medium: 2,
    Low: 3,
  };
  const prioritizedTasks = [...tasksToSchedule].sort(
    (a, b) => (priorityRank[a.priority] ?? 2) - (priorityRank[b.priority] ?? 2)
  );

  const totalEstimatedMinutes = prioritizedTasks.reduce(
    (sum, t) => sum + t.estimatedMinutes,
    0
  );

  const dailyPlan: DailyPlanTimeBlock[] = [];
  let cursorMinutes = 9 * 60; // Start daily plan at 09:00

  const formatTime = (minsFromMidnight: number) => {
    const h = Math.floor(minsFromMidnight / 60) % 24;
    const m = minsFromMidnight % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  prioritizedTasks.forEach((task, index) => {
    const startStr = formatTime(cursorMinutes);
    const endStr = formatTime(cursorMinutes + task.estimatedMinutes);
    const isDeepWork =
      index === 0 ||
      task.priority === 'Urgent' ||
      task.priority === 'High' ||
      task.estimatedMinutes >= 45;

    dailyPlan.push({
      id: `plan-block-${index + 1}`,
      timeSlot: `${startStr} - ${endStr}`,
      title: `${task.title}${task.subject && task.subject !== 'General Study' && !task.title.toLowerCase().includes(task.subject.toLowerCase()) ? ` (${task.subject})` : ''}`,
      durationMinutes: task.estimatedMinutes,
      blockType: isDeepWork ? 'deep_work' : 'review',
      coachingNote: isDeepWork
        ? `Deep Work (${task.priority} Priority): Eliminate distractions, work under timed conditions, and log any mark-scheme gaps.`
        : `Active Consolidation: Test recall without notes and verify weak syllabus concepts.`,
      completed: false,
    });
    cursorMinutes += task.estimatedMinutes;

    // Insert a 15-min recovery break after each study task if there are more tasks
    if (index < prioritizedTasks.length - 1) {
      const bStart = formatTime(cursorMinutes);
      const bEnd = formatTime(cursorMinutes + 15);
      dailyPlan.push({
        id: `plan-break-${index + 1}`,
        timeSlot: `${bStart} - ${bEnd}`,
        title: 'Cognitive Reset & Hydration Break',
        durationMinutes: 15,
        blockType: 'break',
        coachingNote:
          'Step away from screens for 15 minutes to consolidate working memory before the next subject.',
        completed: false,
      });
      cursorMinutes += 15;
    }
  });

  const assistantReply =
    extractedTasks.length > 0
      ? `I listened to your update, extracted ${extractedTasks.length} actionable ${
          extractedTasks.length === 1 ? 'task' : 'tasks'
        } (${extractedTasks
          .map((t) => `"${t.title}" — ${t.estimatedMinutes}m`)
          .join(', ')}), added ${
          extractedTasks.length === 1 ? 'it' : 'them'
        } to your planner, and built a prioritized ${totalEstimatedMinutes}-minute daily schedule starting with "${
          prioritizedTasks[0]?.title
        }".`
      : `I analyzed your ${prioritizedTasks.length} existing planner ${
          prioritizedTasks.length === 1 ? 'task' : 'tasks'
        } (${totalEstimatedMinutes} minutes total) and organized a structured deep-work schedule starting with "${
          prioritizedTasks[0]?.title
        }".`;

  return {
    transcript: cleaned || 'Analyzed existing tasks in your Daily Planner',
    assistantReply,
    extractedTasks,
    analysis: {
      workloadSummary: `Scheduled ${prioritizedTasks.length} study ${
        prioritizedTasks.length === 1 ? 'task' : 'tasks'
      } (${extractedTasks.length} newly extracted${
        pendingExisting.length > 0
          ? `, ${pendingExisting.length} from your existing list`
          : ''
      }) requiring ${totalEstimatedMinutes} minutes of focused work.`,
      totalEstimatedMinutes,
      priorityRationale: `Front-loaded "${prioritizedTasks[0]?.title}" (${prioritizedTasks[0]?.priority} priority) at the start of the schedule for peak cognitive focus, alternating demanding problem sets with 15-minute recovery intervals.`,
      focusStrategy:
        'Complete high-cognitive problem solving in the morning blocks, then use active recall and mark-scheme verification in later blocks.',
    },
    dailyPlan,
    modelUsed: 'Explic Smart Planner Engine',
  };
}


