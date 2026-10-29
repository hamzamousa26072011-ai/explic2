import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { ExaminerEvaluationResult, QuestionMarkLedgerItem } from '../types';

export interface PlannedAnnotationBox {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'badge' | 'subtotal' | 'highlight' | 'symbol' | 'circle-max' | 'feedback';
}

/**
 * Deterministic collision-free layout planner for PDF annotations.
 * Ensures zero overlapping boxes, strict left subtotal lane, right tick/cross symbol lane,
 * and pale-pink feedback callout boxes below lost-mark questions.
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
    symbolBoxes: Array<{ symbol: '✓' | '✗'; x: number; y: number; isTick: boolean }>;
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

  // Track current Y cursor per page so annotations never collide vertically
  const pageYCursor: Record<number, number> = { 0: pageHeight - 135 };
  const MIN_VERTICAL_GAP = 18;

  const plannedItems: Array<{
    item: QuestionMarkLedgerItem;
    pageIndex: number;
    yTop: number;
    subtotalBox: PlannedAnnotationBox;
    highlightBox: PlannedAnnotationBox;
    symbolBoxes: Array<{ symbol: '✓' | '✗'; x: number; y: number; isTick: boolean }>;
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

    // If not enough vertical space on current page, overflow cleanly to next page
    if (pageYCursor[pIdx] - blockRequiredHeight < 65) {
      pIdx += 1;
      if (pageYCursor[pIdx] === undefined) {
        pageYCursor[pIdx] = pageHeight - 95;
      }
    }

    const yTop = pageYCursor[pIdx];

    // Left Margin Subtotal Lane (x = 24..68)
    const subtotalBox: PlannedAnnotationBox = {
      id: `subtotal-${idx}`,
      pageIndex: pIdx,
      x: 24,
      y: yTop - 22,
      width: 44,
      height: 22,
      type: 'subtotal',
    };

    // Student Working Highlight Strip (x = 78..460)
    const highlightBox: PlannedAnnotationBox = {
      id: `highlight-${idx}`,
      pageIndex: pIdx,
      x: 78,
      y: yTop - 36,
      width: 382,
      height: 36,
      type: 'highlight',
    };

    // Printed Max Mark Allocation Circle (x = 468..496)
    const circleMaxBox: PlannedAnnotationBox = {
      id: `circle-max-${idx}`,
      pageIndex: pIdx,
      x: 468,
      y: yTop - 24,
      width: 28,
      height: 20,
      type: 'circle-max',
    };

    // Dedicated Right Margin Annotation Lane for Ticks (✓) and Crosses (✗) ONLY (x = 516..565)
    const symbolBoxes: Array<{ symbol: '✓' | '✗'; x: number; y: number; isTick: boolean }> = [];
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
  return (text || '')
    .replace(/✓/g, '/')
    .replace(/✗/g, 'X')
    .replace(/[—–]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/[^\x20-\x7E]/g, '');
}

/**
 * Generates a vector-annotated PDF script using the Principal Examiner Design System.
 * Preserves an existing uploaded PDF if supplied, or creates a crisp examination script canvas.
 */
