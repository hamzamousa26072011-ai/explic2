import { PDFDocument, type PDFPage, type PDFFont, rgb, StandardFonts } from 'pdf-lib';
import type {
  ExaminerAnnotatedLine,
  ExaminerEvaluationResult,
  QuestionMarkLedgerItem,
  RedCrossCorrectionItem,
} from '../types.ts';

export interface PlannedAnnotationBox {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  type:
    | 'badge'
    | 'subtotal'
    | 'highlight'
    | 'symbol'
    | 'circle-max'
    | 'feedback';
}

/**
 * Deterministic collision-free layout planner for PDF annotations.
 */
export function buildCollisionFreeAnnotationPlan(
  ledger: QuestionMarkLedgerItem[],
  pageWidth = 595.28,
  pageHeight = 841.89
): {
  plannedItems: Array<{
    item: QuestionMarkLedgerItem;
    pageIndex: number;
    yTop: number;
    subtotalBox: PlannedAnnotationBox;
    highlightBox: PlannedAnnotationBox;
    symbolBoxes: Array<{
      symbol: '✓' | '✗';
      x: number;
      y: number;
      isTick: boolean;
    }>;
    circleMaxBox: PlannedAnnotationBox;
    feedbackBox?: PlannedAnnotationBox;
  }>;
  scoreBadgeBox: PlannedAnnotationBox;
} {
  const scoreBadgeBox: PlannedAnnotationBox = {
    id: 'page-one-score-badge',
    pageIndex: 0,
    x: pageWidth - 235,
    y: pageHeight - 68,
    width: 205,
    height: 46,
    type: 'badge',
  };

  const pageYCursor: Record<number, number> = { 0: pageHeight - 135 };
  const MIN_VERTICAL_GAP = 18;

  const plannedItems: Array<{
    item: QuestionMarkLedgerItem;
    pageIndex: number;
    yTop: number;
    subtotalBox: PlannedAnnotationBox;
    highlightBox: PlannedAnnotationBox;
    symbolBoxes: Array<{
      symbol: '✓' | '✗';
      x: number;
      y: number;
      isTick: boolean;
    }>;
    circleMaxBox: PlannedAnnotationBox;
    feedbackBox?: PlannedAnnotationBox;
  }> = [];

  for (let idx = 0; idx < ledger.length; idx++) {
    const q = ledger[idx];
    let pIdx = Math.max(0, (q.pageNumber || 1) - 1);
    if (pageYCursor[pIdx] === undefined) {
      pageYCursor[pIdx] = pageHeight - 100;
    }

    const hasLostMarks = q.awardedMarks < q.maxMarks;
    const blockRequiredHeight = hasLostMarks ? 118 : 56;

    if (pageYCursor[pIdx] - blockRequiredHeight < 65) {
      pIdx += 1;
      if (pageYCursor[pIdx] === undefined) {
        pageYCursor[pIdx] = pageHeight - 95;
      }
    }

    const yTop = pageYCursor[pIdx];

    const subtotalBox: PlannedAnnotationBox = {
      id: `subtotal-${idx}`,
      pageIndex: pIdx,
      x: 24,
      y: yTop - 22,
      width: 44,
      height: 22,
      type: 'subtotal',
    };

    const highlightBox: PlannedAnnotationBox = {
      id: `highlight-${idx}`,
      pageIndex: pIdx,
      x: 78,
      y: yTop - 36,
      width: 382,
      height: 36,
      type: 'highlight',
    };

    const circleMaxBox: PlannedAnnotationBox = {
      id: `circle-max-${idx}`,
      pageIndex: pIdx,
      x: 468,
      y: yTop - 24,
      width: 28,
      height: 20,
      type: 'circle-max',
    };

    const symbolBoxes: Array<{
      symbol: '✓' | '✗';
      x: number;
      y: number;
      isTick: boolean;
    }> = [];
    const totalPoints = Math.min(6, Math.max(1, q.maxMarks));
    const earnedPoints = Math.min(totalPoints, Math.max(0, q.awardedMarks));

    for (let s = 0; s < totalPoints; s++) {
      const isTick = s < earnedPoints;
      const colOffset = s >= 3 ? 22 : 0;
      const rowOffset = (s % 3) * 12;
      symbolBoxes.push({
        symbol: isTick ? '✓' : '✗',
        x: 520 + colOffset,
        y: yTop - 12 - rowOffset,
        isTick,
      });
    }

    let feedbackBox: PlannedAnnotationBox | undefined;
    if (hasLostMarks) {
      feedbackBox = {
        id: `feedback-${idx}`,
        pageIndex: pIdx,
        x: 78,
        y: yTop - 98,
        width: 418,
        height: 56,
        type: 'feedback',
      };
    }

    plannedItems.push({
      item: q,
      pageIndex: pIdx,
      yTop,
      subtotalBox,
      highlightBox,
      symbolBoxes,
      circleMaxBox,
      feedbackBox,
    });

    pageYCursor[pIdx] = yTop - blockRequiredHeight - MIN_VERTICAL_GAP;
  }

  return { plannedItems, scoreBadgeBox };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
  };
}

function sanitizePdfAscii(text: string): string {
  return String(text || '')
    .replace(/✓/g, '/')
    .replace(/✗/g, 'X')
    .replace(/»/g, '>>')
    .replace(/·/g, '|')
    .replace(/×/g, 'x')
    .replace(/[—–]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, '...')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/[^\x20-\x7E]/g, '');
}

