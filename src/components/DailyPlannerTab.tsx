import React, { useRef, useState } from 'react';
import {
  Plus,
  RefreshCw,
  CheckCircle2,
  Circle,
  ExternalLink,
  CalendarPlus,
  Search,
  Trash2,
  CheckCheck,
  Mic,
  Square,
  Sparkles,
  Clock,
  BrainCircuit,
  ListChecks,
  Loader2,
  Send,
  MessageSquare,
  Wand2,
  Lock,
  Table as TableIcon,
} from 'lucide-react';
import {
  DailyPlanTimeBlock,
  PlannerChatMessage,
  StudyTask,
  ThemeMode,
  VoiceDailyPlanResult,
} from '../types';

interface DailyPlannerTabProps {
  theme: ThemeMode;
  tasks: StudyTask[];
  isSignedIn?: boolean;
  onRequireSignIn?: () => void;
  onAddTask: (task: Omit<StudyTask, 'id'>) => void;
  onToggleTask: (id: string) => void;
  onDeleteTask?: (id: string) => void;
  onMarkAllDone: () => void;
  onClearCompleted: () => void;
  onSortByDeadline: () => void;
  onSyncClassroom: () => void;
  isSyncingClassroom: boolean;
  onExportToCalendar: (task: StudyTask) => Promise<void>;
}

function formatDurationReadable(mins: number): string {
  const m = Math.max(5, Math.round(mins || 45));
  if (m < 60) return `${m} mins`;
  const hrs = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0
    ? `${m} mins (${hrs} hr${hrs > 1 ? 's' : ''})`
    : `${m} mins (${hrs}h ${rem}m)`;
}

