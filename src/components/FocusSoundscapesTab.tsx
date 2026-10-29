import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  CloudRain,
  Volume2,
  VolumeX,
  Eye,
  EyeOff,
  Plus,
  Minus,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { ThemeMode } from '../types';
import { soundscapeEngine } from '../utils/soundscapeEngine';

interface FocusSoundscapesTabProps {
  theme: ThemeMode;
  wakeLockActive: boolean;
  onToggleWakeLock: () => void;
  onCompleteFocusSession: (minutesCompleted: number, xpEarned: number) => void;
}

interface FlipCardUnitProps {
  value: number;
  label: string;
  isLight: boolean;
  onIncrement?: () => void;
  onDecrement?: () => void;
  disabledAdjust?: boolean;
}

const FlipCardUnit: React.FC<FlipCardUnitProps> = ({
  value,
  label,
  isLight,
  onIncrement,
  onDecrement,
  disabledAdjust,
}) => {
  const formatted = String(Math.max(0, value)).padStart(2, '0');
  const [prevFormatted, setPrevFormatted] = useState(formatted);
  const [flipKey, setFlipKey] = useState(0);
  const [isFlipping, setIsFlipping] = useState(false);

  useEffect(() => {
    if (formatted !== prevFormatted) {
      setIsFlipping(true);
      setFlipKey((k) => k + 1);
      const timer = window.setTimeout(() => {
        setPrevFormatted(formatted);
        setIsFlipping(false);
      }, 420);
      return () => window.clearTimeout(timer);
    }
  }, [formatted, prevFormatted]);

  return (
    <div className="flex flex-col items-center select-none group">
      {/* Outer Rounded Flip-Card Shell matching reference image */}
      <div
        className={`relative w-32 h-40 sm:w-56 sm:h-64 md:w-72 md:h-80 rounded-[32px] sm:rounded-[42px] p-2 border transition-all ${
          isLight
            ? 'bg-white border-[#E2E8F0] shadow-[0_14px_34px_rgba(15,23,42,0.06)]'
            : 'bg-[#111827] border-white/15 shadow-[0_18px_40px_rgba(0,0,0,0.45)]'
        }`}
      >
        {/* Inner Split-Flap Face */}
        <div
          key={flipKey}
          className={`relative w-full h-full rounded-[26px] sm:rounded-[36px] border overflow-hidden flex items-center justify-center ${
            isFlipping ? 'animate-flip-snap' : ''
          } ${
            isLight
              ? 'border-[#E2E8F0]'
              : 'border-white/10'
          }`}
        >
          {/* Top Half Surface */}
          <div
            className={`absolute inset-x-0 top-0 h-1/2 ${
              isLight ? 'bg-[#FFFFFF]' : 'bg-[#161F33]'
            }`}
          />

          {/* Bottom Half Shaded Surface matching reference split-flap aesthetic */}
          <div
            className={`absolute inset-x-0 bottom-0 h-1/2 ${
              isLight ? 'bg-[#E2E8F0]/65' : 'bg-[#0B101D]'
            }`}
          />

          {/* Animated Top Flap Leaf during flip */}
          {isFlipping && (
            <div
              className={`absolute inset-x-0 top-0 h-1/2 overflow-hidden z-20 animate-flip-top border-b ${
                isLight
                  ? 'bg-[#FFFFFF] border-[#0F172A]/20'
                  : 'bg-[#1E293B] border-white/20'
              }`}
            >
              <div className="w-full h-[200%] flex items-center justify-center">
                <span
                  className={`font-display tabular-nums font-extrabold text-6xl sm:text-8xl md:text-[112px] tracking-tight leading-none ${
                    isLight ? 'text-[#0F172A]' : 'text-[#F8FAFC]'
                  }`}
                >
                  {prevFormatted}
                </span>
              </div>
            </div>
          )}

          {/* Animated Bottom Flap Leaf during flip */}
          {isFlipping && (
            <div
              className={`absolute inset-x-0 bottom-0 h-1/2 overflow-hidden z-20 animate-flip-bottom border-t ${
                isLight
                  ? 'bg-[#E2E8F0]/80 border-[#0F172A]/20'
                  : 'bg-[#0B101D] border-white/20'
              }`}
            >
              <div className="w-full h-[200%] -translate-y-1/2 flex items-center justify-center">
                <span
                  className={`font-display tabular-nums font-extrabold text-6xl sm:text-8xl md:text-[112px] tracking-tight leading-none ${
                    isLight ? 'text-[#0F172A]' : 'text-[#F8FAFC]'
                  }`}
                >
                  {formatted}
                </span>
              </div>
            </div>
          )}

          {/* Main Digit Display */}
          <span
            className={`relative z-10 font-display tabular-nums font-extrabold text-6xl sm:text-8xl md:text-[112px] tracking-tight leading-none ${
              isLight ? 'text-[#0F172A]' : 'text-[#F8FAFC]'
            }`}
          >
            {formatted}
          </span>

          {/* Horizontal Split Seam Line across the center */}
          <div
            className={`absolute inset-x-0 top-1/2 -translate-y-1/2 h-[2.5px] z-30 ${
              isLight ? 'bg-[#0F172A]' : 'bg-[#6366F1]/80'
            }`}
          />

          {/* Subtle Hover Stepper Controls when timer is paused */}
          {!disabledAdjust && onIncrement && onDecrement && (
            <div className="absolute top-2.5 right-2.5 z-40 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={onDecrement}
                aria-label={`Decrease ${label}`}
                className={`w-6 h-6 rounded-full border flex items-center justify-center text-[10px] ${
                  isLight
                    ? 'bg-white/90 border-[#CBD5E1] text-[#0F172A] hover:bg-[#F8FAFC]'
                    : 'bg-[#111827]/90 border-white/20 text-white hover:bg-white/10'
                }`}
              >
                <Minus className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={onIncrement}
                aria-label={`Increase ${label}`}
                className={`w-6 h-6 rounded-full border flex items-center justify-center text-[10px] ${
                  isLight
                    ? 'bg-white/90 border-[#CBD5E1] text-[#0F172A] hover:bg-[#F8FAFC]'
                    : 'bg-[#111827]/90 border-white/20 text-white hover:bg-white/10'
                }`}
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Left Semicircular Mechanical Hinge Cap */}
        <div
          className={`absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1.5 w-3.5 h-6 sm:w-4 sm:h-7 rounded-r-full border z-30 ${
            isLight
              ? 'bg-[#E2E8F0] border-[#CBD5E1]'
              : 'bg-[#1E293B] border-white/25'
          }`}
        />

        {/* Right Semicircular Mechanical Hinge Cap */}
        <div
          className={`absolute right-0 top-1/2 -translate-y-1/2 translate-x-1.5 w-3.5 h-6 sm:w-4 sm:h-7 rounded-l-full border z-30 ${
            isLight
              ? 'bg-[#E2E8F0] border-[#CBD5E1]'
              : 'bg-[#1E293B] border-white/25'
          }`}
        />
      </div>

      {/* Unit Label underneath card matching reference image */}
      <span
        className={`mt-4 text-[11px] sm:text-xs font-bold tracking-[0.22em] uppercase ${
          isLight ? 'text-[#475569]' : 'text-[#94A3B8]'
        }`}
      >
        {label}
      </span>
    </div>
  );
};

export const FocusSoundscapesTab: React.FC<FocusSoundscapesTabProps> = ({
  theme,
  wakeLockActive,
  onToggleWakeLock,
  onCompleteFocusSession,
}) => {
  const isLight = theme === 'warm';

  // Default to P2 Timer 45 minutes (00 : 45 : 00)
  const [configuredTotalSeconds, setConfiguredTotalSeconds] = useState(
    45 * 60
  );
  const [secondsLeft, setSecondsLeft] = useState(45 * 60);
  const [isRunning, setIsRunning] = useState(false);

  // Rain Sounds only state
  const [rainActive, setRainActive] = useState(false);
  const [rainVolume, setRainVolume] = useState(0.45);
  const [masterMuted, setMasterMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const visualizerCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (!containerRef.current) return;
        if (!document.fullscreenElement) {
          containerRef.current.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      } else if (e.code === 'Space') {
        e.preventDefault();
        setIsRunning((r) => !r);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!isRunning && rainActive) {
      soundscapeEngine.stop();
      setRainActive(false);
    }
  }, [isRunning, rainActive]);

  useEffect(() => {
    if (!isRunning) return;
    const interval = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          soundscapeEngine.playBellChime();
          const completedMins = Math.max(
            1,
            Math.round(configuredTotalSeconds / 60)
          );
          onCompleteFocusSession(completedMins, completedMins * 10);
          setIsRunning(false);
          return configuredTotalSeconds;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isRunning, configuredTotalSeconds, onCompleteFocusSession]);

  useEffect(() => {
    const canvas = visualizerCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const renderBars = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const bars = soundscapeEngine.getFrequencyBars(24);
      const barWidth = Math.floor(w / 24) - 2;

      for (let i = 0; i < 24; i++) {
        const val = bars[i] || 5;
        const barHeight = Math.max(4, (val / 255) * (h - 6));
        const x = i * (barWidth + 2);
        const y = h - barHeight;
        ctx.fillStyle = isLight ? '#0F172A' : '#6366F1';
        ctx.fillRect(x, y, barWidth, barHeight);
      }
      rafId = window.requestAnimationFrame(renderBars);
    };

    rafId = window.requestAnimationFrame(renderBars);
    return () => window.cancelAnimationFrame(rafId);
  }, [isLight]);

  const handleSelectDurationPreset = (totalSecs: number) => {
    setIsRunning(false);
    setConfiguredTotalSeconds(totalSecs);
    setSecondsLeft(totalSecs);
  };

  const handleAdjustUnit = (deltaSeconds: number) => {
    if (isRunning) return;
    setSecondsLeft((prev) => {
      const next = Math.max(0, Math.min(99 * 3600 + 59 * 60 + 59, prev + deltaSeconds));
      setConfiguredTotalSeconds(next);
      return next;
    });
  };

  const handleToggleRain = () => {
    const nowOn = soundscapeEngine.toggleChannel('rainWindow', rainVolume);
    setRainActive(nowOn);
  };

  const handleRainVolumeChange = (val: number) => {
    setRainVolume(val);
    soundscapeEngine.setChannelVolume('rainWindow', val);
  };

  const hours = Math.floor(secondsLeft / 3600);
  const minutes = Math.floor((secondsLeft % 3600) / 60);
  const seconds = secondsLeft % 60;

  const statusLabel = isRunning
    ? 'FOCUSING'
    : secondsLeft < configuredTotalSeconds
    ? 'PAUSED'
    : 'READY';

  const cardSurface = isLight
    ? 'bg-white border-[#E2E8F0] text-[#0F172A] shadow-[0_1px_2px_rgba(15,23,42,0.03)]'
    : 'bg-[#111827] border-white/10 text-[#F8FAFC]';
  const subtleSurface = isLight
    ? 'bg-[#F8FAFC] border-[#E2E8F0]'
    : 'bg-[#090D16] border-white/10';
  const mutedText = isLight ? 'text-[#64748B]' : 'text-[#94A3B8]';
  const primaryBtn = isLight
    ? 'bg-[#0F172A] hover:bg-[#1E293B] text-white'
    : 'bg-[#6366F1] hover:bg-[#4F46E5] text-white';
  const outlineBtn = isLight
    ? 'bg-white border-[#E2E8F0] text-[#0F172A] hover:bg-[#F8FAFC]'
    : 'bg-[#111827] border-white/10 text-[#F8FAFC] hover:bg-white/5';

  const PRESETS = [
    { label: 'P2 Timer (45 min)', secs: 45 * 60 },
    { label: 'P4 Timer (75 min)', secs: 75 * 60 },
    { label: 'P6 Timer (60 min)', secs: 60 * 60 },
    { label: 'Math Timer (2 hours)', secs: 120 * 60 },
  ];

  return (
    <div
      ref={containerRef}
      className={`min-h-[60vh] flex flex-col justify-between p-8 ${
        isFullscreen
          ? `fixed inset-0 z-50 ${isLight ? 'bg-[#F9F7F3]' : 'bg-[#090D16]'}`
          : 'rounded-3xl border ' + (isLight ? 'bg-white border-[#E2E8F0]' : 'bg-[#111827] border-white/10')
      }`}
    >
      {/* Top Toolbar */}
      <div className="flex items-center justify-between text-xs font-semibold">
        <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            <span className="tracking-wide">CUSTOM ({Math.round(configuredTotalSeconds/60)} MIN)</span>
        </div>
        <div className="flex items-center gap-2">
            <button
                type="button"
                onClick={handleToggleRain}
                className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all ${
                    rainActive ? (isLight ? 'bg-[#F1F5F9] border-[#E2E8F0]' : 'bg-white/10 border-white/20') : (isLight ? 'border-[#E2E8F0]' : 'border-white/10')
                }`}
            >
                <CloudRain className="w-4 h-4" />
                Rain
            </button>
            <button
                type="button"
                onClick={() => {
                  if (!containerRef.current) return;
                  if (!document.fullscreenElement) {
                    containerRef.current.requestFullscreen();
                  } else {
                    document.exitFullscreen();
                  }
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all ${
                    isLight ? 'border-[#E2E8F0]' : 'border-white/10'
                }`}
            >
                <Maximize2 className="w-4 h-4" />
                {isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
            </button>
        </div>
      </div>

      {/* Timer Display */}
      <div className="flex flex-col items-center justify-center flex-grow py-12">
        <div className="flex items-center gap-8 md:gap-12">
            <FlipCardUnit value={hours} label="HOURS" isLight={isLight} disabledAdjust={isRunning} onIncrement={() => handleAdjustUnit(3600)} onDecrement={() => handleAdjustUnit(-3600)} />
            <FlipCardUnit value={minutes} label="MINUTES" isLight={isLight} disabledAdjust={isRunning} onIncrement={() => handleAdjustUnit(60)} onDecrement={() => handleAdjustUnit(-60)} />
            <FlipCardUnit value={seconds} label="SECONDS" isLight={isLight} disabledAdjust={isRunning} onIncrement={() => handleAdjustUnit(1)} onDecrement={() => handleAdjustUnit(-1)} />
        </div>
        <div className={`mt-10 inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-[11px] font-bold uppercase ${isLight ? 'bg-white border-[#E2E8F0]' : 'bg-[#111827] border-white/10'}`}>
            <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
            {statusLabel}
        </div>
      </div>

      {/* Start/Reset Row */}
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setIsRunning((r) => !r)}
            className={`px-12 py-3.5 rounded-full text-xs font-bold tracking-wider uppercase transition-all ${primaryBtn}`}
          >
            {isRunning ? 'PAUSE' : 'START'}
          </button>
          <button
            type="button"
            onClick={() => { setIsRunning(false); setSecondsLeft(configuredTotalSeconds); }}
            className={`px-8 py-3.5 rounded-full border text-xs font-bold tracking-wider uppercase transition-all ${outlineBtn}`}
          >
            RESET
          </button>
        </div>
        <p className={`text-[10px] font-medium ${mutedText}`}>
            Space: Play/Pause - Esc: Exit Full Screen
        </p>
      </div>
    </div>
  );
};
