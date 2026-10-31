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

interface CorrectionResponseData {
  notice: string;
  marking: string;
  audit: string;
  transcripts: TranscriptItem[];
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
          --red: #b42318;
          --shadow: 0 16px 48px rgba(31, 48, 88, .08);
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: var(--ink);
        }
        .ai-examiner-root * { box-sizing: border-box; }
        .ai-examiner-root button,
        .ai-examiner-root input,
        .ai-examiner-root textarea { font: inherit; }
        .ai-examiner-root .shell { width: min(1120px, 100%); margin: 12px auto 48px; }
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
        .ai-examiner-root .upload-copy { font-size: 12px; color: var(--muted); line-height: 1.45; }
        .ai-examiner-root .file-pick { margin-top: auto; padding-top: 14px; }
        .ai-examiner-root .file-pick input { width: 100%; font-size: 12px; color: var(--muted); }
        .ai-examiner-root .file-pick input::file-selector-button { border: 1px solid var(--line); background: #fff; color: var(--ink); border-radius: 8px; padding: 7px 9px; margin-right: 8px; cursor: pointer; font-weight: 650; }
        .ai-examiner-root .file-name { margin-top: 8px; color: var(--green); font-size: 12px; overflow-wrap: anywhere; font-weight: 600; }
        .ai-examiner-root .controls { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; margin-top: 20px; }
        .ai-examiner-root .small-note { color: var(--muted); font-size: 12px; line-height: 1.5; max-width: 560px; margin: 0; }
        .ai-examiner-root .primary { border: 0; background: var(--brand); color: white; border-radius: 11px; padding: 12px 18px; font-weight: 750; cursor: pointer; box-shadow: 0 5px 14px rgba(49,86,216,.18); transition: .15s ease; font-size: 14px; }
        .ai-examiner-root .primary:hover { background: var(--brand-dark); transform: translateY(-1px); }
        .ai-examiner-root .primary:disabled { opacity: .55; cursor: not-allowed; transform: none; }
        .ai-examiner-root .status { display: none; border-radius: 12px; margin-top: 18px; padding: 13px 15px; background: #f2f5ff; color: #344b9a; font-size: 13px; line-height: 1.5; }
        .ai-examiner-root .status.show { display: block; }
        .ai-examiner-root .status.error { color: var(--red); background: #fff4f2; }
        .ai-examiner-root .results { display: none; margin-top: 24px; }
        .ai-examiner-root .results.show { display: block; }
        .ai-examiner-root .results h3 { margin: 0 0 10px; font-size: 17px; font-weight: 750; color: var(--ink); }
        .ai-examiner-root .notice { background: #fff9e9; border: 1px solid #f6e5b5; color: #765a16; border-radius: 12px; padding: 12px 14px; font-size: 13px; line-height: 1.5; margin-bottom: 15px; }
        .ai-examiner-root details { border: 1px solid var(--line); border-radius: 12px; margin: 10px 0; background: #fff; overflow: hidden; }
        .ai-examiner-root summary { cursor: pointer; list-style: none; padding: 14px 16px; font-weight: 750; display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--ink); font-size: 14px; }
        .ai-examiner-root summary::-webkit-details-marker { display: none; }
        .ai-examiner-root summary::after { content: "+"; color: var(--brand); font-size: 20px; line-height: 1; }
        .ai-examiner-root details[open] summary::after { content: "−"; }
        .ai-examiner-root .result-text { margin: 0; border-top: 1px solid var(--line); padding: 16px; white-space: pre-wrap; overflow-wrap: anywhere; font: 13px/1.65 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #273247; max-height: 640px; overflow: auto; background: #fcfdff; }
        .ai-examiner-root .chat-wrap { display: flex; flex-direction: column; height: min(660px, 72vh); min-height: 470px; }
        .ai-examiner-root .chat-intro { padding-bottom: 15px; }
        .ai-examiner-root .chat-messages { flex: 1; overflow-y: auto; border: 1px solid var(--line); background: #fbfcff; border-radius: 15px; padding: 18px; }
        .ai-examiner-root .empty { height: 100%; min-height: 220px; display: grid; place-content: center; text-align: center; color: var(--muted); gap: 8px; }
        .ai-examiner-root .empty strong { color: var(--ink); font-size: 17px; }
        .ai-examiner-root .bubble { max-width: min(780px, 92%); width: fit-content; padding: 12px 14px; margin: 0 0 12px; border-radius: 14px; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.55; font-size: 14px; }
        .ai-examiner-root .bubble.user { background: var(--brand); color: white; margin-left: auto; border-bottom-right-radius: 4px; }
        .ai-examiner-root .bubble.assistant { background: white; border: 1px solid var(--line); color: var(--ink); border-bottom-left-radius: 4px; }
        .ai-examiner-root .chat-form { display: flex; gap: 10px; margin-top: 13px; }
        .ai-examiner-root .chat-form textarea { flex: 1; min-height: 52px; max-height: 140px; resize: vertical; border: 1px solid #d8deea; border-radius: 12px; padding: 14px; outline: none; background: #fff; color: var(--ink); font-size: 14px; }
        .ai-examiner-root .chat-form textarea:focus { border-color: var(--brand); box-shadow: 0 0 0 3px #e8edff; }
        .ai-examiner-root .footer-note { color: #98a2b3; font-size: 11px; text-align: center; margin: 16px 0 0; }
        @media (max-width: 760px) {
          .ai-examiner-root .shell { width: 100%; margin: 12px auto 34px; }
          .ai-examiner-root .hero { align-items: start; flex-direction: column; }
          .ai-examiner-root .secure { white-space: normal; }
          .ai-examiner-root .panel { padding: 17px; }
          .ai-examiner-root .upload-grid { grid-template-columns: 1fr; }
          .ai-examiner-root .upload-card { min-height: 155px; }
          .ai-examiner-root .section-head { flex-direction: column; }
          .ai-examiner-root .tag { white-space: normal; }
          .ai-examiner-root .chat-wrap { height: 70vh; min-height: 430px; }
          .ai-examiner-root .chat-form { flex-direction: column; }
          .ai-examiner-root .chat-form .primary { width: 100%; }
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
            <span className="dot"></span> Secure server-side AI connection
          </div>
        </header>

        <section className="app" aria-label="AI Examiner application">
          <nav className="tabs" role="tablist" aria-label="AI Examiner tools">
            <button
              type="button"
              className="tab"
              id="chat-tab"
              role="tab"
              aria-selected={activeTab === 'chat'}
              aria-controls="chat-panel"
              onClick={() => setActiveTab('chat')}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l-1-4v-3.5A7.5 7.5 0 0 1 11.5 4h1A7.5 7.5 0 0 1 20 11.5Z" />
                <path
                  d="M8 11h.01M12 11h.01M16 11h.01"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
              Chatbot
            </button>
            <button
              type="button"
              className="tab"
              id="paper-tab"
              role="tab"
              aria-selected={activeTab === 'paper'}
              aria-controls="paper-panel"
              onClick={() => setActiveTab('paper')}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z" />
                <path d="M14 3.5v5h4M8 13h8M8 16.5h8" />
              </svg>
              Paper Correction
            </button>
          </nav>

          {/* CHATBOT PANEL */}
          <section
            className={`panel ${activeTab === 'chat' ? 'active' : ''}`}
            id="chat-panel"
            role="tabpanel"
            aria-labelledby="chat-tab"
          >
            <div className="chat-wrap">
              <div className="chat-intro">
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
              </div>

              <div
                className="chat-messages"
                id="chat-messages"
                aria-live="polite"
                ref={chatMessagesRef}
              >
                {chatBubbles.length === 0 ? (
                  <div className="empty" id="chat-empty">
                    <strong>What are you studying today?</strong>
                    <span>Send a question to start a conversation.</span>
                  </div>
                ) : (
                  chatBubbles.map((bubble) => (
                    <div
                      key={bubble.id}
                      className={`bubble ${bubble.role}`}
                      style={
                        bubble.isError ? { color: '#b42318' } : undefined
                      }
                    >
                      {bubble.content}
                    </div>
                  ))
                )}
              </div>

              <form
                className="chat-form"
                id="chat-form"
                onSubmit={handleChatSubmit}
              >
                <textarea
                  ref={chatTextareaRef}
                  id="chat-input"
                  placeholder="Ask your question..."
                  aria-label="Your message"
                  maxLength={4000}
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
          </section>

          {/* PAPER CORRECTION PANEL */}
          <section
            className={`panel ${activeTab === 'paper' ? 'active' : ''}`}
            id="paper-panel"
            role="tabpanel"
            aria-labelledby="paper-tab"
          >
            <div className="section-head">
              <div>
                <h2>Paper Correction</h2>
                <p className="hint">
                  Upload your answer PDFs and the corresponding mark scheme. The
                  system transcribes each PDF before marking.
                </p>
              </div>
              <span className="tag">Detailed marking + audit</span>
            </div>

            <form id="correction-form" onSubmit={handleCorrectionSubmit}>
              <div className="upload-grid">
                <label className="upload-card" htmlFor="answer1">
                  <span className="upload-icon">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z" />
                      <path d="M14 3.5v5h4M8 13h8M8 16.5h5" />
                    </svg>
                  </span>
                  <span className="upload-title">
                    Answer Paper 1 <span aria-hidden="true">*</span>
                  </span>
                  <span className="upload-copy">
                    Upload the first PDF containing your answers. Handwritten
                    work is supported, but unclear writing may need checking.
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
                  </span>
                  <span className="file-name" id="answer1-name">
                    {answer1File ? `Selected: ${answer1File.name}` : ''}
                  </span>
                </label>

                <label className="upload-card" htmlFor="answer2">
                  <span className="upload-icon">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z" />
                      <path d="M14 3.5v5h4M8 13h8M8 16.5h5" />
                    </svg>
                  </span>
                  <span className="upload-title">Answer Paper 2</span>
                  <span className="upload-copy">
                    Optional second answer PDF. It will be combined with Answer
                    Paper 1 in the order supplied.
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
                  </span>
                  <span className="file-name" id="answer2-name">
                    {answer2File ? `Selected: ${answer2File.name}` : ''}
                  </span>
                </label>

                <label className="upload-card" htmlFor="markscheme">
                  <span className="upload-icon">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z" />
                      <path d="M14 3.5v5h4M8 13h8M8 16.5h8" />
                    </svg>
                  </span>
                  <span className="upload-title">
                    Mark Scheme <span aria-hidden="true">*</span>
                  </span>
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
                  </span>
                  <span className="file-name" id="markscheme-name">
                    {markschemeFile ? `Selected: ${markschemeFile.name}` : ''}
                  </span>
                </label>
              </div>

              <div className="controls">
                <p className="small-note">
                  PDF only · Maximum 15 MB and 20 pages per file. For best
                  results, use clear scans with every page upright and fully
                  visible. Your files are sent for processing and the temporary
                  OpenAI file copies are deleted afterward.
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
            >
              <h3>Correction report</h3>
              <div className="notice" id="result-notice">
                {correctionResult?.notice}
              </div>
              <details open>
                <summary>Marking report</summary>
                <pre className="result-text" id="marking-output">
                  {correctionResult?.marking}
                </pre>
              </details>
              <details>
                <summary>Independent verification</summary>
                <pre className="result-text" id="audit-output">
                  {correctionResult?.audit}
                </pre>
              </details>
              <div id="transcript-outputs">
                {correctionResult?.transcripts.map((item, idx) => (
                  <details key={idx}>
                    <summary>{item.label} — full OCR transcription</summary>
                    <pre className="result-text">{item.text}</pre>
                  </details>
                ))}
              </div>
            </section>
          </section>
        </section>

        <p className="footer-note">
          AI-generated feedback can contain mistakes. Always review unclear
          handwriting and important marks against the original document.
        </p>
      </main>
    </div>
  );
};
