import React, { useState, useRef, useEffect } from 'react';
import { ThemeMode } from '../types';

interface AiScholarTabProps {
  theme?: ThemeMode;
  onTriggerSecurityLockdown?: (input: string, action: string) => boolean;
  onAwardFocusXp?: (xpAmount: number) => void;
}

/* ================= CONFIG ================= */
const CONFIG = {
  PROVIDER: 'openai' as 'openai' | 'anthropic',
  API_KEY: 'key_ps5gnQ9rlp4xSCl6', // chatgpt secret value
  MODELS: {
    openai: { chat: 'gpt-4o-mini', ocr: 'gpt-4o', grade: 'gpt-4o' },
    anthropic: {
      chat: 'claude-haiku-5-5',
      ocr: 'claude-sonnet-5-5',
      grade: 'claude-opus-5-5',
    },
  },
};
/* ========================================== */

const M = () => CONFIG.MODELS[CONFIG.PROVIDER];

const sup: Record<string, string> = { '2': '²', '3': '³' };

export function clean(t: unknown): string {
  let s = String(t ?? '');
  s = s
    .replace(/\\\[([\s\S]*?)\\\]/g, '$1')
    .replace(/\\\(([\s\S]*?)\\\)/g, '$1')
    .replace(/\$\$([\s\S]*?)\$\$/g, '$1')
    .replace(/\$(?!\s)([^$\n]*?\S)\$/g, '$1');
  const fr = (x: string) =>
    x.length > 1 && /[^\w.]/.test(x) ? '(' + x + ')' : x;
  s = s
    .replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, a, b) => fr(a) + '/' + fr(b))
    .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
    .replace(/\\(?:text|mathrm|mathbf|textbf)\{([^{}]*)\}/g, '$1')
    .replace(/\\times/g, '×')
    .replace(/\\cdot/g, '·')
    .replace(/\\div/g, '÷')
    .replace(/\\pm/g, '±')
    .replace(/\\(?:leq?|leqslant)/g, '≤')
    .replace(/\\(?:geq?|geqslant)/g, '≥')
    .replace(/\\neq/g, '≠')
    .replace(/\\approx/g, '≈')
    .replace(/\\pi/g, 'π')
    .replace(/\\theta/g, 'θ')
    .replace(/\\degree|\^\{?\\circ\}?/g, '°')
    .replace(/\\(?:left|right|,|;|!|quad)/g, '')
    .replace(/\^\{?([23])\}?/g, (_, d) => sup[d] || d)
    .replace(/\^\{([^{}]*)\}/g, '^$1')
    .replace(/\\([a-zA-Z]+)/g, '$1');
  return s
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^\s*([-*_]){3,}\s*$/gm, '')
    .replace(/`+/g, '')
    .replace(/\\\$/g, '$');
}

export const esc = (s: unknown): string =>
  String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c)
  );

export const inl = (t: unknown): string =>
  esc(clean(t)).replace(/\*+/g, '').trim();

export function fmt(t: unknown): string {
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      out.push('<ul>' + list.map((x) => '<li>' + x + '</li>').join('') + '</ul>');
    }
    list = [];
  };
  for (const raw of esc(clean(t)).split('\n')) {
    const l = raw.trim();
    const li = l.match(/^(?:[-*•]|\d+[.)])\s+(.*)/);
    if (li) {
      list.push(li[1]);
      continue;
    }
    flush();
    if (l) out.push('<p>' + l + '</p>');
  }
  flush();
  return out
    .join('')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*+/g, '');
}

export const renderAssistantMessage = fmt;

interface LlmMessagePart {
  image?: string;
  text?: string;
}

interface LlmMessage {
  role: 'user' | 'assistant';
  content: string | LlmMessagePart[];
}

interface LlmCallOptions {
  system: string;
  messages: LlmMessage[];
  model: string;
  stream?: boolean;
  onToken?: (text: string) => void;
  json?: boolean;
  signal?: AbortSignal;
}

async function llm({
  system,
  messages,
  model,
  stream,
  onToken,
  json,
  signal,
}: LlmCallOptions): Promise<string> {
  const A = CONFIG.PROVIDER === 'anthropic';
  if (!CONFIG.API_KEY || CONFIG.API_KEY.startsWith('PASTE')) {
    throw new Error('Add your API key to the CONFIG block at the top of the script.');
  }
  const conv = messages.map((m) => ({
    role: m.role,
    content:
      typeof m.content === 'string'
        ? m.content
        : m.content.map((p) =>
            p.image
              ? A
                ? {
                    type: 'image',
                    source: {
                      type: 'base64',
                      media_type: 'image/jpeg',
                      data: p.image,
                    },
                  }
                : {
                    type: 'image_url',
                    image_url: {
                      url: 'data:image/jpeg;base64,' + p.image,
                      detail: 'high',
                    },
                  }
              : { type: 'text', text: p.text || '' }
          ),
  }));
  const body = A
    ? { model, max_tokens: 8000, system, messages: conv, stream: !!stream }
    : {
        model,
        messages: [{ role: 'system', content: system }, ...conv],
        stream: !!stream,
        temperature: json ? 0 : 0.5,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      };

  const useDirectOpenAi = !A && CONFIG.API_KEY.startsWith('sk-');
  const url = A
    ? 'https://api.anthropic.com/v1/messages'
    : useDirectOpenAi
    ? 'https://api.openai.com/v1/chat/completions'
    : '/api/llm';

  const headers: Record<string, string> = A
    ? {
        'x-api-key': CONFIG.API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      }
    : {
        Authorization: 'Bearer ' + CONFIG.API_KEY,
        'x-site-key': CONFIG.API_KEY,
        'content-type': 'application/json',
      };

  let res: Response | undefined;
  for (let i = 0; i < 3; i++) {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
    if (res.ok || ![429, 500, 502, 503, 529].includes(res.status)) break;
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  if (!res || !res.ok) {
    let m = res ? await res.text() : 'Network error';
    try {
      const parsed = JSON.parse(m);
      m = parsed.error?.message || parsed.error || m;
    } catch {
      // keep raw text
    }
    throw new Error(String(m).slice(0, 300));
  }
  if (!stream) {
    const j = await res.json();
    return A
      ? j.content.map((c: any) => c.text || '').join('')
      : j.choices[0].message.content;
  }
  const rd = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let full = '';
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const ls = buf.split('\n');
    buf = ls.pop() || '';
    for (const l of ls) {
      if (!l.startsWith('data:')) continue;
      const d = l.slice(5).trim();
      if (d === '[DONE]') continue;
      try {
        const j = JSON.parse(d);
        const t =
          j.choices?.[0]?.delta?.content ||
          (j.type === 'content_block_delta' ? j.delta?.text : '') ||
          '';
        if (t) {
          full += t;
          onToken?.(full);
        }
      } catch {
        // ignore partial line
      }
    }
  }
  return full;
}

const CHAT_SYS =
  "You are a friendly, sharp AI tutor and examiner. Answer quickly, clearly and accurately. Write plain text only: never use LaTeX, dollar signs, markdown headings, tables or code fences unless the user asks for code. Write maths in plain text (x^2, 3/4, sqrt(9)). Keep paragraphs short and use simple '- ' lists only when they help.";

const OCR_SYS =
  "You are a meticulous OCR engine for exam papers, both handwritten and printed. Transcribe EVERY word, number, symbol, label and table on the page exactly as written, in reading order, keeping question numbers and line breaks. Do not fix spelling, grammar or maths, and do not answer or comment. Write crossed-out text as [crossed out: ...], unreadable text as [illegible], diagrams as [diagram: short description], and tables as rows separated by ' | '. Write maths in plain text (x^2, 3/4), never LaTeX. Output only the transcription.";

const GRADE_SYS = `You are a strict, meticulous, impartial examiner. You receive a MARK SCHEME and the transcription of a student's answers (OCR, so minor transcription noise is possible). Mark every question.
Rules:
- Use ONLY the mark scheme. Award marks point by point exactly as it specifies, respecting "accept", "do not accept", alternative answers and error-carried-forward rules. Never award a mark the student's words do not earn, and never invent text the student did not write.
- If the mark scheme gives no marks for a question, infer them from brackets or the structure. Mark sub-parts separately (1a, 1b...). Include every question in the mark scheme, even unanswered ones (awarded 0).
- If the transcription is [illegible] where an answer should be, mark what is readable and say so in the issue.
- student_answer must quote the student's transcribed answer faithfully (or "No answer found").
- correct_answer is the full correct answer according to the mark scheme.
- points lists each mark scheme point with earned true/false.
- mistakes lists only real errors: issue = what went wrong, fix = how to get the mark. Empty array if full marks.
- Write plain text only: no LaTeX, no dollar signs, no markdown symbols. Maths as plain text (x^2, 3/4).
Return JSON only in exactly this shape:
{"overall_feedback":"2-3 sentence summary","questions":[{"id":"1a","question":"short question text","max_marks":2,"awarded":1,"student_answer":"","correct_answer":"","points":[{"text":"","earned":true}],"mistakes":[{"issue":"","fix":""}]}]}`;

const parse = (s: string) =>
  JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));

async function ensurePdfJsLoaded(): Promise<any> {
  const win = window as any;
  if (win.pdfjsLib) {
    win.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    return win.pdfjsLib;
  }
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load PDF.js library.'));
    document.head.appendChild(script);
  });
  win.pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  return win.pdfjsLib;
}

const jpg = (c: HTMLCanvasElement) =>
  c.toDataURL('image/jpeg', 0.92).split(',')[1];

async function toPages(f: File): Promise<Array<{ img: string; hint: string }>> {
  if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
    const pdfjsLib = await ensurePdfJsLoaded();
    const pdf = await pdfjsLib.getDocument({ data: await f.arrayBuffer() }).promise;
    const out: Array<{ img: string; hint: string }> = [];
    for (let i = 1; i <= Math.min(pdf.numPages, 30); i++) {
      const pg = await pdf.getPage(i);
      const vp = pg.getViewport({ scale: 2.2 });
      const c = document.createElement('canvas');
      c.width = vp.width;
      c.height = vp.height;
      await pg.render({ canvasContext: c.getContext('2d')!, viewport: vp }).promise;
      const tc = await pg.getTextContent();
      out.push({
        img: jpg(c),
        hint: tc.items
          .map((x: any) => x.str)
          .join(' ')
          .trim(),
      });
    }
    return out;
  }
  const bmp = await createImageBitmap(f);
  const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = bmp.width * k;
  c.height = bmp.height * k;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff';
  x.fillRect(0, 0, c.width, c.height);
  x.drawImage(bmp, 0, 0, c.width, c.height);
  return [{ img: jpg(c), hint: '' }];
}

const ocr = (p: { img: string; hint: string }, label: string) =>
  llm({
    system: OCR_SYS,
    model: M().ocr,
    messages: [
      {
        role: 'user',
        content: [
          { image: p.img },
          {
            text:
              `Transcribe this page (${label}).` +
              (p.hint.length > 30
                ? `\nOptional reference, the embedded text layer (may be incomplete or out of order):\n${p.hint.slice(0, 6000)}`
                : ''),
          },
        ],
      },
    ],
  });

async function pool<T, R>(
  items: T[],
  n: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const r: R[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        r[k] = await fn(items[k]);
      }
    })
  );
  return r;
}

const EXAMINER_CSS = `
#ai-examiner{--bg:#f5f6fa;--card:#fff;--ink:#12141c;--mute:#6a7183;--line:#e5e8f0;--acc:#4f46e5;--ok:#15a05a;--mid:#d98a06;--bad:#e03a3a;--soft:#f0f1f7;
font-family:Manrope,system-ui,-apple-system,Segoe UI,sans-serif;color:var(--ink);background:var(--bg);max-width:980px;margin:0 auto;padding:24px 16px 60px;line-height:1.55;border-radius:20px}
@media(prefers-color-scheme:dark){#ai-examiner:not(.light-theme){--bg:#0c0e15;--card:#151822;--ink:#eef0f7;--mute:#8c94a8;--line:#252a3a;--soft:#1c2030;--acc:#8b85ff}}
#ai-examiner.dark-theme{--bg:#0c0e15;--card:#151822;--ink:#eef0f7;--mute:#8c94a8;--line:#252a3a;--soft:#1c2030;--acc:#8b85ff}
#ai-examiner *{box-sizing:border-box}
#ai-examiner h2,#ai-examiner h3,#ai-examiner h4,#ai-examiner p{margin:0}
#ai-examiner .tabs{display:inline-flex;background:var(--soft);padding:4px;border-radius:14px;margin-bottom:22px}
#ai-examiner .tabs button{border:0;background:none;color:var(--mute);font:600 14px Manrope,sans-serif;padding:10px 22px;border-radius:10px;cursor:pointer}
#ai-examiner .tabs button.on{background:var(--card);color:var(--ink);box-shadow:0 1px 6px rgba(0,0,0,.12)}
#ai-examiner .panel{display:none}#ai-examiner .panel.on{display:block}
#ai-examiner button:focus-visible,#ai-examiner textarea:focus-visible{outline:2px solid var(--acc);outline-offset:2px}

/* chat */
#ai-examiner .chat{display:flex;flex-direction:column;height:min(70vh,680px);background:var(--card);border:1px solid var(--line);border-radius:20px;overflow:hidden}
#ai-examiner #msgs{flex:1;overflow-y:auto;padding:24px 22px;display:flex;flex-direction:column;gap:20px}
#ai-examiner .empty{margin:auto;text-align:center;color:var(--mute)}#ai-examiner .empty h3{color:var(--ink);font-size:20px;margin-bottom:4px}
#ai-examiner .m{max-width:88%;font-size:15.5px}
#ai-examiner .m.u{align-self:flex-end;background:var(--soft);padding:10px 16px;border-radius:18px 18px 4px 18px;white-space:pre-wrap}
#ai-examiner .m.a p{margin:0 0 10px}#ai-examiner .m.a ul{margin:0 0 10px;padding-left:20px;list-style:disc}#ai-examiner .m.a li{margin:3px 0}
#ai-examiner .dots{display:inline-flex;gap:4px}#ai-examiner .dots i{width:6px;height:6px;border-radius:50%;background:var(--mute);animation:examiner-b 1s infinite}#ai-examiner .dots i:nth-child(2){animation-delay:.15s}#ai-examiner .dots i:nth-child(3){animation-delay:.3s}
@keyframes examiner-b{50%{opacity:.25}}
#ai-examiner .bar{display:flex;gap:10px;align-items:flex-end;padding:12px;border-top:1px solid var(--line)}
#ai-examiner .bar textarea{flex:1;resize:none;border:0;background:var(--soft);color:var(--ink);font:500 15px Manrope,sans-serif;padding:12px 16px;border-radius:14px;max-height:140px}
#ai-examiner .go{border:0;background:var(--acc);color:#fff;width:44px;height:44px;border-radius:12px;font-size:18px;cursor:pointer;flex:none}

/* paper */
#ai-examiner .zones{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
#ai-examiner .drop{background:var(--card);border:1.5px dashed var(--line);border-radius:18px;padding:16px;transition:.15s}
#ai-examiner .drop.on{border-color:var(--acc);background:var(--soft)}
#ai-examiner .drop label{display:block;cursor:pointer;text-align:center;padding:18px 6px}
#ai-examiner .drop b{display:block;font-size:15px}#ai-examiner .drop small{color:var(--mute)}
#ai-examiner .fl{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
#ai-examiner .fc{background:var(--soft);border-radius:8px;padding:4px 6px 4px 10px;font-size:12px;display:inline-flex;gap:6px;align-items:center;max-width:100%}
#ai-examiner .fc button{border:0;background:none;color:var(--mute);cursor:pointer;font-size:15px;line-height:1}
#ai-examiner .drop textarea{width:100%;margin-top:8px;border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:10px;padding:8px 10px;font:13px Manrope,sans-serif;resize:vertical;min-height:54px}
#ai-examiner .run{margin-top:16px;width:100%;border:0;background:linear-gradient(120deg,#4f46e5,#9333ea);color:#fff;font:700 16px Manrope,sans-serif;padding:16px;border-radius:14px;cursor:pointer}
#ai-examiner .run:disabled{opacity:.45;cursor:not-allowed}
#ai-examiner .prog{display:none;margin-top:16px}#ai-examiner .prog.on{display:block}
#ai-examiner .prog .t{height:6px;background:var(--soft);border-radius:9px;overflow:hidden;margin-top:8px}
#ai-examiner .prog .t i{display:block;height:100%;width:0;background:linear-gradient(90deg,#4f46e5,#c026d3);transition:width .4s}
#ai-examiner .err{margin-top:14px;padding:12px 16px;border-radius:12px;background:rgba(224,58,58,.12);color:var(--bad);display:none;font-size:14px}

#ai-examiner #res{margin-top:28px}
#ai-examiner .hero{--c:var(--ok);position:relative;overflow:hidden;display:flex;gap:30px;align-items:center;flex-wrap:wrap;padding:34px;border-radius:26px;color:#fff;
background:radial-gradient(120% 140% at 0% 0%,color-mix(in srgb,var(--c) 70%,#000) 0%,#10121c 70%)}
#ai-examiner .hero.mid{--c:var(--mid)}#ai-examiner .hero.bad{--c:var(--bad)}
#ai-examiner .ringw{position:relative;width:170px;height:170px;flex:none}
#ai-examiner .ring{width:100%;height:100%}#ai-examiner .ring circle{fill:none;stroke-width:9;stroke-linecap:round}
#ai-examiner .trk{stroke:rgba(255,255,255,.14)}#ai-examiner .arc{stroke:#fff;filter:drop-shadow(0 0 8px var(--c));transition:stroke-dashoffset 1.6s cubic-bezier(.2,.8,.2,1)}
#ai-examiner .pc{position:absolute;inset:0;display:grid;place-content:center;text-align:center}#ai-examiner .pc b{font-size:42px;font-weight:800;line-height:1}#ai-examiner .pc span{font-size:13px;opacity:.75}
#ai-examiner .hi{flex:1;min-width:240px}
#ai-examiner .hi .mk1{font-size:15px;opacity:.8}#ai-examiner .hi .big{font-size:54px;font-weight:800;line-height:1.1;letter-spacing:-1px}#ai-examiner .hi .big small{font-size:26px;opacity:.6;font-weight:600}
#ai-examiner .hi .vd{display:inline-block;margin:8px 0 12px;padding:5px 14px;border-radius:99px;background:rgba(255,255,255,.16);font-weight:700;font-size:14px}
#ai-examiner .hi p{opacity:.88;font-size:14.5px;max-width:56ch}
#ai-examiner .st{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}#ai-examiner .st span{background:rgba(255,255,255,.12);padding:5px 12px;border-radius:99px;font-size:13px;font-weight:600}

#ai-examiner .sec{margin:34px 0 14px;font-size:20px;font-weight:800;display:flex;align-items:center;gap:10px}
#ai-examiner .sec em{font-style:normal;font-size:13px;font-weight:700;background:var(--soft);color:var(--mute);padding:2px 10px;border-radius:99px}
#ai-examiner .mk{background:var(--card);border:1px solid var(--line);border-left:5px solid var(--bad);border-radius:16px;padding:16px 20px;margin-bottom:12px}
#ai-examiner .mkh{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
#ai-examiner .mk p{font-size:14.5px;margin-top:6px}#ai-examiner .lb{display:inline-block;font-weight:700;font-size:12.5px;color:var(--bad);margin-right:8px}#ai-examiner .lb.ok{color:var(--ok)}
#ai-examiner .chip{font-weight:800;font-size:13px;padding:3px 11px;border-radius:99px}
#ai-examiner .chip.ok{background:rgba(21,160,90,.14);color:var(--ok)}#ai-examiner .chip.mid{background:rgba(217,138,6,.15);color:var(--mid)}#ai-examiner .chip.bad{background:rgba(224,58,58,.13);color:var(--bad)}
#ai-examiner .good{background:rgba(21,160,90,.1);color:var(--ok);padding:16px 20px;border-radius:16px;font-weight:600}
#ai-examiner .qc{background:var(--card);border:1px solid var(--line);border-radius:18px;margin-bottom:14px;overflow:hidden}
#ai-examiner .qh{display:flex;gap:12px;align-items:center;padding:14px 20px;border-bottom:1px solid var(--line)}
#ai-examiner .qn{font-weight:800}#ai-examiner .qt{flex:1;color:var(--mute);font-size:14px}
#ai-examiner .g3{display:grid;grid-template-columns:repeat(3,1fr)}
#ai-examiner .g3>div{padding:16px 20px;font-size:14px;border-right:1px solid var(--line)}#ai-examiner .g3>div:last-child{border:0;background:rgba(21,160,90,.06)}
#ai-examiner .g3 h4{font-size:12.5px;color:var(--mute);margin-bottom:8px}
#ai-examiner .g3 p{margin-bottom:6px}#ai-examiner .pts{list-style:none;margin:0;padding:0}#ai-examiner .pts li{display:flex;gap:8px;margin-bottom:7px}
#ai-examiner .pts i{font-style:normal;font-weight:800;flex:none}#ai-examiner .pts .ok i{color:var(--ok)}#ai-examiner .pts .bad i{color:var(--bad)}
#ai-examiner .mute{color:var(--mute)}
#ai-examiner details{margin-top:24px}#ai-examiner summary{cursor:pointer;color:var(--mute);font-weight:600;font-size:14px}
#ai-examiner pre{white-space:pre-wrap;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;font:12.5px/1.5 ui-monospace,monospace;max-height:340px;overflow:auto}
@media(max-width:760px){#ai-examiner .zones,#ai-examiner .g3{grid-template-columns:1fr}#ai-examiner .g3>div{border-right:0;border-bottom:1px solid var(--line)}#ai-examiner .hero{padding:24px}}
@media(prefers-reduced-motion:reduce){#ai-examiner .arc{transition:none}}
`;

export const AiScholarTab: React.FC<AiScholarTabProps> = ({
  theme = 'light',
  onTriggerSecurityLockdown,
  onAwardFocusXp,
}) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'paper'>('chat');

  // Chat state & refs
  const [chatBusy, setChatBusy] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const histRef = useRef<LlmMessage[]>([]);
  const ctlRef = useRef<AbortController | null>(null);
  const msgsRef = useRef<HTMLDivElement | null>(null);
  const inpRef = useRef<HTMLTextAreaElement | null>(null);

  // Paper correction state & refs
  const [files, setFiles] = useState<{ a: File[]; b: File[]; m: File[] }>({
    a: [],
    b: [],
    m: [],
  });
  const [msText, setMsText] = useState('');
  const [dragZone, setDragZone] = useState<'a' | 'b' | 'm' | null>(null);
  const [running, setRunning] = useState(false);
  const [progOn, setProgOn] = useState(false);
  const [progText, setProgText] = useState('');
  const [progWidth, setProgWidth] = useState(0);
  const [errMsg, setErrMsg] = useState('');
  const resRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    ensurePdfJsLoaded().catch(() => {
      // loaded on demand if needed
    });
  }, []);

  const canRun =
    !running &&
    files.a.length + files.b.length > 0 &&
    (files.m.length > 0 || msText.trim().length > 0);

  const handleChatSend = async () => {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    if (onTriggerSecurityLockdown?.(text, 'AI Examiner Chat')) return;

    const msgs = msgsRef.current;
    if (!msgs) return;

    msgs.querySelector('#emp')?.remove();
    setChatInput('');
    if (inpRef.current) {
      inpRef.current.style.height = 'auto';
    }

    msgs.insertAdjacentHTML(
      'beforeend',
      `<div class="m u">${esc(text)}</div><div class="m a"><span class="dots"><i></i><i></i><i></i></span></div>`
    );
    const box = msgs.lastElementChild as HTMLElement;
    msgs.scrollTop = msgs.scrollHeight;

    histRef.current.push({ role: 'user', content: text });
    setChatBusy(true);
    const ctl = new AbortController();
    ctlRef.current = ctl;

    let acc = '';
    let raf = 0;
    try {
      acc = await llm({
        system: CHAT_SYS,
        model: M().chat,
        stream: true,
        signal: ctl.signal,
        messages: histRef.current.slice(-20),
        onToken: (t) => {
          acc = t;
          if (!raf) {
            raf = requestAnimationFrame(() => {
              raf = 0;
              box.innerHTML = fmt(acc);
              msgs.scrollTop = msgs.scrollHeight;
            });
          }
        },
      });
      box.innerHTML = fmt(acc);
      histRef.current.push({ role: 'assistant', content: acc });
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        box.innerHTML = fmt(acc || 'Stopped.');
        if (acc) histRef.current.push({ role: 'assistant', content: acc });
      } else {
        box.innerHTML = `<p style="color:var(--bad)">${esc(e?.message || 'Request failed')}</p>`;
        histRef.current.pop();
      }
    }
    setChatBusy(false);
    msgs.scrollTop = msgs.scrollHeight;
  };

  const addFilesToZone = (k: 'a' | 'b' | 'm', fileList: FileList | null) => {
    if (!fileList) return;
    const valid = Array.from(fileList).filter(
      (f) => /pdf|image/.test(f.type) || /\.pdf$/i.test(f.name)
    );
    if (!valid.length) return;
    setFiles((prev) => ({
      ...prev,
      [k]: [...prev[k], ...valid],
    }));
  };

  const removeFileFromZone = (k: 'a' | 'b' | 'm', index: number) => {
    setFiles((prev) => ({
      ...prev,
      [k]: prev[k].filter((_, i) => i !== index),
    }));
  };

  const status = (t: string, p: number) => {
    setProgOn(true);
    setProgText(t);
    setProgWidth(p);
  };

  const renderResults = (r: any, T: { a: string; b: string; m: string }) => {
    const resEl = resRef.current;
    if (!resEl) return;

    const qs = (r.questions || []).map((q: any) => {
      const max = Math.max(0, +q.max_marks || 0);
      const aw = Math.min(max, Math.max(0, +q.awarded || 0));
      return {
        ...q,
        max,
        aw,
        st: aw >= max ? 'ok' : aw > 0 ? 'mid' : 'bad',
      };
    });
    const got = qs.reduce((s: number, q: any) => s + q.aw, 0);
    const tot = qs.reduce((s: number, q: any) => s + q.max, 0);
    const pct = tot ? Math.round((got / tot) * 100) : 0;
    const n = (x: number) => +x.toFixed(2);
    const cls = pct >= 70 ? '' : pct >= 45 ? 'mid' : 'bad';
    const verdict =
      pct >= 90
        ? 'Outstanding'
        : pct >= 75
        ? 'Strong result'
        : pct >= 60
        ? 'Good effort'
        : pct >= 40
        ? 'Getting there'
        : 'Needs more work';
    const cnt = (s: string) => qs.filter((q: any) => q.st === s).length;
    const wrong = qs.filter((q: any) => (q.mistakes || []).length || q.aw < q.max);
    const C = 326.7;

    resEl.innerHTML = `
  <div class="hero ${cls}">
    <div class="ringw"><svg class="ring" viewBox="0 0 120 120"><circle class="trk" cx="60" cy="60" r="52"/><circle class="arc" id="arc" cx="60" cy="60" r="52" stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90 60 60)"/></svg>
      <div class="pc"><b id="pnum">0</b><span>percent</span></div></div>
    <div class="hi"><div class="mk1">Your mark</div>
      <div class="big">${n(got)}<small> / ${n(tot)}</small></div>
      <div class="vd">${verdict}</div>
      <p>${inl(r.overall_feedback || '')}</p>
      <div class="st"><span>${cnt('ok')} full marks</span><span>${cnt('mid')} partial</span><span>${cnt('bad')} no marks</span></div></div>
  </div>
  <h3 class="sec">Mistakes made <em>${wrong.length}</em></h3>
  ${
    wrong.length
      ? wrong
          .map(
            (q: any) =>
              `<div class="mk"><div class="mkh"><b>Question ${inl(q.id)}</b><span class="chip bad">−${n(
                q.max - q.aw
              )} mark${q.max - q.aw === 1 ? '' : 's'}</span></div>
    ${
      (q.mistakes || [])
        .map(
          (m: any) =>
            `<p><span class="lb">What went wrong</span>${inl(m.issue)}</p><p><span class="lb ok">How to fix it</span>${inl(m.fix)}</p>`
        )
        .join('') || `<p class="mute">Marks were lost against the mark scheme.</p>`
    }</div>`
          )
          .join('')
      : `<div class="good">No mistakes found. Every mark was earned.</div>`
  }
  <h3 class="sec">Right answers vs mark scheme</h3>
  ${qs
    .map(
      (q: any) =>
        `<div class="qc"><div class="qh"><span class="qn">Q${inl(q.id)}</span><span class="qt">${inl(
          q.question || ''
        )}</span><span class="chip ${q.st}">${n(q.aw)} / ${n(q.max)}</span></div>
    <div class="g3">
      <div><h4>Your answer</h4>${fmt(q.student_answer) || `<p class="mute">No answer found</p>`}</div>
      <div><h4>Mark scheme points</h4><ul class="pts">${(q.points || [])
        .map(
          (p: any) =>
            `<li class="${p.earned ? 'ok' : 'bad'}"><i>${p.earned ? '✓' : '✗'}</i><span>${inl(
              p.text
            )}</span></li>`
        )
        .join('')}</ul></div>
      <div><h4>Correct answer</h4>${fmt(q.correct_answer)}</div>
    </div></div>`
    )
    .join('')}
  <details><summary>Extracted text (check the OCR)</summary><pre>${esc(
    'PART 1\n' + T.a + '\n\nPART 2\n' + T.b
  )}</pre></details>`;

    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const arcEl = resEl.querySelector('#arc') as SVGCircleElement | null;
        if (arcEl) {
          arcEl.style.strokeDashoffset = String(C * (1 - pct / 100));
        }
        const el = resEl.querySelector('#pnum');
        const t0 = performance.now();
        if (el) {
          (function tick(t: number) {
            const p = Math.min(1, (t - t0) / 1500);
            el.textContent = String(Math.round(pct * (1 - Math.pow(1 - p, 3))));
            if (p < 1) requestAnimationFrame(tick);
          })(t0);
        }
      })
    );
    resEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleRunCorrection = async () => {
    setRunning(true);
    setErrMsg('');
    if (resRef.current) {
      resRef.current.innerHTML = '';
    }
    try {
      const jobs: Array<{
        k: 'a' | 'b' | 'm';
        p: { img: string; hint: string };
        l: string;
      }> = [];
      for (const k of ['a', 'b', 'm'] as const) {
        for (const f of files[k]) {
          status('Preparing ' + f.name, 3);
          const pages = await toPages(f);
          pages.forEach((p, i) =>
            jobs.push({ k, p, l: `${f.name}, page ${i + 1}` })
          );
        }
      }
      let d = 0;
      const out = await pool(jobs, 3, async (j) => {
        const t = await ocr(j.p, j.l);
        status(
          `Reading text ${++d} of ${jobs.length} pages`,
          5 + (d / jobs.length) * 60
        );
        return { k: j.k, t: `[${j.l}]\n${t}` };
      });
      const T = { a: '', b: '', m: msText.trim() };
      out.forEach((o) => {
        T[o.k] += (T[o.k] ? '\n\n' : '') + o.t;
      });
      const ctx = `MARK SCHEME:\n${T.m}\n\nSTUDENT ANSWERS, PART 1:\n${
        T.a || '(none)'
      }\n\nSTUDENT ANSWERS, PART 2:\n${T.b || '(none)'}`;
      status('Marking against the mark scheme', 70);
      const draft = parse(
        await llm({
          system: GRADE_SYS,
          model: M().grade,
          json: true,
          messages: [
            {
              role: 'user',
              content: ctx + '\n\nMark every question now. Return JSON only.',
            },
          ],
        })
      );
      status('Double-checking every mark', 88);
      let final = draft;
      try {
        final = parse(
          await llm({
            system: GRADE_SYS,
            model: M().grade,
            json: true,
            messages: [
              {
                role: 'user',
                content:
                  ctx +
                  '\n\nDRAFT MARKING:\n' +
                  JSON.stringify(draft) +
                  "\n\nAudit this draft strictly. For each question re-check the student's answer against every mark scheme point, fix wrong marks, wrong quotes and missing questions, then return the corrected full JSON only.",
              },
            ],
          })
        );
        if (!Array.isArray(final.questions) || !final.questions.length) {
          final = draft;
        }
      } catch {
        final = draft;
      }
      if (!Array.isArray(final.questions) || !final.questions.length) {
        throw new Error(
          'No questions could be marked. Check the mark scheme and answer scans.'
        );
      }
      status('Done', 100);
      renderResults(final, T);
      onAwardFocusXp?.(50);
    } catch (e: any) {
      setErrMsg(e?.message || 'Paper check failed.');
      setProgOn(false);
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <style>{EXAMINER_CSS}</style>
      <section
        id="ai-examiner"
        className={theme === 'dark' ? 'dark-theme' : 'light-theme'}
      >
        <div className="tabs" role="tablist">
          <button
            type="button"
            className={activeTab === 'chat' ? 'on' : ''}
            data-t="chat"
            role="tab"
            onClick={() => setActiveTab('chat')}
          >
            Chatbot
          </button>
          <button
            type="button"
            className={activeTab === 'paper' ? 'on' : ''}
            data-t="paper"
            role="tab"
            onClick={() => setActiveTab('paper')}
          >
            Paper Correction
          </button>
        </div>

        {/* CHATBOT */}
        <div className={`panel ${activeTab === 'chat' ? 'on' : ''}`} id="p-chat">
          <div className="chat">
            <div id="msgs" ref={msgsRef}>
              <div className="empty" id="emp">
                <h3>Ask anything</h3>
                <p>Questions, explanations, revision help.</p>
              </div>
            </div>
            <div className="bar">
              <textarea
                id="inp"
                ref={inpRef}
                rows={1}
                placeholder="Type your message"
                value={chatInput}
                onChange={(e) => {
                  setChatInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height =
                    Math.min(e.target.scrollHeight, 140) + 'px';
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleChatSend();
                  }
                }}
              />
              <button
                type="button"
                className="go"
                id="send"
                aria-label="Send"
                onClick={() =>
                  chatBusy ? ctlRef.current?.abort() : handleChatSend()
                }
              >
                {chatBusy ? '\u25A0' : '\u27A4'}
              </button>
            </div>
          </div>
        </div>

        {/* PAPER CORRECTION */}
        <div className={`panel ${activeTab === 'paper' ? 'on' : ''}`} id="p-paper">
          <div className="zones">
            {/* Answers, part 1 */}
            <div
              className={`drop ${dragZone === 'a' ? 'on' : ''}`}
              data-k="a"
              onDragOver={(e) => {
                e.preventDefault();
                setDragZone('a');
              }}
              onDragLeave={() => setDragZone(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragZone(null);
                addFilesToZone('a', e.dataTransfer.files);
              }}
            >
              <label>
                <b>Answers, part 1</b>
                <small>PDF or photos. Drop or click</small>
                <input
                  type="file"
                  hidden
                  multiple
                  accept=".pdf,image/*"
                  onChange={(e) => {
                    addFilesToZone('a', e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
              <div className="fl">
                {files.a.map((f, i) => (
                  <span key={`${f.name}-${i}`} className="fc">
                    {f.name}
                    <button
                      type="button"
                      aria-label="Remove"
                      onClick={() => removeFileFromZone('a', i)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Answers, part 2 */}
            <div
              className={`drop ${dragZone === 'b' ? 'on' : ''}`}
              data-k="b"
              onDragOver={(e) => {
                e.preventDefault();
                setDragZone('b');
              }}
              onDragLeave={() => setDragZone(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragZone(null);
                addFilesToZone('b', e.dataTransfer.files);
              }}
            >
              <label>
                <b>Answers, part 2</b>
                <small>Optional. PDF or photos</small>
                <input
                  type="file"
                  hidden
                  multiple
                  accept=".pdf,image/*"
                  onChange={(e) => {
                    addFilesToZone('b', e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
              <div className="fl">
                {files.b.map((f, i) => (
                  <span key={`${f.name}-${i}`} className="fc">
                    {f.name}
                    <button
                      type="button"
                      aria-label="Remove"
                      onClick={() => removeFileFromZone('b', i)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Mark scheme */}
            <div
              className={`drop ${dragZone === 'm' ? 'on' : ''}`}
              data-k="m"
              onDragOver={(e) => {
                e.preventDefault();
                setDragZone('m');
              }}
              onDragLeave={() => setDragZone(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragZone(null);
                addFilesToZone('m', e.dataTransfer.files);
              }}
            >
              <label>
                <b>Mark scheme</b>
                <small>PDF or photos. Drop or click</small>
                <input
                  type="file"
                  hidden
                  multiple
                  accept=".pdf,image/*"
                  onChange={(e) => {
                    addFilesToZone('m', e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
              <div className="fl">
                {files.m.map((f, i) => (
                  <span key={`${f.name}-${i}`} className="fc">
                    {f.name}
                    <button
                      type="button"
                      aria-label="Remove"
                      onClick={() => removeFileFromZone('m', i)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <textarea
                id="msText"
                placeholder="Or paste the mark scheme text here"
                value={msText}
                onChange={(e) => setMsText(e.target.value)}
              />
            </div>
          </div>

          <button
            type="button"
            className="run"
            id="run"
            disabled={!canRun}
            onClick={handleRunCorrection}
          >
            Check paper
          </button>

          <div className={`prog ${progOn ? 'on' : ''}`} id="prog">
            <span id="pt" className="mute">
              {progText}
            </span>
            <div className="t">
              <i id="pb" style={{ width: `${progWidth}%` }} />
            </div>
          </div>

          <div
            className="err"
            id="err"
            style={{ display: errMsg ? 'block' : 'none' }}
          >
            {errMsg}
          </div>

          <div id="res" ref={resRef} />
        </div>
      </section>
    </>
  );
};