export const DailyPlannerTab: React.FC<DailyPlannerTabProps> = ({
  theme,
  tasks,
  isSignedIn = true,
  onRequireSignIn,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  onMarkAllDone,
  onClearCompleted,
  onSortByDeadline,
  onSyncClassroom,
  isSyncingClassroom,
  onExportToCalendar,
}) => {
  const isLight = theme === 'warm';

  // Manual task creation form: Task Name, Time Taken (mins), and Date
  const [title, setTitle] = useState('');
  const [manualMinutes, setManualMinutes] = useState<number>(45);
  const [dueDate, setDueDate] = useState('2026-10-26');

  // Voice recording, Interactive Chat & AI Daily Plan state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [spokenText, setSpokenText] = useState('');
  const [isAnalyzingVoice, setIsAnalyzingVoice] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voicePlanResult, setVoicePlanResult] =
    useState<VoiceDailyPlanResult | null>(null);
  const [dailyPlanBlocks, setDailyPlanBlocks] = useState<DailyPlanTimeBlock[]>(
    []
  );
  const [chatMessages, setChatMessages] = useState<PlannerChatMessage[]>([
    {
      id: 'welcome-coach',
      role: 'assistant',
      content:
        'Open the mic and speak your main tasks out loud (or type them below). Explic AI will transcribe your audio, extract every task and how much time each task takes, and organize them into a structured Tasks & Time Taken Table.',
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    },
  ]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const speechRecognitionRef = useRef<any>(null);
  const recordTimerRef = useRef<number | null>(null);
  const latestSpokenTextRef = useRef<string>('');

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'pending' | 'completed' | 'classroom'
  >('all');
  const [calendarConfirmTask, setCalendarConfirmTask] =
    useState<StudyTask | null>(null);
  const [calendarExportNotice, setCalendarExportNotice] = useState<
    string | null
  >(null);

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAddTask({
      title: title.trim(),
      subject: title.trim(),
      dueDate,
      dueTime: '18:00',
      priority: 'High',
      estimatedMinutes: Math.max(5, Number(manualMinutes) || 45),
      completed: false,
      source: 'manual',
    });
    setTitle('');
  };

  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to read audio blob'));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const runGeminiVoiceAnalysis = async (params: {
    audioBase64?: string;
    mimeType?: string;
    textOverride?: string;
    planExistingOnly?: boolean;
  }) => {
    if (!isSignedIn && onRequireSignIn) {
      onRequireSignIn();
      return;
    }

    const pendingTasks = tasks.filter((t) => !t.completed);
    const textToAnalyze = params.planExistingOnly
      ? 'Plan my existing tasks and organize my daily schedule'
      : (
          params.textOverride ??
          latestSpokenTextRef.current ??
          spokenText
        ).trim();

    if (!params.audioBase64 && !textToAnalyze && pendingTasks.length === 0) {
      setVoiceError(
        'Please speak into your microphone, type your tasks, or add tasks to your list first.'
      );
      return;
    }

    setIsAnalyzingVoice(true);
    setVoiceError(null);

    const userDisplayMessage = params.planExistingOnly
      ? `Analyze my ${pendingTasks.length} existing tasks (${pendingTasks
          .map((t) => t.title)
          .slice(0, 4)
          .join(', ')}) and build my Tasks & Time Taken Table.`
      : textToAnalyze || 'Audio recording submitted for transcription & task extraction';

    const userMsg: PlannerChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userDisplayMessage,
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    const updatedHistory = [...chatMessages, userMsg];
    setChatMessages(updatedHistory);

    try {
      const response = await fetch('/api/planner/voice-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: params.audioBase64,
          mimeType: params.mimeType || 'audio/webm',
          spokenText: textToAnalyze,
          defaultDate: dueDate,
          existingTasks: pendingTasks,
          chatHistory: updatedHistory.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to analyze tasks with Explic AI Planner.');
      }

      const data: VoiceDailyPlanResult = await response.json();
      setVoicePlanResult(data);
      setDailyPlanBlocks(data.dailyPlan || []);

      // Clear input box after sending so user can continue chatting or speaking
      setSpokenText('');
      latestSpokenTextRef.current = '';

      // Automatically add newly extracted tasks to the Daily Planner (avoiding duplicates)
      const existingTitlesLower = new Set(
        tasks.map((t) => t.title.trim().toLowerCase())
      );
      const newlyAddedTasks: NonNullable<
        PlannerChatMessage['extractedTasks']
      > = [];

      if (Array.isArray(data.extractedTasks)) {
        data.extractedTasks.forEach((extracted) => {
          const cleanTitle = (extracted.title || '').trim();
          if (
            cleanTitle &&
            !existingTitlesLower.has(cleanTitle.toLowerCase())
          ) {
            existingTitlesLower.add(cleanTitle.toLowerCase());
            newlyAddedTasks.push(extracted);
            onAddTask({
              title: cleanTitle,
              subject: extracted.subject || cleanTitle,
              dueDate: extracted.dueDate || dueDate,
              dueTime: '18:00',
              priority: extracted.priority || 'High',
              estimatedMinutes: extracted.estimatedMinutes || 45,
              completed: false,
              source: 'manual',
            });
          }
        });
      }

      const assistantMsg: PlannerChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content:
          data.assistantReply ||
          data.analysis.workloadSummary ||
          'I have transcribed your tasks, calculated the time required for each task, and generated your Tasks & Time Taken Table below.',
        timestamp: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        extractedTasks:
          newlyAddedTasks.length > 0 ? newlyAddedTasks : data.extractedTasks,
      };
      setChatMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setVoiceError(
        err instanceof Error ? err.message : 'AI Planner analysis failed.'
      );
    } finally {
      setIsAnalyzingVoice(false);
    }
  };

  const handleStartRecording = async () => {
    if (!isSignedIn && onRequireSignIn) {
      onRequireSignIn();
      return;
    }

    setVoiceError(null);
    setRecordingSeconds(0);
    audioChunksRef.current = [];
    let micStreamAcquired = false;
    let speechRecStarted = false;

    // Start Web Speech API live transcript if supported by browser
    const SpeechRec =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (SpeechRec) {
      try {
        const recognition = new SpeechRec();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        recognition.onresult = (event: any) => {
          let combined = '';
          for (let i = 0; i < event.results.length; i++) {
            combined += event.results[i][0].transcript + ' ';
          }
          const clean = combined.trim();
          if (clean) {
            setSpokenText(clean);
            latestSpokenTextRef.current = clean;
          }
        };
        recognition.start();
        speechRecognitionRef.current = recognition;
        speechRecStarted = true;
      } catch {
        // Ignore if SpeechRecognition fails to start
      }
    }

    // Start MediaRecorder for server-side Gemini audio transcription
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        micStreamAcquired = true;
        const preferredMime =
          typeof MediaRecorder !== 'undefined' &&
          typeof MediaRecorder.isTypeSupported === 'function'
            ? MediaRecorder.isTypeSupported('audio/webm')
              ? 'audio/webm'
              : MediaRecorder.isTypeSupported('audio/mp4')
              ? 'audio/mp4'
              : MediaRecorder.isTypeSupported('audio/ogg')
              ? 'audio/ogg'
              : ''
            : '';
        const recorder = preferredMime
          ? new MediaRecorder(stream, { mimeType: preferredMime })
          : new MediaRecorder(stream);

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };
        recorder.onstop = async () => {
          stream.getTracks().forEach((track) => track.stop());
          const cleanText = (
            latestSpokenTextRef.current ||
            spokenText ||
            ''
          ).trim();
          if (audioChunksRef.current.length > 0) {
            const rawMime = recorder.mimeType || preferredMime || 'audio/webm';
            const cleanMimeType = rawMime.split(';')[0].trim() || 'audio/webm';
            const audioBlob = new Blob(audioChunksRef.current, {
              type: cleanMimeType,
            });
            try {
              const base64Audio = await blobToBase64(audioBlob);
              await runGeminiVoiceAnalysis({
                audioBase64: base64Audio,
                mimeType: cleanMimeType,
                textOverride: cleanText,
              });
              return;
            } catch {
              // Fall through to text check
            }
          }
          if (cleanText) {
            await runGeminiVoiceAnalysis({
              textOverride: cleanText,
            });
          } else {
            setVoiceError(
              'No speech was detected in the recording. Please speak your tasks clearly into the microphone or type them in the box below.'
            );
          }
        };
        recorder.start(250);
        mediaRecorderRef.current = recorder;
      } catch {
        // Microphone permission denied or unavailable
      }
    }

    if (!micStreamAcquired && !speechRecStarted) {
      setVoiceError(
        'Microphone access is blocked or unavailable in this browser tab. Please allow microphone permission or type your tasks directly into the box below.'
      );
      return;
    }

    setIsRecording(true);
    recordTimerRef.current = window.setInterval(() => {
      setRecordingSeconds((s) => s + 1);
    }, 1000);
  };

  const handleStopRecording = async () => {
    setIsRecording(false);
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }

    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch {}
      speechRecognitionRef.current = null;
    }

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
      return;
    }

    const cleanText = (latestSpokenTextRef.current || spokenText || '').trim();
    if (cleanText) {
      await runGeminiVoiceAnalysis({
        textOverride: cleanText,
      });
    } else {
      setVoiceError(
        'No spoken audio was captured. Please speak clearly while the microphone is open, or type your tasks in the box below and click Extract Tasks & Build Table.'
      );
    }
  };

  const handleTogglePlanBlock = (blockId: string) => {
    setDailyPlanBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId ? { ...b, completed: !b.completed } : b
      )
    );
  };

  const handleConfirmCalendarExport = async () => {
    if (!calendarConfirmTask) return;
    const taskToExport = calendarConfirmTask;
    setCalendarConfirmTask(null);
    await onExportToCalendar(taskToExport);
    setCalendarExportNotice(
      `Scheduled "${taskToExport.title}" on your Google Calendar.`
    );
    setTimeout(() => setCalendarExportNotice(null), 3500);
  };

  const filteredTasks = tasks.filter((t) => {
    if (statusFilter === 'pending' && t.completed) return false;
    if (statusFilter === 'completed' && !t.completed) return false;
    if (statusFilter === 'classroom' && t.source !== 'classroom') return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        (t.courseName || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const pendingTaskCount = tasks.filter((t) => !t.completed).length;
  const totalFilteredMinutes = filteredTasks.reduce(
    (sum, t) => sum + (t.estimatedMinutes || 45),
    0
  );

  const cardSurface = isLight
    ? 'bg-white border-[#E2E8F0] text-[#0F172A] shadow-[0_1px_2px_rgba(15,23,42,0.03)]'
    : 'bg-[#111827] border-white/10 text-[#F8FAFC]';
  const inputSurface = isLight
    ? 'bg-[#F8FAFC] border-[#E2E8F0] text-[#0F172A] focus:bg-white focus:border-[#0F172A]'
    : 'bg-[#090D16] border-white/10 text-[#F8FAFC] focus:border-[#6366F1]';
  const mutedText = isLight ? 'text-[#64748B]' : 'text-[#94A3B8]';
  const primaryBtn = isLight
    ? 'bg-[#0F172A] hover:bg-[#1E293B] text-white'
    : 'bg-[#6366F1] hover:bg-[#4F46E5] text-white';

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Daily Planner</h1>
          <p className={`text-xs mt-1 ${mutedText}`}>
            Speak or type your study tasks — Explic AI transcribes your audio, extracts every task, and builds a structured Tasks &amp; Time Taken Table
          </p>
        </div>

        <button
          type="button"
          onClick={onSyncClassroom}
          disabled={isSyncingClassroom}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap self-start sm:self-auto ${primaryBtn}`}
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isSyncingClassroom ? 'animate-spin' : ''}`}
          />
          {isSyncingClassroom ? 'Syncing Classroom...' : 'Sync Google Classroom'}
        </button>
      </div>

      {!isSignedIn && onRequireSignIn && (
        <div
          className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            isLight
              ? 'bg-indigo-50/80 border-indigo-200 text-[#0F172A]'
              : 'bg-indigo-950/30 border-indigo-500/30 text-white'
          }`}
        >
          <div className="flex items-center gap-3 text-xs">
            <Lock className="w-4 h-4 text-indigo-500 shrink-0" />
            <span>
              <strong>Sign In Required for AI Facilities:</strong> Please sign in with Google or Two-Step Email Verification to use the AI Voice &amp; Daily Planner Coach.
            </span>
          </div>
          <button
            type="button"
            onClick={onRequireSignIn}
            className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 ${primaryBtn}`}
          >
            Sign In / Verify Now
          </button>
        </div>
      )}

      {calendarExportNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
          {calendarExportNotice}
        </div>
      )}

      {/* Manual Task Creator Bar: Task Name, Time Taken (mins), and Date */}
      <section className={`rounded-2xl border p-5 ${cardSurface}`}>
        <form
          onSubmit={handleCreateTask}
          className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs"
        >
          <div className="sm:col-span-5">
            <input
              id="planner-task-title"
              type="text"
              required
              aria-label="Subject or task name"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add a task manually (e.g. Revise Physics Electricity)..."
              className={`w-full rounded-xl border px-3.5 py-2.5 outline-none transition-colors ${inputSurface}`}
            />
          </div>

          <div className="sm:col-span-2">
            <div className="relative">
              <input
                id="planner-task-minutes"
                type="number"
                min={5}
                max={300}
                step={5}
                required
                aria-label="Time taken in minutes"
                value={manualMinutes}
                onChange={(e) =>
                  setManualMinutes(Math.max(5, Number(e.target.value) || 45))
                }
                className={`w-full rounded-xl border pl-3 pr-11 py-2.5 font-mono-tabular outline-none transition-colors ${inputSurface}`}
              />
              <span
                className={`absolute right-3 top-1/2 -translate-y-1/2 text-[11px] pointer-events-none ${mutedText}`}
              >
                mins
              </span>
            </div>
          </div>

          <div className="sm:col-span-3">
            <input
              id="planner-task-date"
              type="date"
              required
              aria-label="Date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={`w-full rounded-xl border px-3.5 py-2.5 font-mono-tabular outline-none transition-colors ${inputSurface}`}
            />
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              className={`w-full h-full py-2.5 px-4 rounded-xl font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap ${primaryBtn}`}
            >
              <Plus className="w-4 h-4" />
              Add Task
            </button>
          </div>
        </form>
      </section>

      {/* Explic AI Voice-to-Tasks & Structured Table Studio */}
      <section className={`rounded-2xl border p-6 space-y-5 ${cardSurface}`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              <h2 className="text-base font-bold tracking-tight">
                Explic AI Audio Transcription &amp; Task Extraction Table
              </h2>
            </div>
            <p className={`text-xs ${mutedText}`}>
              Open the mic to speak your tasks out loud — AI transcribes the audio, extracts each task and its time required, and creates your Tasks &amp; Time Taken Table.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              id="plan-existing-tasks-btn"
              type="button"
              disabled={isAnalyzingVoice || pendingTaskCount === 0}
              onClick={() =>
                runGeminiVoiceAnalysis({ planExistingOnly: true })
              }
              className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition-all whitespace-nowrap disabled:opacity-50 ${
                isLight
                  ? 'border-[#CBD5E1] bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#0F172A]'
                  : 'border-white/15 bg-white/5 hover:bg-white/10 text-white'
              }`}
            >
              <Wand2 className="w-3.5 h-3.5 text-indigo-500" />
              <span>Plan My Existing Tasks ({pendingTaskCount})</span>
            </button>

            {!isRecording ? (
              <button
                id="voice-record-btn"
                type="button"
                onClick={handleStartRecording}
                disabled={isAnalyzingVoice}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                  isLight
                    ? 'bg-rose-600 hover:bg-rose-700 text-white'
                    : 'bg-rose-500 hover:bg-rose-600 text-white'
                }`}
              >
                <Mic className="w-4 h-4" />
                Open Mic &amp; Speak Tasks
              </button>
            ) : (
              <button
                id="voice-stop-btn"
                type="button"
                onClick={handleStopRecording}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-700 text-white animate-pulse whitespace-nowrap"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                Stop &amp; Transcribe ({recordingSeconds}s)
              </button>
            )}
          </div>
        </div>

        {/* Conversational Thread with the AI Study Planner */}
        <div
          className={`rounded-xl border p-4 max-h-60 overflow-y-auto space-y-3 ${
            isLight
              ? 'bg-[#F8FAFC] border-[#E2E8F0]'
              : 'bg-[#090D16] border-white/10'
          }`}
        >
          {chatMessages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${
                msg.role === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              <div
                className={`max-w-2xl rounded-2xl px-4 py-3 text-xs leading-relaxed space-y-2 ${
                  msg.role === 'user'
                    ? isLight
                      ? 'bg-[#0F172A] text-white'
                      : 'bg-[#6366F1] text-white'
                    : isLight
                    ? 'bg-white border border-[#E2E8F0] text-[#0F172A]'
                    : 'bg-[#111827] border border-white/10 text-[#F8FAFC]'
                }`}
              >
                <div className="flex items-center justify-between gap-4 opacity-75 text-[10px] font-semibold uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" />
                    {msg.role === 'user' ? 'You' : 'Explic AI Planner'}
                  </span>
                  <span>{msg.timestamp}</span>
                </div>
                <p>{msg.content}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Spoken Transcript / Chat Input & Direct AI Trigger */}
        <div className="flex flex-col sm:flex-row gap-3 text-xs">
          <input
            id="voice-transcript-input"
            type="text"
            aria-label="Spoken tasks transcript"
            value={spokenText}
            onChange={(e) => {
              setSpokenText(e.target.value);
              latestSpokenTextRef.current = e.target.value;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && spokenText.trim() && !isAnalyzingVoice) {
                e.preventDefault();
                runGeminiVoiceAnalysis({ textOverride: spokenText });
              }
            }}
            placeholder={
              isRecording
                ? 'Listening... speak your tasks out loud (e.g. "Finish Physics electricity worksheet for 60 minutes, then revise Chemistry organic reactions for 45 minutes")...'
                : 'Speak with the mic or type your tasks here (e.g. "Solve Calculus past paper for 1 hour, then review Biology notes for 30 minutes")...'
            }
            className={`flex-1 rounded-xl border px-3.5 py-2.5 outline-none transition-colors ${inputSurface}`}
          />

          <button
            id="voice-analyze-btn"
            type="button"
            disabled={isAnalyzingVoice || !spokenText.trim()}
            onClick={() =>
              runGeminiVoiceAnalysis({ textOverride: spokenText })
            }
            className={`px-4 py-2.5 rounded-xl font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap transition-all disabled:opacity-50 ${primaryBtn}`}
          >
            {isAnalyzingVoice ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Transcribing &amp; Extracting...
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                Extract Tasks &amp; Build Table
              </>
            )}
          </button>
        </div>

        {voiceError && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-medium">
            {voiceError}
          </div>
        )}

        {/* AI Audio Transcription + Extracted Tasks & Time Taken Table */}
        {voicePlanResult && (
          <div className="pt-4 border-t border-current/10 space-y-5">
            {/* Audio Transcription Banner */}
            <div
              className={`p-4 rounded-xl border space-y-1.5 ${
                isLight
                  ? 'bg-[#F8FAFC] border-[#E2E8F0]'
                  : 'bg-[#090D16] border-white/10'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold flex items-center gap-1.5">
                  <Mic className="w-3.5 h-3.5 text-rose-500" />
                  Audio Transcription
                </span>
                <span className={`text-[11px] font-mono-tabular ${mutedText}`}>
                  {voicePlanResult.modelUsed}
                </span>
              </div>
              <p className="text-xs leading-relaxed italic">
                &ldquo;{voicePlanResult.transcript}&rdquo;
              </p>
            </div>

            {/* Dedicated Extracted Tasks & Time Taken Table */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <TableIcon className="w-3.5 h-3.5 text-indigo-500" />
                  Extracted Tasks &amp; Time Taken Table
                </h3>
                <span className="text-xs font-mono-tabular font-semibold">
                  Total Time: {formatDurationReadable(voicePlanResult.analysis.totalEstimatedMinutes)}
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-current/10">
                <table
                  id="extracted-tasks-table"
                  className="w-full text-left border-collapse text-xs"
                >
                  <thead>
                    <tr
                      className={`border-b border-current/10 ${
                        isLight ? 'bg-[#F8FAFC]' : 'bg-[#090D16]'
                      }`}
                    >
                      <th className="py-2.5 px-3.5 font-semibold w-10">#</th>
                      <th className="py-2.5 px-3.5 font-semibold">
                        Task Extracted from Audio
                      </th>
                      <th className="py-2.5 px-3.5 font-semibold">Subject</th>
                      <th className="py-2.5 px-3.5 font-semibold">
                        Time Taken to Do
                      </th>
                      <th className="py-2.5 px-3.5 font-semibold">Priority</th>
                      <th className="py-2.5 px-3.5 font-semibold">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-current/10">
                    {(voicePlanResult.extractedTasks.length > 0
                      ? voicePlanResult.extractedTasks
                      : tasks.filter((t) => !t.completed)
                    ).map((item, idx) => (
                      <tr key={`${item.title}-${idx}`}>
                        <td className={`py-2.5 px-3.5 font-mono-tabular ${mutedText}`}>
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3.5 font-semibold">
                          {item.title}
                        </td>
                        <td className={`py-2.5 px-3.5 ${mutedText}`}>
                          {item.subject || 'General Study'}
                        </td>
                        <td className="py-2.5 px-3.5 font-mono-tabular font-bold text-indigo-600 dark:text-indigo-400">
                          {formatDurationReadable(item.estimatedMinutes)}
                        </td>
                        <td className="py-2.5 px-3.5 font-medium">
                          {item.priority}
                        </td>
                        <td className={`py-2.5 px-3.5 font-mono-tabular ${mutedText}`}>
                          {item.dueDate}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr
                      className={`border-t border-current/10 font-bold ${
                        isLight ? 'bg-[#F8FAFC]' : 'bg-[#090D16]'
                      }`}
                    >
                      <td colSpan={3} className="py-2.5 px-3.5">
                        Total Estimated Workload Time
                      </td>
                      <td
                        colSpan={3}
                        className="py-2.5 px-3.5 font-mono-tabular text-indigo-600 dark:text-indigo-400"
                      >
                        {formatDurationReadable(
                          voicePlanResult.analysis.totalEstimatedMinutes
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Time-Blocked Daily Schedule */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  AI Time-Blocked Daily Schedule
                </h3>
                <button
                  type="button"
                  onClick={() => setVoicePlanResult(null)}
                  className={`text-xs hover:underline ${mutedText}`}
                >
                  Clear Plan
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {dailyPlanBlocks.map((block) => (
                  <div
                    key={block.id}
                    onClick={() => handleTogglePlanBlock(block.id)}
                    className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer transition-all ${
                      block.completed ? 'opacity-60' : ''
                    } ${
                      isLight
                        ? 'bg-[#F8FAFC] border-[#E2E8F0] hover:border-[#CBD5E1]'
                        : 'bg-[#090D16] border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        aria-label={`Toggle daily plan block ${block.title}`}
                        className="mt-0.5 shrink-0"
                      >
                        {block.completed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Circle className={`w-4 h-4 ${mutedText}`} />
                        )}
                      </button>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono-tabular text-xs font-bold">
                            {block.timeSlot}
                          </span>
                          <span
                            className={`text-sm font-semibold ${
                              block.completed ? 'line-through' : ''
                            }`}
                          >
                            {block.title}
                          </span>
                        </div>
                        <p className={`text-xs mt-0.5 ${mutedText}`}>
                          {block.coachingNote}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <span
                        className={`text-[11px] font-mono-tabular px-2.5 py-1 rounded-lg border ${
                          isLight
                            ? 'bg-white border-[#E2E8F0]'
                            : 'bg-[#111827] border-white/10'
                        }`}
                      >
                        {block.durationMinutes} min
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Main Planner Tasks & Time Taken Table */}
      <section className={`rounded-2xl border p-6 space-y-5 ${cardSurface}`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-current/5">
          <div className="flex flex-wrap items-center gap-1.5">
            {(['all', 'pending', 'completed', 'classroom'] as const).map(
              (f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setStatusFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    statusFilter === f
                      ? primaryBtn
                      : `${mutedText} hover:opacity-100`
                  }`}
                >
                  {f === 'all'
                    ? 'All Tasks'
                    : f === 'pending'
                    ? 'Pending'
                    : f === 'completed'
                    ? 'Completed'
                    : 'Classroom'}
                </button>
              )
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
              <input
                type="text"
                aria-label="Search study tasks"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tasks..."
                className={`pl-8 pr-3 py-1.5 rounded-lg border text-xs outline-none ${inputSurface}`}
              />
            </div>

            <button
              type="button"
              onClick={onSortByDeadline}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap ${
                isLight
                  ? 'border-[#E2E8F0] hover:bg-[#F8FAFC]'
                  : 'border-white/10 hover:bg-white/5'
              }`}
            >
              Sort by Date
            </button>
            <button
              type="button"
              onClick={onMarkAllDone}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap ${
                isLight
                  ? 'border-[#E2E8F0] hover:bg-[#F8FAFC]'
                  : 'border-white/10 hover:bg-white/5'
              }`}
            >
              <CheckCheck className="w-3.5 h-3.5 inline mr-1" />
              Mark All
            </button>
            <button
              type="button"
              onClick={onClearCompleted}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap ${
                isLight
                  ? 'border-[#E2E8F0] hover:bg-[#F8FAFC]'
                  : 'border-white/10 hover:bg-white/5'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5 inline mr-1" />
              Clear Done
            </button>
          </div>
        </div>

        {filteredTasks.length === 0 ? (
          <div className={`py-12 text-center text-xs ${mutedText}`}>
            No tasks in your table yet. Speak your tasks with the microphone above or add a task manually to see your Tasks &amp; Time Taken Table.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-current/10">
            <table
              id="planner-tasks-table"
              className="w-full text-left border-collapse text-xs"
            >
              <thead>
                <tr
                  className={`border-b border-current/10 ${
                    isLight ? 'bg-[#F8FAFC]' : 'bg-[#090D16]'
                  }`}
                >
                  <th className="py-3 px-4 font-semibold w-12">Done</th>
                  <th className="py-3 px-4 font-semibold">Task Name</th>
                  <th className="py-3 px-4 font-semibold">Subject</th>
                  <th className="py-3 px-4 font-semibold">
                    Time Taken to Do
                  </th>
                  <th className="py-3 px-4 font-semibold">Priority</th>
                  <th className="py-3 px-4 font-semibold">Due Date</th>
                  <th className="py-3 px-4 font-semibold text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-current/10">
                {filteredTasks.map((task) => (
                  <tr
                    key={task.id}
                    className={`transition-colors ${
                      task.completed ? 'opacity-55' : ''
                    }`}
                  >
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => onToggleTask(task.id)}
                        aria-label={`Mark "${task.title}" as ${
                          task.completed ? 'incomplete' : 'completed'
                        }`}
                      >
                        {task.completed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Circle className={`w-4 h-4 ${mutedText}`} />
                        )}
                      </button>
                    </td>
                    <td
                      className={`py-3 px-4 font-semibold ${
                        task.completed ? 'line-through' : ''
                      }`}
                    >
                      {task.title}
                    </td>
                    <td className={`py-3 px-4 ${mutedText}`}>
                      {task.subject || 'General'}
                    </td>
                    <td className="py-3 px-4 font-mono-tabular font-bold text-indigo-600 dark:text-indigo-400">
                      {formatDurationReadable(task.estimatedMinutes)}
                    </td>
                    <td className="py-3 px-4 font-medium">{task.priority}</td>
                    <td className={`py-3 px-4 font-mono-tabular ${mutedText}`}>
                      {task.dueDate}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        {task.alternateLink && (
                          <a
                            href={task.alternateLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium whitespace-nowrap ${
                              isLight
                                ? 'border-[#E2E8F0] hover:bg-[#F8FAFC]'
                                : 'border-white/10 hover:bg-white/5'
                            }`}
                          >
                            Classroom
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => setCalendarConfirmTask(task)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium whitespace-nowrap ${
                            isLight
                              ? 'border-[#E2E8F0] hover:bg-[#F8FAFC]'
                              : 'border-white/10 hover:bg-white/5'
                          }`}
                        >
                          <CalendarPlus className="w-3 h-3" />
                          Calendar
                        </button>
                        {onDeleteTask && (
                          <button
                            type="button"
                            onClick={() => onDeleteTask(task.id)}
                            aria-label={`Delete ${task.title}`}
                            className="p-1.5 rounded-lg opacity-60 hover:opacity-100 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr
                  className={`border-t border-current/10 font-bold ${
                    isLight ? 'bg-[#F8FAFC]' : 'bg-[#090D16]'
                  }`}
                >
                  <td colSpan={3} className="py-3 px-4">
                    Total Time Taken ({filteredTasks.length}{' '}
                    {filteredTasks.length === 1 ? 'task' : 'tasks'})
                  </td>
                  <td
                    colSpan={4}
                    className="py-3 px-4 font-mono-tabular text-indigo-600 dark:text-indigo-400"
                  >
                    {formatDurationReadable(totalFilteredMinutes)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {calendarConfirmTask && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="calendar-confirm-title"
        >
          <div className={`max-w-md w-full rounded-2xl border p-6 ${cardSurface}`}>
            <h3 id="calendar-confirm-title" className="text-base font-bold">
              Export to Google Calendar
            </h3>
            <p className={`text-xs mt-2 leading-relaxed ${mutedText}`}>
              Create a study block event on your primary Google Calendar for{' '}
              <strong>&ldquo;{calendarConfirmTask.title}&rdquo;</strong> on{' '}
              <span className="font-mono-tabular">
                {calendarConfirmTask.dueDate}
              </span>
              ?
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setCalendarConfirmTask(null)}
                className={`px-3.5 py-2 rounded-xl border text-xs font-semibold ${
                  isLight
                    ? 'border-[#E2E8F0] hover:bg-[#F8FAFC]'
                    : 'border-white/10 hover:bg-white/5'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmCalendarExport}
                className={`px-4 py-2 rounded-xl text-xs font-semibold ${primaryBtn}`}
              >
                Confirm Export
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
