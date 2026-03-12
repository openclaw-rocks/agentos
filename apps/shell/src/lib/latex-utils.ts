/**
 * Lightweight LaTeX-to-Unicode rendering utilities.
 *
 * Detects inline math (`$...$`, `\(...\)`) and display math (`$$...$$`, `\[...\]`)
 * then converts common LaTeX commands to Unicode approximations without requiring
 * a full KaTeX/MathJax dependency.
 */

// ---------------------------------------------------------------------------
// Greek letters
// ---------------------------------------------------------------------------

const GREEK_MAP: Record<string, string> = {
  alpha: "\u03B1",
  beta: "\u03B2",
  gamma: "\u03B3",
  delta: "\u03B4",
  epsilon: "\u03B5",
  zeta: "\u03B6",
  eta: "\u03B7",
  theta: "\u03B8",
  iota: "\u03B9",
  kappa: "\u03BA",
  lambda: "\u03BB",
  mu: "\u03BC",
  nu: "\u03BD",
  xi: "\u03BE",
  omicron: "\u03BF",
  pi: "\u03C0",
  rho: "\u03C1",
  sigma: "\u03C3",
  tau: "\u03C4",
  upsilon: "\u03C5",
  phi: "\u03C6",
  chi: "\u03C7",
  psi: "\u03C8",
  omega: "\u03C9",
  Gamma: "\u0393",
  Delta: "\u0394",
  Theta: "\u0398",
  Lambda: "\u039B",
  Xi: "\u039E",
  Pi: "\u03A0",
  Sigma: "\u03A3",
  Phi: "\u03A6",
  Psi: "\u03A8",
  Omega: "\u03A9",
};

// ---------------------------------------------------------------------------
// Operator / symbol map
// ---------------------------------------------------------------------------

const SYMBOL_MAP: Record<string, string> = {
  sum: "\u2211",
  prod: "\u220F",
  int: "\u222B",
  infty: "\u221E",
  partial: "\u2202",
  nabla: "\u2207",
  forall: "\u2200",
  exists: "\u2203",
  nexists: "\u2204",
  in: "\u2208",
  notin: "\u2209",
  subset: "\u2282",
  supset: "\u2283",
  subseteq: "\u2286",
  supseteq: "\u2287",
  cup: "\u222A",
  cap: "\u2229",
  emptyset: "\u2205",
  pm: "\u00B1",
  mp: "\u2213",
  times: "\u00D7",
  div: "\u00F7",
  cdot: "\u00B7",
  leq: "\u2264",
  geq: "\u2265",
  neq: "\u2260",
  approx: "\u2248",
  equiv: "\u2261",
  sim: "\u223C",
  propto: "\u221D",
  to: "\u2192",
  rightarrow: "\u2192",
  leftarrow: "\u2190",
  Rightarrow: "\u21D2",
  Leftarrow: "\u21D0",
  leftrightarrow: "\u2194",
  Leftrightarrow: "\u21D4",
  langle: "\u27E8",
  rangle: "\u27E9",
  ldots: "\u2026",
  cdots: "\u22EF",
  vdots: "\u22EE",
  ddots: "\u22F1",
  prime: "\u2032",
  star: "\u22C6",
  circ: "\u2218",
  bullet: "\u2022",
  neg: "\u00AC",
  land: "\u2227",
  lor: "\u2228",
  oplus: "\u2295",
  otimes: "\u2297",
  perp: "\u22A5",
  angle: "\u2220",
  triangle: "\u25B3",
  hbar: "\u210F",
  ell: "\u2113",
  Re: "\u211C",
  Im: "\u2111",
  aleph: "\u2135",
};

// ---------------------------------------------------------------------------
// Superscript / subscript maps
// ---------------------------------------------------------------------------

const SUPERSCRIPT_MAP: Record<string, string> = {
  "0": "\u2070",
  "1": "\u00B9",
  "2": "\u00B2",
  "3": "\u00B3",
  "4": "\u2074",
  "5": "\u2075",
  "6": "\u2076",
  "7": "\u2077",
  "8": "\u2078",
  "9": "\u2079",
  "+": "\u207A",
  "-": "\u207B",
  "=": "\u207C",
  "(": "\u207D",
  ")": "\u207E",
  n: "\u207F",
  i: "\u2071",
};

const SUBSCRIPT_MAP: Record<string, string> = {
  "0": "\u2080",
  "1": "\u2081",
  "2": "\u2082",
  "3": "\u2083",
  "4": "\u2084",
  "5": "\u2085",
  "6": "\u2086",
  "7": "\u2087",
  "8": "\u2088",
  "9": "\u2089",
  "+": "\u208A",
  "-": "\u208B",
  "=": "\u208C",
  "(": "\u208D",
  ")": "\u208E",
  a: "\u2090",
  e: "\u2091",
  o: "\u2092",
  x: "\u2093",
  h: "\u2095",
  k: "\u2096",
  l: "\u2097",
  m: "\u2098",
  n: "\u2099",
  p: "\u209A",
  s: "\u209B",
  t: "\u209C",
  i: "\u1D62",
  j: "\u2C7C",
  r: "\u1D63",
  u: "\u1D64",
  v: "\u1D65",
};

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/** Inline: $...$ (not $$) or \(...\) */
const INLINE_RE = /(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)|\\?\\\((.+?)\\\)/;

