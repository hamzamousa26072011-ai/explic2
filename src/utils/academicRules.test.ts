import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateDeterministicFriendCode,
  isGuestUid,
  cleanForFirestore,
  isTestSubject,
  isTestSubjectHabit,
  getIsoWeekIdentifier,
  calculateProvisionalGrade,
  formatWhatsAppSummary,
  buildVoiceDailyPlanFromText,
} from './academicRules';
import { inspectPayloadForThreats } from './securityShield';
import { evaluateCasioExpression } from './casioCalculator';
import { INITIAL_EXAMS, INITIAL_STUDY_TOOLS } from './initialData';

test('buildVoiceDailyPlanFromText extracts spoken tasks, analyzes workload, and builds time-blocked daily schedule', () => {
  const result = buildVoiceDailyPlanFromText(
    'I need to study Physics kinematics for 60 minutes, then solve Calculus past paper and review Chemistry flashcards for 30 minutes',
    '2026-10-26'
  );
  assert.equal(result.extractedTasks.length, 3);
  assert.equal(result.extractedTasks[0].title, 'Study Physics kinematics');
  assert.equal(result.extractedTasks[0].subject, 'Physics');
  assert.equal(result.extractedTasks[0].estimatedMinutes, 60);
  assert.equal(result.extractedTasks[2].estimatedMinutes, 30);
  assert.equal(result.analysis.totalEstimatedMinutes, 150);
  assert.ok(result.dailyPlan.length >= 3);
  assert.equal(result.dailyPlan[0].timeSlot, '09:00 - 10:00');
});

test('buildVoiceDailyPlanFromText plans existing tasks when user asks to go through existing tasks', () => {
  const result = buildVoiceDailyPlanFromText(
    'Plan my existing tasks',
    '2026-10-26',
    [
      {
        title: 'Complete Organic Chemistry Worksheet',
        subject: 'Chemistry',
        estimatedMinutes: 45,
        priority: 'High',
      },
      {
        title: 'Solve IGCSE Physics Paper 4',
        subject: 'Physics',
        estimatedMinutes: 60,
        priority: 'Urgent',
      },
    ]
  );
  assert.equal(result.extractedTasks.length, 0);
  assert.equal(result.analysis.totalEstimatedMinutes, 105);
  assert.ok(result.dailyPlan[0].title.includes('Solve IGCSE Physics Paper 4'));
  assert.ok(result.assistantReply?.includes('existing planner'));
});


test('INITIAL_STUDY_TOOLS contains only Casio fx-991ES PLUS and INITIAL_EXAMS has zero test subjects', () => {
  assert.equal(INITIAL_STUDY_TOOLS.length, 1);
  assert.equal(INITIAL_STUDY_TOOLS[0].id, 'tool-casio-991es');
  assert.equal(INITIAL_STUDY_TOOLS[0].name, 'Casio fx-991ES PLUS');
  assert.equal(INITIAL_EXAMS.length, 0);
});

test('Casio fx-991ES PLUS engine evaluates trig, exact fractions, roots, and combinatorics accurately', () => {
  const sin30 = evaluateCasioExpression('sin(30)', 'DEG', 0, 0);
  assert.equal(sin30.ok, true);
  if (sin30.ok) {
    assert.equal(sin30.formatted, '0.5');
    assert.equal(sin30.exact, '1/2');
  }

  const comb = evaluateCasioExpression('5C2 + 3²', 'DEG', 0, 0);
  assert.equal(comb.ok, true);
  if (comb.ok) {
    assert.equal(comb.value, 19);
    assert.equal(comb.formatted, '19');
  }

  const surd = evaluateCasioExpression('√(2)', 'DEG', 0, 0);
  assert.equal(surd.ok, true);
  if (surd.ok) {
    assert.equal(surd.exact, '√2');
  }
});

test('generateDeterministicFriendCode returns a deterministic 5-digit numeric code', () => {
  const code1 = generateDeterministicFriendCode('scholar-workspace');
  const code2 = generateDeterministicFriendCode('scholar-workspace');
  assert.equal(code1, code2);
  assert.equal(code1.length, 5);
  assert.match(code1, /^[0-9]{5}$/);
});

test('isGuestUid identifies guest and anonymous IDs accurately', () => {
  assert.equal(isGuestUid('guest-workspace-user'), true);
  assert.equal(isGuestUid('guest-12345'), true);
  assert.equal(isGuestUid(null), true);
  assert.equal(isGuestUid('realFirebaseUid99182'), false);
});

