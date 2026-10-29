import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCollisionFreeAnnotationPlan,
  generateAnnotatedExaminerPdfBytes,
} from './examinerPdfAnnotator';
import { ExaminerEvaluationResult, QuestionMarkLedgerItem } from '../types';

const SAMPLE_LEDGER: QuestionMarkLedgerItem[] = [
  {
    questionNumber: '1',
    subQuestion: 'a',
    maxMarks: 3,
    awardedMarks: 3,
    markingPointRationale: 'Full credit for acceleration formula and substitution.',
    studentEvidence: 'a = (v - u) / t = (24 - 0) / 6 = 4.0 m/s^2',
    markSchemeRequirement: '4.0 m/s^2 with correct working',
    confidence: 'High',
    status: 'correct',
    highlightColor: '#70E0A0',
    yAnchorRatio: 0.22,
    pageNumber: 1,
    pass1Awarded: 3,
    pass2Awarded: 3,
    pass3Locked: 3,
  },
  {
    questionNumber: '2',
    subQuestion: 'b',
    maxMarks: 4,
    awardedMarks: 2,
    markingPointRationale: 'Method mark earned; accuracy and unit marks forfeited.',
    studentEvidence: 'F = m * a = 1200 * 4 = 4800',
    reasonForLostMarks: 'Missing SI unit (N) and omitted resultant resistive force subtraction.',
    markSchemeRequirement: 'Resultant F = 4800 - 600 = 4200 N',
    examinerWording: 'Subtract resistive force of 600 N to obtain 4200 N.',
    confidence: 'High',
    status: 'partial',
    highlightColor: '#FFD580',
    yAnchorRatio: 0.45,
    pageNumber: 1,
    pass1Awarded: 2,
    pass2Awarded: 2,
    pass3Locked: 2,
  },
];

test('buildCollisionFreeAnnotationPlan separates left subtotals, center highlights, right ticks/crosses, and feedback boxes without overlap', () => {
  const plan = buildCollisionFreeAnnotationPlan(SAMPLE_LEDGER);
  assert.equal(plan.plannedItems.length, 2);

  const first = plan.plannedItems[0];
  const second = plan.plannedItems[1];

  // Check horizontal lane isolation
  assert.ok(first.subtotalBox.x + first.subtotalBox.width < first.highlightBox.x);
  assert.ok(first.highlightBox.x + first.highlightBox.width < first.circleMaxBox.x);
  assert.ok(first.symbolBoxes.every((s) => s.x >= 516));

  // Check vertical separation between Q1 and Q2
  assert.ok(first.yTop > second.yTop + 40);

  // Check Q1 has 3 ticks and no feedback box
  assert.equal(first.symbolBoxes.filter((s) => s.isTick).length, 3);
  assert.equal(first.feedbackBox, undefined);

  // Check Q2 has 2 ticks, 2 crosses, and a feedback box
  assert.equal(second.symbolBoxes.filter((s) => s.isTick).length, 2);
  assert.equal(second.symbolBoxes.filter((s) => !s.isTick).length, 2);
  assert.notEqual(second.feedbackBox, undefined);
});

test('generateAnnotatedExaminerPdfBytes creates valid PDF bytes with header %PDF-', async () => {
  const evalResult: ExaminerEvaluationResult = {
    evaluationId: 'EVAL-TEST-01',
    timestamp: new Date().toISOString(),
    board: 'Cambridge CAIE',
    qualification: 'IGCSE',
    subject: 'Physics',
    syllabusCode: '',
    paperComponent: 'Paper 4 Extended',
    variant: '2',
    session: 'May/June 2026',
    totalAwarded: 5,
    totalAvailable: 7,
    percentage: 71,
    provisionalGrade: 'B (Provisional)',
    gradeScaleUsed: 'A*-G',
    gradeThresholdBasis: 'Cambridge IGCSE threshold calibration',
    sourceVerificationNotes: ['Verified page geometry 595x842pt'],
    aoBreakdown: {
      ao1: { awarded: 3, max: 4, label: 'AO1 Knowledge with Understanding' },
      ao2: { awarded: 2, max: 3, label: 'AO2 Handling Information & Problem Solving' },
      ao3: { awarded: 0, max: 0, label: 'AO3 Experimental Skills' },
    },
    passSummary: {
      pass1Summary: 'Pass 1 completed: 5/7 marks.',
      pass2Verification: 'Pass 2 ECF check verified.',
      pass3Moderation: 'Pass 3 Cambridge unit convention applied.',
      consensusNotes: 'Locked at 5/7.',
    },
    ledger: SAMPLE_LEDGER,
    lostMarksBreakdown: [SAMPLE_LEDGER[1]],
    priorityRevisionTopics: ['Resultant Forces & Newtons Second Law'],
    whatsappSummary: 'EXAM REPORT — PHYSICS',
  };

  const pdfBytes = await generateAnnotatedExaminerPdfBytes(evalResult);
  assert.ok(pdfBytes.byteLength > 500);
  const header = Buffer.from(pdfBytes.slice(0, 5)).toString('utf8');
  assert.equal(header, '%PDF-');
});
