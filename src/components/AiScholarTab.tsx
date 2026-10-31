import React, { useState, useRef } from 'react';
import { ThemeMode } from '../types';

interface AiScholarTabProps {
  theme?: ThemeMode;
  onTriggerSecurityLockdown?: (input: string, action: string) => boolean;
  onAwardFocusXp?: (xpAmount: number) => void;
}

interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
}

interface TranscriptItem {
  label: string;
  text: string;
}

interface QuestionBreakdownItem {
  question: string;
  status: 'correct' | 'partial' | 'incorrect' | 'unanswered' | 'unclear';
  awarded_marks: number | null;
  maximum_marks: number | null;
  student_evidence: string;
  marking_decision: string;
  improvement: string;
}

interface MistakeItem {
  question: string;
  mistake: string;
  why_marks_lost: string;
  fix: string;
}

interface CorrectAnswerComparisonItem {
  question: string;
  student_answer: string;
  model_answer: string;
  mark_scheme_points: string[];
  comparison: string;
}

interface StructuredMarkingReport {
  overall_mark: number | null;
  maximum_mark: number | null;
  percentage: number | null;
  summary: string;
  question_breakdown: QuestionBreakdownItem[];
  mistakes: MistakeItem[];
  correct_answers: CorrectAnswerComparisonItem[];
  strengths: string[];
  review_required: string[];
  marking_notes: string[];
}

interface StructuredAuditReport {
  audit_status: 'verified' | 'adjustment_needed' | 'human_review';
  arithmetic_check: string;
  verified_mark: number | null;
  verified_maximum: number | null;
  issues: string[];
  corrections: string[];
  final_note: string;
}

interface CorrectionResponseData {
  notice: string;
  marking: StructuredMarkingReport | string;
  audit: StructuredAuditReport | string;
  transcripts: TranscriptItem[];
}

