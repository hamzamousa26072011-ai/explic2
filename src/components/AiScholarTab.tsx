import React, { useState, useRef } from 'react';
import {
  Upload,
  Download,
  Copy,
  Check,
  FileText,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Send,
  History,
  Plus,
  Trash2,
  Camera,
  Paperclip,
  BookOpen,
  Globe,
  X,
  Eye,
  ZoomIn,
  ZoomOut,
  RotateCw,
  ExternalLink,
} from 'lucide-react';
import {
  ExamBoard,
  ExaminerEvaluationResult,
  QualificationLevel,
  ThemeMode,
} from '../types';
import { PAST_PAPER_CATALOG } from '../utils/initialData';
import { generateAnnotatedExaminerPdfBytes } from '../utils/examinerPdfAnnotator';

interface AttachedFileItem {
  id: string;
  name: string;
  size: number;
  type: 'pdf' | 'image' | 'text';
  role: 'student_script' | 'mark_scheme' | 'question_paper';
  pdfBytes?: Uint8Array;
  pdfBase64?: string;
  imageBase64?: string;
  textContent?: string;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function inferDocumentRole(
  name: string,
  text = ''
): 'student_script' | 'mark_scheme' | 'question_paper' {
  const lower = `${name} ${text.slice(0, 300)}`.toLowerCase();
  if (
    lower.includes('mark scheme') ||
    lower.includes('markscheme') ||
    lower.includes('_ms') ||
    lower.includes('-ms') ||
    lower.includes('rubric')
  ) {
    return 'mark_scheme';
  }
  if (
    lower.includes('question paper') ||
    lower.includes('_qp') ||
    lower.includes('-qp')
  ) {
    return 'question_paper';
  }
  return 'student_script';
}

interface AiScholarTabProps {
  theme: ThemeMode;
  onTriggerSecurityLockdown: (input: string, action: string) => boolean;
  onAwardFocusXp: (xpAmount: number) => void;
}

interface ChatSessionItem {
  id: string;
  title: string;
  subject: string;
  createdAt: string;
  messages: Array<{
    id: string;
    role: 'user' | 'examiner';
    text: string;
    evaluation?: ExaminerEvaluationResult | null;
  }>;
}

const SUBJECT_OPTIONS = [
  'Auto-Detect Subject',
  'Physics',
  'Chemistry',
  'Mathematics',
  'Biology',
  'Computer Science',
];

export const AiScholarTab: React.FC<AiScholarTabProps> = ({
  theme,
  onTriggerSecurityLockdown,
  onAwardFocusXp,
}) => {
  const isLight = theme === 'warm';

  // Layout & Sidebar state matching reference design
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<string>(
    'Auto-Detect Subject'
  );
  const [board, setBoard] = useState<ExamBoard>('General / All Curricula');
  const [qualification] = useState<QualificationLevel>('All Levels');
  const [reasoningEngine, setReasoningEngine] = useState<
    'deepseek-r1' | 'gemini-vision'
  >('deepseek-r1');

  // Sessions state
  const [sessions, setSessions] = useState<ChatSessionItem[]>([
    {
      id: 'session-1',
      title: 'Starting...',
      subject: 'Auto-Detect Subject',
      createdAt: 'Just now',
      messages: [],
    },
  ]);
  const [activeSessionId, setActiveSessionId] = useState<string>('session-1');

  const [attachedFiles, setAttachedFiles] = useState<AttachedFileItem[]>([]);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [draftPasteText, setDraftPasteText] = useState('');

  // File Preview Modal state
  const [previewModal, setPreviewModal] = useState<{
    isOpen: boolean;
    title: string;
    fileType: 'pdf' | 'image' | 'text';
    url?: string | null;
    imageBase64?: string | null;
    textContent?: string;
    fileSizeStr?: string;
  }>({
    isOpen: false,
    title: '',
    fileType: 'text',
  });
  const [imageZoom, setImageZoom] = useState(1);
  const [imageRotation, setImageRotation] = useState(0);

  // Evaluation & Chat state
  const [inputPrompt, setInputPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeOutputView, setActiveOutputView] = useState<
    'outputA' | 'outputOCR' | 'outputB' | 'outputC' | 'outputD'
  >('outputA');
  const [copiedWhatsApp, setCopiedWhatsApp] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const dropzoneInputRef = useRef<HTMLInputElement | null>(null);

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) || sessions[0];

  const resolvedSubject =
    selectedSubject === 'Auto-Detect Subject' ? 'Physics' : selectedSubject;

  const totalBytesSize = attachedFiles.reduce((acc, f) => acc + f.size, 0);