test('cleanForFirestore converts undefined to null and strips invalid keys', () => {
  const dirty = {
    validKey: 'hello',
    missingVal: undefined,
    __protoPollution: 'bad',
    $illegal: 'bad',
    nested: {
      undefProp: undefined,
      count: 42,
    },
  };
  const cleaned = cleanForFirestore(dirty) as Record<string, any>;
  assert.equal(cleaned.validKey, 'hello');
  assert.equal(cleaned.missingVal, null);
  assert.equal('__protoPollution' in cleaned, false);
  assert.equal('$illegal' in cleaned, false);
  assert.equal(cleaned.nested.undefProp, null);
  assert.equal(cleaned.nested.count, 42);
});

test('isTestSubject and isTestSubjectHabit purge simulated placeholders', () => {
  assert.equal(isTestSubject('Sarah'), true);
  assert.equal(isTestSubject('Karim'), true);
  assert.equal(isTestSubject('Nour'), true);
  assert.equal(isTestSubject('Youssef El-Masri'), true);
  assert.equal(isTestSubject('Mariam Al-Qasimi'), true);
  assert.equal(isTestSubject('Test Subject'), true);
  assert.equal(isTestSubject('Scholar #48210'), false);
  assert.equal(isTestSubjectHabit('test habit'), true);
  assert.equal(isTestSubjectHabit('Solve 2 Past Paper Section B Questions'), true);
  assert.equal(isTestSubjectHabit('Morning Mechanics Revision'), false);
});

test('getIsoWeekIdentifier formats YYYY-Www properly', () => {
  const weekId = getIsoWeekIdentifier(new Date('2026-10-25T12:00:00Z'));
  assert.match(weekId, /^2026-W\d{2}$/);
});

test('calculateProvisionalGrade respects board and qualification scales', () => {
  const caie = calculateProvisionalGrade('Cambridge CAIE', 'IGCSE', 88);
  assert.equal(caie.scale, 'A*-G');
  assert.equal(caie.grade, 'A* (Provisional)');

  const edexcel = calculateProvisionalGrade('Pearson Edexcel', 'IGCSE', 88);
  assert.equal(edexcel.scale, '9-1');
  assert.equal(edexcel.grade, '9 (Provisional)');

  const alevel = calculateProvisionalGrade('Cambridge CAIE', 'A-Level', 78);
  assert.equal(alevel.scale, 'A*-E');
  assert.equal(alevel.grade, 'A (Provisional)');
});

test('formatWhatsAppSummary outputs required Output D structure', () => {
  const text = formatWhatsAppSummary({
    subject: 'Physics',
    board: 'Cambridge CAIE',
    paperComponent: 'Paper 4 Extended Theory',
    awarded: 42,
    available: 50,
    percentage: 84,
    estimatedGrade: 'A* (Provisional)',
    lostMarks: [
      {
        questionNumber: '3',
        subQuestion: 'b',
        maxMarks: 3,
        awardedMarks: 2,
        markingPointRationale: 'M1 A1 awarded, B1 lost for missing unit',
        studentEvidence: 'P = F / A = 240 / 0.12 = 2000',
        reasonForLostMarks: 'Omitted SI unit Pa or N/m²',
        markSchemeRequirement: '2000 Pa',
        examinerWording: 'State final pressure as 2000 Pa (or N/m²).',
        confidence: 'High',
        status: 'partial',
        highlightColor: '#FFD580',
        yAnchorRatio: 0.4,
        pageNumber: 1,
        pass1Awarded: 2,
        pass2Awarded: 2,
        pass3Locked: 2,
      },
    ],
    priorityTopics: ['Thermal Physics & Pressure Units', 'Momentum Vector Conservation'],
  });
  assert.ok(text.includes('EXAM REPORT — PHYSICS'));
  assert.ok(text.includes('Score: 42 / 50 (84%)'));
  assert.ok(text.includes('Q3(b): Omitted SI unit Pa or N/m²'));
});

test('inspectPayloadForThreats detects SQLi, XSS, and Prototype Pollution', () => {
  const xss = inspectPayloadForThreats('<script>alert(1)</script>');
  assert.notEqual(xss, null);
  assert.equal(xss?.vectorType, 'XSS_PAYLOAD');

  const sqli = inspectPayloadForThreats("SELECT * FROM users WHERE '1'='1'");
  assert.notEqual(sqli, null);
  assert.equal(sqli?.vectorType, 'SQL_INJECTION');

  const proto = inspectPayloadForThreats('{"__proto__": {"admin": true}}');
  assert.notEqual(proto, null);
  assert.equal(proto?.vectorType, 'PROTOTYPE_POLLUTION');

  const safe = inspectPayloadForThreats('Calculate the derivative of 3x^2 + 5x - 2');
  assert.equal(safe, null);
});
