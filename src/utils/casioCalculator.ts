export type AngleMode = 'DEG' | 'RAD';

export interface CalculationHistoryItem {
  id: string;
  expression: string;
  decimalResult: number;
  formattedDecimal: string;
  exactRepresentation: string | null;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

export function factorial(n: number): number {
  if (n < 0 || !Number.isFinite(n)) return NaN;
  if (Math.abs(n - Math.round(n)) > 1e-9) return NaN;
  const intN = Math.round(n);
  if (intN > 170) return Infinity;
  let res = 1;
  for (let i = 2; i <= intN; i++) {
    res *= i;
  }
  return res;
}

export function nCr(n: number, r: number): number {
  const intN = Math.round(n);
  const intR = Math.round(r);
  if (intR < 0 || intN < 0 || intR > intN) return NaN;
  return factorial(intN) / (factorial(intR) * factorial(intN - intR));
}

export function nPr(n: number, r: number): number {
  const intN = Math.round(n);
  const intR = Math.round(r);
  if (intR < 0 || intN < 0 || intR > intN) return NaN;
  return factorial(intN) / factorial(intN - intR);
}

/**
 * Converts a finite decimal number into an exact fraction or symbolic surd/pi form
 * for the Casio fx-991ES PLUS S⇔D button.
 */
export function toExactRepresentation(val: number): string | null {
  if (!Number.isFinite(val)) return null;
  if (Math.abs(val - Math.round(val)) < 1e-10) {
    return String(Math.round(val));
  }

  // Check common multiples of pi
  const piRatio = val / Math.PI;
  if (Math.abs(piRatio - Math.round(piRatio)) < 1e-9 && Math.round(piRatio) !== 0) {
    const k = Math.round(piRatio);
    return k === 1 ? 'π' : k === -1 ? '-π' : `${k}π`;
  }

  // Check simple rational multiples of pi: (p/q)π for q <= 12
  for (let q = 2; q <= 12; q++) {
    const p = Math.round(piRatio * q);
    if (p !== 0 && Math.abs(piRatio - p / q) < 1e-9) {
      const g = gcd(p, q);
      const num = p / g;
      const den = q / g;
      const numStr = num === 1 ? '' : num === -1 ? '-' : String(num);
      return `${numStr}π/${den}`;
    }
  }

  // Check common square roots: k * √m for m in [2, 3, 5, 6, 7, 10]
  for (const m of [2, 3, 5, 6, 7, 10]) {
    const rootM = Math.sqrt(m);
    const ratio = val / rootM;
    if (Math.abs(ratio - Math.round(ratio)) < 1e-9 && Math.round(ratio) !== 0) {
      const k = Math.round(ratio);
      return k === 1 ? `√${m}` : k === -1 ? `-√${m}` : `${k}√${m}`;
    }
    // Check (p/q)√m for small q <= 6
    for (let q = 2; q <= 6; q++) {
      const p = Math.round(ratio * q);
      if (p !== 0 && Math.abs(ratio - p / q) < 1e-9) {
        const g = gcd(p, q);
        const num = p / g;
        const den = q / g;
        const numStr = num === 1 ? '' : num === -1 ? '-' : String(num);
        return `${numStr}√${m}/${den}`;
      }
    }
  }

  // Continued fraction rational approximation for exact fractions a/b
  const sign = val < 0 ? -1 : 1;
  const absVal = Math.abs(val);
  const maxDenominator = 10000;
  let h1 = 1;
  let h2 = 0;
  let k1 = 0;
  let k2 = 1;
  let b = absVal;

  for (let i = 0; i < 20; i++) {
    const a = Math.floor(b);
    const hAux = a * h1 + h2;
    const kAux = a * k1 + k2;
    if (kAux > maxDenominator) break;
    h2 = h1;
    h1 = hAux;
    k2 = k1;
    k1 = kAux;
    const rem = b - a;
    if (rem < 1e-10) break;
    b = 1 / rem;
  }

  if (k1 > 1 && k1 <= maxDenominator && Math.abs(absVal - h1 / k1) < 1e-9) {
    return `${sign * h1}/${k1}`;
  }

  return null;
}

export function formatCasioNumber(val: number): string {
  if (Number.isNaN(val)) return 'Math ERROR';
  if (!Number.isFinite(val)) return 'Math ERROR';
  if (Math.abs(val) < 1e-12) return '0';

  if (Math.abs(val) >= 1e10 || (Math.abs(val) > 0 && Math.abs(val) < 1e-3)) {
    const expStr = val.toExponential(6);
    const [mantissa, exp] = expStr.split('e');
    const cleanMantissa = parseFloat(mantissa).toString();
    const cleanExp = parseInt(exp, 10);
    return `${cleanMantissa}×10^(${cleanExp})`;
  }

  // Round to 10 significant digits like Casio fx-991ES PLUS
  const rounded = Number(val.toPrecision(10));
  return String(rounded);
}

/**
 * Evaluates a Casio fx-991ES PLUS expression string safely.
 */
export function evaluateCasioExpression(
  rawExpr: string,
  angleMode: AngleMode,
  ansValue: number,
  memValue: number
): { ok: true; value: number; formatted: string; exact: string | null } | { ok: false; error: string } {
  const trimmed = rawExpr.trim();
  if (!trimmed) {
    return { ok: true, value: 0, formatted: '0', exact: '0' };
  }

  try {
    let expr = trimmed;

    // Auto-close unmatched opening parentheses (standard Casio behavior when pressing '=')
    const openCount = (expr.match(/\(/g) || []).length;
    const closeCount = (expr.match(/\)/g) || []).length;
    if (openCount > closeCount) {
      expr += ')'.repeat(openCount - closeCount);
    }

    // Replace constants and Ans/M registers
    expr = expr
      .replace(/Ans/g, `(${ansValue})`)
      .replace(/\bM\b/g, `(${memValue})`)
      .replace(/π/g, '(Math.PI)')
      .replace(/(?<![a-zA-Z])e(?![a-zA-Z])/g, '(Math.E)');

    // Replace implicit multiplication before parentheses, π, √, sin, cos, tan, log, ln
    expr = expr
      .replace(/(\d|\))(?=\()/g, '$1*')
      .replace(/(\d|\))(?=(sin|cos|tan|asin|acos|atan|log|ln|√|cbrt|abs))/g, '$1*');

    // Factorials: number or parenthesized expression followed by !
    expr = expr.replace(/(\d+(?:\.\d+)?|\([^()]+\))!/g, '__fact($1)');

    // Combinatorics nCr and nPr: e.g., 5C2 or 5P2
    expr = expr.replace(
      /(\d+(?:\.\d+)?|\([^()]+\))C(\d+(?:\.\d+)?|\([^()]+\))/g,
      '__nCr($1,$2)'
    );
    expr = expr.replace(
      /(\d+(?:\.\d+)?|\([^()]+\))P(\d+(?:\.\d+)?|\([^()]+\))/g,
      '__nPr($1,$2)'
    );

    // Roots: ³√(x), cbrt(x), and √(x) or √number
    expr = expr
      .replace(/³√\(/g, '__cbrt(')
      .replace(/cbrt\(/g, '__cbrt(')
      .replace(/³√(\d+(?:\.\d+)?)/g, '__cbrt($1)')
      .replace(/√\(/g, '__sqrt(')
      .replace(/√(\d+(?:\.\d+)?)/g, '__sqrt($1)');

    // Inverse trig & standard trig functions
    expr = expr
      .replace(/sin⁻¹\(/g, '__asin(')
      .replace(/cos⁻¹\(/g, '__acos(')
      .replace(/tan⁻¹\(/g, '__atan(')
      .replace(/asin\(/g, '__asin(')
      .replace(/acos\(/g, '__acos(')
      .replace(/atan\(/g, '__atan(')
      .replace(/sin\(/g, '__sin(')
      .replace(/cos\(/g, '__cos(')
      .replace(/tan\(/g, '__tan(')
      .replace(/log\(/g, '__log10(')
      .replace(/ln\(/g, '__ln(')
      .replace(/Abs\(/g, 'Math.abs(');

    // Powers and operators
    expr = expr
      .replace(/²/g, '**2')
      .replace(/³/g, '**3')
      .replace(/⁻¹/g, '**(-1)')
      .replace(/×10\^\(/g, '*10**(')
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/−/g, '-')
      .replace(/\^/g, '**');

    // Reject any unexpected identifiers
    const scrubbed = expr.replace(
      /__fact|__nCr|__nPr|__cbrt|__sqrt|__asin|__acos|__atan|__sin|__cos|__tan|__log10|__ln|Math\.PI|Math\.E|Math\.abs/g,
      ''
    );
    if (/[a-zA-Z_$]/.test(scrubbed)) {
      return { ok: false, error: 'Syntax ERROR' };
    }

    const toRad = (x: number) => (angleMode === 'DEG' ? (x * Math.PI) / 180 : x);
    const fromRad = (x: number) => (angleMode === 'DEG' ? (x * 180) / Math.PI : x);

    const helpers = {
      __fact: factorial,
      __nCr: nCr,
      __nPr: nPr,
      __cbrt: (x: number) => Math.cbrt(x),
      __sqrt: (x: number) => (x < 0 ? NaN : Math.sqrt(x)),
      __sin: (x: number) => {
        if (angleMode === 'DEG' && Math.abs(x % 180) < 1e-12) return 0;
        return Math.sin(toRad(x));
      },
      __cos: (x: number) => {
        if (angleMode === 'DEG' && Math.abs((Math.abs(x) - 90) % 180) < 1e-12) return 0;
        return Math.cos(toRad(x));
      },
      __tan: (x: number) => {
        if (angleMode === 'DEG' && Math.abs((Math.abs(x) - 90) % 180) < 1e-12) return NaN;
        if (angleMode === 'DEG' && Math.abs(x % 180) < 1e-12) return 0;
        return Math.tan(toRad(x));
      },
      __asin: (x: number) => (x < -1 || x > 1 ? NaN : fromRad(Math.asin(x))),
      __acos: (x: number) => (x < -1 || x > 1 ? NaN : fromRad(Math.acos(x))),
      __atan: (x: number) => fromRad(Math.atan(x)),
      __log10: (x: number) => (x <= 0 ? NaN : Math.log10(x)),
      __ln: (x: number) => (x <= 0 ? NaN : Math.log(x)),
    };

    const fn = new Function(
      'h',
      `const { __fact, __nCr, __nPr, __cbrt, __sqrt, __sin, __cos, __tan, __asin, __acos, __atan, __log10, __ln } = h; return (${expr});`
    );
    const result = Number(fn(helpers));

    if (Number.isNaN(result) || !Number.isFinite(result)) {
      return { ok: false, error: 'Math ERROR' };
    }

    const formatted = formatCasioNumber(result);
    const exact = toExactRepresentation(result);
    return {
      ok: true,
      value: result,
      formatted,
      exact,
    };
  } catch {
    return { ok: false, error: 'Syntax ERROR' };
  }
}
