import React, { useState, useRef, useEffect } from 'react';
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
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { marked } from 'marked';
import {
  ExamBoard,
  ExaminerEvaluationResult,
  QualificationLevel,
  ThemeMode,
} from '../types';
import { PAST_PAPER_CATALOG } from '../utils/initialData';
import {
  deriveQuestionAnnotatedLines,
  deriveQuestionRedCrossCorrections,
  deriveQuestionWhatEarnedTicks,
  generateAnnotatedExaminerPdfBytes,
} from '../utils/examinerPdfAnnotator';

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
  const [workingStageIndex, setWorkingStageIndex] = useState(0);
  const [workingElapsedSec, setWorkingElapsedSec] = useState(0);
  const [activeOutputView, setActiveOutputView] = useState<
    'outputA' | 'outputOCR' | 'outputB' | 'outputC' | 'outputD'
  >('outputA');
  const [copiedWhatsApp, setCopiedWhatsApp] = useState(false);

  // Two-Step Forensic OCR + 3-Pass Moderation Pipeline State (/api/ocr-extract, /api/evaluate-transcript, /api/chat)
  const [examinerMainTab, setExaminerMainTab] = useState<'correction' | 'chat'>(
    'correction'
  );
  const [examinerSubTab, setExaminerSubTab] = useState<'report' | 'ocr'>(
    'report'
  );
  const [auditScriptFiles, setAuditScriptFiles] = useState<File[]>([]);
  const [auditSchemeFiles, setAuditSchemeFiles] = useState<File[]>([]);
  const [auditStatusText, setAuditStatusText] = useState(
    'Ready: Step 1 (Forensic OCR Transcription) ➔ Step 2 (3-Pass Mark Scheme Comparison).'
  );
  const [isAuditStreaming, setIsAuditStreaming] = useState(false);
  const [auditOcrMarkdown, setAuditOcrMarkdown] = useState('');
  const [auditRawMarkdown, setAuditRawMarkdown] = useState('');
  const [auditRenderedHtml, setAuditRenderedHtml] = useState('');
  const [auditReportVisible, setAuditReportVisible] = useState(false);
  const [copiedRawReport, setCopiedRawReport] = useState(false);

  // Normal AI Chat Tab State (/api/chat)
  const [portalChatMessages, setPortalChatMessages] = useState<
    Array<{ id: string; role: 'user' | 'assistant'; content: string }>
  >([
    {
      id: 'welcome-msg',
      role: 'assistant',
      content:
        'Hello! I am your AI Examiner & Tutor. You can chat with me about any IGCSE, O-Level, or A-Level topic, or switch to the **Paper Correction** tab to upload a script and mark scheme for full forensic OCR grading.',
    },
  ]);
  const [portalChatInput, setPortalChatInput] = useState('');
  const [isPortalChatStreaming, setIsPortalChatStreaming] = useState(false);
  const portalChatEndRef = useRef<HTMLDivElement | null>(null);

  const SITE_KEY = 'key_ps5gnQ9rlp4xSCl6';

  const formatHighlights = (html: string) => {
    return html
      .replace(
        /\[GREEN HIGHLIGHT \| ✓\](.*?)(\n|<br>|<\/p>|<\/li>)/g,
        '<span class="green-highlight">✓ $1</span>$2'
      )
      .replace(
        /\[RED HIGHLIGHT \| ✗\](.*?)(\n|<br>|<\/p>|<\/li>)/g,
        '<span class="red-highlight">✗ $1</span>$2'
      );
  };

  const readSSEStream = async (
    response: Response,
    onTextChunk: (chunkText: string) => void
  ) => {
    if (!response.body) {
      throw new Error('Streaming response body unavailable');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';

      for (const line of parts) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const dataStr = trimmed.replace('data: ', '').trim();
          if (dataStr === '[DONE]') return;
          const parsed = JSON.parse(dataStr);
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.text) onTextChunk(parsed.text);
        }
      }
    }
  };

  // PDF-to-High-Res-Image Unpacker for 100% Handwriting OCR Fidelity
  const unpackFilesForOCR = async (
    fileList: File[],
    labelPrefix: string
  ): Promise<Array<{ blob: Blob; filename: string }>> => {
    const unpackedBlobs: Array<{ blob: Blob; filename: string }> = [];
    const pdfjsLib = (window as any).pdfjsLib;
    if (pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    for (const file of fileList) {
      if (file.type === 'application/pdf' && pdfjsLib) {
        try {
          setAuditStatusText(
            `Opening ${file.name} and rendering pages for handwriting OCR...`
          );
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            setAuditStatusText(
              `Rendering ${labelPrefix} (${file.name} — Page ${pageNum} of ${pdf.numPages})...`
            );
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 2.0 }); // 2x high-res scale for crisp handwriting
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            await page.render({ canvasContext: ctx, viewport }).promise;
            const blob = await new Promise<Blob | null>((resolve) =>
              canvas.toBlob(resolve, 'image/png', 0.95)
            );
            if (blob) {
              unpackedBlobs.push({
                blob,
                filename: `${file.name.replace(/\.pdf$/i, '')}_page_${pageNum}.png`,
              });
            }
          }
        } catch {
          // Fallback to raw PDF if PDF.js fails on a specific file
          unpackedBlobs.push({ blob: file, filename: file.name });
        }
      } else {
        unpackedBlobs.push({ blob: file, filename: file.name });
      }
    }
    return unpackedBlobs;
  };

  // Step 2: Evaluate OCR Transcript against Mark Scheme (/api/evaluate-transcript)
  const runEvaluationFromTranscript = async (transcriptOverride?: string) => {
    const transcriptToGrade = (
      transcriptOverride !== undefined ? transcriptOverride : auditOcrMarkdown
    ).trim();
    if (!transcriptToGrade) return;

    setAuditRawMarkdown('');
    setAuditRenderedHtml('');
    setExaminerSubTab('report');
    setIsAuditStreaming(true);
    setAuditStatusText(
      'Step 2/2: Comparing OCR Transcription against Mark Scheme (3-Pass Moderation)...'
    );

    try {
      const evalRes = await fetch('/api/evaluate-transcript', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-site-key': SITE_KEY,
        },
        body: JSON.stringify({ ocrTranscript: transcriptToGrade }),
      });

      if (!evalRes.ok) {
        const err = await evalRes.json().catch(() => ({}));
        throw new Error(err.error || 'Failed during transcript evaluation.');
      }

      let accReport = '';
      await readSSEStream(evalRes, (chunkText) => {
        accReport += chunkText;
        setAuditRawMarkdown(accReport);
        const rendered = String(marked.parse(accReport));
        setAuditRenderedHtml(formatHighlights(rendered));
      });

      setAuditStatusText(
        'Complete — Full OCR Transcription & 3-Pass Examiner Report Locked.'
      );
      onAwardFocusXp(80);
    } catch (err: any) {
      const msg = err?.message || 'Failed during transcript evaluation.';
      setAuditStatusText('Error: ' + msg);
      setAuditRenderedHtml(`<div class="red-highlight">Error: ${msg}</div>`);
    } finally {
      setIsAuditStreaming(false);
    }
  };

  // Step 1 + Step 2 Full Pipeline Execution
  const handleRunForensicExaminerAudit = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();
    if (auditScriptFiles.length === 0 || auditSchemeFiles.length === 0) {
      setAuditStatusText(
        'Error: Please upload both the Student Script and the Official Mark Scheme.'
      );
      return;
    }

    setAuditOcrMarkdown('');
    setAuditRawMarkdown('');
    setAuditRenderedHtml('');
    setAuditReportVisible(true);
    setIsAuditStreaming(true);

    try {
      // 1. Open PDFs & convert every page to high-res images for OCR
      const unpackedScripts = await unpackFilesForOCR(
        auditScriptFiles,
        'Student Script'
      );
      const unpackedSchemes = await unpackFilesForOCR(
        auditSchemeFiles,
        'Mark Scheme'
      );

      const ocrFormData = new FormData();
      unpackedScripts.forEach((item) =>
        ocrFormData.append('studentScript', item.blob, item.filename)
      );
      unpackedSchemes.forEach((item) =>
        ocrFormData.append('markScheme', item.blob, item.filename)
      );

      // 2. Run Step 1: Forensic OCR & Mark Scheme Transcription
      setExaminerSubTab('ocr');
      setAuditStatusText(
        'Step 1/2: Running Forensic OCR on all pages (extracting handwriting, working & mark scheme)...'
      );

      const ocrRes = await fetch('/api/ocr-extract', {
        method: 'POST',
        headers: { 'x-site-key': SITE_KEY },
        body: ocrFormData,
      });

      if (!ocrRes.ok) {
        const err = await ocrRes.json().catch(() => ({}));
        throw new Error(err.error || 'Failed during OCR extraction.');
      }

      let accOcr = '';
      await readSSEStream(ocrRes, (chunkText) => {
        accOcr += chunkText;
        setAuditOcrMarkdown(accOcr);
      });

      // 3. Automatically Run Step 2: 3-Pass Moderation comparing OCR Transcript vs. Mark Scheme
      await runEvaluationFromTranscript(accOcr);
    } catch (err: any) {
      const msg = err?.message || 'Failed to process script';
      setAuditStatusText('Error: ' + msg);
      setAuditRenderedHtml(`<div class="red-highlight">Error: ${msg}</div>`);
      setIsAuditStreaming(false);
    }
  };

  // Normal AI Chat Tab Submission (/api/chat)
  const handleSendPortalChat = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const userText = portalChatInput.trim();
    if (!userText || isPortalChatStreaming) return;

    if (onTriggerSecurityLockdown(userText, 'Examiner Chat')) return;

    const userMsg = {
      id: `chat-${Date.now()}-u`,
      role: 'user' as const,
      content: userText,
    };
    const aiPlaceholderId = `chat-${Date.now()}-a`;
    const nextHistory = [...portalChatMessages, userMsg];

    setPortalChatInput('');
    setPortalChatMessages([
      ...nextHistory,
      { id: aiPlaceholderId, role: 'assistant', content: 'Thinking...' },
    ]);
    setIsPortalChatStreaming(true);

    try {
      const paperContext =
        auditOcrMarkdown || auditRawMarkdown
          ? `OCR TRANSCRIPT:\n${auditOcrMarkdown}\n\nMODERATION REPORT:\n${auditRawMarkdown}`
          : '';

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-site-key': SITE_KEY,
        },
        body: JSON.stringify({
          messages: nextHistory
            .filter((m) => m.id !== 'welcome-msg')
            .map((m) => ({ role: m.role, content: m.content })),
          paperContext,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Chat request failed.');
      }

      let aiReply = '';
      await readSSEStream(res, (chunkText) => {
        aiReply += chunkText;
        setPortalChatMessages((prev) =>
          prev.map((m) =>
            m.id === aiPlaceholderId ? { ...m, content: aiReply } : m
          )
        );
      });
    } catch (err: any) {
      const msg = err?.message || 'Chat request failed.';
      setPortalChatMessages((prev) =>
        prev.map((m) =>
          m.id === aiPlaceholderId ? { ...m, content: `Error: ${msg}` } : m
        )
      );
    } finally {
      setIsPortalChatStreaming(false);
      setTimeout(() => {
        portalChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    }
  };

  const WORKING_STAGES = [
    {
      badge: 'STAGE 1 / 4 • EXHAUSTIVE PAST PAPER & ANNOTATION OCR',
      title: 'Extracting 100% of student writing, handwritten answers & paper annotations page-by-page...',
      detail: 'Running dedicated zero-omission Vision OCR across every page, question, sub-question, equation, and margin note',
    },
    {
      badge: 'STAGE 2 / 4 • COMPLETE MARK SCHEME EXTRACTION',
      title: 'Extracting every marking point (M1/A1/B1), acceptable alternative & rejection rule from the Mark Scheme...',
      detail: 'Reading all pages of the official Mark Scheme without omitting any detail, keyword, unit rule, or ECF note',
    },
    {
      badge: 'STAGE 3 / 4 • 3-PASS MARK SCHEME CORRECTION & MODERATION',
      title: 'Correcting every transcribed answer & annotation against the full Mark Scheme...',
      detail: 'Allocating green ticks (✓), red-cross corrections (✗), and checking Error Carried Forward (ECF) & 2026 grade thresholds',
    },
    {
      badge: 'STAGE 4 / 4 • MULTI-PAGE ANNOTATED PDF REPORT',
      title: 'Generating 14-page Marked Script & Examiner Report PDF with line-by-line highlights...',
      detail: 'Compiling Output A (Marked Script), Full OCR & Mark Scheme, Output B (Examiner Report), Output C & Output D',
    },
  ];

  useEffect(() => {
    if (!isProcessing) {
      setWorkingStageIndex(0);
      setWorkingElapsedSec(0);
      return;
    }
    const secInterval = window.setInterval(() => {
      setWorkingElapsedSec((prev) => prev + 1);
    }, 1000);
    const stageInterval = window.setInterval(() => {
      setWorkingStageIndex((prev) =>
        prev < WORKING_STAGES.length - 1 ? prev + 1 : prev
      );
    }, 3200);
    return () => {
      window.clearInterval(secInterval);
      window.clearInterval(stageInterval);
    };
  }, [isProcessing]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const dropzoneInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activeSessionId, isProcessing, workingStageIndex]);

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

      {/* CAIE / Edexcel / OxfordAQA — AI Principal Examiner & Assessment Portal (Forensic OCR & 3-Pass Moderation + Mini-Tabs) */}
      <section className="rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 shadow-sm">
        <div className="bg-slate-900 text-white py-5 px-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <span className="text-[11px] uppercase tracking-widest bg-indigo-600 px-2.5 py-1 rounded font-semibold">
              Forensic OCR &amp; 3-Pass Moderation
            </span>
            <h2 className="text-xl sm:text-2xl font-bold mt-2 text-white">
              AI Principal Examiner &amp; Assessment Portal
            </h2>
            <p className="text-slate-400 text-xs sm:text-sm mt-0.5">
              Cambridge (IGCSE / O-Level / AS &amp; A-Level) · Pearson Edexcel · OxfordAQA
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Mini-Tabs Navigation Bar */}
            <div className="flex bg-slate-800 p-1.5 rounded-xl border border-slate-700">
              <button
                type="button"
                id="tabCorrectionBtn"
                onClick={() => setExaminerMainTab('correction')}
                className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition ${
                  examinerMainTab === 'correction'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                📄 Paper Correction
              </button>
              <button
                type="button"
                id="tabChatBtn"
                onClick={() => setExaminerMainTab('chat')}
                className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition ${
                  examinerMainTab === 'chat'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                💬 Normal AI Chat
              </button>
            </div>

            {attachedFiles.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  handleExecuteExaminerAction(
                    'Evaluate attached documents and generate 14-page annotated PDF report',
                    true
                  )
                }
                disabled={isProcessing}
                className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                14-Page Annotated PDF
              </button>
            )}
          </div>
        </div>

        <div className={`p-6 ${isLight ? 'bg-white' : 'bg-[#111827]'}`}>
          {examinerMainTab === 'correction' ? (
            <div id="sectionCorrection">
              <form
                id="examinerForm"
                onSubmit={handleRunForensicExaminerAudit}
                className="space-y-6"
              >
                <div className="grid md:grid-cols-2 gap-6">
                  {/* 1. Student Script Upload */}
                  <div
                    className={`border-2 border-dashed rounded-xl p-6 text-center transition ${
                      isLight
                        ? 'border-slate-300 hover:border-indigo-500 bg-slate-50/50'
                        : 'border-white/15 hover:border-indigo-500 bg-[#090D16]/50'
                    }`}
                  >
                    <label className="block cursor-pointer">
                      <span className="text-sm font-semibold block mb-1">
                        1. Upload Past Paper / Student Script
                      </span>
                      <span className={`text-xs block mb-4 ${mutedText}`}>
                        PDF or Images (JPG/PNG) — Every page &amp; handwritten note is unpacked for OCR
                      </span>
                      <input
                        type="file"
                        id="studentScript"
                        name="studentScript"
                        multiple
                        accept=".pdf,image/*"
                        required={auditScriptFiles.length === 0}
                        onChange={(e) => {
                          const files = e.target.files
                            ? Array.from(e.target.files)
                            : [];
                          setAuditScriptFiles(files);
                          handleFileUpload(e);
                        }}
                        className="block w-full text-xs text-slate-600 dark:text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                      />
                      {auditScriptFiles.length > 0 && (
                        <div className="mt-2.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                          {auditScriptFiles.length} Past Paper / Script file(s) ready:{' '}
                          {auditScriptFiles.map((f) => f.name).join(', ')}
                        </div>
                      )}
                    </label>
                  </div>

                  {/* 2. Official Mark Scheme Upload */}
                  <div
                    className={`border-2 border-dashed rounded-xl p-6 text-center transition ${
                      isLight
                        ? 'border-slate-300 hover:border-indigo-500 bg-slate-50/50'
                        : 'border-white/15 hover:border-indigo-500 bg-[#090D16]/50'
                    }`}
                  >
                    <label className="block cursor-pointer">
                      <span className="text-sm font-semibold block mb-1">
                        2. Upload Official Mark Scheme
                      </span>
                      <span className={`text-xs block mb-4 ${mutedText}`}>
                        PDF or Images (JPG/PNG) — Complete official marking rubric
                      </span>
                      <input
                        type="file"
                        id="markScheme"
                        name="markScheme"
                        multiple
                        accept=".pdf,image/*"
                        required={auditSchemeFiles.length === 0}
                        onChange={(e) => {
                          const files = e.target.files
                            ? Array.from(e.target.files)
                            : [];
                          setAuditSchemeFiles(files);
                          handleFileUpload(e);
                        }}
                        className="block w-full text-xs text-slate-600 dark:text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
                      />
                      {auditSchemeFiles.length > 0 && (
                        <div className="mt-2.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          {auditSchemeFiles.length} Official Mark Scheme file(s) ready:{' '}
                          {auditSchemeFiles.map((f) => f.name).join(', ')}
                        </div>
                      )}
                    </label>
                  </div>
                </div>

                {/* Pipeline Progress Bar & Controls */}
                <div className="mt-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-t border-current/10 pt-4">
                  <div className="flex items-center gap-3">
                    {isAuditStreaming && (
                      <div
                        id="spinner"
                        className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin shrink-0"
                      />
                    )}
                    <p
                      id="statusText"
                      className={`text-xs sm:text-sm font-medium ${mutedText}`}
                    >
                      {auditStatusText}
                    </p>
                  </div>
                  <button
                    type="submit"
                    id="submitBtn"
                    disabled={isAuditStreaming}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs sm:text-sm px-6 py-2.5 rounded-lg shadow transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
                  >
                    {isAuditStreaming
                      ? 'Processing OCR & Grading...'
                      : 'Extract OCR & Grade Paper'}
                  </button>
                </div>
              </form>

              {/* Output Sub-Tabs (Switch between OCR Transcription & Final Grading Report) */}
              {auditReportVisible && (
                <div
                  id="resultContainer"
                  className={`mt-6 rounded-xl border overflow-hidden ${
                    isLight
                      ? 'bg-white border-slate-200 text-slate-800'
                      : 'bg-[#090D16] border-white/10 text-slate-100'
                  }`}
                >
                  <div
                    className={`px-6 py-3 border-b flex flex-wrap items-center justify-between gap-3 ${
                      isLight
                        ? 'bg-slate-100 border-slate-200'
                        : 'bg-[#111827] border-white/10'
                    }`}
                  >
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        id="subTabReportBtn"
                        onClick={() => setExaminerSubTab('report')}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                          examinerSubTab === 'report'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        ✅ Final Moderation Report (Stages 3 &amp; 4)
                      </button>
                      <button
                        type="button"
                        id="subTabOcrBtn"
                        onClick={() => setExaminerSubTab('ocr')}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                          examinerSubTab === 'ocr'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        🔍 Verbatim OCR &amp; Mark Scheme Transcript (Stages 1 &amp; 2)
                      </button>
                    </div>

                    <div className="flex gap-2">
                      {examinerSubTab === 'ocr' && (
                        <button
                          type="button"
                          id="reEvaluateBtn"
                          disabled={isAuditStreaming}
                          onClick={() => runEvaluationFromTranscript()}
                          className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 py-1.5 rounded transition disabled:opacity-50"
                        >
                          Re-Grade Edited OCR Transcript
                        </button>
                      )}
                      <button
                        type="button"
                        id="copyBtn"
                        onClick={() => {
                          const textToCopy =
                            examinerSubTab === 'report'
                              ? auditRawMarkdown
                              : auditOcrMarkdown;
                          navigator.clipboard
                            .writeText(textToCopy)
                            .catch(() => {});
                          setCopiedRawReport(true);
                          setTimeout(() => setCopiedRawReport(false), 2000);
                        }}
                        className="text-xs bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold px-3 py-1.5 rounded transition"
                      >
                        {copiedRawReport ? 'Copied!' : 'Copy Output'}
                      </button>
                    </div>
                  </div>

                  {/* Sub-Tab 1: Final Moderation Report */}
                  {examinerSubTab === 'report' ? (
                    <div id="viewReport" className="p-6 sm:p-8">
                      <div
                        id="reportOutput"
                        className="markdown-body leading-relaxed text-sm"
                        dangerouslySetInnerHTML={{
                          __html:
                            auditRenderedHtml ||
                            '<p class="text-slate-400 italic">Waiting for Step 1 OCR transcription to complete before streaming Step 2 Moderation Report...</p>',
                        }}
                      />
                    </div>
                  ) : (
                    /* Sub-Tab 2: Verbatim OCR Transcript (Editable & Inspectable) */
                    <div
                      id="viewOcr"
                      className={`p-6 sm:p-8 ${
                        isLight ? 'bg-slate-50' : 'bg-[#090D16]'
                      }`}
                    >
                      <p className={`text-xs mb-3 ${mutedText}`}>
                        Below is the raw 100% verbatim OCR transcription of the
                        student&apos;s handwriting, annotations, and mark scheme.
                        You can inspect or edit any character and click{' '}
                        <strong>&quot;Re-Grade Edited OCR Transcript&quot;</strong>{' '}
                        above.
                      </p>
                      <textarea
                        id="ocrTextarea"
                        rows={18}
                        value={auditOcrMarkdown}
                        onChange={(e) => setAuditOcrMarkdown(e.target.value)}
                        className={`w-full font-mono text-xs p-4 rounded-lg border focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-6 ${
                          isLight
                            ? 'border-slate-300 bg-white text-slate-800'
                            : 'border-white/15 bg-[#111827] text-slate-100'
                        }`}
                        placeholder="OCR transcription will stream here..."
                      />
                      <h3 className="text-sm font-bold mb-2">
                        Formatted OCR Preview:
                      </h3>
                      <div
                        id="ocrOutput"
                        className={`markdown-body p-6 rounded-lg border text-sm ${
                          isLight
                            ? 'bg-white border-slate-200 text-slate-800'
                            : 'bg-[#111827] border-white/10 text-slate-100'
                        }`}
                        dangerouslySetInnerHTML={{
                          __html: String(marked.parse(auditOcrMarkdown || '')),
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* SECTION 2: NORMAL AI CHAT TAB */
            <div id="sectionChat">
              <div
                className={`rounded-xl border flex flex-col h-[580px] overflow-hidden ${
                  isLight
                    ? 'bg-white border-slate-200'
                    : 'bg-[#090D16] border-white/10'
                }`}
              >
                <div
                  className={`px-6 py-4 border-b flex items-center justify-between ${
                    isLight
                      ? 'bg-slate-100 border-slate-200'
                      : 'bg-[#111827] border-white/10'
                  }`}
                >
                  <div>
                    <h3 className="text-base font-bold">
                      AI Examiner &amp; Study Chat
                    </h3>
                    <p className={`text-xs ${mutedText}`}>
                      Ask general subject questions or discuss the paper you just
                      graded in the Paper Correction tab.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setPortalChatMessages([
                        {
                          id: `clear-${Date.now()}`,
                          role: 'assistant',
                          content: 'Chat history cleared. Ask me anything!',
                        },
                      ])
                    }
                    className="text-xs bg-white border border-slate-300 hover:bg-slate-50 text-slate-600 font-semibold px-3 py-1.5 rounded"
                  >
                    Clear Chat
                  </button>
                </div>

                <div
                  id="chatMessages"
                  className={`flex-1 p-6 overflow-y-auto space-y-4 ${
                    isLight ? 'bg-slate-50' : 'bg-[#090D16]'
                  }`}
                >
                  {portalChatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={
                        msg.role === 'user'
                          ? 'flex justify-end'
                          : 'flex justify-start'
                      }
                    >
                      <div
                        className={
                          msg.role === 'user'
                            ? 'max-w-2xl bg-indigo-600 text-white rounded-2xl rounded-tr-none px-4 py-3 text-sm shadow-sm'
                            : `max-w-2xl border rounded-2xl rounded-tl-none px-4 py-3 text-sm shadow-sm markdown-body ${
                                isLight
                                  ? 'bg-white border-slate-200 text-slate-800'
                                  : 'bg-[#111827] border-white/10 text-slate-100'
                              }`
                        }
                        dangerouslySetInnerHTML={{
                          __html:
                            msg.role === 'user'
                              ? msg.content
                              : String(marked.parse(msg.content || '')),
                        }}
                      />
                    </div>
                  ))}
                  <div ref={portalChatEndRef} />
                </div>

                <form
                  id="chatForm"
                  onSubmit={handleSendPortalChat}
                  className={`p-4 border-t flex gap-3 ${
                    isLight
                      ? 'bg-white border-slate-200'
                      : 'bg-[#111827] border-white/10'
                  }`}
                >
                  <input
                    type="text"
                    id="chatInput"
                    value={portalChatInput}
                    onChange={(e) => setPortalChatInput(e.target.value)}
                    placeholder="Ask a question about a question, mark scheme, or topic..."
                    required
                    className={`flex-1 px-4 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      isLight
                        ? 'border-slate-300 bg-white text-slate-900'
                        : 'border-white/15 bg-[#090D16] text-white'
                    }`}
                  />
                  <button
                    type="submit"
                    id="chatSendBtn"
                    disabled={isPortalChatStreaming}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2.5 rounded-lg text-sm shadow transition disabled:opacity-50"
                  >
                    Send
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </section>

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
                          Past Paper / Script (OCR Writing &amp; Annotations)
                        </option>
                        <option value="mark_scheme">
                          Official Mark Scheme (Full Rubric)
                        </option>
                        <option value="question_paper">
                          Question Paper + Annotations (OCR)
                        </option>
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
              <div className="space-y-6">
                {activeSession.messages.map((msg) => {
                  const isUser = msg.role === 'user';
                  const cleanParagraphs = String(msg.text || '')
                    .replace(/\*\*([^*]+)\*\*/g, '$1')
                    .split('\n')
                    .map((l) => l.trim())
                    .filter(Boolean);

                  return (
                    <div key={msg.id} className="space-y-3.5">
                      {/* Message Bubble */}
                      <div
                        className={`rounded-2xl border transition-all ${
                          isUser
                            ? isLight
                              ? 'bg-[#0F172A] text-white border-[#0F172A] ml-auto max-w-xl p-4 shadow-xs'
                              : 'bg-[#6366F1] text-white border-[#6366F1] ml-auto max-w-xl p-4 shadow-xs'
                            : `${subtleSurface} p-4 sm:p-5 shadow-2xs`
                        }`}
                      >
                        {/* Examiner Message Header */}
                        {!isUser && (
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-current/10">
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold ${
                                  isLight
                                    ? 'bg-[#17365D] text-white'
                                    : 'bg-[#6366F1]/25 text-indigo-300'
                                }`}
                              >
                                <ShieldCheck className="w-3.5 h-3.5" />
                              </span>
                              <span className="text-[11px] font-bold tracking-wider uppercase">
                                Principal Examiner &amp; Senior Moderator
                              </span>
                            </div>
                            <span
                              className={`text-[10px] font-mono-tabular px-2 py-0.5 rounded-md border ${
                                isLight
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                              }`}
                            >
                              {msg.evaluation
                                ? '3-Pass Mark Lock Verified'
                                : 'Examiner Response'}
                            </span>
                          </div>
                        )}

                        <div className="space-y-2 text-xs sm:text-[13px] leading-relaxed">
                          {cleanParagraphs.map((line, lIdx) => {
                            const isHeading =
                              line.startsWith('#') ||
                              /^(?:Pass \d|Output [A-D]|Summary|Key Points|Lost Marks|Model Answer)/i.test(
                                line
                              );
                            const isBullet =
                              line.startsWith('- ') ||
                              line.startsWith('• ') ||
                              /^\d+\.\s/.test(line);
                            const cleanedLine = line.replace(/^#+\s*/, '');

                            if (isHeading) {
                              return (
                                <div
                                  key={lIdx}
                                  className="font-bold text-xs sm:text-sm pt-1 first:pt-0 tracking-tight"
                                >
                                  {cleanedLine}
                                </div>
                              );
                            }
                            if (isBullet) {
                              return (
                                <div
                                  key={lIdx}
                                  className="flex items-start gap-2 pl-1"
                                >
                                  <span className="text-indigo-500 font-bold mt-0.5">
                                    •
                                  </span>
                                  <span>
                                    {cleanedLine.replace(/^(?:[-•]|\d+\.)\s*/, '')}
                                  </span>
                                </div>
                              );
                            }
                            return <p key={lIdx}>{cleanedLine}</p>;
                          })}
                        </div>
                      </div>

                      {/* If message includes a 3-Pass Examiner Evaluation, render the structured 4-Output Studio */}
                      {msg.evaluation && (
                        <div
                          className={`rounded-2xl border overflow-hidden shadow-sm ${cardSurface}`}
                        >
                          {/* Top Navy Score & Grade Banner (#17365D design system) */}
                          <div className="bg-[#17365D] text-white p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="px-2 py-0.5 rounded bg-white/15 text-[10px] font-mono-tabular font-bold uppercase tracking-wider">
                                  {msg.evaluation.board}
                                </span>
                                <span className="text-xs sm:text-sm font-bold tracking-tight">
                                  {msg.evaluation.subject} —{' '}
                                  {msg.evaluation.paperComponent}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-200 flex flex-wrap items-center gap-3 font-mono-tabular">
                                <span>
                                  FINAL SCORE:{' '}
                                  <strong className="text-white">
                                    {msg.evaluation.totalAwarded}/
                                    {msg.evaluation.totalAvailable} (
                                    {msg.evaluation.percentage}%)
                                  </strong>
                                </span>
                                <span>•</span>
                                <span>
                                  PROVISIONAL GRADE (2026):{' '}
                                  <strong className="text-[#70E0A0]">
                                    {msg.evaluation.provisionalGrade}
                                  </strong>
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                id="preview-annotated-pdf-btn"
                                onClick={() =>
                                  handlePreviewAnnotatedPdf(msg.evaluation!)
                                }
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all"
                              >
                                <Eye className="w-3.5 h-3.5 text-[#70E0A0]" />
                                Preview Annotated PDF
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  handleDownloadAnnotatedPdf(msg.evaluation!)
                                }
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#70E0A0] hover:bg-[#5cd48f] text-[#0F172A] transition-all shadow-xs"
                              >
                                <Download className="w-3.5 h-3.5" />
                                Download PDF
                              </button>
                            </div>
                          </div>

                          <div className="p-4 sm:p-5 space-y-4">
                            {/* Deliverable View Switcher (Outputs A, OCR, B, C, D) */}
                            <div
                              className={`grid grid-cols-2 sm:grid-cols-5 gap-1.5 p-1.5 rounded-xl border ${subtleSurface}`}
                            >
                              {[
                                {
                                  id: 'outputA',
                                  label: 'Output A: Script Ledger',
                                },
                                {
                                  id: 'outputOCR',
                                  label: 'OCR & Mark Scheme',
                                },
                                {
                                  id: 'outputB',
                                  label: 'Output B: Examiner Report',
                                },
                                {
                                  id: 'outputC',
                                  label: `Output C: Lost Marks (${msg.evaluation.lostMarksBreakdown.length})`,
                                },
                                {
                                  id: 'outputD',
                                  label: 'Output D: WhatsApp',
                                },
                              ].map((tab) => (
                                <button
                                  key={tab.id}
                                  type="button"
                                  onClick={() =>
                                    setActiveOutputView(tab.id as any)
                                  }
                                  className={`py-2 px-2.5 rounded-lg text-[11px] font-semibold transition-all truncate ${
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
                                className="grid grid-cols-1 md:grid-cols-2 gap-3.5"
                              >
                                <div
                                  className={`p-4 rounded-xl border space-y-2 ${subtleSurface}`}
                                >
                                  <div className="flex items-center justify-between pb-1.5 border-b border-current/10">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-500">
                                      Exhaustive Past Paper Writing &amp; Annotation OCR Transcription
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        navigator.clipboard?.writeText(
                                          msg.evaluation?.ocrTranscription || ''
                                        );
                                      }}
                                      className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${outlineBtn}`}
                                    >
                                      Copy Full OCR
                                    </button>
                                  </div>
                                  <pre className="text-xs font-mono-tabular whitespace-pre-wrap leading-relaxed max-h-[540px] overflow-y-auto">
                                    {msg.evaluation.ocrTranscription ||
                                      msg.evaluation.ledger
                                        .map(
                                          (q) =>
                                            `Q${q.questionNumber}${
                                              q.subQuestion
                                                ? `(${q.subQuestion})`
                                                : ''
                                            }: ${q.studentEvidence}`
                                        )
                                        .join('\n')}
                                  </pre>
                                </div>

                                <div
                                  className={`p-4 rounded-xl border space-y-2 ${subtleSurface}`}
                                >
                                  <div className="flex items-center justify-between pb-1.5 border-b border-current/10">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                                      Complete Official Mark Scheme Extraction (Zero Detail Omitted)
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        navigator.clipboard?.writeText(
                                          msg.evaluation?.extractedMarkScheme || ''
                                        );
                                      }}
                                      className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${outlineBtn}`}
                                    >
                                      Copy Mark Scheme
                                    </button>
                                  </div>
                                  <pre className="text-xs font-mono-tabular whitespace-pre-wrap leading-relaxed max-h-[540px] overflow-y-auto">
                                    {msg.evaluation.extractedMarkScheme ||
                                      msg.evaluation.ledger
                                        .map(
                                          (q) =>
                                            `Q${q.questionNumber}${
                                              q.subQuestion
                                                ? `(${q.subQuestion})`
                                                : ''
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
                              <div className="space-y-6">
                                {/* Full Verbatim OCR Transcription & Mark Scheme Expandable Drawer right inside Output A */}
                                <details
                                  className={`rounded-2xl border p-4 ${subtleSurface}`}
                                  open
                                >
                                  <summary className="cursor-pointer font-bold text-xs sm:text-sm flex flex-wrap items-center justify-between gap-2 select-none">
                                    <span className="inline-flex items-center gap-2">
                                      <span className="w-2 h-2 rounded-full bg-indigo-500" />
                                      <span>
                                        Complete Verbatim OCR Transcription (All Writing &amp; Annotations) &amp; Full Mark Scheme Breakdown
                                      </span>
                                    </span>
                                    <span className={`text-[11px] font-mono-tabular ${mutedText}`}>
                                      Click to toggle • Zero-Omission Multi-Pass Extraction
                                    </span>
                                  </summary>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-3.5 mt-3 border-t border-current/10">
                                    <div className="rounded-xl border border-slate-300/80 dark:border-white/10 bg-white dark:bg-[#0B0F19] p-3.5 space-y-2">
                                      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-indigo-500 pb-1 border-b border-slate-200 dark:border-white/10">
                                        <span>Verbatim OCR Transcription (All Paper Writing &amp; Annotations)</span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            navigator.clipboard?.writeText(
                                              msg.evaluation?.ocrTranscription || ''
                                            );
                                          }}
                                          className="underline hover:opacity-80"
                                        >
                                          Copy
                                        </button>
                                      </div>
                                      <pre className="text-xs font-mono-tabular whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
                                        {msg.evaluation.ocrTranscription ||
                                          msg.evaluation.ledger
                                            .map(
                                              (q) =>
                                                `Q${q.questionNumber}${
                                                  q.subQuestion
                                                    ? `(${q.subQuestion})`
                                                    : ''
                                                }: ${q.studentEvidence}`
                                            )
                                            .join('\n')}
                                      </pre>
                                    </div>

                                    <div className="rounded-xl border border-slate-300/80 dark:border-white/10 bg-white dark:bg-[#0B0F19] p-3.5 space-y-2">
                                      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 pb-1 border-b border-slate-200 dark:border-white/10">
                                        <span>Complete Extracted Official Mark Scheme (All Details)</span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            navigator.clipboard?.writeText(
                                              msg.evaluation?.extractedMarkScheme || ''
                                            );
                                          }}
                                          className="underline hover:opacity-80"
                                        >
                                          Copy
                                        </button>
                                      </div>
                                      <pre className="text-xs font-mono-tabular whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
                                        {msg.evaluation.extractedMarkScheme ||
                                          msg.evaluation.ledger
                                            .map(
                                              (q) =>
                                                `Q${q.questionNumber}${
                                                  q.subQuestion
                                                    ? `(${q.subQuestion})`
                                                    : ''
                                                } [${q.maxMarks}m]: ${
                                                  q.markSchemeRequirement
                                                }`
                                            )
                                            .join('\n')}
                                      </pre>
                                    </div>
                                  </div>
                                </details>

                                {/* Question-by-Question Marked Script + Deep-Dive Cards matching the 14-Page Reference PDF */}
                                {msg.evaluation.ledger.map((q, idx) => {
                                  const annotatedLines =
                                    deriveQuestionAnnotatedLines(q);
                                  const tickItems =
                                    deriveQuestionWhatEarnedTicks(q);
                                  const redCrossItems =
                                    deriveQuestionRedCrossCorrections(q);
                                  const qTag = `Q${q.questionNumber}${
                                    q.subQuestion ? `(${q.subQuestion})` : ''
                                  }`;

                                  return (
                                    <div
                                      key={`${q.questionNumber}-${idx}`}
                                      className={`rounded-2xl border p-4 sm:p-5 space-y-4 ${subtleSurface}`}
                                    >
                                      {/* Question Header with Green Left Bar */}
                                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-current/10 pb-3">
                                        <div className="space-y-1">
                                          <div className="flex items-center gap-2">
                                            <span className="w-1 h-4 rounded-full bg-[#1E6B52]" />
                                            <h4 className="text-sm sm:text-base font-bold tracking-tight">
                                              Question {q.questionNumber}
                                              {q.subQuestion
                                                ? `(${q.subQuestion})`
                                                : ''}{' '}
                                              ·{' '}
                                              {q.taskTitle ||
                                                'Marked Script & Evaluation'}{' '}
                                              · [{q.maxMarks} marks]
                                            </h4>
                                          </div>
                                          <div className="text-xs font-bold text-[#1E6B52] dark:text-emerald-400 pl-3">
                                            {q.contentMax && q.languageMax ? (
                                              <>
                                                Content &amp; Communication{' '}
                                                {q.contentAwarded ??
                                                  q.awardedMarks}{' '}
                                                / {q.contentMax} · Language{' '}
                                                {q.languageAwarded ?? 0} /{' '}
                                                {q.languageMax} ·{' '}
                                              </>
                                            ) : null}
                                            TOTAL {q.awardedMarks} /{' '}
                                            {q.maxMarks}
                                          </div>
                                          <p
                                            className={`text-[11px] italic pl-3 ${mutedText}`}
                                          >
                                            Mark-scheme basis:{' '}
                                            {q.markSchemeRequirement}
                                          </p>
                                        </div>

                                        {/* Official Boxed Score [awarded / max] */}
                                        <div className="border-2 border-slate-800 dark:border-slate-300 rounded-lg px-2.5 py-1 text-center font-mono-tabular bg-white dark:bg-[#090D16] shrink-0">
                                          <div className="text-xs font-bold text-[#1E6B52] dark:text-emerald-400 border-b border-slate-800 dark:border-slate-300 pb-0.5">
                                            {q.awardedMarks}
                                          </div>
                                          <div className="text-xs font-bold pt-0.5">
                                            {q.maxMarks}
                                          </div>
                                        </div>
                                      </div>

                                      {/* Annotated Student Script Lined Canvas (Green/Red Line Highlights + Right-Margin Ticks/Crosses) */}
                                      <div className="rounded-xl border border-slate-300/80 dark:border-white/15 bg-white dark:bg-[#0B0F19] p-3.5 sm:p-4 space-y-2 shadow-2xs">
                                        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500 pb-1 border-b border-slate-200 dark:border-white/10">
                                          <span>
                                            Annotated Student Script ({qTag})
                                          </span>
                                          <span>Right Margin: ✓ / ✗</span>
                                        </div>

                                        <div className="space-y-1.5 pt-1">
                                          {annotatedLines.map((line, lIdx) => (
                                            <div
                                              key={lIdx}
                                              className="flex items-center justify-between gap-3 border-b border-slate-200/70 dark:border-white/5 pb-1"
                                            >
                                              <div
                                                className={`flex-1 px-2.5 py-1 rounded text-xs font-medium leading-relaxed ${
                                                  line.isCorrect
                                                    ? 'bg-[#70E0A0]/35 text-slate-900 dark:text-slate-100'
                                                    : 'bg-[#FF8888]/35 text-slate-900 dark:text-slate-100'
                                                }`}
                                              >
                                                {line.text}
                                              </div>
                                              <span
                                                className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-sm shrink-0 ${
                                                  line.isCorrect
                                                    ? 'text-[#15803D] dark:text-emerald-400'
                                                    : 'text-[#B91C1C] dark:text-red-400'
                                                }`}
                                              >
                                                {line.isCorrect ? '✓' : '✗'}
                                              </span>
                                            </div>
                                          ))}
                                        </div>

                                        {/* Bottom-of-Question Green-Bordered Summary Pill */}
                                        <div className="pt-2 flex flex-wrap items-center justify-between gap-2">
                                          <div className="inline-flex flex-col px-3.5 py-2 rounded-xl border-2 border-[#1E6B52] bg-white dark:bg-[#090D16] text-xs">
                                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                                              {q.contentMax && q.languageMax
                                                ? `${qTag} Content & Communication ${
                                                    q.contentAwarded ??
                                                    q.awardedMarks
                                                  }/${q.contentMax} · Language ${
                                                    q.languageAwarded ?? 0
                                                  }/${q.languageMax}`
                                                : `${qTag} Marked against ${msg.evaluation!.board} Rubric`}
                                            </span>
                                            <span className="font-bold text-[#1E6B52] dark:text-emerald-400">
                                              {qTag} TOTAL {q.awardedMarks} /{' '}
                                              {q.maxMarks}
                                            </span>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Section: | What earned you ticks */}
                                      <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                          <span className="w-1 h-3.5 rounded-full bg-[#1E6B52]" />
                                          <h5 className="text-xs font-bold text-[#1E6B52] dark:text-emerald-400">
                                            What earned you ticks
                                          </h5>
                                        </div>
                                        <div className="space-y-1.5 pl-2">
                                          {tickItems.map((tItem, tIdx) => (
                                            <div
                                              key={tIdx}
                                              className="flex items-start gap-2 text-xs leading-relaxed"
                                            >
                                              <span className="text-[#15803D] dark:text-emerald-400 font-bold shrink-0">
                                                ✓
                                              </span>
                                              <span>{tItem}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>

                                      {/* Section: | Corrections marked with a red cross */}
                                      {redCrossItems.length > 0 && (
                                        <div className="space-y-2.5">
                                          <div className="flex items-center gap-2">
                                            <span className="w-1 h-3.5 rounded-full bg-[#991B1B]" />
                                            <h5 className="text-xs font-bold text-[#991B1B] dark:text-red-400">
                                              Corrections marked with a red
                                              cross
                                            </h5>
                                          </div>

                                          <div className="space-y-2">
                                            {redCrossItems.map(
                                              (corr, cIdx) => (
                                                <div
                                                  key={cIdx}
                                                  className="flex items-start gap-2.5"
                                                >
                                                  <span className="text-[#B91C1C] dark:text-red-400 font-bold text-sm mt-2.5 shrink-0">
                                                    ✗
                                                  </span>
                                                  <div className="flex-1 rounded-xl border border-[#D97788] bg-[#FFF0F3] text-[#1E293B] p-3.5 text-xs space-y-1.5 shadow-2xs">
                                                    <div className="font-bold">
                                                      &ldquo;{corr.quotedError}
                                                      &rdquo; —{' '}
                                                      <span className="font-semibold">
                                                        {corr.explanation}
                                                      </span>
                                                    </div>
                                                    <div className="font-bold text-[#0F172A]">
                                                      &raquo;{' '}
                                                      {corr.modelCorrection}
                                                    </div>
                                                    {corr.higherRangeAlternative && (
                                                      <div className="italic font-semibold text-[#1E6B52]">
                                                        Higher-range
                                                        alternative: &ldquo;
                                                        {corr.higherRangeAlternative.replace(
                                                          /^Higher-range alternative:\s*/i,
                                                          ''
                                                        )}
                                                        &rdquo;
                                                      </div>
                                                    )}
                                                  </div>
                                                </div>
                                              )
                                            )}
                                          </div>
                                        </div>
                                      )}

                                      {/* Closing Examiner Comment on Qn */}
                                      <div className="pt-2 border-t border-current/10 text-xs italic font-medium">
                                        {q.examinerComment ||
                                          `Examiner comment on ${qTag}: ${q.markingPointRationale}`}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Output B: Official Marked Script · Examiner Report Executive Summary & Whole-Script Feedback */}
                            {activeOutputView === 'outputB' && (
                              <div
                                className={`p-4 sm:p-5 rounded-xl border space-y-5 text-xs ${subtleSurface}`}
                              >
                                {/* Header & TOTAL SCORE Green-Bordered Box */}
                                <div className="space-y-2">
                                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#1E6B52] dark:text-emerald-400">
                                    MARKED SCRIPT · EXAMINER REPORT ·{' '}
                                    {msg.evaluation.board.toUpperCase()}
                                  </div>
                                  <h3 className="text-base sm:text-lg font-bold tracking-tight">
                                    {msg.evaluation.subject} —{' '}
                                    {msg.evaluation.paperComponent}
                                  </h3>
                                  <div className="rounded-xl border-2 border-[#1E6B52] bg-white dark:bg-[#090D16] p-4 flex flex-wrap items-baseline justify-between gap-4">
                                    <div>
                                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#1E6B52] dark:text-emerald-400">
                                        TOTAL SCORE
                                      </div>
                                      <div className="text-2xl sm:text-3xl font-extrabold font-mono-tabular mt-0.5">
                                        {msg.evaluation.totalAwarded} /{' '}
                                        {msg.evaluation.totalAvailable}
                                      </div>
                                    </div>
                                    <div className="text-xs sm:text-sm font-bold font-mono-tabular">
                                      {msg.evaluation.percentage.toFixed(1)} % ·
                                      Provisional Grade:{' '}
                                      <span className="text-[#1E6B52] dark:text-emerald-400">
                                        {msg.evaluation.provisionalGrade}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Dark-Header Question Summary Table */}
                                <div className="overflow-x-auto rounded-xl border border-current/10">
                                  <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                      <tr className="bg-[#262626] text-white">
                                        <th className="py-2 px-3 font-bold">
                                          Question
                                        </th>
                                        <th className="py-2 px-3 font-bold">
                                          Task / Topic
                                        </th>
                                        <th className="py-2 px-3 font-bold">
                                          Total
                                        </th>
                                        <th className="py-2 px-3 font-bold">
                                          Level / Verdict
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-current/10">
                                      {msg.evaluation.ledger.map((q, idx) => (
                                        <tr key={idx}>
                                          <td className="py-2 px-3 font-bold font-mono-tabular">
                                            Q{q.questionNumber}
                                            {q.subQuestion
                                              ? `(${q.subQuestion})`
                                              : ''}
                                          </td>
                                          <td className="py-2 px-3">
                                            {q.taskTitle ||
                                              q.markSchemeRequirement.slice(
                                                0,
                                                48
                                              )}
                                          </td>
                                          <td className="py-2 px-3 font-bold font-mono-tabular text-[#1E6B52] dark:text-emerald-400">
                                            {q.awardedMarks} / {q.maxMarks}
                                          </td>
                                          <td className="py-2 px-3">
                                            {q.levelAwarded ||
                                              (q.awardedMarks === q.maxMarks
                                                ? 'Full Credit'
                                                : 'Partial Credit')}
                                          </td>
                                        </tr>
                                      ))}
                                      <tr className="font-bold bg-current/5">
                                        <td className="py-2 px-3" colSpan={2}>
                                          PAPER TOTAL
                                        </td>
                                        <td className="py-2 px-3 font-mono-tabular text-[#1E6B52] dark:text-emerald-400">
                                          {msg.evaluation.totalAwarded} /{' '}
                                          {msg.evaluation.totalAvailable}
                                        </td>
                                        <td className="py-2 px-3 font-mono-tabular">
                                          {msg.evaluation.percentage.toFixed(1)}{' '}
                                          %
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>

                                {/* Examiner's overview */}
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-2">
                                    <span className="w-1 h-4 rounded-full bg-[#1E6B52]" />
                                    <h4 className="text-sm font-bold text-[#1E6B52] dark:text-emerald-400">
                                      Examiner&apos;s overview
                                    </h4>
                                  </div>
                                  <p className="leading-relaxed">
                                    {msg.evaluation.examinerOverview ||
                                      `${msg.evaluation.passSummary.pass1Summary} ${msg.evaluation.passSummary.pass2Verification} ${msg.evaluation.passSummary.pass3Moderation}`}
                                  </p>
                                </div>

                                {/* Strengths to protect & Where the marks went */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-current/10">
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                      <span className="w-1 h-4 rounded-full bg-[#1E6B52]" />
                                      <h4 className="text-xs font-bold text-[#1E6B52] dark:text-emerald-400">
                                        Strengths to protect
                                      </h4>
                                    </div>
                                    <div className="space-y-1.5">
                                      {(msg.evaluation.strengthsToProtect &&
                                      msg.evaluation.strengthsToProtect.length >
                                        0
                                        ? msg.evaluation.strengthsToProtect
                                        : [
                                            msg.evaluation.passSummary
                                              .pass1Summary,
                                            msg.evaluation.passSummary
                                              .consensusNotes,
                                          ]
                                      ).map((st, sIdx) => (
                                        <div
                                          key={sIdx}
                                          className="flex items-start gap-2"
                                        >
                                          <span className="text-[#15803D] font-bold">
                                            ✓
                                          </span>
                                          <span>{st}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                      <span className="w-1 h-4 rounded-full bg-[#991B1B]" />
                                      <h4 className="text-xs font-bold text-[#991B1B] dark:text-red-400">
                                        Where the marks went
                                      </h4>
                                    </div>
                                    <div className="space-y-1.5">
                                      {(msg.evaluation.whereMarksWent &&
                                      msg.evaluation.whereMarksWent.length > 0
                                        ? msg.evaluation.whereMarksWent
                                        : msg.evaluation.lostMarksBreakdown.map(
                                            (l) =>
                                              `Q${l.questionNumber}: ${l.reasonForLostMarks}`
                                          )
                                      ).map((wm, wIdx) => (
                                        <div
                                          key={wIdx}
                                          className="flex items-start gap-2"
                                        >
                                          <span className="text-[#B91C1C] font-bold">
                                            ✗
                                          </span>
                                          <span>{wm}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>

                                {/* Next four targets & Projected score */}
                                {(msg.evaluation.nextFourTargets ||
                                  msg.evaluation.projectedScoreWithFixes) && (
                                  <div className="space-y-3 pt-2 border-t border-current/10">
                                    {msg.evaluation.nextFourTargets &&
                                      msg.evaluation.nextFourTargets.length >
                                        0 && (
                                        <div className="space-y-1.5">
                                          <div className="flex items-center gap-2">
                                            <span className="w-1 h-4 rounded-full bg-[#1E6B52]" />
                                            <h4 className="text-xs font-bold">
                                              Your next four targets
                                            </h4>
                                          </div>
                                          <ul className="list-disc pl-5 space-y-1">
                                            {msg.evaluation.nextFourTargets.map(
                                              (t, idx) => (
                                                <li key={idx}>{t}</li>
                                              )
                                            )}
                                          </ul>
                                        </div>
                                      )}

                                    {msg.evaluation.projectedScoreWithFixes && (
                                      <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                          <span className="w-1 h-4 rounded-full bg-[#1E6B52]" />
                                          <h4 className="text-xs font-bold">
                                            What the same script would score
                                            with those fixes
                                          </h4>
                                        </div>
                                        <p className="leading-relaxed font-semibold text-[#1E6B52] dark:text-emerald-400">
                                          {
                                            msg.evaluation
                                              .projectedScoreWithFixes
                                          }
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Output C: Lost-Marks Breakdown (ONLY questions where marks were lost) */}
                            {activeOutputView === 'outputC' && (
                              <div className="space-y-2.5">
                                {msg.evaluation.lostMarksBreakdown.length ===
                                0 ? (
                                  <div
                                    className={`p-4 rounded-xl border text-center text-xs font-semibold text-emerald-600 ${subtleSurface}`}
                                  >
                                    Zero lost marks — full marks awarded across
                                    all evaluated questions!
                                  </div>
                                ) : (
                                  msg.evaluation.lostMarksBreakdown.map(
                                    (item, idx) => (
                                      <div
                                        key={idx}
                                        className="p-4 rounded-xl border bg-[#FFEBEE] border-[#FF8888]/60 text-[#243247] text-xs space-y-1.5"
                                      >
                                        <div className="font-bold flex items-center justify-between text-[#17365D]">
                                          <span className="flex items-center gap-1.5">
                                            <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                                            Question Q{item.questionNumber}
                                            {item.subQuestion
                                              ? `(${item.subQuestion})`
                                              : ''}
                                          </span>
                                          <span className="font-mono-tabular">
                                            Awarded: {item.awardedMarks}/
                                            {item.maxMarks} (Recoverable: +
                                            {item.maxMarks - item.awardedMarks})
                                          </span>
                                        </div>
                                        <div>
                                          <strong>Exact Issue:</strong>{' '}
                                          {item.reasonForLostMarks}
                                        </div>
                                        <div>
                                          <strong>
                                            Missing Mark Scheme Point:
                                          </strong>{' '}
                                          {item.markSchemeRequirement}
                                        </div>
                                        <div>
                                          <strong>
                                            Concise Model Correction:
                                          </strong>{' '}
                                          {item.examinerWording ||
                                            item.markSchemeRequirement}
                                        </div>
                                      </div>
                                    )
                                  )
                                )}
                              </div>
                            )}

                            {/* Output D: WhatsApp Summary */}
                            {activeOutputView === 'outputD' && (
                              <div className="space-y-2.5">
                                <div className="flex items-center justify-between">
                                  <span
                                    className={`text-[11px] font-semibold ${mutedText}`}
                                  >
                                    Copy-ready WhatsApp summary for students,
                                    parents, or tutors
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleCopyWhatsApp(
                                        msg.evaluation!.whatsappSummary
                                      )
                                    }
                                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${primaryBtn}`}
                                  >
                                    {copiedWhatsApp ? (
                                      <>
                                        <Check className="w-3.5 h-3.5" />
                                        Copied to Clipboard
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3.5 h-3.5" />
                                        Copy WhatsApp Summary
                                      </>
                                    )}
                                  </button>
                                </div>
                                <pre
                                  className={`p-4 rounded-xl border text-xs font-mono-tabular whitespace-pre-wrap leading-relaxed ${subtleSurface}`}
                                >
                                  {msg.evaluation.whatsappSummary}
                                </pre>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* LIVE AI EXAMINER WORKING INDICATOR CARD */}
                {isProcessing && (
                  <div
                    id="examiner-live-working-card"
                    className={`rounded-2xl border p-4 sm:p-5 space-y-3.5 transition-all ${
                      isLight
                        ? 'bg-[#F8FAFC] border-indigo-200 text-[#0F172A] shadow-sm'
                        : 'bg-[#111827] border-[#6366F1]/40 text-white shadow-sm'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-[#17365D] text-white flex items-center justify-center shrink-0">
                          <Loader2 className="w-4 h-4 animate-spin text-[#70E0A0]" />
                        </div>
                        <div>
                          <div className="text-[10px] font-bold font-mono-tabular uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                            {WORKING_STAGES[workingStageIndex].badge}
                          </div>
                          <div className="text-xs sm:text-sm font-bold">
                            AI Principal Examiner is evaluating your task...
                          </div>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg border border-current/15 text-[11px] font-mono-tabular font-semibold shrink-0">
                        {workingElapsedSec}s elapsed
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="text-xs font-medium">
                        {WORKING_STAGES[workingStageIndex].title}
                      </div>
                      <div className={`text-[11px] ${mutedText}`}>
                        {WORKING_STAGES[workingStageIndex].detail}
                      </div>
                    </div>

                    {/* 4-Step Progress Bar */}
                    <div className="grid grid-cols-4 gap-1.5 pt-1">
                      {WORKING_STAGES.map((st, idx) => (
                        <div
                          key={st.badge}
                          className={`h-1.5 rounded-full transition-all ${
                            idx <= workingStageIndex
                              ? 'bg-[#70E0A0]'
                              : isLight
                              ? 'bg-slate-200'
                              : 'bg-white/10'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Bottom Composer Area matching reference screenshot */}
          <div className="p-4 border-t border-current/10 space-y-3">
            {/* Compact Live Status Pill when AI is working */}
            {isProcessing && (
              <div
                className={`px-3 py-2 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                  isLight
                    ? 'bg-indigo-50/90 border-indigo-200 text-indigo-950'
                    : 'bg-[#6366F1]/15 border-[#6366F1]/30 text-indigo-200'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span className="font-semibold truncate">
                    {WORKING_STAGES[workingStageIndex].title}
                  </span>
                </div>
                <span className="text-[11px] font-mono-tabular font-bold shrink-0">
                  {workingElapsedSec}s
                </span>
              </div>
            )}

            {/* Row 1: Quick-Action Chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() =>
                  handleExecuteExaminerAction(
                    'Key Points Right & Lost Marks Breakdown',
                    true
                  )
                }
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold whitespace-nowrap inline-flex items-center gap-1 transition-all disabled:opacity-50 ${subtleSurface} hover:border-current/30`}
              >
                <Check className="w-3 h-3 text-emerald-600 stroke-[2.5]" />
                <span>Key Points Right &amp;</span>
                <X className="w-3 h-3 text-red-500 stroke-[2.5]" />
                <span>Lost Marks</span>
              </button>

              <button
                type="button"
                disabled={isProcessing}
                onClick={() =>
                  handleExecuteExaminerAction(
                    'Grade vs Official Mark Scheme',
                    true
                  )
                }
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold whitespace-nowrap inline-flex items-center gap-1 transition-all disabled:opacity-50 ${subtleSurface} hover:border-current/30`}
              >
                <span>🎯</span> Grade vs Mark Scheme
              </button>

              <button
                type="button"
                disabled={isProcessing}
                onClick={() =>
                  handleExecuteExaminerAction(
                    'Pinpoint Lost Marks & Examiner Fixes',
                    true
                  )
                }
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold whitespace-nowrap inline-flex items-center gap-1 transition-all disabled:opacity-50 ${subtleSurface} hover:border-current/30`}
              >
                <X className="w-3 h-3 text-red-500 stroke-[2.5]" />
                <span>Pinpoint Lost Marks</span>
              </button>

              <button
                type="button"
                disabled={isProcessing}
                onClick={() =>
                  handleExecuteExaminerAction(
                    'Provide a 100% full-marks model examiner answer'
                  )
                }
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold whitespace-nowrap inline-flex items-center gap-1 transition-all disabled:opacity-50 ${subtleSurface} hover:border-current/30`}
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
                disabled={isProcessing}
                onClick={() => photoInputRef.current?.click()}
                className={`w-12 h-11 rounded-xl border flex flex-col items-center justify-center gap-0.5 shrink-0 text-[10px] font-semibold transition-all disabled:opacity-50 ${subtleSurface} hover:border-current/30`}
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
                disabled={isProcessing}
                onClick={() => fileInputRef.current?.click()}
                className={`w-12 h-11 rounded-xl border flex flex-col items-center justify-center gap-0.5 shrink-0 text-[10px] font-semibold transition-all disabled:opacity-50 ${subtleSurface} hover:border-current/30`}
              >
                <Paperclip className="w-3.5 h-3.5 opacity-70" />
                <span>Files</span>
              </button>

              <input
                type="text"
                disabled={isProcessing}
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                placeholder={
                  isProcessing
                    ? 'AI Examiner is evaluating your script...'
                    : 'Paste your question & answer, attach photos or study notes...'
                }
                className={`flex-1 h-11 rounded-xl border px-4 text-xs outline-none transition-all disabled:opacity-60 ${subtleSurface}`}
              />

              <button
                type="submit"
                disabled={isProcessing}
                aria-label="Send message to AI Examiner"
                className={`h-11 px-4 rounded-xl flex items-center justify-center gap-1.5 shrink-0 text-xs font-semibold transition-all disabled:opacity-60 ${primaryBtn}`}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="hidden sm:inline">Working...</span>
                  </>
                ) : (
                  <Send className="w-4 h-4" />
                )}
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