function wrapTextToLines(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): string[] {
  const clean = sanitizePdfAscii(text).trim();
  if (!clean) return [];
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(candidate, fontSize);
    if (width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawVectorTick(page: PDFPage, x: number, y: number, scale = 1) {
  const green = hexToRgb('#15803D');
  page.drawLine({
    start: { x, y: y + 3.2 * scale },
    end: { x: x + 3.2 * scale, y },
    thickness: 1.7 * scale,
    color: rgb(green.r, green.g, green.b),
  });
  page.drawLine({
    start: { x: x + 3.2 * scale, y },
    end: { x: x + 9.5 * scale, y: y + 7.8 * scale },
    thickness: 1.7 * scale,
    color: rgb(green.r, green.g, green.b),
  });
}

function drawVectorCross(page: PDFPage, x: number, y: number, scale = 1) {
  const red = hexToRgb('#B91C1C');
  page.drawLine({
    start: { x, y },
    end: { x: x + 7.5 * scale, y: y + 7.5 * scale },
    thickness: 1.6 * scale,
    color: rgb(red.r, red.g, red.b),
  });
  page.drawLine({
    start: { x, y: y + 7.5 * scale },
    end: { x: x + 7.5 * scale, y },
    thickness: 1.6 * scale,
    color: rgb(red.r, red.g, red.b),
  });
}

export function deriveQuestionAnnotatedLines(
  q: QuestionMarkLedgerItem
): ExaminerAnnotatedLine[] {
  if (Array.isArray(q.annotatedLines) && q.annotatedLines.length > 0) {
    return q.annotatedLines;
  }
  const rawSentences = (q.studentEvidence || '')
    .split(/(?<=[.?!;])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (rawSentences.length === 0) {
    return [
      {
        text: q.studentEvidence || 'Student response inspected.',
        isCorrect: q.awardedMarks >= q.maxMarks,
      },
    ];
  }

  const lostCount = Math.max(0, q.maxMarks - q.awardedMarks);
  return rawSentences.map((lineText, idx) => {
    const isErrLine =
      lostCount > 0 &&
      idx >= Math.max(0, rawSentences.length - lostCount);
    return {
      text: lineText,
      isCorrect: !isErrLine,
    };
  });
}

export function deriveQuestionRedCrossCorrections(
  q: QuestionMarkLedgerItem
): RedCrossCorrectionItem[] {
  if (
    Array.isArray(q.redCrossCorrections) &&
    q.redCrossCorrections.length > 0
  ) {
    return q.redCrossCorrections;
  }
  if (q.awardedMarks >= q.maxMarks) {
    return [];
  }
  return [
    {
      quotedError:
        q.studentEvidence.slice(0, 95) ||
        `Q${q.questionNumber}${q.subQuestion ? `(${q.subQuestion})` : ''} response`,
      explanation:
        q.reasonForLostMarks ||
        'Incomplete or imprecise expression against the mark scheme descriptor.',
      modelCorrection: q.examinerWording || q.markSchemeRequirement,
      higherRangeAlternative: q.examinerWording
        ? `Full-mark formulation: "${q.examinerWording}"`
        : undefined,
    },
  ];
}

export function deriveQuestionWhatEarnedTicks(
  q: QuestionMarkLedgerItem
): string[] {
  if (Array.isArray(q.whatEarnedTicks) && q.whatEarnedTicks.length > 0) {
    return q.whatEarnedTicks;
  }
  const items: string[] = [];
  if (q.markingPointRationale) {
    items.push(q.markingPointRationale);
  }
  if (q.awardedMarks > 0 && q.studentEvidence) {
    items.push(
      `Relevant evidence credited: "${q.studentEvidence.slice(0, 110)}"`
    );
  }
  if (items.length === 0) {
    items.push('Attempted question structure aligned with the prompt.');
  }
  return items;
}

/**
 * Generates the complete Multi-Page Marked Script + Examiner Report PDF
 * modeled directly on the OxfordAQA / Cambridge / Edexcel Marked Script & Examiner Report format:
 * - Pages 1..N: Annotated Student Script pages with line-by-line soft green (#70E0A0) & soft pink/red (#FF8888) highlights,
 *   right-margin green ticks (✓) and red crosses (✗) per line, and bottom-of-question green-bordered score summary pill.
 * - Page N+1: MARKED SCRIPT · EXAMINER REPORT Executive Summary Page (Total Score box, Question breakdown table,
 *   | Examiner's overview, and | Word-limit / precision discipline table).
 * - Pages N+2..M: Per-Question Deep-Dive Pages (| Question N, You wrote quote block, | What earned you ticks,
 *   | Corrections marked with a red cross in pale pink #FFF0F3 cards with >> model corrections & Higher-range alternatives).
 * - Final Page: | Overall feedback · whole script (Strengths to protect, Where the marks went, Your next four targets,
 *   and What the same script would score with those four fixes).
 */
export async function generateAnnotatedExaminerPdfBytes(
  evaluation: ExaminerEvaluationResult,
  existingPdfBytes?: Uint8Array | null
): Promise<Uint8Array> {
  let pdfDoc: PDFDocument;
  let hasOriginalScriptPages = false;

  if (existingPdfBytes && existingPdfBytes.byteLength > 100) {
    try {
      pdfDoc = await PDFDocument.load(existingPdfBytes);
      hasOriginalScriptPages = pdfDoc.getPageCount() > 0;
    } catch {
      pdfDoc = await PDFDocument.create();
    }
  } else {
    pdfDoc = await PDFDocument.create();
  }

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const fontBoldItalic = await pdfDoc.embedFont(
    StandardFonts.HelveticaBoldOblique
  );

  const PAGE_W = 595.28;
  const PAGE_H = 841.89;

  const darkGreen = hexToRgb('#1E6B52');
  const darkRed = hexToRgb('#991B1B');
  const darkCharcoal = hexToRgb('#1E293B');
  const tableHeaderBg = hexToRgb('#262626');
  const mutedGray = hexToRgb('#475569');
  const greenHighlight = hexToRgb('#70E0A0');
  const redHighlight = hexToRgb('#FF8888');
  const pinkCardBg = hexToRgb('#FFF0F3');
  const pinkCardBorder = hexToRgb('#D97788');
  const ruleGray = hexToRgb('#CBD5E1');

  // ============================================================================
  // PART 1: ANNOTATED STUDENT SCRIPT PAGES (Line-by-line highlights + right-margin ✓/✗ + green-bordered Q summary pill)
  // ============================================================================
  if (hasOriginalScriptPages) {
    const existingCount = pdfDoc.getPageCount();
    for (let idx = 0; idx < evaluation.ledger.length; idx++) {
      const q = evaluation.ledger[idx];
      const targetPageIndex = Math.min(
        existingCount - 1,
        Math.max(0, (q.pageNumber || idx + 1) - 1)
      );
      const page = pdfDoc.getPage(targetPageIndex);
      const { width: pW, height: pH } = page.getSize();

      const lines = deriveQuestionAnnotatedLines(q);
      // Position lines across the writing region of the page
      const questionsOnThisPage = evaluation.ledger.filter(
        (item, i) =>
          Math.min(
            existingCount - 1,
            Math.max(0, (item.pageNumber || i + 1) - 1)
          ) === targetPageIndex
      );
      const indexOnPage = Math.max(0, questionsOnThisPage.indexOf(q));
      const regionTop =
        questionsOnThisPage.length > 1
          ? pH * (0.76 - indexOnPage * 0.42)
          : pH * 0.62;
      const lineSpacing = Math.min(
        22,
        Math.max(15, (pH * 0.36) / Math.max(1, lines.length))
      );

      lines.slice(0, 14).forEach((line, lIdx) => {
        const yBar = regionTop - lIdx * lineSpacing;
        if (yBar < 95) return;
        const hlColor = line.isCorrect ? greenHighlight : redHighlight;

        // Horizontal highlight band across the handwritten line
        page.drawRectangle({
          x: pW * 0.13,
          y: yBar - 4,
          width: pW * 0.68,
          height: 13.5,
          color: rgb(hlColor.r, hlColor.g, hlColor.b),
          opacity: line.isCorrect ? 0.34 : 0.38,
        });

        // Right-margin tick (✓) or cross (✗) aligned with the line
        const symX = pW * 0.855;
        if (line.isCorrect) {
          drawVectorTick(page, symX, yBar - 1, 0.95);
        } else {
          drawVectorCross(page, symX, yBar - 1, 0.95);
        }
      });

      // Bottom-of-Question Rounded Green-Bordered Summary Box (e.g., Q1 Content & Communication 5/6 · Language 2/3 / Q1 TOTAL 7 / 9)
      const summaryBoxY = Math.max(
        52,
        regionTop - Math.min(14, lines.length) * lineSpacing - 44
      );
      page.drawRectangle({
        x: pW * 0.14,
        y: summaryBoxY,
        width: 245,
        height: 34,
        color: rgb(1, 1, 1),
        borderColor: rgb(darkGreen.r, darkGreen.g, darkGreen.b),
        borderWidth: 1.2,
      });

      const qTag = `Q${q.questionNumber}${q.subQuestion ? `(${q.subQuestion})` : ''}`;
      const subScoreLine =
        q.contentMax && q.languageMax
          ? `${qTag} Content & Communication ${q.contentAwarded ?? q.awardedMarks}/${q.contentMax} | Language ${q.languageAwarded ?? 0}/${q.languageMax}`
          : `${qTag} Marked against ${evaluation.board} Rubric | Pass-Locked`;

      page.drawText(sanitizePdfAscii(subScoreLine), {
        x: pW * 0.14 + 9,
        y: summaryBoxY + 20,
        size: 8,
        font: fontBoldItalic,
        color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
      });
      page.drawText(
        sanitizePdfAscii(`${qTag} TOTAL ${q.awardedMarks} / ${q.maxMarks}`),
        {
          x: pW * 0.14 + 9,
          y: summaryBoxY + 7,
          size: 8.5,
          font: fontBoldItalic,
          color: rgb(darkGreen.r, darkGreen.g, darkGreen.b),
        }
      );

      // Right-margin official mark box [awarded / max]
      page.drawRectangle({
        x: pW * 0.845,
        y: summaryBoxY,
        width: 32,
        height: 34,
        color: rgb(1, 1, 1),
        borderColor: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
        borderWidth: 1,
      });
      page.drawLine({
        start: { x: pW * 0.845 + 5, y: summaryBoxY + 17 },
        end: { x: pW * 0.845 + 27, y: summaryBoxY + 17 },
        thickness: 0.9,
        color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
      });
      page.drawText(sanitizePdfAscii(`${q.awardedMarks}`), {
        x: pW * 0.845 + 10,
        y: summaryBoxY + 21,
        size: 9,
        font: fontBold,
        color: rgb(darkGreen.r, darkGreen.g, darkGreen.b),
      });
      page.drawText(sanitizePdfAscii(`${q.maxMarks}`), {
        x: pW * 0.845 + 10,
        y: summaryBoxY + 5,
        size: 9,
        font: fontBold,
        color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
      });
    }
  } else {
    // No PDF background was uploaded (e.g. image or text submission): render clean lined Annotated Script pages
    let scriptPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
    let yCursor = PAGE_H - 55;

    for (let idx = 0; idx < evaluation.ledger.length; idx++) {
      const q = evaluation.ledger[idx];
      const lines = deriveQuestionAnnotatedLines(q);
      const neededHeight = 75 + lines.length * 20 + 48;

      if (yCursor - neededHeight < 60 && yCursor < PAGE_H - 90) {
        scriptPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
        yCursor = PAGE_H - 55;
      }

      // Question Box Header [0 | 1] + Prompt title + [max marks]
      scriptPage.drawRectangle({
        x: 42,
        y: yCursor - 16,
        width: 28,
        height: 16,
        borderColor: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
        borderWidth: 0.9,
      });
      scriptPage.drawText(
        sanitizePdfAscii(
          `0 ${q.questionNumber}${q.subQuestion ? q.subQuestion : ''}`
        ),
        {
          x: 46,
          y: yCursor - 12,
          size: 8.5,
          font: fontBold,
          color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
        }
      );

      scriptPage.drawText(
        sanitizePdfAscii(
          q.taskTitle ||
            `Question ${q.questionNumber}${q.subQuestion ? `(${q.subQuestion})` : ''} — Student Script Response`
        ),
        {
          x: 78,
          y: yCursor - 12,
          size: 9.5,
          font: fontBold,
          color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
        }
      );

      scriptPage.drawText(sanitizePdfAscii(`[${q.maxMarks} marks]`), {
        x: PAGE_W - 115,
        y: yCursor - 12,
        size: 9,
        font: fontBold,
        color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
      });

      yCursor -= 32;

      // Render each handwritten line with notebook rule, green/pink highlight bar, and right-margin tick/cross
      for (const line of lines) {
        const wrappedSubLines = wrapTextToLines(
          line.text,
          fontItalic,
          10,
          PAGE_W - 155
        );
        for (let wIdx = 0; wIdx < wrappedSubLines.length; wIdx++) {
          if (yCursor < 95) {
            scriptPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
            yCursor = PAGE_H - 55;
          }
          const subLine = wrappedSubLines[wIdx];
          const hlColor = line.isCorrect ? greenHighlight : redHighlight;

          // Ruled writing line
          scriptPage.drawLine({
            start: { x: 48, y: yCursor - 4 },
            end: { x: PAGE_W - 88, y: yCursor - 4 },
            thickness: 0.5,
            color: rgb(ruleGray.r, ruleGray.g, ruleGray.b),
          });

          // Highlight band over line
          scriptPage.drawRectangle({
            x: 50,
            y: yCursor - 3,
            width: PAGE_W - 142,
            height: 14,
            color: rgb(hlColor.r, hlColor.g, hlColor.b),
            opacity: line.isCorrect ? 0.36 : 0.4,
          });

          // Student text on ruled line
          scriptPage.drawText(subLine, {
            x: 54,
            y: yCursor,
            size: 10,
            font: fontItalic,
            color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
          });

          // Right margin tick or cross
          if (wIdx === wrappedSubLines.length - 1) {
            if (line.isCorrect) {
              drawVectorTick(scriptPage, PAGE_W - 72, yCursor, 1);
            } else {
              drawVectorCross(scriptPage, PAGE_W - 72, yCursor, 1);
            }
          }

          yCursor -= 19;
        }
      }

      // Bottom-of-question Green-Bordered Summary Box
      yCursor -= 6;
      scriptPage.drawRectangle({
        x: 54,
        y: yCursor - 30,
        width: 248,
        height: 32,
        color: rgb(1, 1, 1),
        borderColor: rgb(darkGreen.r, darkGreen.g, darkGreen.b),
        borderWidth: 1.2,
      });

      const qTag = `Q${q.questionNumber}${q.subQuestion ? `(${q.subQuestion})` : ''}`;
      const subScoreLine =
        q.contentMax && q.languageMax
          ? `${qTag} Content & Communication ${q.contentAwarded ?? q.awardedMarks}/${q.contentMax} | Language ${q.languageAwarded ?? 0}/${q.languageMax}`
          : `${qTag} Marked against ${evaluation.board} Mark Scheme`;

      scriptPage.drawText(sanitizePdfAscii(subScoreLine), {
        x: 63,
        y: yCursor - 12,
        size: 8,
        font: fontBoldItalic,
        color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
      });
      scriptPage.drawText(
        sanitizePdfAscii(`${qTag} TOTAL ${q.awardedMarks} / ${q.maxMarks}`),
        {
          x: 63,
          y: yCursor - 24,
          size: 8.5,
          font: fontBoldItalic,
          color: rgb(darkGreen.r, darkGreen.g, darkCharcoal.b),
        }
      );

      // Right-margin official mark box [awarded / max]
      scriptPage.drawRectangle({
        x: PAGE_W - 78,
        y: yCursor - 30,
        width: 30,
        height: 32,
        color: rgb(1, 1, 1),
        borderColor: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
        borderWidth: 1,
      });
      scriptPage.drawLine({
        start: { x: PAGE_W - 73, y: yCursor - 14 },
        end: { x: PAGE_W - 53, y: yCursor - 14 },
        thickness: 0.9,
        color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
      });
      scriptPage.drawText(sanitizePdfAscii(`${q.awardedMarks}`), {
        x: PAGE_W - 69,
        y: yCursor - 10,
        size: 8.5,
        font: fontBold,
        color: rgb(darkGreen.r, darkGreen.g, darkGreen.b),
      });
      scriptPage.drawText(sanitizePdfAscii(`${q.maxMarks}`), {
        x: PAGE_W - 69,
        y: yCursor - 26,
        size: 8.5,
        font: fontBold,
        color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
      });

      yCursor -= 52;
    }
  }

  // ============================================================================
  // PART 2: EXECUTIVE EXAMINER REPORT SUMMARY PAGE (Matching Page 7 of Reference PDF)
  // ============================================================================
  const summaryPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let sy = PAGE_H - 48;

  summaryPage.drawText(
    sanitizePdfAscii(
      `MARKED SCRIPT | EXAMINER REPORT | ${evaluation.board.toUpperCase()} ${evaluation.qualification.toUpperCase()}`
    ),
    {
      x: 42,
      y: sy,
      size: 8,
      font: fontBoldItalic,
      color: rgb(darkGreen.r, darkGreen.g, darkGreen.b),
    }
  );
  sy -= 20;

  summaryPage.drawText(
    sanitizePdfAscii(`${evaluation.subject} - ${evaluation.paperComponent}`),
    {
      x: 42,
      y: sy,
      size: 16,
      font: fontBoldItalic,
      color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
    }
  );
  sy -= 15;

  const qBreakdownSummary = evaluation.ledger
    .map(
      (q) =>
        `Q${q.questionNumber}${q.subQuestion ? `(${q.subQuestion})` : ''} [${q.maxMarks}]`
    )
    .join(' | ');
  const subtitleLines = wrapTextToLines(
    `Marked against the official ${evaluation.board} (${evaluation.session}) mark scheme. Questions: ${qBreakdownSummary} | Paper total [${evaluation.totalAvailable}].`,
    fontItalic,
    8.5,
    PAGE_W - 84
  );
  for (const sLine of subtitleLines) {
    summaryPage.drawText(sLine, {
      x: 42,
      y: sy,
      size: 8.5,
      font: fontItalic,
      color: rgb(mutedGray.r, mutedGray.g, mutedGray.b),
    });
    sy -= 12;
  }

  sy -= 6;
  // TOTAL SCORE Green-Bordered Hero Box
  summaryPage.drawRectangle({
    x: 42,
    y: sy - 58,
    width: PAGE_W - 84,
    height: 58,
    color: rgb(1, 1, 1),
    borderColor: rgb(darkGreen.r, darkGreen.g, darkGreen.b),
    borderWidth: 1.4,
  });
  summaryPage.drawText('TOTAL SCORE', {
    x: 56,
    y: sy - 16,
    size: 7.5,
    font: fontBoldItalic,
    color: rgb(darkGreen.r, darkGreen.g, darkGreen.b),
  });
  summaryPage.drawText(
    sanitizePdfAscii(
      `${evaluation.totalAwarded} / ${evaluation.totalAvailable}`
    ),
    {
      x: 56,
      y: sy - 44,
      size: 23,
      font: fontBoldItalic,
      color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
    }
  );

  const totalContentAw = evaluation.ledger.reduce(
    (s, q) => s + (q.contentAwarded ?? 0),
    0
  );
  const totalContentMx = evaluation.ledger.reduce(
    (s, q) => s + (q.contentMax ?? 0),
    0
  );
  const totalLangAw = evaluation.ledger.reduce(
    (s, q) => s + (q.languageAwarded ?? 0),
    0
  );
  const totalLangMx = evaluation.ledger.reduce(
    (s, q) => s + (q.languageMax ?? 0),
    0
  );

  const scoreMetaLine =
    totalContentMx > 0 && totalLangMx > 0
      ? `${evaluation.percentage.toFixed(1)} %   |   Content ${totalContentAw}/${totalContentMx}   |   Language ${totalLangAw}/${totalLangMx}`
      : `${evaluation.percentage.toFixed(1)} %   |   Provisional Grade: ${evaluation.provisionalGrade}`;

  summaryPage.drawText(sanitizePdfAscii(scoreMetaLine), {
    x: 215,
    y: sy - 42,
    size: 10,
    font: fontBoldItalic,
    color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
  });

  sy -= 72;

  // Question Breakdown Table (Dark Header Row)
  summaryPage.drawRectangle({
    x: 42,
    y: sy - 16,
    width: PAGE_W - 84,
    height: 16,
    color: rgb(tableHeaderBg.r, tableHeaderBg.g, tableHeaderBg.b),
  });
  const cols = [
    { label: 'Question', x: 48 },
    { label: 'Task / Topic', x: 102 },
    {
      label: totalContentMx > 0 ? 'Content & Comm.' : 'Pass 1 & 2',
      x: 245,
    },
    { label: totalLangMx > 0 ? 'Language' : 'Moderation', x: 335 },
    { label: 'Total', x: 405 },
    { label: 'Level / Status', x: 458 },
  ];
  for (const c of cols) {
    summaryPage.drawText(c.label, {
      x: c.x,
      y: sy - 11,
      size: 7.5,
      font: fontBoldItalic,
      color: rgb(1, 1, 1),
    });
  }
  sy -= 16;

  for (let i = 0; i < evaluation.ledger.length; i++) {
    const q = evaluation.ledger[i];
    const rowY = sy - 15;
    if (i % 2 === 1) {
      summaryPage.drawRectangle({
        x: 42,
        y: rowY,
        width: PAGE_W - 84,
        height: 15,
        color: rgb(0.96, 0.97, 0.98),
      });
    }
    const qLabel = `Q${q.questionNumber}${q.subQuestion ? `(${q.subQuestion})` : ''}`;
    summaryPage.drawText(sanitizePdfAscii(qLabel), {
      x: 48,
      y: rowY + 4,
      size: 8,
      font: fontBoldItalic,
      color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
    });
    summaryPage.drawText(
      sanitizePdfAscii((q.taskTitle || q.markSchemeRequirement).slice(0, 26)),
      {
        x: 102,
        y: rowY + 4,
        size: 8,
        font: fontItalic,
        color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
      }
    );
    summaryPage.drawText(
      sanitizePdfAscii(
        q.contentMax
          ? `${q.contentAwarded ?? q.awardedMarks} / ${q.contentMax}`
          : `${q.awardedMarks} / ${q.maxMarks}`
      ),
      {
        x: 245,
        y: rowY + 4,
        size: 8,
        font: fontBoldItalic,
        color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
      }
    );
    summaryPage.drawText(
      sanitizePdfAscii(
        q.languageMax
          ? `${q.languageAwarded ?? 0} / ${q.languageMax}`
          : 'Verified'
      ),
      {
        x: 335,
        y: rowY + 4,
        size: 8,
        font: fontBoldItalic,
        color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
      }
    );
    summaryPage.drawText(
      sanitizePdfAscii(`${q.awardedMarks} / ${q.maxMarks}`),
      {
        x: 405,
        y: rowY + 4,
        size: 8,
        font: fontBoldItalic,
        color: rgb(darkGreen.r, darkGreen.g, darkGreen.b),
      }
    );
    summaryPage.drawText(
      sanitizePdfAscii(
        (
          q.levelAwarded ||
          (q.awardedMarks === q.maxMarks
            ? 'Full Credit'
            : q.awardedMarks > 0
            ? 'Partial Credit'
            : 'Uncredited')
        ).slice(0, 22)
      ),
      {
        x: 458,
        y: rowY + 4,
        size: 7.5,
        font: fontItalic,
        color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
      }
    );
    sy = rowY;
  }

  // PAPER TOTAL Row
  summaryPage.drawLine({
    start: { x: 42, y: sy },
    end: { x: PAGE_W - 42, y: sy },
    thickness: 0.8,
    color: rgb(ruleGray.r, ruleGray.g, ruleGray.b),
  });
  sy -= 16;
  summaryPage.drawText('PAPER TOTAL', {
    x: 102,
    y: sy + 4,
    size: 8,
    font: fontBoldItalic,
    color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
  });
  if (totalContentMx > 0) {
    summaryPage.drawText(
      sanitizePdfAscii(`${totalContentAw} / ${totalContentMx}`),
      {
        x: 245,
        y: sy + 4,
        size: 8,
        font: fontBoldItalic,
        color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
      }
    );
  }
  if (totalLangMx > 0) {
    summaryPage.drawText(
      sanitizePdfAscii(`${totalLangAw} / ${totalLangMx}`),
      {
        x: 335,
        y: sy + 4,
        size: 8,
        font: fontBoldItalic,
        color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
      }
    );
  }
  summaryPage.drawText(
    sanitizePdfAscii(
      `${evaluation.totalAwarded} / ${evaluation.totalAvailable}`
    ),
    {
      x: 405,
      y: sy + 4,
      size: 8,
      font: fontBoldItalic,
      color: rgb(darkGreen.r, darkGreen.g, darkGreen.b),
    }
  );
  summaryPage.drawText(
    sanitizePdfAscii(`${evaluation.percentage.toFixed(1)} %`),
    {
      x: 458,
      y: sy + 4,
      size: 8,
      font: fontBoldItalic,
      color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
    }
  );

  sy -= 24;

  // Section: | Examiner's overview
  summaryPage.drawRectangle({
    x: 42,
    y: sy - 2,
    width: 3.5,
    height: 14,
    color: rgb(darkGreen.r, darkGreen.g, darkGreen.b),
  });
  summaryPage.drawText("Examiner's overview", {
    x: 52,
    y: sy,
    size: 11.5,
    font: fontBoldItalic,
    color: rgb(darkGreen.r, darkGreen.g, darkGreen.b),
  });
  sy -= 16;

  const overviewText =
    evaluation.examinerOverview ||
    `${evaluation.passSummary.pass1Summary} ${evaluation.passSummary.pass2Verification} ${evaluation.passSummary.pass3Moderation} ${evaluation.passSummary.consensusNotes}`;
  const overviewLines = wrapTextToLines(
    overviewText,
    fontBoldItalic,
    8.8,
    PAGE_W - 84
  );
  for (const oLine of overviewLines) {
    if (sy < 180) break;
    summaryPage.drawText(oLine, {
      x: 42,
      y: sy,
      size: 8.8,
      font: fontBoldItalic,
      color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
    });
    sy -= 12.5;
  }

  sy -= 14;

  // Section: | Word-limit & precision discipline
  summaryPage.drawRectangle({
    x: 42,
    y: sy - 2,
    width: 3.5,
    height: 14,
    color: rgb(darkRed.r, darkRed.g, darkRed.b),
  });
  summaryPage.drawText(
    'Word-limit & response discipline - key risk audit in this script',
    {
      x: 52,
      y: sy,
      size: 11,
      font: fontBoldItalic,
      color: rgb(darkRed.r, darkRed.g, darkRed.b),
    }
  );
  sy -= 18;

  summaryPage.drawRectangle({
    x: 42,
    y: sy - 15,
    width: PAGE_W - 84,
    height: 15,
    color: rgb(tableHeaderBg.r, tableHeaderBg.g, tableHeaderBg.b),
  });
  summaryPage.drawText('Question', {
    x: 48,
    y: sy - 11,
    size: 7.5,
    font: fontBoldItalic,
    color: rgb(1, 1, 1),
  });
  summaryPage.drawText('You wrote', {
    x: 135,
    y: sy - 11,
    size: 7.5,
    font: fontBoldItalic,
    color: rgb(1, 1, 1),
  });
  summaryPage.drawText('Required / Target', {
    x: 255,
    y: sy - 11,
    size: 7.5,
    font: fontBoldItalic,
    color: rgb(1, 1, 1),
  });
  summaryPage.drawText('Position / Audit', {
    x: 390,
    y: sy - 11,
    size: 7.5,
    font: fontBoldItalic,
    color: rgb(1, 1, 1),
  });
  sy -= 15;

  for (let i = 0; i < evaluation.ledger.length; i++) {
    const q = evaluation.ledger[i];
    if (sy < 75) break;
    const rowY = sy - 14;
    const wordCount =
      q.wordCountWrote ||
      (q.studentEvidence || '').trim().split(/\s+/).filter(Boolean).length;
    summaryPage.drawText(
      sanitizePdfAscii(
        `Q${q.questionNumber}${q.subQuestion ? `(${q.subQuestion})` : ''}`
      ),
      {
        x: 48,
        y: rowY + 3,
        size: 8,
        font: fontBoldItalic,
        color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
      }
    );
    summaryPage.drawText(sanitizePdfAscii(`about ${wordCount} words`), {
      x: 135,
      y: rowY + 3,
      size: 8,
      font: fontItalic,
      color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
    });
    summaryPage.drawText(
      sanitizePdfAscii(q.wordCountRequired || `${q.maxMarks} mark allocation`),
      {
        x: 255,
        y: rowY + 3,
        size: 8,
        font: fontItalic,
        color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
      }
    );
    summaryPage.drawText(
      sanitizePdfAscii(
        q.wordCountPosition ||
          (q.awardedMarks === q.maxMarks
            ? 'Within target precision'
            : `${q.maxMarks - q.awardedMarks} mark(s) recoverable`)
      ),
      {
        x: 390,
        y: rowY + 3,
        size: 8,
        font: fontBoldItalic,
        color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
      }
    );
    sy = rowY;
  }

  if (evaluation.wordLimitDisciplineNote && sy > 65) {
    sy -= 12;
    const wlLines = wrapTextToLines(
      evaluation.wordLimitDisciplineNote,
      fontBoldItalic,
      8.3,
      PAGE_W - 84
    );
    for (const l of wlLines) {
      if (sy < 45) break;
      summaryPage.drawText(l, {
        x: 42,
        y: sy,
        size: 8.3,
        font: fontBoldItalic,
        color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
      });
      sy -= 11.5;
    }
  }

  // ============================================================================
  // PART 3: PER-QUESTION DEEP-DIVE PAGES (Matching Pages 8–13 of Reference PDF)
  // ============================================================================
  for (let idx = 0; idx < evaluation.ledger.length; idx++) {
    const q = evaluation.ledger[idx];
    let qPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
    let qy = PAGE_H - 48;

    const qLabel = `Question ${q.questionNumber}${q.subQuestion ? `(${q.subQuestion})` : ''}`;
    const qTitle = `${qLabel} | ${q.taskTitle || 'Question Evaluation'} | [${q.maxMarks} marks]`;

    // Green bar + Question Header
    qPage.drawRectangle({
      x: 42,
      y: qy - 2,
      width: 3.8,
      height: 15,
      color: rgb(darkGreen.r, darkGreen.g, darkGreen.b),
    });
    qPage.drawText(sanitizePdfAscii(qTitle), {
      x: 52,
      y: qy,
      size: 13,
      font: fontBoldItalic,
      color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
    });
    qy -= 16;

    // Score Breakdown Line
    const subBreakdown =
      q.contentMax && q.languageMax
        ? `Content & Communication ${q.contentAwarded ?? q.awardedMarks} / ${q.contentMax}   Language ${q.languageAwarded ?? 0} / ${q.languageMax}   TOTAL ${q.awardedMarks} / ${q.maxMarks}`
        : `Pass 1: ${q.pass1Awarded}/${q.maxMarks}   Pass 2 Verified: ${q.pass2Awarded}/${q.maxMarks}   TOTAL ${q.awardedMarks} / ${q.maxMarks}`;

    qPage.drawText(sanitizePdfAscii(subBreakdown), {
      x: 42,
      y: qy,
      size: 9.2,
      font: fontBoldItalic,
      color: rgb(darkGreen.r, darkGreen.g, darkGreen.b),
    });
    qy -= 14;

    // Mark-scheme basis
    const msBasisLines = wrapTextToLines(
      `Mark-scheme basis: ${q.markSchemeRequirement}`,
      fontItalic,
      8.5,
      PAGE_W - 84
    );
    for (const msLine of msBasisLines) {
      qPage.drawText(msLine, {
        x: 42,
        y: qy,
        size: 8.5,
        font: fontItalic,
        color: rgb(mutedGray.r, mutedGray.g, mutedGray.b),
      });
      qy -= 11.5;
    }

    qy -= 4;
    qPage.drawText('You wrote:', {
      x: 42,
      y: qy,
      size: 8.5,
      font: fontItalic,
      color: rgb(mutedGray.r, mutedGray.g, mutedGray.b),
    });
    qy -= 13;

    // Indented Student Quote Block with left vertical border
    const quoteLines = wrapTextToLines(
      q.studentEvidence || 'No student text extracted.',
      fontItalic,
      8.8,
      PAGE_W - 115
    );
    const quoteBlockHeight = Math.max(16, quoteLines.length * 12);
    qPage.drawLine({
      start: { x: 52, y: qy + 8 },
      end: { x: 52, y: qy - quoteBlockHeight + 8 },
      thickness: 1.5,
      color: rgb(ruleGray.r, ruleGray.g, ruleGray.b),
    });
    for (const qLine of quoteLines) {
      qPage.drawText(qLine, {
        x: 64,
        y: qy,
        size: 8.8,
        font: fontItalic,
        color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
      });
      qy -= 12;
    }

    qy -= 10;

    // Section: | What earned you ticks
    qPage.drawRectangle({
      x: 42,
      y: qy - 2,
      width: 3.5,
      height: 13,
      color: rgb(darkGreen.r, darkGreen.g, darkGreen.b),
    });
    qPage.drawText('What earned you ticks', {
      x: 52,
      y: qy,
      size: 10.5,
      font: fontBoldItalic,
      color: rgb(darkGreen.r, darkGreen.g, darkGreen.b),
    });
    qy -= 15;

    const tickBullets = deriveQuestionWhatEarnedTicks(q);
    for (const bullet of tickBullets) {
      const bLines = wrapTextToLines(
        bullet,
        fontBoldItalic,
        8.6,
        PAGE_W - 104
      );
      if (qy - bLines.length * 12 < 65) {
        qPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
        qy = PAGE_H - 48;
      }
      drawVectorTick(qPage, 46, qy - 1, 0.85);
      for (const bl of bLines) {
        qPage.drawText(bl, {
          x: 60,
          y: qy,
          size: 8.6,
          font: fontBoldItalic,
          color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
        });
        qy -= 12;
      }
      qy -= 3;
    }

    qy -= 8;

    // Section: | Corrections marked with a red cross
    const redCorrections = deriveQuestionRedCrossCorrections(q);
    if (redCorrections.length > 0) {
      if (qy < 130) {
        qPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
        qy = PAGE_H - 48;
      }
      qPage.drawRectangle({
        x: 42,
        y: qy - 2,
        width: 3.5,
        height: 13,
        color: rgb(darkRed.r, darkRed.g, darkRed.b),
      });
      qPage.drawText('Corrections marked with a red cross', {
        x: 52,
        y: qy,
        size: 10.5,
        font: fontBoldItalic,
        color: rgb(darkRed.r, darkRed.g, darkRed.b),
      });
      qy -= 16;

      for (const corr of redCorrections) {
        const errHeaderLines = wrapTextToLines(
          `"${corr.quotedError}" - ${corr.explanation}`,
          fontBoldItalic,
          8.5,
          PAGE_W - 122
        );
        const fixLines = wrapTextToLines(
          `>> ${corr.modelCorrection}`,
          fontBoldItalic,
          8.5,
          PAGE_W - 122
        );
        const altLines = corr.higherRangeAlternative
          ? wrapTextToLines(
              `Higher-range alternative: "${corr.higherRangeAlternative.replace(/^Higher-range alternative:\s*/i, '')}"`,
              fontBoldItalic,
              8.3,
              PAGE_W - 130
            )
          : [];

        const boxHeight =
          14 +
          (errHeaderLines.length + fixLines.length + altLines.length) * 11.5;

        if (qy - boxHeight < 60) {
          qPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
          qy = PAGE_H - 48;
        }

        // Red Cross (✗) in left margin outside card
        drawVectorCross(qPage, 46, qy - 14, 0.9);

        // Pale Pink Rounded Card (#FFF0F3 fill, #D97788 border)
        qPage.drawRectangle({
          x: 62,
          y: qy - boxHeight,
          width: PAGE_W - 104,
          height: boxHeight,
          color: rgb(pinkCardBg.r, pinkCardBg.g, pinkCardBg.b),
          borderColor: rgb(
            pinkCardBorder.r,
            pinkCardBorder.g,
            pinkCardBorder.b
          ),
          borderWidth: 0.95,
        });

        let innerY = qy - 13;
        for (const el of errHeaderLines) {
          qPage.drawText(el, {
            x: 72,
            y: innerY,
            size: 8.5,
            font: fontBoldItalic,
            color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
          });
          innerY -= 11.5;
        }
        for (const fl of fixLines) {
          qPage.drawText(fl, {
            x: 72,
            y: innerY,
            size: 8.5,
            font: fontBoldItalic,
            color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
          });
          innerY -= 11.5;
        }
        for (const al of altLines) {
          qPage.drawText(al, {
            x: 80,
            y: innerY,
            size: 8.3,
            font: fontBoldItalic,
            color: rgb(darkGreen.r, darkGreen.g, darkGreen.b),
          });
          innerY -= 11.5;
        }

        qy -= boxHeight + 9;
      }
    }

    // Closing Examiner Comment on Qn
    const closingComment =
      q.examinerComment ||
      `Examiner comment on Q${q.questionNumber}: ${q.markingPointRationale}`;
    const commentLines = wrapTextToLines(
      closingComment,
      fontBoldItalic,
      8.6,
      PAGE_W - 84
    );
    if (qy - commentLines.length * 12 < 45) {
      qPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
      qy = PAGE_H - 48;
    }
    qy -= 4;
    for (const cl of commentLines) {
      qPage.drawText(cl, {
        x: 42,
        y: qy,
        size: 8.6,
        font: fontBoldItalic,
        color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
      });
      qy -= 12;
    }
  }

  // ============================================================================
  // PART 4: FINAL PAGE — OVERALL FEEDBACK · WHOLE SCRIPT (Matching Page 14 of Reference PDF)
  // ============================================================================
  const finalPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let fy = PAGE_H - 48;

  finalPage.drawRectangle({
    x: 42,
    y: fy - 2,
    width: 3.8,
    height: 15,
    color: rgb(darkGreen.r, darkGreen.g, darkGreen.b),
  });
  finalPage.drawText('Overall feedback | whole script', {
    x: 52,
    y: fy,
    size: 13.5,
    font: fontBoldItalic,
    color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
  });
  fy -= 18;

  const overallPara =
    evaluation.overallFeedbackWholeScript ||
    `${evaluation.totalAwarded}/${evaluation.totalAvailable} (${evaluation.percentage}%) places this script at Provisional Grade ${evaluation.provisionalGrade}. ${evaluation.passSummary.consensusNotes}`;
  for (const line of wrapTextToLines(
    overallPara,
    fontBoldItalic,
    9,
    PAGE_W - 84
  )) {
    finalPage.drawText(line, {
      x: 42,
      y: fy,
      size: 9,
      font: fontBoldItalic,
      color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
    });
    fy -= 12.5;
  }

  fy -= 12;

  // Section: | Strengths to protect
  finalPage.drawRectangle({
    x: 42,
    y: fy - 2,
    width: 3.5,
    height: 13,
    color: rgb(darkGreen.r, darkGreen.g, darkGreen.b),
  });
  finalPage.drawText('Strengths to protect', {
    x: 52,
    y: fy,
    size: 11,
    font: fontBoldItalic,
    color: rgb(darkGreen.r, darkGreen.g, darkGreen.b),
  });
  fy -= 16;

  const strengths =
    Array.isArray(evaluation.strengthsToProtect) &&
    evaluation.strengthsToProtect.length > 0
      ? evaluation.strengthsToProtect
      : evaluation.ledger
          .filter((q) => q.awardedMarks > 0)
          .slice(0, 3)
          .map(
            (q) =>
              `Q${q.questionNumber}: ${q.markingPointRationale}`
          );

  for (const st of strengths) {
    const sLines = wrapTextToLines(st, fontBoldItalic, 8.8, PAGE_W - 104);
    drawVectorTick(finalPage, 46, fy - 1, 0.85);
    for (const sl of sLines) {
      finalPage.drawText(sl, {
        x: 60,
        y: fy,
        size: 8.8,
        font: fontBoldItalic,
        color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
      });
      fy -= 12;
    }
    fy -= 4;
  }

  fy -= 10;

  // Section: | Where the marks went
  finalPage.drawRectangle({
    x: 42,
    y: fy - 2,
    width: 3.5,
    height: 13,
    color: rgb(darkRed.r, darkRed.g, darkRed.b),
  });
  finalPage.drawText('Where the marks went', {
    x: 52,
    y: fy,
    size: 11,
    font: fontBoldItalic,
    color: rgb(darkRed.r, darkRed.g, darkRed.b),
  });
  fy -= 16;

  const lostWhere =
    Array.isArray(evaluation.whereMarksWent) &&
    evaluation.whereMarksWent.length > 0
      ? evaluation.whereMarksWent
      : evaluation.lostMarksBreakdown.map(
          (q) =>
            `Q${q.questionNumber}${q.subQuestion ? `(${q.subQuestion})` : ''}: ${q.reasonForLostMarks || q.markSchemeRequirement}`
        );

  for (const lw of lostWhere.length > 0
    ? lostWhere
    : ['No marks lost across evaluated questions.']) {
    const lLines = wrapTextToLines(lw, fontBoldItalic, 8.8, PAGE_W - 104);
    drawVectorCross(finalPage, 46, fy - 1, 0.85);
    for (const ll of lLines) {
      finalPage.drawText(ll, {
        x: 60,
        y: fy,
        size: 8.8,
        font: fontBoldItalic,
        color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
      });
      fy -= 12;
    }
    fy -= 3;
  }

  fy -= 10;

  // Section: | Your next four targets
  finalPage.drawRectangle({
    x: 42,
    y: fy - 2,
    width: 3.5,
    height: 13,
    color: rgb(darkGreen.r, darkGreen.g, darkGreen.b),
  });
  finalPage.drawText('Your next four targets', {
    x: 52,
    y: fy,
    size: 11,
    font: fontBoldItalic,
    color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
  });
  fy -= 16;

  const targets =
    Array.isArray(evaluation.nextFourTargets) &&
    evaluation.nextFourTargets.length > 0
      ? evaluation.nextFourTargets
      : evaluation.priorityRevisionTopics.map(
          (t) => `Focus revision on: ${t}`
        );

  for (const tg of targets.slice(0, 4)) {
    const tLines = wrapTextToLines(
      `* ${tg}`,
      fontBoldItalic,
      8.8,
      PAGE_W - 96
    );
    for (const tl of tLines) {
      finalPage.drawText(tl, {
        x: 50,
        y: fy,
        size: 8.8,
        font: fontBoldItalic,
        color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
      });
      fy -= 12;
    }
    fy -= 3;
  }

  fy -= 10;

  // Section: | What the same script would score with those four fixes
  if (fy > 95) {
    finalPage.drawRectangle({
      x: 42,
      y: fy - 2,
      width: 3.5,
      height: 13,
      color: rgb(darkGreen.r, darkGreen.g, darkGreen.b),
    });
    finalPage.drawText(
      'What the same script would score with those four fixes',
      {
        x: 52,
        y: fy,
        size: 11,
        font: fontBoldItalic,
        color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
      }
    );
    fy -= 16;

    const projectedText =
      evaluation.projectedScoreWithFixes ||
      `Resolving the identified mark-scheme deductions above would recover up to ${evaluation.totalAvailable - evaluation.totalAwarded} mark(s), raising this script to ${evaluation.totalAvailable}/${evaluation.totalAvailable} (100%) from the same core working.`;

    for (const pl of wrapTextToLines(
      projectedText,
      fontBoldItalic,
      8.8,
      PAGE_W - 84
    )) {
      finalPage.drawText(pl, {
        x: 42,
        y: fy,
        size: 8.8,
        font: fontBoldItalic,
        color: rgb(darkCharcoal.r, darkCharcoal.g, darkCharcoal.b),
      });
      fy -= 12;
    }

    fy -= 8;
    finalPage.drawLine({
      start: { x: 42, y: fy },
      end: { x: PAGE_W - 42, y: fy },
      thickness: 0.9,
      color: rgb(darkGreen.r, darkGreen.g, darkGreen.b),
    });
    fy -= 13;
    const footerNote = `This script has been marked against the official ${evaluation.board} (${evaluation.session}) mark scheme using a three-pass independent moderation approach.`;
    for (const fl of wrapTextToLines(
      footerNote,
      fontItalic,
      7.8,
      PAGE_W - 84
    )) {
      finalPage.drawText(fl, {
        x: 42,
        y: fy,
        size: 7.8,
        font: fontItalic,
        color: rgb(mutedGray.r, mutedGray.g, mutedGray.b),
      });
      fy -= 10;
    }
  }

  return await pdfDoc.save();
}