  const formatBytes = (bytes: number) => {
    if (bytes <= 0) return '0 B / 100 MB';
    if (bytes < 1024) return `${bytes} B / 100 MB`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB / 100 MB`;
    return `${(bytes / 1048576).toFixed(2)} MB / 100 MB`;
  };

  const handleStartNewChat = () => {
    const newId = `session-${Date.now()}`;
    const newSession: ChatSessionItem = {
      id: newId,
      title: 'Starting...',
      subject: selectedSubject,
      createdAt: 'Just now',
      messages: [],
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newId);
    setInputPrompt('');
  };

  const handleClearCurrentSession = () => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSession.id
          ? { ...s, title: 'Starting...', messages: [] }
          : s
      )
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newItems: AttachedFileItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const id = `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      const lowerFileName = file.name.toLowerCase();
      if (
        file.type === 'application/pdf' ||
        lowerFileName.endsWith('.pdf')
      ) {
        const arrayBuf = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuf);
        newItems.push({
          id,
          name: file.name,
          size: file.size,
          type: 'pdf',
          role: inferDocumentRole(file.name),
          pdfBytes: bytes,
          pdfBase64: uint8ArrayToBase64(bytes),
        });
      } else if (
        file.type.startsWith('image/') ||
        /\.(png|jpe?g|webp|gif|bmp)$/i.test(lowerFileName)
      ) {
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.readAsDataURL(file);
        });
        newItems.push({
          id,
          name: file.name,
          size: file.size,
          type: 'image',
          role: inferDocumentRole(file.name),
          imageBase64: base64,
        });
      } else {
        const text = await file.text();
        newItems.push({
          id,
          name: file.name,
          size: file.size,
          type: 'text',
          role: inferDocumentRole(file.name, text),
          textContent: text,
        });
      }
    }

    setAttachedFiles((prev) => [...prev, ...newItems]);
    if (dropzoneInputRef.current) dropzoneInputRef.current.value = '';
  };

  const handleChangeFileRole = (
    id: string,
    role: 'student_script' | 'mark_scheme' | 'question_paper'
  ) => {
    setAttachedFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, role } : f))
    );
  };

  const handleSaveDirectPaste = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftPasteText.trim()) {
      setShowPasteModal(false);
      return;
    }
    const id = `file-${Date.now()}`;
    const trimmed = draftPasteText.trim();
    const role = inferDocumentRole('Pasted Document', trimmed);
    const newItem: AttachedFileItem = {
      id,
      name:
        role === 'mark_scheme'
          ? `Mark Scheme Notes (${new Date().toLocaleTimeString()}).txt`
          : `Student Script Working (${new Date().toLocaleTimeString()}).txt`,
      size: new Blob([trimmed]).size,
      type: 'text',
      role,
      textContent: trimmed,
    };
    setAttachedFiles((prev) => [...prev, newItem]);
    setDraftPasteText('');
    setShowPasteModal(false);
  };

  const handleRemoveFileItem = (id: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleClearAllAttachedDocuments = () => {
    setAttachedFiles([]);
    if (dropzoneInputRef.current) dropzoneInputRef.current.value = '';
  };

  const handlePreviewFileItem = (item: AttachedFileItem) => {
    if (item.type === 'pdf' && item.pdfBytes) {
      const blob = new Blob([new Uint8Array(item.pdfBytes)], {
        type: 'application/pdf',
      });
      const url = URL.createObjectURL(blob);
      setPreviewModal({
        isOpen: true,
        title: item.name,
        fileType: 'pdf',
        url,
        fileSizeStr: formatBytes(item.size),
      });
    } else if (item.type === 'image' && item.imageBase64) {
      setPreviewModal({
        isOpen: true,
        title: item.name,
        fileType: 'image',
        imageBase64: item.imageBase64,
        fileSizeStr: formatBytes(item.size),
      });
    } else if (item.type === 'text' && item.textContent) {
      setPreviewModal({
        isOpen: true,
        title: item.name,
        fileType: 'text',
        textContent: item.textContent,
        fileSizeStr: formatBytes(item.size),
      });
    }
  };

  const handlePreviewSampleOrFirst = () => {
    if (attachedFiles.length > 0) {
      handlePreviewFileItem(attachedFiles[0]);
    } else {
      const sample =
        PAST_PAPER_CATALOG.find(
          (p) => p.subject.toLowerCase() === resolvedSubject.toLowerCase()
        ) || PAST_PAPER_CATALOG[0];
      setPreviewModal({
        isOpen: true,
        title: `${sample.board} ${sample.subject} - ${sample.paperComponent} (Sample Preview)`,
        fileType: 'text',
        textContent: `STUDENT SCRIPT:\n${sample.sampleStudentScript}\n\nOFFICIAL MARK SCHEME:\n${sample.sampleMarkScheme}`,
        fileSizeStr: 'Sample Document',
      });
    }
  };

  const handleClosePreviewModal = () => {
    if (previewModal.url && previewModal.url.startsWith('blob:')) {
      URL.revokeObjectURL(previewModal.url);
    }
    setPreviewModal({ isOpen: false, title: '', fileType: 'text' });
    setImageZoom(1);
    setImageRotation(0);
  };

  const handlePreviewAnnotatedPdf = async (
    evaluation: ExaminerEvaluationResult
  ) => {
    try {
      const studentPdfBytes =
        attachedFiles.find(
          (f) => f.type === 'pdf' && f.role === 'student_script'
        )?.pdfBytes || attachedFiles.find((f) => f.type === 'pdf')?.pdfBytes;
      let pdfBytes: Uint8Array;
      if (evaluation.annotatedPdfBase64) {
        const binaryString = atob(evaluation.annotatedPdfBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        pdfBytes = bytes;
      } else {
        pdfBytes = await generateAnnotatedExaminerPdfBytes(
          evaluation,
          studentPdfBytes
        );
      }
      const blob = new Blob([new Uint8Array(pdfBytes)], {
        type: 'application/pdf',
      });
      const url = URL.createObjectURL(blob);
      setPreviewModal({
        isOpen: true,
        title: `Annotated_${evaluation.subject}_Examiner_Script.pdf`,
        fileType: 'pdf',
        url,
        fileSizeStr: `${(pdfBytes.byteLength / 1024).toFixed(1)} KB`,
      });
    } catch {
      // Graceful fallback
    }
  };

  const handleExecuteExaminerAction = async (
    customPrompt?: string,
    forceFullEvaluation = false
  ) => {
    const textToUse = (customPrompt ?? inputPrompt).trim();

    const studentTextFiles = attachedFiles
      .filter(
        (f) => f.type === 'text' && f.role !== 'mark_scheme' && f.textContent
      )
      .map((f) => `--- STUDENT FILE: ${f.name} ---\n${f.textContent}`)
      .join('\n\n');

    const markSchemeTextFiles = attachedFiles
      .filter(
        (f) => f.type === 'text' && f.role === 'mark_scheme' && f.textContent
      )
      .map((f) => `--- MARK SCHEME FILE: ${f.name} ---\n${f.textContent}`)
      .join('\n\n');

    const firstImage = attachedFiles.find(
      (f) => f.type === 'image'
    )?.imageBase64;

    const isQuickActionInstruction =
      Boolean(customPrompt) &&
      /^(?:Key Points|Check my answer|Identify mistakes|Evaluate attached|Grade vs|Pinpoint Lost|Provide a 100%|Perform OCR)/i.test(
        customPrompt || ''
      );

    // NEVER inject hardcoded sample scripts or sample mark schemes when the user interacts or uploads files
    const combinedWorking = [
      studentTextFiles,
      !isQuickActionInstruction && textToUse ? textToUse : '',
    ]
      .filter(Boolean)
      .join('\n\n')
      .trim();

    const combinedMarkScheme = markSchemeTextFiles.trim();

    if (
      onTriggerSecurityLockdown(
        `${textToUse} ${studentTextFiles} ${markSchemeTextFiles}`,
        'AI Tutor & Examiner Input'
      )
    ) {
      return;
    }

    const userDisplayMessage =
      textToUse ||
      (attachedFiles.length > 0
        ? `Evaluate ${attachedFiles.length} attached document(s) (${attachedFiles
            .map((f) => `${f.name} [${f.role.replace('_', ' ')}]`)
            .join(', ')}) using Gemini Vision OCR & 3-Pass Mark Scheme comparison.`
        : 'Evaluate my submission with Gemini Principal Examiner.');

    const userMsgId = `msg-${Date.now()}`;
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSession.id
          ? {
              ...s,
              title:
                s.title === 'Starting...'
                  ? userDisplayMessage.slice(0, 28)
                  : s.title,
              messages: [
                ...s.messages,
                { id: userMsgId, role: 'user', text: userDisplayMessage },
              ],
            }
          : s
      )
    );
    if (!customPrompt) setInputPrompt('');

    // If user clicked a quick action or evaluate button with zero files and no student working/question, ask them to attach or type their question/working
    if (
      attachedFiles.length === 0 &&
      !combinedWorking &&
      (forceFullEvaluation || isQuickActionInstruction)
    ) {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSession.id
            ? {
                ...s,
                messages: [
                  ...s.messages,
                  {
                    id: `msg-${Date.now()}-prompt-needed`,
                    role: 'examiner',
                    text: 'Please attach your **Student Script PDF / handwritten photo** and **Official Mark Scheme PDF** on the left panel (or paste/type your question and working in the message box below), then click **Evaluate Documents** so Gemini can perform real OCR transcription and mark your paper.',
                  },
                ],
              }
            : s
        )
      );
      return;
    }

    setIsProcessing(true);

    try {
      const shouldRunEvaluation =
        forceFullEvaluation ||
        attachedFiles.length > 0 ||
        (Boolean(combinedWorking) &&
          /mark|scheme|lost|evaluate|check|mistake|grade|score|point|ocr|transcri|correct/i.test(
            userDisplayMessage
          ));

      const serializedAttachedFiles = attachedFiles.map((f) => ({
        name: f.name,
        type: f.type,
        role: f.role,
        base64Data:
          f.type === 'image'
            ? f.imageBase64
            : f.type === 'pdf'
            ? f.pdfBase64
            : undefined,
        textContent: f.textContent,
      }));

      if (shouldRunEvaluation) {
        const res = await fetch('/api/scholar/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'evaluate',
            board,
            qualification,
            subject: selectedSubject,
            syllabusCode: '',
            paperComponent: 'Examination Paper',
            variant: '',
            session: '2025/2026',
            studentSubmissionText: combinedWorking,
            markSchemeText: combinedMarkScheme,
            userPrompt: textToUse,
            imageBase64: firstImage || null,
            attachedFiles: serializedAttachedFiles,
            reasoningEngine,
          }),
        });

        const data = await res.json().catch(() => null);
        if (res.ok && data && Array.isArray(data.ledger)) {
          const result: ExaminerEvaluationResult = data;
          onAwardFocusXp(120);
          setActiveOutputView('outputA');
          setSessions((prev) =>
            prev.map((s) =>
              s.id === activeSession.id
                ? {
                    ...s,
                    messages: [
                      ...s.messages,
                      {
                        id: `msg-${Date.now()}-eval`,
                        role: 'examiner',
                        text: `Completed Gemini Handwriting OCR Transcription & 3-Pass Mark Scheme Comparison for ${result.board} ${result.subject} (${result.paperComponent}). Final Score: ${result.totalAwarded}/${result.totalAvailable} (${result.percentage}%) — Provisional Grade: ${result.provisionalGrade}.`,
                        evaluation: result,
                      },
                    ],
                  }
                : s
            )
          );
        } else {
          const errMsg =
            data?.error ||
            'Gemini Examiner could not process the request. Please ensure your PDF/image files are readable and try again.';
          setSessions((prev) =>
            prev.map((s) =>
              s.id === activeSession.id
                ? {
                    ...s,
                    messages: [
                      ...s.messages,
                      {
                        id: `msg-${Date.now()}-err`,
                        role: 'examiner',
                        text: `Examiner Error: ${errMsg}`,
                      },
                    ],
                  }
                : s
            )
          );
        }
      } else {
        const res = await fetch('/api/scholar/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'tutor_chat',
            board,
            qualification,
            subject: resolvedSubject,
            syllabusCode: '',
            reasoningEngine,
            prompt: userDisplayMessage,
            attachedFiles: serializedAttachedFiles,
          }),
        });

        const data = await res.json().catch(() => null);
        if (res.ok && data?.reply) {
          setSessions((prev) =>
            prev.map((s) =>
              s.id === activeSession.id
                ? {
                    ...s,
                    messages: [
                      ...s.messages,
                      {
                        id: `msg-${Date.now()}-reply`,
                        role: 'examiner',
                        text: data.reply,
                      },
                    ],
                  }
                : s
            )
          );
        } else {
          setSessions((prev) =>
            prev.map((s) =>
              s.id === activeSession.id
                ? {
                    ...s,
                    messages: [
                      ...s.messages,
                      {
                        id: `msg-${Date.now()}-err`,
                        role: 'examiner',
                        text:
                          data?.error ||
                          'Failed to receive response from Gemini Examiner.',
                      },
                    ],
                  }
                : s
            )
          );
        }
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadAnnotatedPdf = async (
    evaluation: ExaminerEvaluationResult
  ) => {
    const firstPdfBytes = attachedFiles.find((f) => f.type === 'pdf')?.pdfBytes;
    const pdfBytes = await generateAnnotatedExaminerPdfBytes(
      evaluation,
      firstPdfBytes
    );
    const blob = new Blob([new Uint8Array(pdfBytes)], {
      type: 'application/pdf',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Explic_Annotated_${evaluation.subject.replace(
      /\s+/g,
      '_'
    )}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyWhatsApp = (summary: string) => {
    navigator.clipboard.writeText(summary).catch(() => {});
    setCopiedWhatsApp(true);
    setTimeout(() => setCopiedWhatsApp(false), 2000);
  };

  // Theme-consistent surface tokens
  const cardSurface = isLight
    ? 'bg-white border-[#E2E8F0] text-[#0F172A] shadow-[0_1px_2px_rgba(15,23,42,0.03)]'
    : 'bg-[#111827] border-white/10 text-[#F8FAFC]';
  const subtleSurface = isLight
    ? 'bg-[#F8FAFC] border-[#E2E8F0] text-[#0F172A]'
    : 'bg-[#090D16] border-white/10 text-[#F8FAFC]';
  const mutedText = isLight ? 'text-[#64748B]' : 'text-[#94A3B8]';
  const primaryBtn = isLight
    ? 'bg-[#0F172A] hover:bg-[#1E293B] text-white'
    : 'bg-[#6366F1] hover:bg-[#4F46E5] text-white';
  const outlineBtn = isLight
    ? 'bg-white border-[#E2E8F0] text-[#0F172A] hover:bg-[#F8FAFC]'
    : 'bg-[#111827] border-white/10 text-[#F8FAFC] hover:bg-white/5';

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Top Header matching reference image */}
      <header className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 pb-5 border-b border-current/10">
        <div className="space-y-2 max-w-2xl">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              AI Examiner
            </h1>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px] font-bold tracking-wider uppercase ${
                isLight
                  ? 'bg-[#F8FAFC] border-[#E2E8F0] text-[#0F172A]'
                  : 'bg-[#6366F1]/15 border-[#6366F1]/40 text-indigo-300'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isLight ? 'bg-[#0F172A]' : 'bg-[#6366F1]'
                }`}
              />
              AI EXAMINER &amp; TUTOR
            </span>
          </div>
          <p className={`text-xs leading-relaxed ${mutedText}`}>
            Academic examiner and tutor for all students, subjects, and
            examination systems. Attach exam questions, past papers,
            worksheets, or photos of your handwritten working to analyze
            documents, evaluate marks, and receive step-by-step model answers.
          </p>
        </div>

        {/* Right Header Controls: Hide Sidebar + New Chat */}
        <div className="flex items-center gap-2.5 shrink-0 self-start lg:self-center">
          <button
            type="button"
            onClick={() => setSidebarHidden((h) => !h)}
            className={`px-3.5 py-2 rounded-full border text-xs font-semibold inline-flex items-center gap-1.5 transition-all ${outlineBtn}`}
          >
            <History className="w-3.5 h-3.5 opacity-70" />
            {sidebarHidden ? 'Show Sidebar' : 'Hide Sidebar'}
          </button>

          <button
            type="button"
            onClick={handleStartNewChat}
            className={`px-4 py-2 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-all ${primaryBtn}`}
          >
            <Plus className="w-3.5 h-3.5" />
            New Chat
          </button>
        </div>
      </header>

      {/* Main 3-Column Workspace matching reference image */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch min-h-[640px]">
        {/* COLUMN 1: HISTORY PANEL (2 cols when visible) */}
        {!sidebarHidden && (
          <aside
            className={`lg:col-span-2 rounded-2xl border p-4 flex flex-col justify-between ${cardSurface}`}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2.5 border-b border-current/10">
                <span
                  className={`text-[11px] font-bold tracking-wider uppercase flex items-center gap-1.5 ${mutedText}`}
                >
                  <History className="w-3.5 h-3.5" />
                  HISTORY
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono-tabular font-semibold ${
                    isLight
                      ? 'bg-slate-100 text-slate-700'
                      : 'bg-white/10 text-slate-300'
                  }`}
                >
                  {sessions.length}
                </span>
              </div>

              <button
                type="button"
                onClick={handleStartNewChat}
                className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${primaryBtn}`}
              >
                <Plus className="w-3.5 h-3.5" />
                New chat
              </button>

              <div className="space-y-1.5 pt-1 max-h-[460px] overflow-y-auto">
                {sessions.map((sess) => {
                  const isCurrent = sess.id === activeSession.id;
                  return (
                    <button
                      key={sess.id}
                      type="button"
                      onClick={() => setActiveSessionId(sess.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl border text-xs font-medium truncate flex items-center gap-2 transition-all ${
                        isCurrent
                          ? isLight
                            ? 'bg-[#F8FAFC] border-[#0F172A] text-[#0F172A] font-semibold'
                            : 'bg-[#6366F1]/15 border-[#6366F1] text-white font-semibold'
                          : isLight
                          ? 'border-transparent hover:bg-[#F8FAFC] text-[#64748B]'
                          : 'border-transparent hover:bg-white/5 text-[#94A3B8]'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          isCurrent
                            ? isLight
                              ? 'bg-[#0F172A]'
                              : 'bg-[#6366F1]'
                            : 'bg-current opacity-40'
                        }`}
                      />
                      <span className="truncate">{sess.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={`pt-3 border-t border-current/5 text-[11px] ${mutedText}`}>
              <label htmlFor="examiner-board-picker" className="block mb-1 font-medium">
                Curriculum / Board
              </label>
              <select
                id="examiner-board-picker"
                value={board}
                onChange={(e) => setBoard(e.target.value as ExamBoard)}
                className={`w-full rounded-lg border px-2 py-1.5 text-xs outline-none ${subtleSurface}`}
              >
                <option value="General / All Curricula">General / All Curricula</option>
                <option value="Cambridge CAIE">Cambridge CAIE</option>
                <option value="Pearson Edexcel">Pearson Edexcel</option>
                <option value="Oxford AQA">Oxford AQA</option>
              </select>
            </div>
          </aside>
        )}

        {/* COLUMN 2: DOCUMENTS PANEL (3 cols) */}
        <section
          className={`${
            sidebarHidden ? 'lg:col-span-4' : 'lg:col-span-3'
          } rounded-2xl border p-4 flex flex-col ${cardSurface}`}
        >
          <div className="mb-3">
            <div className="flex items-center justify-between gap-2">
              <span
                className={`text-[10px] font-bold tracking-wider uppercase ${mutedText}`}
              >
                DOCUMENTS ({attachedFiles.length})
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono-tabular border ${subtleSurface}`}
              >
                {formatBytes(totalBytesSize)}
              </span>
            </div>
            <div className="text-sm font-bold mt-1 truncate">
              {attachedFiles.length > 0
                ? `${attachedFiles.length} file${
                    attachedFiles.length > 1 ? 's' : ''
                  } attached`
                : 'No documents loaded'}
            </div>
          </div>

          {/* Tall Dashed Dropzone Container */}
          <div
            className={`flex-1 rounded-2xl border-2 border-dashed p-4 flex flex-col items-center justify-center text-center transition-colors ${
              isLight
                ? 'border-[#CBD5E1] bg-[#F8FAFC]/60'
                : 'border-white/15 bg-[#090D16]/60'
            }`}
          >
            <input
              ref={dropzoneInputRef}
              type="file"
              accept=".pdf,image/*,.txt"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => dropzoneInputRef.current?.click()}
              className="group flex flex-col items-center cursor-pointer focus:outline-none mb-3"
            >
              <div
                className={`w-9 h-9 rounded-xl border flex items-center justify-center mb-2 transition-transform group-hover:scale-105 ${
                  isLight
                    ? 'bg-white border-[#E2E8F0] text-[#0F172A]'
                    : 'bg-[#111827] border-white/10 text-[#6366F1]'
                }`}
              >
                <Upload className="w-4 h-4" />
              </div>

              <div className="text-xs font-bold group-hover:underline">
                Add More Files
              </div>
              <p className={`text-[10px] mt-0.5 ${mutedText}`}>
                PDFs, images, past papers
              </p>
            </button>

            {/* Attached Files List */}
            {attachedFiles.length > 0 && (
              <div className="w-full max-h-[180px] overflow-y-auto space-y-1.5 my-2 pr-1 text-left">
                {attachedFiles.map((file) => (
                  <div
                    key={file.id}
                    className={`flex flex-col gap-1.5 p-2 rounded-xl border text-[11px] ${subtleSurface}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <FileText className="w-3.5 h-3.5 shrink-0 text-indigo-500" />
                        <span className="truncate font-medium">{file.name}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handlePreviewFileItem(file)}
                          title="Preview"
                          className="p-1 hover:opacity-100 opacity-70"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveFileItem(file.id)}
                          title="Remove"
                          className="p-1 hover:text-red-500 opacity-70 hover:opacity-100"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-1 text-[10px]">
                      <span className={mutedText}>Role:</span>
                      <select
                        aria-label={`Document role for ${file.name}`}
                        value={file.role}
                        onChange={(e) =>
                          handleChangeFileRole(
                            file.id,
                            e.target.value as
                              | 'student_script'
                              | 'mark_scheme'
                              | 'question_paper'
                          )
                        }
                        className={`rounded px-1.5 py-0.5 border text-[10px] font-semibold outline-none ${
                          isLight
                            ? 'bg-white border-slate-200 text-slate-800'
                            : 'bg-[#111827] border-white/10 text-slate-200'
                        }`}
                      >
                        <option value="student_script">
                          Student Handwriting / Script (OCR)
                        </option>
                        <option value="mark_scheme">Official Mark Scheme</option>
                        <option value="question_paper">Question Paper</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div
              className="mt-2 flex flex-col gap-2 w-full max-w-[200px]"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                id="preview-attached-file-btn"
                onClick={handlePreviewSampleOrFirst}
                className={`w-full py-2 px-3 rounded-lg border text-[11px] font-semibold transition-all inline-flex items-center justify-center gap-1.5 ${
                  attachedFiles.length > 0
                    ? isLight
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                      : 'bg-[#6366F1]/20 border-[#6366F1]/40 text-indigo-300 hover:bg-[#6366F1]/30'
                    : outlineBtn
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>
                  {attachedFiles.length > 0
                    ? `Preview First (${attachedFiles[0].name.slice(0, 10)}...)`
                    : 'Preview Sample Paper'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setDraftPasteText('');
                  setShowPasteModal(true);
                }}
                className={`w-full py-2 px-3 rounded-lg border text-[11px] font-semibold transition-all ${outlineBtn}`}
              >
                + Paste text directly
              </button>

              {attachedFiles.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      handleExecuteExaminerAction(
                        'Evaluate attached documents and generate annotated PDF report',
                        true
                      )
                    }
                    className={`w-full py-2 px-3 rounded-lg text-[11px] font-semibold transition-all ${primaryBtn}`}
                  >
                    Evaluate Documents ({attachedFiles.length})
                  </button>

                  <button
                    type="button"
                    onClick={handleClearAllAttachedDocuments}
                    className="w-full py-1.5 px-3 rounded-lg border text-[11px] font-semibold transition-all text-red-600 dark:text-red-400 border-red-500/20 hover:bg-red-500/10 inline-flex items-center justify-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear All Files</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </section>

        {/* COLUMN 3: MAIN CHAT & EXAMINER SESSION CARD (7 cols or 8 cols when sidebar hidden) */}
        <section
          className={`${
            sidebarHidden ? 'lg:col-span-8' : 'lg:col-span-7'
          } rounded-2xl border flex flex-col justify-between overflow-hidden ${cardSurface}`}
        >
          {/* Top Session Header Bar */}
          <div className="p-4 border-b border-current/10 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => setSidebarHidden((h) => !h)}
                aria-label="Toggle history panel"
                className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${outlineBtn}`}
              >
                <History className="w-3.5 h-3.5" />
              </button>

              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-xs font-bold tracking-wider uppercase">
                    {activeSession.title === 'Starting...'
                      ? 'STARTING CHAT SESSION'
                      : activeSession.title.toUpperCase()}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <div
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-medium ${subtleSurface}`}
                  >
                    <BookOpen className="w-3 h-3 opacity-70" />
                    <span className={mutedText}>Subject:</span>
                    <select
                      aria-label="Select Subject"
                      value={selectedSubject}
                      onChange={(e) => setSelectedSubject(e.target.value)}
                      className="bg-transparent font-semibold outline-none cursor-pointer"
                    >
                      {SUBJECT_OPTIONS.map((subj) => (
                        <option
                          key={subj}
                          value={subj}
                          className={
                            isLight
                              ? 'bg-white text-[#0F172A]'
                              : 'bg-[#111827] text-white'
                          }
                        >
                          {subj}
                        </option>
                      ))}
                    </select>
                  </div>

                  <span className={`text-[11px] ${mutedText}`}>
                    • Identifies Key Points &amp; Lost Marks
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClearCurrentSession}
                aria-label="Clear current chat session"
                title="Clear session"
                className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${outlineBtn}`}
              >
                <Trash2 className="w-3.5 h-3.5 opacity-70" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setReasoningEngine((eng) =>
                    eng === 'deepseek-r1' ? 'gemini-vision' : 'deepseek-r1'
                  )
                }
                aria-label="Switch reasoning engine"
                title={`Active Engine: ${
                  reasoningEngine === 'deepseek-r1'
                    ? 'DeepSeek-R1 STEM'
                    : 'Gemini Vision OCR'
                }`}
                className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${outlineBtn}`}
              >
                <Globe className="w-3.5 h-3.5 opacity-70" />
              </button>
            </div>
          </div>

          {/* Center Viewport: Empty State Prompt Cards OR Active Session Messages */}
          <div className="flex-1 p-6 overflow-y-auto flex flex-col">
            {activeSession.messages.length === 0 ? (
              <div className="my-auto max-w-md w-full mx-auto text-center space-y-5 py-8">
                <div
                  className={`w-12 h-12 rounded-2xl border mx-auto flex items-center justify-center ${
                    isLight
                      ? 'bg-[#F8FAFC] border-[#E2E8F0] text-[#0F172A]'
                      : 'bg-[#6366F1]/15 border-[#6366F1]/40 text-indigo-300'
                  }`}
                >
                  <Sparkles className="w-5 h-5" />
                </div>

                <div className="space-y-1.5">
                  <h2 className="text-base font-bold">
                    Ask or Upload Your Working
                  </h2>
                  <p className={`text-xs leading-relaxed ${mutedText}`}>
                    Paste any exam question, upload a past paper or worksheet
                    picture, or ask for a full mark scheme breakdown.
                  </p>
                </div>

                {/* 3 Stacked Full-Width Prompt Cards matching reference screenshot */}
                <div className="space-y-2.5 text-left">
                  <button
                    type="button"
                    onClick={() =>
                      handleExecuteExaminerAction(
                        'Key Points Got Right & Points Lost Marks On',
                        true
                      )
                    }
                    className={`w-full px-4 py-3 rounded-xl border text-xs font-medium flex items-center gap-2.5 transition-all ${subtleSurface} hover:border-current/30`}
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 stroke-[2.5]" />
                    <span className="inline-flex items-center gap-1.5 flex-wrap">
                      <span>Key Points Got Right &amp;</span>
                      <X className="w-3.5 h-3.5 text-red-500 inline shrink-0 stroke-[2.5]" />
                      <span>Points Lost Marks On</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleExecuteExaminerAction(
                        'Check my answer against the official Mark Scheme',
                        true
                      )
                    }
                    className={`w-full px-4 py-3 rounded-xl border text-xs font-medium flex items-center gap-2.5 transition-all ${subtleSurface} hover:border-current/30`}
                  >
                    <span className="text-indigo-500 font-bold">🎯</span>
                    <span>
                      Check my answer against the official Mark Scheme
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleExecuteExaminerAction(
                        'Identify mistakes, missed keywords & lost marks',
                        true
                      )
                    }
                    className={`w-full px-4 py-3 rounded-xl border text-xs font-medium flex items-center gap-2.5 transition-all ${subtleSurface} hover:border-current/30`}
                  >
                    <span className="text-amber-500 font-bold">⚡</span>
                    <span>
                      Identify mistakes, missed keywords &amp; lost marks
                    </span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {activeSession.messages.map((msg) => (
                  <div key={msg.id} className="space-y-3">
                    <div
                      className={`p-4 rounded-2xl border text-xs leading-relaxed ${
                        msg.role === 'user'
                          ? isLight
                            ? 'bg-[#0F172A] text-white border-[#0F172A] ml-auto max-w-xl'
                            : 'bg-[#6366F1] text-white border-[#6366F1] ml-auto max-w-xl'
                          : subtleSurface
                      }`}
                    >
                      <div className="whitespace-pre-line">{msg.text}</div>
                    </div>

                    {/* If message includes a 3-Pass Examiner Evaluation, render the interactive deliverables */}
                    {msg.evaluation && (
                      <div
                        className={`rounded-2xl border p-5 space-y-4 ${cardSurface}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-current/10">
                          <div>
                            <div className="text-xs font-bold">
                              {msg.evaluation.board} · {msg.evaluation.subject} —{' '}
                              {msg.evaluation.paperComponent}
                            </div>
                            <div className={`text-[11px] ${mutedText}`}>
                              Score: {msg.evaluation.totalAwarded}/
                              {msg.evaluation.totalAvailable} (
                              {msg.evaluation.percentage}%) · Grade:{' '}
                              {msg.evaluation.provisionalGrade}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              id="preview-annotated-pdf-btn"
                              onClick={() =>
                                handlePreviewAnnotatedPdf(msg.evaluation!)
                              }
                              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${outlineBtn}`}
                            >
                              <Eye className="w-3.5 h-3.5 text-indigo-500" />
                              Preview Script
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleDownloadAnnotatedPdf(msg.evaluation!)
                              }
                              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold ${primaryBtn}`}
                            >
                              <Download className="w-3.5 h-3.5" />
                              Download PDF
                            </button>
                          </div>
                        </div>

                        {/* Deliverable View Switcher */}
                        <div
                          className={`grid grid-cols-2 sm:grid-cols-5 gap-1.5 p-1 rounded-xl border ${subtleSurface}`}
                        >
                          {[
                            { id: 'outputA', label: 'Annotated Script' },
                            { id: 'outputOCR', label: 'OCR & Mark Scheme' },
                            { id: 'outputB', label: '3-Pass Report' },
                            { id: 'outputC', label: 'Lost Marks' },
                            { id: 'outputD', label: 'Share Summary' },
                          ].map((tab) => (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() =>
                                setActiveOutputView(tab.id as any)
                              }
                              className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all truncate ${
                                activeOutputView === tab.id
                                  ? primaryBtn
                                  : `${mutedText} hover:opacity-100`
                              }`}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>

                        {activeOutputView === 'outputOCR' && (
                          <div
                            id="examiner-ocr-comparison-panel"
                            className="grid grid-cols-1 md:grid-cols-2 gap-3"
                          >
                            <div
                              className={`p-3.5 rounded-xl border space-y-2 ${subtleSurface}`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-500">
                                  Student Handwriting OCR Transcription
                                </span>
                                <span className={`text-[10px] font-mono-tabular ${mutedText}`}>
                                  Extracted via AI Vision OCR
                                </span>
                              </div>
                              <pre className="text-xs font-mono-tabular whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                                {msg.evaluation.ocrTranscription ||
                                  msg.evaluation.ledger
                                    .map(
                                      (q) =>
                                        `Q${q.questionNumber}${
                                          q.subQuestion ? `(${q.subQuestion})` : ''
                                        }: ${q.studentEvidence}`
                                    )
                                    .join('\n')}
                              </pre>
                            </div>

                            <div
                              className={`p-3.5 rounded-xl border space-y-2 ${subtleSurface}`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                                  Applied Official Mark Scheme Points
                                </span>
                                <span className={`text-[10px] font-mono-tabular ${mutedText}`}>
                                  {msg.evaluation.board} Rubric
                                </span>
                              </div>
                              <pre className="text-xs font-mono-tabular whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                                {msg.evaluation.extractedMarkScheme ||
                                  msg.evaluation.ledger
                                    .map(
                                      (q) =>
                                        `Q${q.questionNumber}${
                                          q.subQuestion ? `(${q.subQuestion})` : ''
                                        } [${q.maxMarks}m]: ${
                                          q.markSchemeRequirement
                                        }`
                                    )
                                    .join('\n')}
                              </pre>
                            </div>
                          </div>
                        )}

                        {activeOutputView === 'outputA' && (
                          <div className="space-y-3">
                            {/* Compact OCR Transcription vs Mark Scheme Summary Bar */}
                            <div
                              id="ocr-summary-banner"
                              className={`p-3 rounded-xl border text-xs grid grid-cols-1 md:grid-cols-2 gap-3 ${subtleSurface}`}
                            >
                              <div>
                                <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 mb-1">
                                  OCR Transcribed Student Handwriting / Script
                                </div>
                                <div className="font-mono-tabular text-[11px] line-clamp-3 whitespace-pre-wrap">
                                  {msg.evaluation.ocrTranscription ||
                                    msg.evaluation.ledger
                                      .map(
                                        (q) =>
                                          `Q${q.questionNumber}: ${q.studentEvidence}`
                                      )
                                      .join(' | ')}
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1">
                                  Compared Against Mark Scheme
                                </div>
                                <div className="font-mono-tabular text-[11px] line-clamp-3 whitespace-pre-wrap">
                                  {msg.evaluation.extractedMarkScheme ||
                                    msg.evaluation.ledger
                                      .map(
                                        (q) =>
                                          `Q${q.questionNumber}: ${q.markSchemeRequirement}`
                                      )
                                      .join(' | ')}
                                </div>
                              </div>
                            </div>

                            {msg.evaluation.ledger.map((q, idx) => {
                              const hlStyle =
                                q.status === 'correct'
                                  ? 'bg-[#70E0A0]/30 border-[#70E0A0]'
                                  : q.status === 'partial'
                                  ? 'bg-[#FFD580]/30 border-[#FFD580]'
                                  : 'bg-[#FF8888]/30 border-[#FF8888]';

                              return (
                                <div
                                  key={`${q.questionNumber}-${idx}`}
                                  className="grid grid-cols-12 gap-2.5 items-start pb-3 border-b border-current/10 last:border-b-0"
                                >
                                  <div
                                    className={`col-span-2 flex flex-col items-center justify-center p-2 rounded-xl border ${subtleSurface}`}
                                  >
                                    <span className="text-xs font-bold font-mono-tabular">
                                      {q.awardedMarks}/{q.maxMarks}
                                    </span>
                                    <span className={`text-[10px] ${mutedText}`}>
                                      Q{q.questionNumber}
                                      {q.subQuestion ? `(${q.subQuestion})` : ''}
                                    </span>
                                  </div>

                                  <div className="col-span-8 space-y-2">
                                    <div
                                      className={`p-3 rounded-xl border ${hlStyle}`}
                                    >
                                      <div className="text-xs font-mono-tabular">
                                        {q.studentEvidence}
                                      </div>
                                      <div className="text-[11px] mt-1 opacity-85">
                                        {q.markingPointRationale}
                                      </div>
                                    </div>

                                    {q.awardedMarks < q.maxMarks && (
                                      <div className="bg-[#FFF1F2] border border-[#FECDD3] text-[#0F172A] rounded-xl p-3 text-xs space-y-1">
                                        <div>
                                          <strong>
                                            Lost (-{q.maxMarks - q.awardedMarks}
                                            ):
                                          </strong>{' '}
                                          {q.reasonForLostMarks}
                                        </div>
                                        <div>
                                          <strong>Mark Scheme:</strong>{' '}
                                          {q.markSchemeRequirement}
                                        </div>
                                        {q.examinerWording && (
                                          <div>
                                            <strong>Corrected Answer:</strong>{' '}
                                            {q.examinerWording}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  <div
                                    className={`col-span-2 flex flex-col items-center justify-center p-2 rounded-xl border space-y-1 ${subtleSurface}`}
                                  >
                                    {Array.from({
                                      length: q.awardedMarks,
                                    }).map((_, i) => (
                                      <Check
                                        key={`t-${i}`}
                                        className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]"
                                      />
                                    ))}
                                    {Array.from({
                                      length: Math.max(
                                        0,
                                        q.maxMarks - q.awardedMarks
                                      ),
                                    }).map((_, i) => (
                                      <X
                                        key={`c-${i}`}
                                        className="w-3.5 h-3.5 text-red-600 stroke-[2.5]"
                                      />
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {activeOutputView === 'outputB' && (
                          <div
                            className={`p-4 rounded-xl border space-y-2 text-xs ${subtleSurface}`}
                          >
                            <p>
                              <CheckCircle2 className="w-3.5 h-3.5 inline mr-1.5 text-emerald-500" />
                              {msg.evaluation.passSummary.pass1Summary}
                            </p>
                            <p>
                              <CheckCircle2 className="w-3.5 h-3.5 inline mr-1.5 text-emerald-500" />
                              {msg.evaluation.passSummary.pass2Verification}
                            </p>
                            <p>
                              <CheckCircle2 className="w-3.5 h-3.5 inline mr-1.5 text-emerald-500" />
                              {msg.evaluation.passSummary.pass3Moderation}
                            </p>
                          </div>
                        )}

                        {activeOutputView === 'outputC' && (
                          <div className="space-y-2">
                            {msg.evaluation.lostMarksBreakdown.map(
                              (item, idx) => (
                                <div
                                  key={idx}
                                  className="p-3.5 rounded-xl border bg-[#FFF1F2] border-[#FECDD3] text-[#0F172A] text-xs space-y-1"
                                >
                                  <div className="font-bold flex items-center justify-between">
                                    <span>
                                      <AlertTriangle className="w-3.5 h-3.5 inline mr-1 text-red-600" />
                                      Q{item.questionNumber}
                                      {item.subQuestion
                                        ? `(${item.subQuestion})`
                                        : ''}
                                    </span>
                                    <span className="font-mono-tabular">
                                      {item.awardedMarks}/{item.maxMarks}
                                    </span>
                                  </div>
                                  <div>{item.reasonForLostMarks}</div>
                                  <div>
                                    <strong>Model Wording:</strong>{' '}
                                    {item.examinerWording ||
                                      item.markSchemeRequirement}
                                  </div>
                                </div>
                              )
                            )}
                          </div>
                        )}

                        {activeOutputView === 'outputD' && (
                          <div className="space-y-2">
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() =>
                                  handleCopyWhatsApp(
                                    msg.evaluation!.whatsappSummary
                                  )
                                }
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${primaryBtn}`}
                              >
                                {copiedWhatsApp ? (
                                  <>
                                    <Check className="w-3.5 h-3.5" />
                                    Copied
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" />
                                    Copy Summary
                                  </>
                                )}
                              </button>
                            </div>
                            <pre
                              className={`p-3.5 rounded-xl border text-xs font-mono-tabular whitespace-pre-wrap ${subtleSurface}`}
                            >
                              {msg.evaluation.whatsappSummary}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom Composer Area matching reference screenshot */}
          <div className="p-4 border-t border-current/10 space-y-3">
            {/* Row 1: Quick-Action Chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  handleExecuteExaminerAction(
                    'Key Points Right & Lost Marks Breakdown',
                    true
                  )
                }
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold whitespace-nowrap inline-flex items-center gap-1 transition-all ${subtleSurface} hover:border-current/30`}
              >
                <Check className="w-3 h-3 text-emerald-600 stroke-[2.5]" />
                <span>Key Points Right &amp;</span>
                <X className="w-3 h-3 text-red-500 stroke-[2.5]" />
                <span>Lost Marks</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleExecuteExaminerAction(
                    'Grade vs Official Mark Scheme',
                    true
                  )
                }
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold whitespace-nowrap inline-flex items-center gap-1 transition-all ${subtleSurface} hover:border-current/30`}
              >
                <span>🎯</span> Grade vs Mark Scheme
              </button>

              <button
                type="button"
                onClick={() =>
                  handleExecuteExaminerAction(
                    'Pinpoint Lost Marks & Examiner Fixes',
                    true
                  )
                }
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold whitespace-nowrap inline-flex items-center gap-1 transition-all ${subtleSurface} hover:border-current/30`}
              >
                <X className="w-3 h-3 text-red-500 stroke-[2.5]" />
                <span>Pinpoint Lost Marks</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleExecuteExaminerAction(
                    'Provide a 100% full-marks model examiner answer'
                  )
                }
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold whitespace-nowrap inline-flex items-center gap-1 transition-all ${subtleSurface} hover:border-current/30`}
              >
                <span className="text-amber-500">⚡</span> 100% Model Answer
              </button>
            </div>

            {/* Attached File Preview Bars */}
            {attachedFiles.length > 0 && (
              <div className="space-y-1.5 max-h-[120px] overflow-y-auto pr-1">
                {attachedFiles.map((file) => (
                  <div
                    key={file.id}
                    className={`p-2 px-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                      isLight
                        ? 'bg-indigo-50/70 border-indigo-200/80 text-indigo-950'
                        : 'bg-[#6366F1]/15 border-[#6366F1]/30 text-indigo-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      <span className="font-semibold truncate">{file.name}</span>
                      <span className="text-[11px] opacity-70 font-mono-tabular shrink-0">
                        ({formatBytes(file.size)})
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        id={`composer-preview-${file.id}`}
                        onClick={() => handlePreviewFileItem(file)}
                        className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 transition-all ${
                          isLight
                            ? 'bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-50'
                            : 'bg-white/10 border-white/20 text-white hover:bg-white/15'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveFileItem(file.id)}
                        aria-label={`Remove ${file.name}`}
                        className="p-1 rounded-lg opacity-60 hover:opacity-100 hover:text-red-500 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Row 2: Photos button, Files button, Input box, and Send button */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleExecuteExaminerAction();
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className={`w-12 h-11 rounded-xl border flex flex-col items-center justify-center gap-0.5 shrink-0 text-[10px] font-semibold transition-all ${subtleSurface} hover:border-current/30`}
              >
                <Camera className="w-3.5 h-3.5 opacity-70" />
                <span>Photos</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.doc,.docx"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`w-12 h-11 rounded-xl border flex flex-col items-center justify-center gap-0.5 shrink-0 text-[10px] font-semibold transition-all ${subtleSurface} hover:border-current/30`}
              >
                <Paperclip className="w-3.5 h-3.5 opacity-70" />
                <span>Files</span>
              </button>

              <input
                type="text"
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                placeholder="Paste your question & answer, attach photos or study notes..."
                className={`flex-1 h-11 rounded-xl border px-4 text-xs outline-none transition-all ${subtleSurface}`}
              />

              <button
                type="submit"
                disabled={isProcessing}
                aria-label="Send message to AI Examiner"
                className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all ${primaryBtn}`}
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </section>
      </div>

      {/* Direct Text Paste Modal */}
      {showPasteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="paste-modal-title"
        >
          <form
            onSubmit={handleSaveDirectPaste}
            className={`max-w-lg w-full rounded-2xl border p-6 space-y-4 text-xs ${cardSurface}`}
          >
            <div className="flex items-center justify-between">
              <h3 id="paste-modal-title" className="text-sm font-bold flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Paste Study Document or Student Working
              </h3>
              <button
                type="button"
                onClick={() => setShowPasteModal(false)}
                className="p-1 rounded-lg opacity-60 hover:opacity-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <textarea
              rows={7}
              value={draftPasteText}
              onChange={(e) => setDraftPasteText(e.target.value)}
              placeholder="Paste exam question, student working, or mark scheme notes here..."
              className={`w-full rounded-xl border p-3.5 font-mono-tabular text-xs leading-relaxed outline-none ${subtleSurface}`}
            />

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPasteModal(false)}
                className={`px-4 py-2 rounded-xl border font-semibold ${outlineBtn}`}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`px-4 py-2 rounded-xl font-semibold ${primaryBtn}`}
              >
                Load Document Text
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Full-featured Interactive File Preview Modal */}
      {previewModal.isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="preview-modal-title"
        >
          <div
            className={`max-w-4xl w-full max-h-[90vh] rounded-2xl border flex flex-col overflow-hidden shadow-2xl ${cardSurface}`}
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-current/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
                    isLight
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                      : 'bg-[#6366F1]/20 border-[#6366F1]/40 text-indigo-300'
                  }`}
                >
                  <Eye className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3
                    id="preview-modal-title"
                    className="text-sm font-bold truncate tracking-tight"
                  >
                    {previewModal.title}
                  </h3>
                  <div className={`text-[11px] flex items-center gap-2 ${mutedText}`}>
                    <span className="uppercase font-semibold tracking-wider">
                      {previewModal.fileType}
                    </span>
                    {previewModal.fileSizeStr && (
                      <>
                        <span>•</span>
                        <span className="font-mono-tabular">
                          {previewModal.fileSizeStr}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Controls Toolbar */}
              <div className="flex items-center gap-2 shrink-0">
                {previewModal.fileType === 'image' && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setImageZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))
                      }
                      title="Zoom Out"
                      className={`p-2 rounded-xl border transition-colors ${outlineBtn}`}
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[11px] font-mono-tabular w-12 text-center">
                      {Math.round(imageZoom * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setImageZoom((z) => Math.min(3, Math.round((z + 0.25) * 100) / 100))
                      }
                      title="Zoom In"
                      className={`p-2 rounded-xl border transition-colors ${outlineBtn}`}
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setImageRotation((r) => (r + 90) % 360)}
                      title="Rotate 90°"
                      className={`p-2 rounded-xl border transition-colors ${outlineBtn}`}
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}

                {previewModal.fileType === 'text' && previewModal.textContent && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(previewModal.textContent || '');
                    }}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-all ${outlineBtn}`}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy
                  </button>
                )}

                {previewModal.url && (
                  <a
                    href={previewModal.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={previewModal.title}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-all ${outlineBtn}`}
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </a>
                )}

                <button
                  type="button"
                  id="close-preview-modal-btn"
                  onClick={handleClosePreviewModal}
                  aria-label="Close preview"
                  className="p-2 rounded-xl hover:bg-current/10 transition-colors ml-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 p-4 overflow-auto min-h-[360px] max-h-[70vh] flex items-center justify-center bg-current/5">
              {previewModal.fileType === 'image' && previewModal.imageBase64 && (
                <div className="w-full h-full flex items-center justify-center p-2 overflow-auto">
                  <img
                    src={previewModal.imageBase64}
                    alt={previewModal.title}
                    style={{
                      transform: `scale(${imageZoom}) rotate(${imageRotation}deg)`,
                      transformOrigin: 'center center',
                    }}
                    className="max-w-full max-h-[64vh] object-contain rounded-lg shadow-md transition-transform duration-200"
                  />
                </div>
              )}

              {previewModal.fileType === 'pdf' && previewModal.url && (
                <iframe
                  src={previewModal.url}
                  title="PDF Preview"
                  className="w-full h-[64vh] rounded-xl border bg-white shadow-inner"
                />
              )}

              {previewModal.fileType === 'text' && (
                <pre
                  className={`w-full h-full max-h-[64vh] overflow-y-auto p-4 rounded-xl border font-mono-tabular text-xs leading-relaxed whitespace-pre-wrap select-text ${
                    isLight ? 'bg-white text-slate-800' : 'bg-[#090D16] text-slate-200'
                  }`}
                >
                  {previewModal.textContent || 'No text content available.'}
                </pre>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 px-4 border-t border-current/10 flex items-center justify-between text-xs shrink-0">
              <span className={`text-[11px] ${mutedText}`}>
                {previewModal.fileType === 'pdf'
                  ? 'Interactive vector PDF preview'
                  : previewModal.fileType === 'image'
                  ? 'Use zoom/rotate controls to inspect student working'
                  : 'Plain-text study document reader'}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClosePreviewModal}
                  className={`px-4 py-2 rounded-xl font-semibold ${primaryBtn}`}
                >
                  Close Preview
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