function escapeHtml(raw: string): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInlineMarkdown(line: string): string {
  return escapeHtml(line)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

export function renderAssistantMessage(rawText: string): string {
  const lines = String(rawText ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  const output: string[] = [];
  let inList: 'ul' | 'ol' | null = null;
  let inCode = false;
  let codeLines: string[] = [];

  const closeList = () => {
    if (inList) {
      output.push(`</${inList}>`);
      inList = null;
    }
  };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      closeList();
      if (inCode) {
        output.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      closeList();
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      closeList();
      const tag = heading[1].length <= 2 ? 'h3' : 'h4';
      output.push(`<${tag}>${renderInlineMarkdown(heading[2])}</${tag}>`);
      continue;
    }

    const bullet = line.match(/^\s*[-*•]\s+(.+)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (bullet || numbered) {
      const targetList = bullet ? 'ul' : 'ol';
      if (inList !== targetList) {
        closeList();
        output.push(`<${targetList}>`);
        inList = targetList;
      }
      output.push(`<li>${renderInlineMarkdown((bullet || numbered)![1])}</li>`);
      continue;
    }

    closeList();
    output.push(`<p>${renderInlineMarkdown(line)}</p>`);
  }

  if (inCode && codeLines.length) {
    output.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  }
  closeList();
  return output.join('') || '<p></p>';
}

function formatNumber(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function displayValue(value: unknown, fallback = 'Not provided'): string {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  return String(value);
}

export const AiScholarTab: React.FC<AiScholarTabProps> = ({
  onAwardFocusXp,
}) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'paper'>('chat');

  // Chatbot state
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatBubbles, setChatBubbles] = useState<ChatMessageItem[]>([]);
  const chatHistoryRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const chatMessagesRef = useRef<HTMLDivElement | null>(null);
  const chatTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Paper Correction state
  const [answer1File, setAnswer1File] = useState<File | null>(null);
  const [answer2File, setAnswer2File] = useState<File | null>(null);
  const [markschemeFile, setMarkschemeFile] = useState<File | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusError, setStatusError] = useState(false);
  const [correctionResult, setCorrectionResult] = useState<CorrectionResponseData | null>(null);
  const correctionResultsRef = useRef<HTMLElement | null>(null);

  const scrollChatToBottom = () => {
    setTimeout(() => {
      if (chatMessagesRef.current) {
        chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
      }
    }, 10);
  };

  const handleChatSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const message = chatInput.trim();
    if (!message || chatSending) return;

    chatHistoryRef.current.push({ role: 'user', content: message });
    const userBubbleId = `user-${Date.now()}`;
    const thinkingBubbleId = `assistant-${Date.now() + 1}`;

    setChatBubbles((prev) => [
      ...prev,
      { id: userBubbleId, role: 'user', content: message },
      { id: thinkingBubbleId, role: 'assistant', content: 'Thinking…' },
    ]);
    setChatInput('');
    setChatSending(true);
    scrollChatToBottom();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-site-key': 'key_ps5gnQ9rlp4xSCl6',
        },
        body: JSON.stringify({
          siteKey: 'key_ps5gnQ9rlp4xSCl6',
          messages: chatHistoryRef.current.slice(-20),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'The chatbot request failed.');
      }

      const answerText = data.answer || 'Please ask your question again.';
      chatHistoryRef.current.push({ role: 'assistant', content: answerText });

      setChatBubbles((prev) =>
        prev.map((b) =>
          b.id === thinkingBubbleId ? { ...b, content: answerText } : b
        )
      );
      if (onAwardFocusXp) onAwardFocusXp(10);
    } catch (error: any) {
      const errMsg = error?.message || 'Something went wrong. Please try again.';
      setChatBubbles((prev) =>
        prev.map((b) =>
          b.id === thinkingBubbleId
            ? { ...b, content: errMsg, isError: true }
            : b
        )
      );
    } finally {
      setChatSending(false);
      chatTextareaRef.current?.focus();
      scrollChatToBottom();
    }
  };

  const setStatus = (message: string, isError = false) => {
    setStatusMessage(message);
    setStatusError(isError);
  };

  const handleCorrectionSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!answer1File || !markschemeFile) {
      setStatus(
        'Please upload Answer Paper 1 and the Mark Scheme PDF. Answer Paper 2 is optional.',
        true
      );
      return;
    }

    const filesToCheck = [answer1File, answer2File, markschemeFile].filter(
      Boolean
    ) as File[];

    for (const file of filesToCheck) {
      if (
        file.type !== 'application/pdf' &&
        !file.name.toLowerCase().endsWith('.pdf')
      ) {
        setStatus(`${file.name} is not a PDF file.`, true);
        return;
      }
      if (file.size > 15 * 1024 * 1024) {
        setStatus(`${file.name} is larger than 15 MB.`, true);
        return;
      }
    }

    const formData = new FormData();
    formData.append('answer1', answer1File);
    if (answer2File) formData.append('answer2', answer2File);
    formData.append('markscheme', markschemeFile);

    setCorrecting(true);
    setCorrectionResult(null);
    setStatus(
      'Step 1 of 3: Uploading your PDFs and reading every page. Handwriting and diagram labels are checked by the vision-capable model. This can take a little while for long papers.'
    );

    try {
      const response = await fetch('/api/correct', {
        method: 'POST',
        headers: {
          'x-site-key': 'key_ps5gnQ9rlp4xSCl6',
        },
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Paper correction failed.');
      }

      setStatus(
        'Step 2 of 3: Transcription complete. Step 3 of 3: Marking and independently checking the marks are complete.'
      );

      setCorrectionResult({
        notice: data.notice || '',
        marking: data.marking || '',
        audit: data.audit || '',
        transcripts: Array.isArray(data.transcripts) ? data.transcripts : [],
      });

      setStatus(
        'Done. Review the marking report, independent verification, and full transcriptions below. Check any uncertain handwriting against your original PDFs.'
      );
      if (onAwardFocusXp) onAwardFocusXp(50);

      setTimeout(() => {
        correctionResultsRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 50);
    } catch (error: any) {
      setStatus(
        error?.message || 'Something went wrong. Please try again.',
        true
      );
    } finally {
      setCorrecting(false);
    }
  };

  const renderStructuredResults = () => {
    if (!correctionResult) return null;

    const report =
      typeof correctionResult.marking === 'object' && correctionResult.marking !== null
        ? (correctionResult.marking as StructuredMarkingReport)
        : null;
    const audit =
      typeof correctionResult.audit === 'object' && correctionResult.audit !== null
        ? (correctionResult.audit as StructuredAuditReport)
        : null;

    if (!report) {
      return (
        <>
          <div className="result-section">
            <h4>Marking Report</h4>
            <pre className="result-text">{String(correctionResult.marking || '')}</pre>
          </div>
          <div className="result-section">
            <h4>Independent Audit Verification</h4>
            <pre className="result-text">{String(correctionResult.audit || '')}</pre>
          </div>
        </>
      );
    }

    const mark = formatNumber(report.overall_mark);
    const max = formatNumber(report.maximum_mark);
    const percent =
      typeof report.percentage === 'number' && Number.isFinite(report.percentage)
        ? `${Math.round(report.percentage)}%`
        : '—';
    const overallScoreText =
      mark !== null && max !== null
        ? `${mark} / ${max}`
        : mark !== null
        ? mark
        : 'See breakdown';

    const questions = Array.isArray(report.question_breakdown)
      ? report.question_breakdown
      : [];
    const mistakes = Array.isArray(report.mistakes) ? report.mistakes : [];
    const comparisons = Array.isArray(report.correct_answers)
      ? report.correct_answers
      : [];

    const vMark = formatNumber(audit?.verified_mark);
    const vMax = formatNumber(audit?.verified_maximum);
    const vTotal =
      vMark !== null && vMax !== null
        ? `${vMark} / ${vMax}`
        : 'Requires human verification';
    const auditStatus = audit?.audit_status || 'human_review';

    return (
      <>
        <div className="score-hero">
          <div>
            <div className="score-label">Estimated Overall Score</div>
            <div className="score-number" id="score-number">
              {overallScoreText}
            </div>
            <div className="score-summary">
              {displayValue(
                report.summary,
                'Completed structured marking against the official mark scheme.'
              )}
            </div>
          </div>
          <div className="score-percent-box">
            <span className="score-percent">{percent}</span>
            <span className="score-percent-label">Percentage</span>
          </div>
        </div>

        <div className="result-section">
          <h4>Question-by-Question Breakdown</h4>
          <div className="stack-list" id="question-list">
            {questions.length === 0 ? (
              <div className="item-card">
                <div className="field-row">No individual questions were identified.</div>
              </div>
            ) : (
              questions.map((q, idx) => {
                const qAwarded = formatNumber(q.awarded_marks);
                const qMax = formatNumber(q.maximum_marks);
                const qScore =
                  qAwarded !== null && qMax !== null
                    ? `${qAwarded} / ${qMax}`
                    : 'Marks N/A';
                const status = q.status || 'unclear';
                return (
                  <div className="item-card" key={`${q.question}-${idx}`}>
                    <div className="item-head">
                      <span className="item-title">
                        {displayValue(q.question, 'Question')} · {qScore}
                      </span>
                      <span className={`status-chip ${status}`}>
                        {status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="field-row">
                      <strong>Student evidence:</strong>{' '}
                      {displayValue(q.student_evidence)}
                    </div>
                    <div className="field-row">
                      <strong>Marking decision:</strong>{' '}
                      {displayValue(q.marking_decision)}
                    </div>
                    <div className="field-row">
                      <strong>Improvement:</strong> {displayValue(q.improvement)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="result-section">
          <h4>Mistakes &amp; Lost Marks</h4>
          <div className="stack-list">
            {mistakes.length === 0 ? (
              <div className="item-card">
                <div className="field-row">
                  No specific mistakes or lost-mark items were flagged.
                </div>
              </div>
            ) : (
              mistakes.map((m, idx) => (
                <div className="item-card" key={`${m.question}-${idx}`}>
                  <div className="item-head">
                    <span className="item-title">
                      {displayValue(m.question, 'Question')}
                    </span>
                    <span className="status-chip incorrect">Lost mark</span>
                  </div>
                  <div className="field-row">
                    <strong>Mistake:</strong> {displayValue(m.mistake)}
                  </div>
                  <div className="field-row">
                    <strong>Why marks were lost:</strong>{' '}
                    {displayValue(m.why_marks_lost)}
                  </div>
                  <div className="field-row">
                    <strong>How to fix:</strong> {displayValue(m.fix)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="result-section">
          <h4>Correct Answers &amp; Mark Scheme Comparison</h4>
          <div className="stack-list">
            {comparisons.length === 0 ? (
              <div className="item-card">
                <div className="field-row">No model answer comparisons available.</div>
              </div>
            ) : (
              comparisons.map((c, idx) => (
                <div className="item-card" key={`${c.question}-${idx}`}>
                  <div className="item-head">
                    <span className="item-title">
                      {displayValue(c.question, 'Question')}
                    </span>
                  </div>
                  <div className="comparison-grid">
                    <div className="comparison-box">
                      <h5>Student&apos;s Answer</h5>
                      <div>{displayValue(c.student_answer)}</div>
                    </div>
                    <div className="comparison-box">
                      <h5>Model Answer</h5>
                      <div>{displayValue(c.model_answer)}</div>
                    </div>
                  </div>
                  <div className="field-row" style={{ marginTop: 10 }}>
                    <strong>Mark scheme points:</strong>
                    <ul className="bullet-list">
                      {(Array.isArray(c.mark_scheme_points) &&
                      c.mark_scheme_points.length > 0
                        ? c.mark_scheme_points
                        : ['None listed']
                      ).map((pt, pIdx) => (
                        <li key={pIdx}>{pt}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="field-row">
                    <strong>Comparison:</strong> {displayValue(c.comparison)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="result-section">
          <h4>Strengths, Review Required &amp; Marking Notes</h4>
          <div className="stack-list">
            {[
              ['Strengths', report.strengths],
              [
                'Questions / Handwriting Requiring Human Review',
                report.review_required,
              ],
              ['Marking Notes & Assumptions', report.marking_notes],
            ].map(([label, items]) => {
              const list =
                Array.isArray(items) && items.length > 0
                  ? (items as string[])
                  : ['None noted.'];
              return (
                <div className="item-card" key={String(label)}>
                  <div className="item-title" style={{ marginBottom: 6 }}>
                    {label}
                  </div>
                  <ul className="bullet-list">
                    {list.map((entry, idx) => (
                      <li key={idx}>{entry}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>

        <div className="result-section">
          <h4>Independent Audit Verification</h4>
          {audit ? (
            <div className="item-card">
              <div className="item-head">
                <span className="item-title">Verified Total: {vTotal}</span>
                <span className={`status-chip ${auditStatus}`}>
                  {auditStatus.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="field-row">
                <strong>Arithmetic check:</strong>{' '}
                {displayValue(audit.arithmetic_check)}
              </div>
              <div className="field-row">
                <strong>Issues flagged:</strong>
                <ul className="bullet-list">
                  {(Array.isArray(audit.issues) && audit.issues.length > 0
                    ? audit.issues
                    : ['None']
                  ).map((issue, idx) => (
                    <li key={idx}>{issue}</li>
                  ))}
                </ul>
              </div>
              <div className="field-row">
                <strong>Required corrections:</strong>
                <ul className="bullet-list">
                  {(Array.isArray(audit.corrections) &&
                  audit.corrections.length > 0
                    ? audit.corrections
                    : ['None']
                  ).map((corr, idx) => (
                    <li key={idx}>{corr}</li>
                  ))}
                </ul>
              </div>
              <div className="field-row">
                <strong>Final note:</strong> {displayValue(audit.final_note)}
              </div>
            </div>
          ) : (
            <div className="item-card">
              <pre className="result-text">
                {displayValue(correctionResult.audit)}
              </pre>
            </div>
          )}
        </div>
      </>
    );
  };

  return (
    <div className="ai-examiner-root">
      <style>{`
        .ai-examiner-root {
          --ink: #172033;
          --muted: #667085;
          --line: #e6eaf1;
          --panel: #ffffff;
          --page: #f6f8fc;
          --brand: #3156d8;
          --brand-dark: #2445b8;
          --soft: #edf2ff;
          --green: #147d55;
          --green-soft: #e9f8f1;
          --amber: #9a5b13;
          --amber-soft: #fff6e6;
          --red: #b42318;
          --red-soft: #fef3f2;
          --shadow: 0 16px 48px rgba(31, 48, 88, .08);
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: var(--ink);
        }
        .ai-examiner-root * { box-sizing: border-box; }
        .ai-examiner-root button,
        .ai-examiner-root input,
        .ai-examiner-root textarea { font: inherit; }
        .ai-examiner-root .shell { width: min(1060px, 100%); margin: 12px auto 48px; }
        .ai-examiner-root .hero { display: flex; justify-content: space-between; align-items: end; gap: 20px; margin-bottom: 24px; }
        .ai-examiner-root .eyebrow { color: var(--brand); font-size: 12px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
        .ai-examiner-root h1 { margin: 7px 0 8px; font-size: clamp(30px, 5vw, 42px); line-height: 1.1; letter-spacing: -.04em; font-weight: 800; color: var(--ink); }
        .ai-examiner-root .sub { margin: 0; color: var(--muted); max-width: 650px; line-height: 1.6; font-size: 15px; }
        .ai-examiner-root .secure { display: inline-flex; align-items: center; gap: 8px; color: #475467; background: #fff; border: 1px solid var(--line); padding: 10px 13px; border-radius: 999px; white-space: nowrap; font-size: 13px; }
        .ai-examiner-root .dot { width: 8px; height: 8px; background: #16a36a; border-radius: 50%; }
        .ai-examiner-root .app { background: var(--panel); border: 1px solid var(--line); border-radius: 22px; box-shadow: var(--shadow); overflow: hidden; }
        .ai-examiner-root .tabs { display: flex; gap: 6px; padding: 12px; border-bottom: 1px solid var(--line); background: #fbfcff; }
        .ai-examiner-root .tab { border: 0; color: #667085; background: transparent; padding: 12px 17px; border-radius: 12px; cursor: pointer; font-weight: 700; display: flex; align-items: center; gap: 9px; font-size: 14px; }
        .ai-examiner-root .tab[aria-selected="true"] { color: var(--brand); background: var(--soft); }
        .ai-examiner-root .tab svg { width: 18px; height: 18px; }
        .ai-examiner-root .panel { display: none; padding: 26px; background: #ffffff; color: var(--ink); }
        .ai-examiner-root .panel.active { display: block; }
        .ai-examiner-root .section-head { display: flex; justify-content: space-between; align-items: start; gap: 18px; margin-bottom: 20px; }
        .ai-examiner-root h2 { font-size: 22px; margin: 0 0 6px; letter-spacing: -.025em; font-weight: 750; color: var(--ink); }
        .ai-examiner-root .hint { color: var(--muted); margin: 0; font-size: 14px; line-height: 1.55; }
        .ai-examiner-root .tag { font-size: 12px; font-weight: 700; color: #475467; border: 1px solid var(--line); border-radius: 999px; padding: 7px 10px; white-space: nowrap; background: #fff; }
        .ai-examiner-root .upload-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 14px; }
        .ai-examiner-root .upload-card { border: 1px dashed #cbd3e1; border-radius: 16px; padding: 18px; background: #fcfdff; min-height: 182px; display: flex; flex-direction: column; cursor: pointer; }
        .ai-examiner-root .upload-card:focus-within { outline: 3px solid #dce5ff; border-color: var(--brand); }
        .ai-examiner-root .upload-icon { width: 40px; height: 40px; display: grid; place-items: center; background: var(--soft); color: var(--brand); border-radius: 12px; margin-bottom: 13px; }
        .ai-examiner-root .upload-icon svg { width: 20px; height: 20px; }
        .ai-examiner-root .upload-title { font-weight: 750; margin-bottom: 5px; color: var(--ink); font-size: 15px; }
        .ai-examiner-root .upload-copy { font-size: 13px; color: var(--muted); line-height: 1.5; }
        .ai-examiner-root .file-pick { margin-top: auto; padding-top: 14px; }
        .ai-examiner-root .file-pick input { width: 100%; font-size: 13px; color: var(--muted); }
        .ai-examiner-root .file-pick input::file-selector-button { border: 1px solid var(--line); background: #fff; color: var(--ink); border-radius: 9px; padding: 7px 10px; margin-right: 10px; cursor: pointer; font-weight: 650; }
        .ai-examiner-root .file-name { margin-top: 7px; font-size: 12px; color: var(--green); font-weight: 650; word-break: break-word; }
        .ai-examiner-root .actions { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-top: 18px; padding-top: 18px; border-top: 1px solid var(--line); }
        .ai-examiner-root .primary { border: 0; background: var(--brand); color: #fff; padding: 12px 18px; border-radius: 12px; font-weight: 750; cursor: pointer; transition: background .15s ease; }
        .ai-examiner-root .primary:hover:not(:disabled) { background: var(--brand-dark); }
        .ai-examiner-root .primary:disabled { opacity: .6; cursor: wait; }
        .ai-examiner-root .status { display: none; margin-top: 16px; padding: 13px 15px; border-radius: 13px; border: 1px solid #d7e2ff; background: #f5f8ff; font-size: 14px; line-height: 1.5; color: var(--ink); }
        .ai-examiner-root .status.error { border-color: #fecdca; background: #fef3f2; color: var(--red); }
        .ai-examiner-root .status.show { display: block; }
        .ai-examiner-root .results { display: none; margin-top: 22px; gap: 16px; flex-direction: column; }
        .ai-examiner-root .results.show { display: flex; }
        .ai-examiner-root .notice { padding: 13px 15px; border-radius: 13px; background: #fffbeb; border: 1px solid #fde68a; color: #78350f; font-size: 13px; line-height: 1.5; }
        .ai-examiner-root .score-hero { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 20px 22px; border-radius: 16px; background: linear-gradient(135deg, #172033 0%, #243863 100%); color: #fff; }
        .ai-examiner-root .score-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: #cbd5e1; margin-bottom: 6px; }
        .ai-examiner-root .score-number { font-size: clamp(28px, 4vw, 38px); font-weight: 800; letter-spacing: -.04em; color: #fff; }
        .ai-examiner-root .score-summary { margin-top: 6px; font-size: 14px; color: #e2e8f0; line-height: 1.55; max-width: 680px; }
        .ai-examiner-root .score-percent-box { text-align: right; background: rgba(255, 255, 255, .1); border: 1px solid rgba(255, 255, 255, .18); padding: 12px 16px; border-radius: 14px; white-space: nowrap; }
        .ai-examiner-root .score-percent { font-size: 29px; font-weight: 800; letter-spacing: -.04em; color: #fff; }
        .ai-examiner-root .score-percent-label { display: block; font-size: 12px; color: #cbd5e1; }
        .ai-examiner-root .result-section { border: 1px solid var(--line); border-radius: 16px; padding: 18px; background: #fff; }
        .ai-examiner-root .result-section h4 { margin: 0 0 12px; font-size: 18px; letter-spacing: -.025em; font-weight: 750; color: var(--ink); }
        .ai-examiner-root .stack-list { display: flex; flex-direction: column; gap: 12px; }
        .ai-examiner-root .item-card { border: 1px solid var(--line); border-radius: 13px; padding: 14px 16px; background: #fcfdff; }
        .ai-examiner-root .item-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 8px; }
        .ai-examiner-root .item-title { font-weight: 750; font-size: 15px; color: var(--ink); }
        .ai-examiner-root .status-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
        .ai-examiner-root .status-chip.correct, .ai-examiner-root .status-chip.verified { background: var(--green-soft); color: var(--green); }
        .ai-examiner-root .status-chip.partial, .ai-examiner-root .status-chip.adjustment_needed { background: var(--amber-soft); color: var(--amber); }
        .ai-examiner-root .status-chip.incorrect { background: var(--red-soft); color: var(--red); }
        .ai-examiner-root .status-chip.unanswered, .ai-examiner-root .status-chip.unclear, .ai-examiner-root .status-chip.human_review { background: #f2f4f7; color: #475467; }
        .ai-examiner-root .field-row { margin-top: 6px; font-size: 13.5px; line-height: 1.55; color: #344054; }
        .ai-examiner-root .field-row strong { color: var(--ink); }
        .ai-examiner-root .comparison-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 8px; }
        .ai-examiner-root .comparison-box { border: 1px solid var(--line); border-radius: 11px; padding: 12px; background: #fff; font-size: 13.5px; line-height: 1.55; color: #344054; }
        .ai-examiner-root .comparison-box h5 { margin: 0 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); font-weight: 750; }
        .ai-examiner-root .bullet-list { margin: 6px 0 0; padding-left: 18px; font-size: 13.5px; line-height: 1.6; color: #344054; list-style-type: disc; }
        .ai-examiner-root .result-text { white-space: pre-wrap; line-height: 1.65; font-size: 14px; color: #253046; margin: 0; font-family: inherit; }
        .ai-examiner-root details { border: 1px solid var(--line); border-radius: 14px; padding: 12px 15px; background: #fbfcff; }
        .ai-examiner-root details + details { margin-top: 10px; }
        .ai-examiner-root summary { cursor: pointer; font-weight: 700; font-size: 14px; color: var(--ink); }
        .ai-examiner-root .chat-box { display: grid; grid-template-rows: 430px auto; border: 1px solid var(--line); border-radius: 18px; overflow: hidden; background: #fbfcff; }
        .ai-examiner-root .chat-messages { padding: 18px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
        .ai-examiner-root .bubble { max-width: min(740px, 88%); padding: 12px 15px; border-radius: 16px; line-height: 1.6; font-size: 14px; white-space: pre-wrap; word-break: break-word; }
        .ai-examiner-root .bubble.user { align-self: flex-end; background: var(--brand); color: #fff; border-bottom-right-radius: 5px; }
        .ai-examiner-root .bubble.assistant { align-self: flex-start; background: #fff; border: 1px solid var(--line); border-bottom-left-radius: 5px; color: var(--ink); white-space: normal; }
        .ai-examiner-root .bubble.assistant p { margin: 0 0 8px; }
        .ai-examiner-root .bubble.assistant p:last-child { margin-bottom: 0; }
        .ai-examiner-root .bubble.assistant ul { margin: 6px 0 8px; padding-left: 20px; list-style-type: disc; }
        .ai-examiner-root .bubble.assistant ol { margin: 6px 0 8px; padding-left: 20px; list-style-type: decimal; }
        .ai-examiner-root .bubble.assistant li { margin-bottom: 4px; }
        .ai-examiner-root .bubble.assistant h3, .ai-examiner-root .bubble.assistant h4 { margin: 10px 0 6px; font-size: 15px; font-weight: 750; }
        .ai-examiner-root .bubble.assistant pre { overflow-x: auto; background: #f6f7fa; border: 1px solid #eceff4; border-radius: 10px; padding: 12px 14px; margin: 8px 0; }
        .ai-examiner-root .bubble.assistant code { background: #f2f4f7; padding: 2px 5px; border-radius: 5px; font-size: 13px; }
        .ai-examiner-root .chat-empty { margin: auto; text-align: center; color: var(--muted); max-width: 410px; font-size: 14px; line-height: 1.6; }
        .ai-examiner-root .chat-form { display: flex; gap: 10px; padding: 13px; background: #fff; border-top: 1px solid var(--line); }
        .ai-examiner-root .chat-input { flex: 1; resize: none; border: 1px solid var(--line); border-radius: 12px; padding: 11px 13px; min-height: 46px; max-height: 140px; color: var(--ink); background: #fff; }
        .ai-examiner-root .chat-input:focus { outline: 3px solid #dce5ff; border-color: var(--brand); }
        .ai-examiner-root .footnote { margin-top: 16px; color: var(--muted); font-size: 12px; text-align: center; }
        @media (max-width: 820px) {
          .ai-examiner-root .hero,
          .ai-examiner-root .section-head,
          .ai-examiner-root .actions,
          .ai-examiner-root .score-hero { flex-direction: column; align-items: stretch; }
          .ai-examiner-root .upload-grid,
          .ai-examiner-root .comparison-grid { grid-template-columns: 1fr; }
          .ai-examiner-root .panel { padding: 18px; }
          .ai-examiner-root .score-percent-box { text-align: left; }
          .ai-examiner-root .score-percent-label { display: inline; margin-left: 5px; }
        }
      `}</style>

      <main className="shell">
        <header className="hero">
          <div>
            <div className="eyebrow">Your study workspace</div>
            <h1>AI Examiner</h1>
            <p className="sub">
              Ask questions, upload exam papers, and receive detailed feedback
              based on the mark scheme you provide.
            </p>
          </div>
          <div className="secure">
            <span className="dot"></span>Secure server-side AI connection
          </div>
        </header>

        <section className="app" aria-label="AI Examiner application">
          <nav className="tabs" role="tablist" aria-label="AI Examiner tools">
            <button
              className="tab"
              id="chat-tab"
              role="tab"
              aria-selected={activeTab === 'chat'}
              aria-controls="chat-panel"
              type="button"
              onClick={() => setActiveTab('chat')}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />
              </svg>
              Chatbot
            </button>
            <button
              className="tab"
              id="paper-tab"
              role="tab"
              aria-selected={activeTab === 'paper'}
              aria-controls="paper-panel"
              type="button"
              onClick={() => setActiveTab('paper')}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="m9 15 2 2 4-4" />
              </svg>
              Paper Correction
            </button>
          </nav>

          <div
            className={`panel ${activeTab === 'chat' ? 'active' : ''}`}
            id="chat-panel"
            role="tabpanel"
            aria-labelledby="chat-tab"
          >
            <div className="section-head">
              <div>
                <h2>Chatbot</h2>
                <p className="hint">
                  A quick study assistant for explanations, revision, and
                  questions.
                </p>
              </div>
              <span className="tag">Fast responses</span>
            </div>

            <div className="chat-box">
              <div
                className="chat-messages"
                id="chat-messages"
                aria-live="polite"
                ref={chatMessagesRef}
              >
                {chatBubbles.length === 0 ? (
                  <div className="chat-empty" id="chat-empty">
                    Ask a question to get started. You can ask for explanations,
                    worked examples, revision help, or quick checks.
                  </div>
                ) : (
                  chatBubbles.map((bubble) =>
                    bubble.role === 'assistant' && !bubble.isError ? (
                      <div
                        key={bubble.id}
                        className="bubble assistant"
                        dangerouslySetInnerHTML={{
                          __html: renderAssistantMessage(bubble.content),
                        }}
                      />
                    ) : (
                      <div
                        key={bubble.id}
                        className={`bubble ${bubble.role}`}
                        style={bubble.isError ? { color: '#b42318' } : undefined}
                      >
                        {bubble.content}
                      </div>
                    )
                  )
                )}
              </div>
              <form
                className="chat-form"
                id="chat-form"
                onSubmit={handleChatSubmit}
              >
                <textarea
                  ref={chatTextareaRef}
                  className="chat-input"
                  id="chat-input"
                  rows={1}
                  placeholder="Ask your question..."
                  aria-label="Your message"
                  required
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleChatSubmit(e);
                    }
                  }}
                />
                <button
                  className="primary"
                  id="chat-send"
                  type="submit"
                  disabled={chatSending}
                >
                  {chatSending ? 'Thinking…' : 'Send'}
                </button>
              </form>
            </div>
          </div>

          <div
            className={`panel ${activeTab === 'paper' ? 'active' : ''}`}
            id="paper-panel"
            role="tabpanel"
            aria-labelledby="paper-tab"
          >
            <div className="section-head">
              <div>
                <h2>Paper Correction</h2>
                <p className="hint">
                  Upload one or two answer PDFs and the official mark scheme
                  PDF. Every page is transcribed first, then marked against the
                  scheme and checked in a second pass.
                </p>
              </div>
              <span className="tag">Detailed marking + review</span>
            </div>

            <form id="correction-form" onSubmit={handleCorrectionSubmit}>
              <div className="upload-grid">
                <label className="upload-card" htmlFor="answer1">
                  <span className="upload-icon">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M14 2v6h6" />
                    </svg>
                  </span>
                  <span className="upload-title">Answer Paper 1 *</span>
                  <span className="upload-copy">
                    Upload the first PDF containing your answers. Handwriting is
                    supported; unclear words will be flagged.
                  </span>
                  <span className="file-pick">
                    <input
                      id="answer1"
                      name="answer1"
                      type="file"
                      accept="application/pdf,.pdf"
                      required
                      onChange={(e) =>
                        setAnswer1File(e.target.files?.[0] || null)
                      }
                    />
                    <div className="file-name" id="answer1-name">
                      {answer1File ? `Selected: ${answer1File.name}` : ''}
                    </div>
                  </span>
                </label>

                <label className="upload-card" htmlFor="answer2">
                  <span className="upload-icon">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M14 2v6h6" />
                      <path d="M12 18v-6" />
                      <path d="M9 15h6" />
                    </svg>
                  </span>
                  <span className="upload-title">Answer Paper 2</span>
                  <span className="upload-copy">
                    Optional second PDF if your answers continue in another file
                    or scan.
                  </span>
                  <span className="file-pick">
                    <input
                      id="answer2"
                      name="answer2"
                      type="file"
                      accept="application/pdf,.pdf"
                      onChange={(e) =>
                        setAnswer2File(e.target.files?.[0] || null)
                      }
                    />
                    <div className="file-name" id="answer2-name">
                      {answer2File ? `Selected: ${answer2File.name}` : ''}
                    </div>
                  </span>
                </label>

                <label className="upload-card" htmlFor="markscheme">
                  <span className="upload-icon">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M9 11l3 3L22 4" />
                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                    </svg>
                  </span>
                  <span className="upload-title">Mark Scheme *</span>
                  <span className="upload-copy">
                    Upload the official mark scheme PDF that should be used to
                    assess your answers.
                  </span>
                  <span className="file-pick">
                    <input
                      id="markscheme"
                      name="markscheme"
                      type="file"
                      accept="application/pdf,.pdf"
                      required
                      onChange={(e) =>
                        setMarkschemeFile(e.target.files?.[0] || null)
                      }
                    />
                    <div className="file-name" id="markscheme-name">
                      {markschemeFile ? `Selected: ${markschemeFile.name}` : ''}
                    </div>
                  </span>
                </label>
              </div>

              <div className="actions">
                <p className="hint">
                  Limits: PDF files only, up to 15 MB and 20 pages per file.
                </p>
                <button
                  className="primary"
                  id="correct-button"
                  type="submit"
                  disabled={correcting}
                >
                  {correcting ? 'Processing…' : 'Transcribe & correct papers'}
                </button>
              </div>
            </form>

            <div
              className={`status ${statusMessage ? 'show' : ''} ${
                statusError ? 'error' : ''
              }`}
              id="correction-status"
              role="status"
              aria-live="polite"
            >
              {statusMessage}
            </div>

            <section
              ref={correctionResultsRef}
              className={`results ${correctionResult ? 'show' : ''}`}
              id="correction-results"
              aria-live="polite"
            >
              {correctionResult && (
                <>
                  <div className="notice" id="result-notice">
                    {correctionResult.notice}
                  </div>

                  {renderStructuredResults()}

                  <div className="result-section">
                    <h4>Full PDF Transcriptions</h4>
                    <details>
                      <summary>Full PDF transcriptions</summary>
                      <div id="transcript-outputs" style={{ marginTop: 12 }}>
                        {correctionResult.transcripts.map((item, idx) => (
                          <details key={`${item.label}-${idx}`}>
                            <summary>
                              {item.label} — full OCR transcription
                            </summary>
                            <pre className="result-text">{item.text}</pre>
                          </details>
                        ))}
                      </div>
                    </details>
                  </div>
                </>
              )}
            </section>
          </div>
        </section>

        <p className="footnote">
          AI-generated feedback can contain mistakes. Always review unclear
          handwriting and important marks against the original document.
        </p>
      </main>
    </div>
  );
};
