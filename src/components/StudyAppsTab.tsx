import React, { useEffect, useState } from 'react';
import {
  Plus,
  ExternalLink,
  Calculator,
  History,
  RotateCcw,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { CustomStudyTool, ThemeMode } from '../types';
import {
  AngleMode,
  CalculationHistoryItem,
  evaluateCasioExpression,
  formatCasioNumber,
} from '../utils/casioCalculator';

interface StudyAppsTabProps {
  theme: ThemeMode;
  tools: CustomStudyTool[];
  onAddCustomTool: (tool: CustomStudyTool) => void;
}

const LEGACY_TEST_TOOL_IDS = new Set([
  'tool-desmos',
  'tool-periodic',
  'tool-geogebra',
  'tool-phet',
  'tool-wolfram',
  'tool-caie-papers',
]);

export const StudyAppsTab: React.FC<StudyAppsTabProps> = ({
  theme,
  tools,
  onAddCustomTool,
}) => {
  const isLight = theme === 'warm';

  // Filter out any legacy test tools so only Casio fx-991ES PLUS and user-created tools exist
  const cleanTools = tools.filter((t) => !LEGACY_TEST_TOOL_IDS.has(t.id));
  const customUserTools = cleanTools.filter(
    (t) => t.id !== 'tool-casio-991es'
  );

  const [activeToolId, setActiveToolId] = useState<string>('tool-casio-991es');
  const [showAddModal, setShowAddModal] = useState(false);

  // Custom tool modal state
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('https://');
  const [newDesc, setNewDesc] = useState('');

  // Casio fx-991ES PLUS Hardware State
  const [expression, setExpression] = useState<string>('');
  const [displayResult, setDisplayResult] = useState<string>('0');
  const [exactResult, setExactResult] = useState<string | null>('0');
  const [showingExact, setShowingExact] = useState<boolean>(false);
  const [angleMode, setAngleMode] = useState<AngleMode>('DEG');
  const [shiftActive, setShiftActive] = useState<boolean>(false);
  const [alphaActive, setAlphaActive] = useState<boolean>(false);
  const [ansValue, setAnsValue] = useState<number>(0);
  const [memValue, setMemValue] = useState<number>(0);
  const [justEvaluated, setJustEvaluated] = useState<boolean>(false);
  const [history, setHistory] = useState<CalculationHistoryItem[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Companion Quadratic Solver state
  const [quadA, setQuadA] = useState(1);
  const [quadB, setQuadB] = useState(-5);
  const [quadC, setQuadC] = useState(6);

  const discriminant = quadB * quadB - 4 * quadA * quadC;
  const root1 =
    discriminant >= 0 && quadA !== 0
      ? Number(((-quadB + Math.sqrt(discriminant)) / (2 * quadA)).toPrecision(6)).toString()
      : 'Complex';
  const root2 =
    discriminant >= 0 && quadA !== 0
      ? Number(((-quadB - Math.sqrt(discriminant)) / (2 * quadA)).toPrecision(6)).toString()
      : 'Complex';

  const clearModifiers = () => {
    setShiftActive(false);
    setAlphaActive(false);
  };

  const insertToken = (token: string, isOperator = false) => {
    clearModifiers();
    setShowingExact(false);
    if (justEvaluated) {
      if (isOperator) {
        setExpression(`Ans${token}`);
      } else {
        setExpression(token);
      }
      setJustEvaluated(false);
      return;
    }
    setExpression((prev) => prev + token);
  };

  const handleAllClear = () => {
    clearModifiers();
    setExpression('');
    setDisplayResult('0');
    setExactResult('0');
    setShowingExact(false);
    setJustEvaluated(false);
    setHistoryIndex(-1);
  };

  const handleDelete = () => {
    clearModifiers();
    if (justEvaluated) {
      setJustEvaluated(false);
      return;
    }
    setExpression((prev) => {
      const multiCharTokens = [
        'sin⁻¹(',
        'cos⁻¹(',
        'tan⁻¹(',
        '³√(',
        '×10^(',
        'sin(',
        'cos(',
        'tan(',
        'log(',
        'ln(',
        'Abs(',
        'Ans',
        '√(',
        '⁻¹',
      ];
      for (const t of multiCharTokens) {
        if (prev.endsWith(t)) {
          return prev.slice(0, prev.length - t.length);
        }
      }
      return prev.slice(0, -1);
    });
  };

  const handleEvaluate = () => {
    clearModifiers();
    const res = evaluateCasioExpression(
      expression,
      angleMode,
      ansValue,
      memValue
    );
    if (!res.ok) {
      setDisplayResult(res.error);
      setExactResult(null);
      setShowingExact(false);
      setJustEvaluated(true);
      return;
    }

    setAnsValue(res.value);
    setDisplayResult(res.formatted);
    setExactResult(res.exact);
    // On Casio fx-991ES PLUS, if an exact fraction/surd exists (and differs from decimal), show exact or allow S⇔D toggle
    const hasDistinctExact =
      res.exact !== null && res.exact !== res.formatted;
    setShowingExact(hasDistinctExact);
    setJustEvaluated(true);

    if (expression.trim()) {
      const item: CalculationHistoryItem = {
        id: `calc-${Date.now()}`,
        expression: expression.trim(),
        decimalResult: res.value,
        formattedDecimal: res.formatted,
        exactRepresentation: res.exact,
      };
      setHistory((prev) => [item, ...prev.slice(0, 19)]);
      setHistoryIndex(-1);
    }
  };

  const handleToggleSD = () => {
    clearModifiers();
    if (!justEvaluated && expression.trim()) {
      const res = evaluateCasioExpression(
        expression,
        angleMode,
        ansValue,
        memValue
      );
      if (res.ok) {
        setAnsValue(res.value);
        setDisplayResult(res.formatted);
        setExactResult(res.exact);
        setJustEvaluated(true);
        setShowingExact(Boolean(res.exact && res.exact !== res.formatted));
      }
      return;
    }
    if (exactResult) {
      setShowingExact((prev) => !prev);
    }
  };

  const handleMemoryPlus = () => {
    const minusMode = shiftActive;
    clearModifiers();
    const targetExpr = expression.trim() || String(ansValue);
    const res = evaluateCasioExpression(
      targetExpr,
      angleMode,
      ansValue,
      memValue
    );
    if (res.ok) {
      const delta = minusMode ? -res.value : res.value;
      setMemValue((prev) => prev + delta);
      setAnsValue(res.value);
      setDisplayResult(res.formatted);
      setExactResult(res.exact);
      setJustEvaluated(true);
    }
  };

  const handleReplayHistory = (direction: 'up' | 'down') => {
    if (history.length === 0) return;
    clearModifiers();
    const nextIdx =
      direction === 'up'
        ? Math.min(history.length - 1, historyIndex + 1)
        : Math.max(0, historyIndex - 1);
    const item = history[nextIdx];
    if (item) {
      setHistoryIndex(nextIdx);
      setExpression(item.expression);
      setDisplayResult(item.formattedDecimal);
      setExactResult(item.exactRepresentation);
      setShowingExact(false);
      setJustEvaluated(false);
    }
  };

  // Keyboard support when Casio calculator is active and modal is closed
  useEffect(() => {
    if (activeToolId !== 'tool-casio-991es' || showAddModal) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        insertToken(e.key);
      } else if (e.key === '.') {
        e.preventDefault();
        insertToken('.');
      } else if (e.key === '+') {
        e.preventDefault();
        insertToken('+', true);
      } else if (e.key === '-') {
        e.preventDefault();
        insertToken('−', true);
      } else if (e.key === '*') {
        e.preventDefault();
        insertToken('×', true);
      } else if (e.key === '/') {
        e.preventDefault();
        insertToken('÷', true);
      } else if (e.key === '^') {
        e.preventDefault();
        insertToken('^', true);
      } else if (e.key === '(' || e.key === ')') {
        e.preventDefault();
        insertToken(e.key);
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        handleEvaluate();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleDelete();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleAllClear();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const handleCreateTool = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newUrl.trim()) return;
    const created: CustomStudyTool = {
      id: `custom-${Date.now()}`,
      name: newName.trim(),
      category: 'Custom',
      url: newUrl.trim(),
      description:
        newDesc.trim() || 'Pinned custom study resource.',
      iconName: 'Compass',
      embeddable: true,
    };
    onAddCustomTool(created);
    setActiveToolId(created.id);
    setShowAddModal(false);
    setNewName('');
    setNewUrl('https://');
    setNewDesc('');
  };

  const selectedCustomTool = customUserTools.find(
    (t) => t.id === activeToolId
  );

  const cardSurface = isLight
    ? 'bg-white border-[#E2E8F0] text-[#0F172A] shadow-[0_1px_3px_rgba(15,23,42,0.03)]'
    : 'bg-[#111827] border-white/10 text-[#F8FAFC]';
  const inputSurface = isLight
    ? 'bg-[#F8FAFC] border-[#E2E8F0] text-[#0F172A] focus:bg-white focus:border-[#0F172A]'
    : 'bg-[#090D16] border-white/10 text-[#F8FAFC] focus:border-[#6366F1]';
  const mutedText = isLight ? 'text-[#64748B]' : 'text-[#94A3B8]';
  const primaryBtn = isLight
    ? 'bg-[#0F172A] hover:bg-[#1E293B] text-white'
    : 'bg-[#6366F1] hover:bg-[#4F46E5] text-white';

  const lcdMainOutput =
    showingExact && exactResult ? exactResult : displayResult;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Study Tools
          </h1>
          <p className={`text-xs mt-1 ${mutedText}`}>
            Casio fx-991ES PLUS Natural-V.P.A.M. scientific calculator &amp; equation tools
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          {customUserTools.length > 0 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveToolId('tool-casio-991es')}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeToolId === 'tool-casio-991es'
                    ? primaryBtn
                    : isLight
                    ? 'border border-[#E2E8F0] hover:bg-[#F8FAFC]'
                    : 'border border-white/10 hover:bg-white/5'
                }`}
              >
                Casio fx-991ES PLUS
              </button>
              {customUserTools.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveToolId(t.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                    activeToolId === t.id
                      ? primaryBtn
                      : isLight
                      ? 'border border-[#E2E8F0] hover:bg-[#F8FAFC]'
                      : 'border border-white/10 hover:bg-white/5'
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all active:scale-95 ${primaryBtn}`}
          >
            <Plus className="w-4 h-4" />
            Add Custom Tool
          </button>
        </div>
      </div>

      {selectedCustomTool ? (
        <section className={`rounded-2xl border p-6 space-y-4 ${cardSurface}`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">{selectedCustomTool.name}</h2>
              <p className={`text-xs ${mutedText}`}>{selectedCustomTool.url}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveToolId('tool-casio-991es')}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-current/15"
              >
                Back to Casio fx-991ES PLUS
              </button>
              <a
                href={selectedCustomTool.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 ${primaryBtn}`}
              >
                Launch Window
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          <div className="w-full h-[500px] rounded-xl overflow-hidden border border-current/10 bg-white">
            <iframe
              title={selectedCustomTool.name}
              src={selectedCustomTool.url}
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin allow-forms"
            />
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Authentic Casio fx-991ES PLUS Hardware Calculator */}
          <div className="lg:col-span-7 flex justify-center">
            <div
              aria-label="Casio fx-991ES PLUS Scientific Calculator"
              className="w-full max-w-[430px] rounded-[34px] p-5 sm:p-6 select-none border-2 border-[#94A3B8]/60 bg-gradient-to-b from-[#E2E8F0] via-[#CBD5E1] to-[#94A3B8] text-[#1E293B] shadow-[0_22px_50px_rgba(15,23,42,0.28),inset_0_2px_3px_rgba(255,255,255,0.85)]"
            >
              {/* Top Casio Branding & Solar Panel Row */}
              <div className="flex items-start justify-between gap-3 mb-3 px-1">
                <div>
                  <div className="text-lg font-black tracking-[0.14em] text-[#0F172A] leading-none">
                    CASIO
                  </div>
                  <div className="text-xs font-bold italic tracking-wide text-[#1E293B] mt-1">
                    fx-991ES PLUS
                  </div>
                  <div className="text-[10px] font-extrabold tracking-[0.18em] text-[#B45309] mt-0.5">
                    NATURAL-V.P.A.M.
                  </div>
                </div>

                {/* Two Way Power Solar Cell */}
                <div className="flex flex-col items-end">
                  <div
                    aria-hidden="true"
                    className="w-28 h-7 rounded-md bg-gradient-to-r from-[#291D18] via-[#3E2723] to-[#291D18] border-2 border-[#475569] shadow-inner grid grid-cols-4 overflow-hidden"
                  >
                    <div className="border-r border-amber-500/20" />
                    <div className="border-r border-amber-500/20" />
                    <div className="border-r border-amber-500/20" />
                    <div />
                  </div>
                  <span className="text-[8px] font-bold tracking-[0.16em] text-[#334155] mt-1">
                    TWO WAY POWER
                  </span>
                </div>
              </div>

              {/* Natural Textbook 2-Line LCD Bezel & Screen */}
              <div className="rounded-2xl p-2.5 bg-[#334155] border-2 border-[#1E293B] shadow-inner mb-4">
                <div className="rounded-xl bg-[#C5D3BC] border border-[#94A88B] px-3.5 py-2.5 text-[#111C14] shadow-[inset_0_2px_6px_rgba(0,0,0,0.16)] min-h-[96px] flex flex-col justify-between">
                  {/* LCD Status Indicators */}
                  <div className="flex items-center justify-between text-[10px] font-mono font-bold tracking-wider border-b border-[#111C14]/15 pb-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-1 rounded ${
                          shiftActive
                            ? 'bg-[#111C14] text-[#C5D3BC]'
                            : 'opacity-20'
                        }`}
                      >
                        S
                      </span>
                      <span
                        className={`px-1 rounded ${
                          alphaActive
                            ? 'bg-[#111C14] text-[#C5D3BC]'
                            : 'opacity-20'
                        }`}
                      >
                        A
                      </span>
                      <span
                        className={`px-1 rounded ${
                          Math.abs(memValue) > 1e-12
                            ? 'bg-[#111C14] text-[#C5D3BC]'
                            : 'opacity-20'
                        }`}
                      >
                        M
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-1 bg-[#111C14] text-[#C5D3BC] rounded">
                        {angleMode === 'DEG' ? 'D' : 'R'}
                      </span>
                      <span className="font-extrabold">Math</span>
                      {showingExact && exactResult && (
                        <span className="text-[9px] px-1 rounded border border-[#111C14]/40">
                          a/b
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Top Expression Line */}
                  <div
                    data-testid="casio-expression-display"
                    className="font-mono text-sm sm:text-base font-semibold tracking-tight text-left overflow-x-auto whitespace-nowrap py-1 min-h-[28px] flex items-center"
                  >
                    <span>{expression || '0'}</span>
                    {!justEvaluated && (
                      <span className="inline-block w-1.5 h-4 bg-[#111C14] ml-0.5 animate-pulse" />
                    )}
                  </div>

                  {/* Bottom Output Line */}
                  <div
                    data-testid="casio-result-display"
                    className="font-mono text-xl sm:text-2xl font-extrabold tracking-tight text-right truncate leading-none pt-0.5"
                  >
                    {lcdMainOutput}
                  </div>
                </div>
              </div>

              {/* Control Row: SHIFT, ALPHA, REPLAY D-Pad, MODE, ON */}
              <div className="grid grid-cols-5 items-center gap-2 mb-3 px-1">
                {/* SHIFT */}
                <div className="flex flex-col items-center">
                  <span className="text-[9px] font-extrabold text-[#B45309] tracking-wider mb-0.5">
                    SHIFT
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setShiftActive((s) => !s);
                      setAlphaActive(false);
                    }}
                    className={`w-full h-7 rounded-full text-[10px] font-bold border shadow-xs transition-transform active:scale-95 ${
                      shiftActive
                        ? 'bg-[#B45309] text-white border-[#78350F]'
                        : 'bg-[#64748B] text-white border-[#475569] hover:bg-[#475569]'
                    }`}
                  >
                    SHIFT
                  </button>
                </div>

                {/* ALPHA */}
                <div className="flex flex-col items-center">
                  <span className="text-[9px] font-extrabold text-[#BE123C] tracking-wider mb-0.5">
                    ALPHA
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAlphaActive((a) => !a);
                      setShiftActive(false);
                    }}
                    className={`w-full h-7 rounded-full text-[10px] font-bold border shadow-xs transition-transform active:scale-95 ${
                      alphaActive
                        ? 'bg-[#BE123C] text-white border-[#881337]'
                        : 'bg-[#64748B] text-white border-[#475569] hover:bg-[#475569]'
                    }`}
                  >
                    ALPHA
                  </button>
                </div>

                {/* Center Circular REPLAY Pad */}
                <div className="flex justify-center">
                  <div className="relative w-16 h-14 rounded-full bg-gradient-to-b from-[#94A3B8] to-[#64748B] border-2 border-[#475569] shadow-md flex items-center justify-center">
                    <span className="text-[7px] font-extrabold tracking-widest text-white/90 pointer-events-none">
                      REPLAY
                    </span>
                    <button
                      type="button"
                      aria-label="Replay Previous Calculation"
                      onClick={() => handleReplayHistory('up')}
                      className="absolute top-0.5 inset-x-4 h-3.5 flex items-center justify-center text-white hover:text-amber-200"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      aria-label="Replay Next Calculation"
                      onClick={() => handleReplayHistory('down')}
                      className="absolute bottom-0.5 inset-x-4 h-3.5 flex items-center justify-center text-white hover:text-amber-200"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      aria-label="Cursor Left"
                      onClick={() => {}}
                      className="absolute left-0.5 inset-y-3 w-3.5 flex items-center justify-center text-white/80"
                    >
                      <ChevronLeft className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      aria-label="Cursor Right"
                      onClick={() => {}}
                      className="absolute right-0.5 inset-y-3 w-3.5 flex items-center justify-center text-white/80"
                    >
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* MODE (toggles DEG / RAD) */}
                <div className="flex flex-col items-center">
                  <span className="text-[9px] font-extrabold text-[#B45309] tracking-wider mb-0.5">
                    SETUP
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      clearModifiers();
                      setAngleMode((m) => (m === 'DEG' ? 'RAD' : 'DEG'));
                    }}
                    className="w-full h-7 rounded-full bg-[#64748B] hover:bg-[#475569] text-white text-[10px] font-bold border border-[#475569] shadow-xs transition-transform active:scale-95"
                  >
                    MODE
                  </button>
                </div>

                {/* ON */}
                <div className="flex flex-col items-center">
                  <span className="text-[9px] font-extrabold text-[#334155] tracking-wider mb-0.5">
                    CLR
                  </span>
                  <button
                    type="button"
                    onClick={handleAllClear}
                    className="w-full h-7 rounded-full bg-[#64748B] hover:bg-[#475569] text-white text-[10px] font-bold border border-[#475569] shadow-xs transition-transform active:scale-95"
                  >
                    ON
                  </button>
                </div>
              </div>

              {/* Upper Scientific Function Grid (6 columns x 4 rows) */}
              <div className="grid grid-cols-6 gap-1.5 mb-3.5">
                {[
                  {
                    shift: <>SOLVE</>,
                    label: <>CALC</>,
                    action: () => handleEvaluate(),
                  },
                  {
                    shift: <>x!</>,
                    label: (
                      <>
                        x<sup>-1</sup>
                      </>
                    ),
                    action: () =>
                      shiftActive
                        ? insertToken('!', true)
                        : insertToken('^(-1)', true),
                  },
                  {
                    shift: <>d/c</>,
                    label: <>a b/c</>,
                    action: () => insertToken('÷', true),
                  },
                  {
                    shift: (
                      <>
                        <sup>3</sup>√
                      </>
                    ),
                    label: <>√( )</>,
                    action: () =>
                      shiftActive
                        ? insertToken('cbrt(')
                        : insertToken('√('),
                  },
                  {
                    shift: (
                      <>
                        x<sup>3</sup>
                      </>
                    ),
                    label: (
                      <>
                        x<sup>2</sup>
                      </>
                    ),
                    action: () =>
                      shiftActive
                        ? insertToken('^3', true)
                        : insertToken('²', true),
                  },
                  {
                    shift: (
                      <>
                        <sup>x</sup>√
                      </>
                    ),
                    label: (
                      <>
                        x<sup>y</sup>
                      </>
                    ),
                    action: () => insertToken('^', true),
                  },
                  {
                    shift: (
                      <>
                        10<sup>x</sup>
                      </>
                    ),
                    label: <>log</>,
                    action: () =>
                      shiftActive
                        ? insertToken('10^(')
                        : insertToken('log('),
                  },
                  {
                    shift: (
                      <>
                        e<sup>x</sup>
                      </>
                    ),
                    label: <>ln</>,
                    action: () =>
                      shiftActive
                        ? insertToken('e^(')
                        : insertToken('ln('),
                  },
                  {
                    shift: <>(-)</>,
                    label: <>(-)</>,
                    action: () => insertToken('-'),
                  },
                  {
                    shift: <>FACT</>,
                    label: <>° &apos; &quot;</>,
                    action: () => handleToggleSD(),
                  },
                  {
                    shift: <>Abs</>,
                    label: <>Abs</>,
                    action: () => insertToken('Abs('),
                  },
                  {
                    shift: (
                      <>
                        sin<sup>-1</sup>
                      </>
                    ),
                    label: <>sin</>,
                    action: () =>
                      shiftActive
                        ? insertToken('asin(')
                        : insertToken('sin('),
                  },
                  {
                    shift: (
                      <>
                        cos<sup>-1</sup>
                      </>
                    ),
                    label: <>cos</>,
                    action: () =>
                      shiftActive
                        ? insertToken('acos(')
                        : insertToken('cos('),
                  },
                  {
                    shift: (
                      <>
                        tan<sup>-1</sup>
                      </>
                    ),
                    label: <>tan</>,
                    action: () =>
                      shiftActive
                        ? insertToken('atan(')
                        : insertToken('tan('),
                  },
                  {
                    shift: <>STO</>,
                    label: <>RCL</>,
                    action: () => insertToken('M'),
                  },
                  {
                    shift: <>ENG</>,
                    label: <>ENG</>,
                    action: () => handleToggleSD(),
                  },
                  {
                    shift: <>%</>,
                    label: <>(</>,
                    action: () =>
                      shiftActive
                        ? insertToken('÷100', true)
                        : insertToken('('),
                  },
                  {
                    shift: <>,</>,
                    label: <>)</>,
                    alpha: <>X</>,
                    action: () => insertToken(')'),
                  },
                ].map((btn, idx) => (
                  <div key={idx} className="flex flex-col items-center">
                    <div className="flex items-center justify-center gap-1 h-3 text-[8px] font-extrabold leading-none">
                      {btn.shift && (
                        <span className="text-[#B45309]">{btn.shift}</span>
                      )}
                      {btn.alpha && (
                        <span className="text-[#BE123C]">{btn.alpha}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={btn.action}
                      className="w-full h-7 rounded-lg bg-[#334155] hover:bg-[#1E293B] text-white text-[11px] font-semibold border border-[#1E293B] shadow-[0_2px_0_#0F172A] transition-transform active:translate-y-0.5"
                    >
                      {btn.label}
                    </button>
                  </div>
                ))}

                {/* S<->D and M+ keys completing the scientific row */}
                <div className="col-span-3 flex flex-col items-center">
                  <div className="h-3 text-[8px] font-extrabold text-[#B45309] leading-none">
                    EXACT / DEC
                  </div>
                  <button
                    type="button"
                    aria-label="S to D toggle"
                    onClick={handleToggleSD}
                    className="w-full h-7 rounded-lg bg-[#334155] hover:bg-[#1E293B] text-amber-300 text-[11px] font-bold border border-[#1E293B] shadow-[0_2px_0_#0F172A] transition-transform active:translate-y-0.5"
                  >
                    S↔D
                  </button>
                </div>

                <div className="col-span-3 flex flex-col items-center">
                  <div className="flex items-center gap-1.5 h-3 text-[8px] font-extrabold leading-none">
                    <span className="text-[#B45309]">M-</span>
                    <span className="text-[#BE123C]">M</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleMemoryPlus}
                    className="w-full h-7 rounded-lg bg-[#334155] hover:bg-[#1E293B] text-white text-[11px] font-bold border border-[#1E293B] shadow-[0_2px_0_#0F172A] transition-transform active:translate-y-0.5"
                  >
                    M+
                  </button>
                </div>
              </div>

              {/* Lower Numeric & Primary Operator Keypad (5 columns x 4 rows) */}
              <div className="grid grid-cols-5 gap-2">
                {/* Row 1: 7, 8, 9, DEL, AC */}
                {[
                  { label: '7', shift: 'CONST', onClick: () => insertToken('7') },
                  { label: '8', shift: 'CONV', onClick: () => insertToken('8') },
                  { label: '9', shift: 'CLR', onClick: () => insertToken('9') },
                ].map((num) => (
                  <div key={num.label} className="flex flex-col items-center">
                    <span className="h-3 text-[8px] font-bold text-[#B45309] leading-none">
                      {num.shift}
                    </span>
                    <button
                      type="button"
                      onClick={num.onClick}
                      className="w-full h-10 rounded-xl bg-[#F8FAFC] hover:bg-white text-[#0F172A] text-sm font-extrabold border border-[#94A3B8] shadow-[0_2px_0_#64748B] transition-transform active:translate-y-0.5"
                    >
                      {num.label}
                    </button>
                  </div>
                ))}

                {/* Orange DEL */}
                <div className="flex flex-col items-center">
                  <span className="h-3 text-[8px] font-bold text-[#B45309] leading-none">
                    INS
                  </span>
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="w-full h-10 rounded-xl bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-extrabold border border-[#92400E] shadow-[0_2px_0_#78350F] transition-transform active:translate-y-0.5"
                  >
                    DEL
                  </button>
                </div>

                {/* Orange AC */}
                <div className="flex flex-col items-center">
                  <span className="h-3 text-[8px] font-bold text-[#B45309] leading-none">
                    OFF
                  </span>
                  <button
                    type="button"
                    onClick={handleAllClear}
                    className="w-full h-10 rounded-xl bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-extrabold border border-[#92400E] shadow-[0_2px_0_#78350F] transition-transform active:translate-y-0.5"
                  >
                    AC
                  </button>
                </div>

                {/* Row 2: 4, 5, 6, × (nPr), ÷ (nCr) */}
                {[
                  { label: '4', shift: 'MATRIX', onClick: () => insertToken('4') },
                  { label: '5', shift: 'VECTOR', onClick: () => insertToken('5') },
                  { label: '6', shift: '', onClick: () => insertToken('6') },
                ].map((num) => (
                  <div key={num.label} className="flex flex-col items-center">
                    <span className="h-3 text-[8px] font-bold text-[#B45309] leading-none">
                      {num.shift}
                    </span>
                    <button
                      type="button"
                      onClick={num.onClick}
                      className="w-full h-10 rounded-xl bg-[#F8FAFC] hover:bg-white text-[#0F172A] text-sm font-extrabold border border-[#94A3B8] shadow-[0_2px_0_#64748B] transition-transform active:translate-y-0.5"
                    >
                      {num.label}
                    </button>
                  </div>
                ))}

                <div className="flex flex-col items-center">
                  <span className="h-3 text-[8px] font-extrabold text-[#B45309] leading-none">
                    nPr
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      shiftActive
                        ? insertToken('P', true)
                        : insertToken('×', true)
                    }
                    className="w-full h-10 rounded-xl bg-[#F8FAFC] hover:bg-white text-[#0F172A] text-base font-extrabold border border-[#94A3B8] shadow-[0_2px_0_#64748B] transition-transform active:translate-y-0.5"
                  >
                    ×
                  </button>
                </div>

                <div className="flex flex-col items-center">
                  <span className="h-3 text-[8px] font-extrabold text-[#B45309] leading-none">
                    nCr
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      shiftActive
                        ? insertToken('C', true)
                        : insertToken('÷', true)
                    }
                    className="w-full h-10 rounded-xl bg-[#F8FAFC] hover:bg-white text-[#0F172A] text-base font-extrabold border border-[#94A3B8] shadow-[0_2px_0_#64748B] transition-transform active:translate-y-0.5"
                  >
                    ÷
                  </button>
                </div>

                {/* Row 3: 1, 2, 3, +, − */}
                {[
                  { label: '1', shift: 'STAT', onClick: () => insertToken('1') },
                  { label: '2', shift: 'CMPLX', onClick: () => insertToken('2') },
                  { label: '3', shift: 'BASE', onClick: () => insertToken('3') },
                ].map((num) => (
                  <div key={num.label} className="flex flex-col items-center">
                    <span className="h-3 text-[8px] font-bold text-[#B45309] leading-none">
                      {num.shift}
                    </span>
                    <button
                      type="button"
                      onClick={num.onClick}
                      className="w-full h-10 rounded-xl bg-[#F8FAFC] hover:bg-white text-[#0F172A] text-sm font-extrabold border border-[#94A3B8] shadow-[0_2px_0_#64748B] transition-transform active:translate-y-0.5"
                    >
                      {num.label}
                    </button>
                  </div>
                ))}

                <div className="flex flex-col items-center">
                  <span className="h-3 text-[8px] font-extrabold text-[#B45309] leading-none">
                    Pol
                  </span>
                  <button
                    type="button"
                    onClick={() => insertToken('+', true)}
                    className="w-full h-10 rounded-xl bg-[#F8FAFC] hover:bg-white text-[#0F172A] text-base font-extrabold border border-[#94A3B8] shadow-[0_2px_0_#64748B] transition-transform active:translate-y-0.5"
                  >
                    +
                  </button>
                </div>

                <div className="flex flex-col items-center">
                  <span className="h-3 text-[8px] font-extrabold text-[#B45309] leading-none">
                    Rec
                  </span>
                  <button
                    type="button"
                    onClick={() => insertToken('−', true)}
                    className="w-full h-10 rounded-xl bg-[#F8FAFC] hover:bg-white text-[#0F172A] text-base font-extrabold border border-[#94A3B8] shadow-[0_2px_0_#64748B] transition-transform active:translate-y-0.5"
                  >
                    −
                  </button>
                </div>

                {/* Row 4: 0, ., ×10^x (π / e), Ans, = */}
                <div className="flex flex-col items-center">
                  <span className="h-3 text-[8px] font-extrabold text-[#B45309] leading-none">
                    Rnd
                  </span>
                  <button
                    type="button"
                    onClick={() => insertToken('0')}
                    className="w-full h-10 rounded-xl bg-[#F8FAFC] hover:bg-white text-[#0F172A] text-sm font-extrabold border border-[#94A3B8] shadow-[0_2px_0_#64748B] transition-transform active:translate-y-0.5"
                  >
                    0
                  </button>
                </div>

                <div className="flex flex-col items-center">
                  <span className="h-3 text-[8px] font-extrabold text-[#B45309] leading-none">
                    Ran#
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      shiftActive
                        ? insertToken(
                            String(Number(Math.random().toFixed(3)))
                          )
                        : insertToken('.')
                    }
                    className="w-full h-10 rounded-xl bg-[#F8FAFC] hover:bg-white text-[#0F172A] text-base font-extrabold border border-[#94A3B8] shadow-[0_2px_0_#64748B] transition-transform active:translate-y-0.5"
                  >
                    .
                  </button>
                </div>

                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-1.5 h-3 text-[8px] font-extrabold leading-none">
                    <span className="text-[#B45309]">π</span>
                    <span className="text-[#BE123C]">e</span>
                  </div>
                  <button
                    type="button"
                    aria-label="Times 10 to the power of x"
                    onClick={() => {
                      if (shiftActive) {
                        insertToken('π');
                      } else if (alphaActive) {
                        insertToken('e');
                      } else {
                        insertToken('×10^(', true);
                      }
                    }}
                    className="w-full h-10 rounded-xl bg-[#F8FAFC] hover:bg-white text-[#0F172A] text-[11px] font-extrabold border border-[#94A3B8] shadow-[0_2px_0_#64748B] transition-transform active:translate-y-0.5"
                  >
                    ×10<sup>x</sup>
                  </button>
                </div>

                <div className="flex flex-col items-center">
                  <span className="h-3 text-[8px] font-extrabold text-[#B45309] leading-none">
                    DRG
                  </span>
                  <button
                    type="button"
                    onClick={() => insertToken('Ans')}
                    className="w-full h-10 rounded-xl bg-[#F8FAFC] hover:bg-white text-[#0F172A] text-xs font-extrabold border border-[#94A3B8] shadow-[0_2px_0_#64748B] transition-transform active:translate-y-0.5"
                  >
                    Ans
                  </button>
                </div>

                <div className="flex flex-col items-center">
                  <span className="h-3 text-[8px] font-extrabold text-[#B45309] leading-none">
                    ≈
                  </span>
                  <button
                    type="button"
                    onClick={handleEvaluate}
                    className="w-full h-10 rounded-xl bg-[#F8FAFC] hover:bg-white text-[#0F172A] text-base font-extrabold border border-[#94A3B8] shadow-[0_2px_0_#64748B] transition-transform active:translate-y-0.5"
                  >
                    =
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Calculation Tape, Registers, and Quadratic Solver */}
          <div className="lg:col-span-5 space-y-5">
            {/* Active Register & Quick Presets Card */}
            <section className={`rounded-2xl border p-5 space-y-4 ${cardSurface}`}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Casio fx-991ES PLUS Registers
                </h2>
                <button
                  type="button"
                  onClick={() =>
                    setAngleMode((m) => (m === 'DEG' ? 'RAD' : 'DEG'))
                  }
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold border transition-colors ${
                    isLight
                      ? 'border-[#E2E8F0] hover:bg-[#F8FAFC]'
                      : 'border-white/10 hover:bg-white/5'
                  }`}
                >
                  Angle: {angleMode}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className={`p-3 rounded-xl border ${inputSurface}`}>
                  <div className={`text-[11px] ${mutedText}`}>Last Answer (Ans)</div>
                  <div className="font-mono-tabular font-bold text-sm mt-0.5 truncate">
                    {formatCasioNumber(ansValue)}
                  </div>
                </div>
                <div className={`p-3 rounded-xl border ${inputSurface}`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] ${mutedText}`}>Memory (M)</span>
                    {Math.abs(memValue) > 1e-12 && (
                      <button
                        type="button"
                        onClick={() => setMemValue(0)}
                        className="text-[10px] underline opacity-75 hover:opacity-100"
                      >
                        Clear M
                      </button>
                    )}
                  </div>
                  <div className="font-mono-tabular font-bold text-sm mt-0.5 truncate">
                    {formatCasioNumber(memValue)}
                  </div>
                </div>
              </div>

              <div className={`text-[11px] leading-relaxed ${mutedText}`}>
                Use <span className="font-semibold">S↔D</span> to toggle between
                exact fractions/surds (e.g. <span className="font-mono">3/4</span>,{' '}
                <span className="font-mono">√2/2</span>) and decimal form, or press{' '}
                <span className="font-semibold">
                  SHIFT + ×10<sup>x</sup>
                </span>{' '}
                for <span className="font-mono">π</span>.
              </div>
            </section>

            {/* Calculation History Tape */}
            <section className={`rounded-2xl border p-5 space-y-3 ${cardSurface}`}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <History className="w-4 h-4" />
                  Calculation Tape
                </h2>
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setHistory([])}
                    className={`inline-flex items-center gap-1 text-xs ${mutedText} hover:underline`}
                  >
                    <RotateCcw className="w-3 h-3" />
                    Clear
                  </button>
                )}
              </div>

              {history.length === 0 ? (
                <div
                  className={`p-4 rounded-xl border text-xs text-center ${inputSurface} ${mutedText}`}
                >
                  Calculations evaluated on the Casio fx-991ES PLUS appear here. Click any entry to recall it.
                </div>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {history.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setExpression(item.expression);
                        setDisplayResult(item.formattedDecimal);
                        setExactResult(item.exactRepresentation);
                        setJustEvaluated(false);
                      }}
                      className={`w-full text-left p-3 rounded-xl border text-xs flex items-center justify-between gap-3 transition-all hover:scale-[1.01] ${inputSurface}`}
                    >
                      <span className="font-mono truncate">{item.expression}</span>
                      <span className="font-mono font-bold shrink-0">
                        = {item.exactRepresentation && item.exactRepresentation !== item.formattedDecimal
                          ? `${item.exactRepresentation} (${item.formattedDecimal})`
                          : item.formattedDecimal}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* Built-in Quadratic & Discriminant Solver */}
            <section className={`rounded-2xl border p-5 space-y-4 ${cardSurface}`}>
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Calculator className="w-4 h-4" />
                Quadratic &amp; Discriminant Solver (EQN Mode)
              </h2>
              <p className={`text-xs ${mutedText}`}>
                Exact root verification for ax² + bx + c = 0
              </p>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <label htmlFor="quad-a" className={`block mb-1 ${mutedText}`}>
                    a
                  </label>
                  <input
                    id="quad-a"
                    type="number"
                    value={quadA}
                    onChange={(e) => setQuadA(Number(e.target.value))}
                    className={`w-full rounded-xl border px-2.5 py-2 font-mono-tabular outline-none ${inputSurface}`}
                  />
                </div>
                <div>
                  <label htmlFor="quad-b" className={`block mb-1 ${mutedText}`}>
                    b
                  </label>
                  <input
                    id="quad-b"
                    type="number"
                    value={quadB}
                    onChange={(e) => setQuadB(Number(e.target.value))}
                    className={`w-full rounded-xl border px-2.5 py-2 font-mono-tabular outline-none ${inputSurface}`}
                  />
                </div>
                <div>
                  <label htmlFor="quad-c" className={`block mb-1 ${mutedText}`}>
                    c
                  </label>
                  <input
                    id="quad-c"
                    type="number"
                    value={quadC}
                    onChange={(e) => setQuadC(Number(e.target.value))}
                    className={`w-full rounded-xl border px-2.5 py-2 font-mono-tabular outline-none ${inputSurface}`}
                  />
                </div>
              </div>

              <div
                className={`p-3.5 rounded-xl border text-xs font-mono-tabular space-y-1.5 ${inputSurface}`}
              >
                <div>Discriminant (Δ = b² − 4ac): {discriminant}</div>
                <div>
                  Root x<sub>1</sub>: {root1}
                </div>
                <div>
                  Root x<sub>2</sub>: {root2}
                </div>
              </div>
            </section>
          </div>
        </div>
      )}

      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-tool-modal-title"
        >
          <form
            onSubmit={handleCreateTool}
            className={`max-w-md w-full rounded-2xl border p-6 space-y-4 text-xs ${cardSurface}`}
          >
            <h3 id="add-tool-modal-title" className="text-base font-bold">
              Pin Custom Study Tool
            </h3>
            <div>
              <label htmlFor="custom-tool-name" className="block font-medium mb-1">
                Tool Title
              </label>
              <input
                id="custom-tool-name"
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Formula Sheet"
                className={`w-full rounded-xl border px-3 py-2 outline-none ${inputSurface}`}
              />
            </div>
            <div>
              <label htmlFor="custom-tool-url" className="block font-medium mb-1">
                URL
              </label>
              <input
                id="custom-tool-url"
                type="url"
                required
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                className={`w-full rounded-xl border px-3 py-2 font-mono-tabular outline-none ${inputSurface}`}
              />
            </div>
            <div>
              <label htmlFor="custom-tool-desc" className="block font-medium mb-1">
                Description
              </label>
              <input
                id="custom-tool-desc"
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className={`w-full rounded-xl border px-3 py-2 outline-none ${inputSurface}`}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-3.5 py-2 rounded-xl border font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`px-4 py-2 rounded-xl font-semibold ${primaryBtn}`}
              >
                Save Tool
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