/** Display: $$...$$ or \[...\] */
const DISPLAY_RE = /\$\$(.+?)\$\$|\\\[(.+?)\\\]/s;

/**
 * Returns `true` when the text contains at least one LaTeX math delimiter.
 */
export function containsLatex(text: string): boolean {
  return INLINE_RE.test(text) || DISPLAY_RE.test(text);
}

// ---------------------------------------------------------------------------
// Internal: convert a LaTeX math expression to Unicode
// ---------------------------------------------------------------------------

function toSuperscript(text: string): string {
  return Array.from(text)
    .map((ch) => SUPERSCRIPT_MAP[ch] ?? ch)
    .join("");
}

function toSubscript(text: string): string {
  return Array.from(text)
    .map((ch) => SUBSCRIPT_MAP[ch] ?? ch)
    .join("");
}

/**
 * Strip surrounding braces from a LaTeX group: `{abc}` -> `abc`.
 */
function _stripBraces(s: string): string {
  if (s.startsWith("{") && s.endsWith("}")) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Convert a single LaTeX math expression (without delimiters) to a Unicode string.
 */
export function convertLatexToUnicode(expr: string): string {
  let result = expr;

  // \frac{a}{b} -> a/b
  result = result.replace(/\\frac\{([^}]*)}\{([^}]*)}/g, (_m, num: string, den: string) => {
    return `${num}/${den}`;
  });

  // \sqrt{x} -> sqrt(x) unicode
  result = result.replace(/\\sqrt\{([^}]*)}/g, (_m, inner: string) => {
    return `\u221A${inner}`;
  });

  // \sqrt x (single token)
  result = result.replace(/\\sqrt\s+([a-zA-Z0-9])/g, (_m, inner: string) => {
    return `\u221A${inner}`;
  });

  // Superscripts: x^{2} or x^2
  result = result.replace(/\^{([^}]+)}/g, (_m, inner: string) => toSuperscript(inner));
  result = result.replace(/\^([a-zA-Z0-9+\-=()])/g, (_m, ch: string) => toSuperscript(ch));

  // Subscripts: x_{i} or x_i
  result = result.replace(/_{([^}]+)}/g, (_m, inner: string) => toSubscript(inner));
  result = result.replace(/_([a-zA-Z0-9+\-=()])/g, (_m, ch: string) => toSubscript(ch));

  // Greek letters: \alpha, \beta, ...
  for (const [name, symbol] of Object.entries(GREEK_MAP)) {
    result = result.replace(new RegExp(`\\\\${name}(?![a-zA-Z])`, "g"), symbol);
  }

  // Symbols / operators: \sum, \int, ...
  for (const [name, symbol] of Object.entries(SYMBOL_MAP)) {
    result = result.replace(new RegExp(`\\\\${name}(?![a-zA-Z])`, "g"), symbol);
  }

  // \left and \right delimiters (just strip the command)
  result = result.replace(/\\left\s*/g, "");
  result = result.replace(/\\right\s*/g, "");

  // \text{...} -> just the text
  result = result.replace(/\\text\{([^}]*)}/g, (_m, inner: string) => inner);
  result = result.replace(/\\mathrm\{([^}]*)}/g, (_m, inner: string) => inner);

  // \mathbb{R} etc -> just the letter (approximation)
  result = result.replace(/\\mathbb\{([^}]*)}/g, (_m, inner: string) => inner);

  // Remaining \cmd{arg} -> just arg (best effort)
  result = result.replace(/\\[a-zA-Z]+\{([^}]*)}/g, (_m, inner: string) => inner);

  // Remaining \cmd -> strip backslash commands we haven't handled
  result = result.replace(/\\([a-zA-Z]+)/g, (_m, name: string) => {
    // If it's a known Greek or symbol we somehow missed, return it
    return GREEK_MAP[name] ?? SYMBOL_MAP[name] ?? name;
  });

  // Strip leftover braces
  result = result.replace(/[{}]/g, "");

  // Clean up extra whitespace
  result = result.replace(/\s+/g, " ").trim();

  return result;
}

// ---------------------------------------------------------------------------
// Public API: render LaTeX in text to HTML
// ---------------------------------------------------------------------------

/**
 * Find all LaTeX math regions in the text and replace them with styled HTML spans
 * containing Unicode approximations. Non-math text is HTML-escaped.
 */
export function renderLatex(text: string): string {
  // We process display math first ($$...$$, \[...\]) then inline ($...$, \(...\))
  // to avoid the inline regex matching inside display math.

  const DISPLAY_GLOBAL = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g;
  const INLINE_GLOBAL = /(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)|\\\((.+?)\\\)/g;

  // First pass: replace display math
  let result = text.replace(
    DISPLAY_GLOBAL,
    (_match, g1: string | undefined, g2: string | undefined) => {
      const expr = g1 ?? g2 ?? "";
      const rendered = convertLatexToUnicode(expr);
      return `<span class="latex-math latex-display font-serif italic block text-center my-2">${escapeHtml(rendered)}</span>`;
    },
  );

  // Second pass: replace inline math
  result = result.replace(
    INLINE_GLOBAL,
    (_match, g1: string | undefined, g2: string | undefined) => {
      const expr = g1 ?? g2 ?? "";
      const rendered = convertLatexToUnicode(expr);
      return `<span class="latex-math font-serif italic">${escapeHtml(rendered)}</span>`;
    },
  );

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