export async function generateAnnotatedExaminerPdfBytes(
  evaluation: ExaminerEvaluationResult,
  existingPdfBytes?: Uint8Array | null
): Promise<Uint8Array> {
  let pdfDoc: PDFDocument;
  if (existingPdfBytes && existingPdfBytes.byteLength > 100) {
    try {
      pdfDoc = await PDFDocument.load(existingPdfBytes);
    } catch {
      pdfDoc = await PDFDocument.create();
    }
  } else {
    pdfDoc = await PDFDocument.create();
  }

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontExaminer = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

  const PAGE_W = 595.28;
  const PAGE_H = 841.89;

  const { plannedItems, scoreBadgeBox } = buildCollisionFreeAnnotationPlan(
    evaluation.ledger,
    PAGE_W,
    PAGE_H
  );

  const maxPageIndex = plannedItems.reduce((acc, p) => Math.max(acc, p.pageIndex), 0);
  while (pdfDoc.getPageCount() <= maxPageIndex) {
    pdfDoc.addPage([PAGE_W, PAGE_H]);
  }

  const navyText = hexToRgb('#243247');
  const scoreBadgeColor = hexToRgb('#17365D');
  const feedbackBg = hexToRgb('#FFEBEE');
  const feedbackBorder = hexToRgb('#FECDD3');
  const separatorColor = hexToRgb('#D8DEE8');
  const greenHighlight = hexToRgb('#70E0A0');
  const redHighlight = hexToRgb('#FF8888');
  const amberHighlight = hexToRgb('#FFD580');
  const greenStroke = hexToRgb('#16A34A');
  const redStroke = hexToRgb('#DC2626');

  // Render Page 1 Header & Official Score Badge
  const firstPage = pdfDoc.getPage(0);
  const { width: p1W, height: p1H } = firstPage.getSize();

  // Top Header Strip
  firstPage.drawText(
    sanitizePdfAscii(`EXPLIC EXAMINER MODERATION SCRIPT - ${evaluation.board}`),
    {
      x: 24,
      y: p1H - 32,
      size: 10,
      font: fontBold,
      color: rgb(navyText.r, navyText.g, navyText.b),
    }
  );
  firstPage.drawText(
    sanitizePdfAscii(
      `${evaluation.subject} | ${evaluation.paperComponent} | Session: ${evaluation.session}`
    ),
    {
      x: 24,
      y: p1H - 46,
      size: 8.5,
      font: fontRegular,
      color: rgb(navyText.r, navyText.g, navyText.b),
    }
  );
  firstPage.drawText(
    sanitizePdfAscii(
      `Left Lane: Subtotals   |   Center: Student Script & Highlights   |   Right Lane: Ticks & Crosses Only`
    ),
    {
      x: 24,
      y: p1H - 60,
      size: 7.5,
      font: fontExaminer,
      color: rgb(0.35, 0.42, 0.52),
    }
  );

  // Page-One Score Badge (#17365D Navy background with white text)
  firstPage.drawRectangle({
    x: scoreBadgeBox.x,
    y: p1H - 68,
    width: scoreBadgeBox.width,
    height: scoreBadgeBox.height,
    color: rgb(scoreBadgeColor.r, scoreBadgeColor.g, scoreBadgeColor.b),
  });
  firstPage.drawText(
    sanitizePdfAscii(
      `SCORE: ${evaluation.totalAwarded}/${evaluation.totalAvailable} (${evaluation.percentage}%)`
    ),
    {
      x: scoreBadgeBox.x + 12,
      y: p1H - 42,
      size: 12,
      font: fontBold,
      color: rgb(1, 1, 1),
    }
  );
  firstPage.drawText(
    sanitizePdfAscii(`PROVISIONAL GRADE: ${evaluation.provisionalGrade}`),
    {
      x: scoreBadgeBox.x + 12,
      y: p1H - 58,
      size: 9,
      font: fontRegular,
      color: rgb(0.88, 0.94, 1),
    }
  );

  // Draw vertical lane rules on every active page
  for (let pIdx = 0; pIdx <= maxPageIndex; pIdx++) {
    const page = pdfDoc.getPage(pIdx);
    const { height: pH } = page.getSize();
    // Left subtotal lane divider
    page.drawLine({
      start: { x: 72, y: 45 },
      end: { x: 72, y: pH - 78 },
      thickness: 0.7,
      color: rgb(separatorColor.r, separatorColor.g, separatorColor.b),
    });
    // Right tick/cross lane divider
    page.drawLine({
      start: { x: 508, y: 45 },
      end: { x: 508, y: pH - 78 },
      thickness: 0.7,
      color: rgb(separatorColor.r, separatorColor.g, separatorColor.b),
    });
  }

  // Render every planned question block
  for (const planned of plannedItems) {
    const page = pdfDoc.getPage(planned.pageIndex);
    const q = planned.item;

    const hlRgb =
      q.status === 'correct'
        ? greenHighlight
        : q.status === 'partial'
        ? amberHighlight
        : redHighlight;

    // 1. Left Margin Subtotal Lane (e.g. 3/3, 2/3, 0/2)
    page.drawRectangle({
      x: planned.subtotalBox.x,
      y: planned.subtotalBox.y,
      width: planned.subtotalBox.width,
      height: planned.subtotalBox.height,
      color: rgb(0.95, 0.97, 0.99),
      borderColor: rgb(separatorColor.r, separatorColor.g, separatorColor.b),
      borderWidth: 0.8,
    });
    page.drawText(sanitizePdfAscii(`${q.awardedMarks}/${q.maxMarks}`), {
      x: planned.subtotalBox.x + 8,
      y: planned.subtotalBox.y + 6,
      size: 10,
      font: fontBold,
      color: rgb(navyText.r, navyText.g, navyText.b),
    });

    // 2. Student Response & Localized 40% Opacity Highlight Strip
    page.drawRectangle({
      x: planned.highlightBox.x,
      y: planned.highlightBox.y,
      width: planned.highlightBox.width,
      height: planned.highlightBox.height,
      color: rgb(hlRgb.r, hlRgb.g, hlRgb.b),
      opacity: 0.4,
    });

    const qLabel = `Q${q.questionNumber}${q.subQuestion ? `(${q.subQuestion})` : ''}`;
    page.drawText(
      sanitizePdfAscii(`${qLabel}: ${q.studentEvidence.slice(0, 74)}`),
      {
        x: planned.highlightBox.x + 6,
        y: planned.highlightBox.y + 21,
        size: 9,
        font: fontRegular,
        color: rgb(navyText.r, navyText.g, navyText.b),
      }
    );
    page.drawText(
      sanitizePdfAscii(`Examiner Note: ${q.markingPointRationale.slice(0, 82)}`),
      {
        x: planned.highlightBox.x + 6,
        y: planned.highlightBox.y + 7,
        size: 8,
        font: fontExaminer,
        color: rgb(navyText.r, navyText.g, navyText.b),
      }
    );

    // 3. Circled Official Mark Allocation [max] in Thin Green Oval
    page.drawEllipse({
      x: planned.circleMaxBox.x + 14,
      y: planned.circleMaxBox.y + 10,
      xScale: 13,
      yScale: 9,
      borderColor: rgb(greenStroke.r, greenStroke.g, greenStroke.b),
      borderWidth: 1.1,
    });
    page.drawText(sanitizePdfAscii(`[${q.maxMarks}]`), {
      x: planned.circleMaxBox.x + 7,
      y: planned.circleMaxBox.y + 6,
      size: 8.5,
      font: fontBold,
      color: rgb(greenStroke.r, greenStroke.g, greenStroke.b),
    });

    // 4. Right Margin Annotation Lane — Strictly Vector Ticks (✓) and Crosses (✗) ONLY
    for (const sym of planned.symbolBoxes) {
      if (sym.isTick) {
        // Vector tick ✓
        page.drawLine({
          start: { x: sym.x, y: sym.y + 3 },
          end: { x: sym.x + 3.5, y: sym.y },
          thickness: 1.6,
          color: rgb(greenStroke.r, greenStroke.g, greenStroke.b),
        });
        page.drawLine({
          start: { x: sym.x + 3.5, y: sym.y },
          end: { x: sym.x + 10, y: sym.y + 8 },
          thickness: 1.6,
          color: rgb(greenStroke.r, greenStroke.g, greenStroke.b),
        });
      } else {
        // Vector cross ✗
        page.drawLine({
          start: { x: sym.x, y: sym.y },
          end: { x: sym.x + 8, y: sym.y + 8 },
          thickness: 1.5,
          color: rgb(redStroke.r, redStroke.g, redStroke.b),
        });
        page.drawLine({
          start: { x: sym.x, y: sym.y + 8 },
          end: { x: sym.x + 8, y: sym.y },
          thickness: 1.5,
          color: rgb(redStroke.r, redStroke.g, redStroke.b),
        });
      }
    }

    // 5. Examiner Feedback Callout Box (#FFEBEE pale pink) when marks are lost
    if (planned.feedbackBox) {
      const fb = planned.feedbackBox;
      const marksLost = q.maxMarks - q.awardedMarks;
      page.drawRectangle({
        x: fb.x,
        y: fb.y,
        width: fb.width,
        height: fb.height,
        color: rgb(feedbackBg.r, feedbackBg.g, feedbackBg.b),
        borderColor: rgb(feedbackBorder.r, feedbackBorder.g, feedbackBorder.b),
        borderWidth: 0.9,
      });

      page.drawText(
        sanitizePdfAscii(
          `Issue (-${marksLost}m): ${(q.reasonForLostMarks || 'Incomplete mark scheme point').slice(0, 74)}`
        ),
        {
          x: fb.x + 8,
          y: fb.y + 39,
          size: 8,
          font: fontBold,
          color: rgb(navyText.r, navyText.g, navyText.b),
        }
      );
      page.drawText(
        sanitizePdfAscii(`Required Improvement: ${q.markSchemeRequirement.slice(0, 78)}`),
        {
          x: fb.x + 8,
          y: fb.y + 24,
          size: 8,
          font: fontRegular,
          color: rgb(navyText.r, navyText.g, navyText.b),
        }
      );
      page.drawText(
        sanitizePdfAscii(
          `Examiner Wording: "${(q.examinerWording || q.markSchemeRequirement).slice(0, 76)}"`
        ),
        {
          x: fb.x + 8,
          y: fb.y + 9,
          size: 8,
          font: fontExaminer,
          color: rgb(navyText.r, navyText.g, navyText.b),
        }
      );
    }
  }

  return await pdfDoc.save();
}
