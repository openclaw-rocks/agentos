/**
 * Minimal QR code generator that produces SVG strings.
 *
 * This implements a simplified QR code encoding (version 1-4, error correction L)
 * using byte-mode encoding sufficient for typical matrix.to URLs and short strings.
 *
 * For production use with longer data, consider using a dedicated library.
 * This implementation covers the common case of encoding short URLs (< 80 chars).
 */

// ---------------------------------------------------------------------------
// GF(256) arithmetic for Reed-Solomon error correction
// ---------------------------------------------------------------------------

const GF_EXP: number[] = new Array(256);
const GF_LOG: number[] = new Array(256);

(function initGaloisField(): void {
  let x = 1;
  for (let i = 0; i < 256; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x >= 256) x ^= 0x11d;
  }
  GF_LOG[0] = 255; // convention
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[(GF_LOG[a] + GF_LOG[b]) % 255];
}

function rsGeneratorPoly(nsym: number): number[] {
  let g = [1];
  for (let i = 0; i < nsym; i++) {
    const newG = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      newG[j] ^= g[j];
      newG[j + 1] ^= gfMul(g[j], GF_EXP[i]);
    }
    g = newG;
  }
  return g;
}

function rsEncode(data: number[], nsym: number): number[] {
  const gen = rsGeneratorPoly(nsym);
  const result = new Array(data.length + nsym).fill(0);
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i];
  }
  for (let i = 0; i < data.length; i++) {
    const coef = result[i];
    if (coef !== 0) {
      for (let j = 1; j < gen.length; j++) {
        result[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return result.slice(data.length);
}

// ---------------------------------------------------------------------------
// QR code data structures
// ---------------------------------------------------------------------------

interface QrVersion {
  version: number;
  size: number;
  dataCodewords: number;
  ecCodewords: number;
  capacity: number; // byte-mode capacity at ECC level L
}

/** Versions 1-6 with error correction level L. */
const QR_VERSIONS: QrVersion[] = [
  { version: 1, size: 21, dataCodewords: 19, ecCodewords: 7, capacity: 17 },
  { version: 2, size: 25, dataCodewords: 34, ecCodewords: 10, capacity: 32 },
  { version: 3, size: 29, dataCodewords: 55, ecCodewords: 15, capacity: 53 },
  { version: 4, size: 33, dataCodewords: 80, ecCodewords: 20, capacity: 78 },
  { version: 5, size: 37, dataCodewords: 108, ecCodewords: 26, capacity: 106 },
  { version: 6, size: 41, dataCodewords: 136, ecCodewords: 36, capacity: 134 },
];

/** Alignment pattern center coordinates per version. */
const ALIGNMENT_PATTERNS: Record<number, number[]> = {
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
};

function selectVersion(byteCount: number): QrVersion {
  for (const v of QR_VERSIONS) {
    if (byteCount <= v.capacity) return v;
  }
  throw new Error(
    `Data too long for QR code (${byteCount} bytes, max ${QR_VERSIONS[QR_VERSIONS.length - 1].capacity})`,
  );
}

// ---------------------------------------------------------------------------
// Module placement
// ---------------------------------------------------------------------------

type Module = 0 | 1;

function createMatrix(size: number): { modules: Module[][]; reserved: boolean[][] } {
  const modules: Module[][] = [];
  const reserved: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    modules.push(new Array(size).fill(0));
    reserved.push(new Array(size).fill(false));
  }
  return { modules, reserved };
}

function placeFinderPattern(
  modules: Module[][],
  reserved: boolean[][],
  row: number,
  col: number,
): void {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || rr >= modules.length || cc < 0 || cc >= modules.length) continue;
      const isBorder = r === -1 || r === 7 || c === -1 || c === 7;
      const isOuter = r === 0 || r === 6 || c === 0 || c === 6;
      const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      modules[rr][cc] = (isOuter || isInner) && !isBorder ? 1 : isBorder ? 0 : 0;
      if (!isBorder) {
        modules[rr][cc] = isOuter || isInner ? 1 : 0;
      }
      reserved[rr][cc] = true;
    }
  }
}

function placeAlignmentPattern(
  modules: Module[][],
  reserved: boolean[][],
  row: number,
  col: number,
): void {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || rr >= modules.length || cc < 0 || cc >= modules.length) continue;
      if (reserved[rr][cc]) continue;
      const isEdge = Math.abs(r) === 2 || Math.abs(c) === 2;
      const isCenter = r === 0 && c === 0;
      modules[rr][cc] = isEdge || isCenter ? 1 : 0;
      reserved[rr][cc] = true;
    }
  }
}

function placeTimingPatterns(modules: Module[][], reserved: boolean[][], size: number): void {
  for (let i = 8; i < size - 8; i++) {
    if (!reserved[6][i]) {
      modules[6][i] = i % 2 === 0 ? 1 : 0;
      reserved[6][i] = true;
    }
    if (!reserved[i][6]) {
      modules[i][6] = i % 2 === 0 ? 1 : 0;
      reserved[i][6] = true;
    }
  }
}

function reserveFormatBits(reserved: boolean[][], size: number): void {
  // Around top-left finder
  for (let i = 0; i <= 8; i++) {
    if (i < size) reserved[8][i] = true;
    if (i < size) reserved[i][8] = true;
  }
  // Around top-right finder
  for (let i = 0; i <= 7; i++) {
    reserved[8][size - 1 - i] = true;
  }
  // Around bottom-left finder
  for (let i = 0; i <= 7; i++) {
    reserved[size - 1 - i][8] = true;
  }
  // Dark module
  reserved[size - 8][8] = true;
}

function placeFormatBits(modules: Module[][], size: number, maskPattern: number): void {
  // Format info for ECC level L (01) and mask pattern
  const formatBits = getFormatBits(0, maskPattern); // 0 = L level

  let bit = 0;
  // Horizontal strip near top-left
  for (let i = 0; i <= 5; i++) {
    modules[8][i] = ((formatBits >> (14 - bit)) & 1) as Module;
    bit++;
  }
  modules[8][7] = ((formatBits >> (14 - bit)) & 1) as Module;
  bit++;
  modules[8][8] = ((formatBits >> (14 - bit)) & 1) as Module;
  bit++;
  modules[7][8] = ((formatBits >> (14 - bit)) & 1) as Module;
  bit++;
  for (let i = 5; i >= 0; i--) {
    modules[i][8] = ((formatBits >> (14 - bit)) & 1) as Module;
    bit++;
  }

  // Vertical strip near bottom-left and horizontal near top-right
  bit = 0;
  for (let i = 0; i <= 7; i++) {
    modules[size - 1 - i][8] = ((formatBits >> (14 - bit)) & 1) as Module;
    bit++;
  }
  // Dark module
  modules[size - 8][8] = 1;
  for (let i = 8; i <= 14; i++) {
    modules[8][size - 15 + i] = ((formatBits >> (14 - i)) & 1) as Module;
  }
}

/** Pre-computed format info bit strings with BCH error correction. */
function getFormatBits(ecLevel: number, mask: number): number {
  const FORMAT_INFO = [
    // L=0
    [0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976],
    // M=1
    [0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0],
    // Q=2
    [0x355f, 0x3068, 0x3f31, 0x3a06, 0x24b4, 0x2183, 0x2eda, 0x2bed],
    // H=3
    [0x1689, 0x13be, 0x1ce7, 0x19d0, 0x0762, 0x0255, 0x0d0c, 0x083b],
  ];
  return FORMAT_INFO[ecLevel][mask];
}

// ---------------------------------------------------------------------------
// Data encoding (byte mode)
// ---------------------------------------------------------------------------

function encodeData(text: string, version: QrVersion): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 255) {
      // Encode as UTF-8
      const encoded = new TextEncoder().encode(text.charAt(i));
      for (const b of encoded) bytes.push(b);
    } else {
      bytes.push(code);
    }
  }

  const totalDataCodewords = version.dataCodewords;

  // Mode indicator: 0100 (byte mode)
  // Character count indicator length depends on version
  const countBits = version.version <= 9 ? 8 : 16;

  const bitStream: number[] = [];

  // Mode indicator: 4 bits
  bitStream.push(0, 1, 0, 0);

  // Character count
  for (let i = countBits - 1; i >= 0; i--) {
    bitStream.push((bytes.length >> i) & 1);
  }

  // Data bits
  for (const b of bytes) {
    for (let i = 7; i >= 0; i--) {
      bitStream.push((b >> i) & 1);
    }
  }

  // Terminator (up to 4 bits)
  const totalBits = totalDataCodewords * 8;
  for (let i = 0; i < 4 && bitStream.length < totalBits; i++) {
    bitStream.push(0);
  }

  // Pad to byte boundary
  while (bitStream.length % 8 !== 0) {
    bitStream.push(0);
  }

  // Pad with alternating bytes
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bitStream.length < totalBits) {
    const pb = padBytes[padIdx % 2];
    for (let i = 7; i >= 0; i--) {
      bitStream.push((pb >> i) & 1);
    }
    padIdx++;
  }

  // Convert bit stream to byte array
  const codewords: number[] = [];
  for (let i = 0; i < bitStream.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | (bitStream[i + j] ?? 0);
    }
    codewords.push(byte);
  }

  return codewords;
}

// ---------------------------------------------------------------------------
// Data placement
// ---------------------------------------------------------------------------

function placeData(modules: Module[][], reserved: boolean[][], size: number, data: number[]): void {
  const bits: number[] = [];
  for (const byte of data) {
    for (let i = 7; i >= 0; i--) {
      bits.push((byte >> i) & 1);
    }
  }

  let bitIdx = 0;
  let upward = true;

  for (let col = size - 1; col >= 0; col -= 2) {
    // Skip timing pattern column
    if (col === 6) col = 5;

    const rows = upward
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const row of rows) {
      for (const dc of [0, -1]) {
        const c = col + dc;
        if (c < 0 || c >= size) continue;
        if (reserved[row][c]) continue;
        if (bitIdx < bits.length) {
          modules[row][c] = bits[bitIdx] as Module;
          bitIdx++;
        }
      }
    }

    upward = !upward;
  }
}

// ---------------------------------------------------------------------------
// Masking
// ---------------------------------------------------------------------------

type MaskFn = (row: number, col: number) => boolean;

const MASK_FUNCTIONS: MaskFn[] = [
  (r, c) => (r + c) % 2 === 0,
  (r, _) => r % 2 === 0,
  (_, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function applyMask(
  modules: Module[][],
  reserved: boolean[][],
  size: number,
  maskIdx: number,
): Module[][] {
  const masked: Module[][] = modules.map((row) => [...row]);
  const fn = MASK_FUNCTIONS[maskIdx];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!reserved[r][c] && fn(r, c)) {
        masked[r][c] = masked[r][c] === 1 ? 0 : 1;
      }
    }
  }
  return masked;
}

function scoreMask(modules: Module[][], size: number): number {
  let penalty = 0;

  // Rule 1: runs of same color
  for (let r = 0; r < size; r++) {
    let count = 1;
    for (let c = 1; c < size; c++) {
      if (modules[r][c] === modules[r][c - 1]) {
        count++;
      } else {
        if (count >= 5) penalty += count - 2;
        count = 1;
      }
    }
    if (count >= 5) penalty += count - 2;
  }

  for (let c = 0; c < size; c++) {
    let count = 1;
    for (let r = 1; r < size; r++) {
      if (modules[r][c] === modules[r - 1][c]) {
        count++;
      } else {
        if (count >= 5) penalty += count - 2;
        count = 1;
      }
    }
    if (count >= 5) penalty += count - 2;
  }

  // Rule 2: 2x2 blocks
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const val = modules[r][c];
      if (modules[r][c + 1] === val && modules[r + 1][c] === val && modules[r + 1][c + 1] === val) {
        penalty += 3;
      }
    }
  }

  return penalty;
}

function selectBestMask(
  modules: Module[][],
  reserved: boolean[][],
  size: number,
): { masked: Module[][]; maskIdx: number } {
  let bestScore = Infinity;
  let bestMask = 0;
  let bestModules = modules;

  for (let i = 0; i < 8; i++) {
    const masked = applyMask(modules, reserved, size, i);
    const score = scoreMask(masked, size);
    if (score < bestScore) {
      bestScore = score;
      bestMask = i;
      bestModules = masked;
    }
  }

  return { masked: bestModules, maskIdx: bestMask };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a QR code as an SVG string.
 *
 * @param data - The string to encode
 * @param size - The width/height of the SVG in pixels (default: 200)
 * @returns An SVG string that can be embedded in HTML
 */
export function generateQRCodeSVG(data: string, size: number = 200): string {
  const utf8Bytes = new TextEncoder().encode(data);
  const version = selectVersion(utf8Bytes.length);
  const qrSize = version.size;

  // Create the module matrix
  const { modules, reserved } = createMatrix(qrSize);

  // Place finder patterns
  placeFinderPattern(modules, reserved, 0, 0);
  placeFinderPattern(modules, reserved, 0, qrSize - 7);
  placeFinderPattern(modules, reserved, qrSize - 7, 0);

  // Place alignment patterns (version 2+)
  const alignCoords = ALIGNMENT_PATTERNS[version.version];
  if (alignCoords) {
    for (const r of alignCoords) {
      for (const c of alignCoords) {
        placeAlignmentPattern(modules, reserved, r, c);
      }
    }
  }

  // Place timing patterns
  placeTimingPatterns(modules, reserved, qrSize);

  // Reserve format info areas
  reserveFormatBits(reserved, qrSize);

  // Encode data
  const dataCodewords = encodeData(data, version);

  // Add error correction
  const ecCodewords = rsEncode(dataCodewords, version.ecCodewords);

  // Combine data and EC codewords
  const allCodewords = [...dataCodewords, ...ecCodewords];

  // Place data
  placeData(modules, reserved, qrSize, allCodewords);

  // Apply best mask
  const { masked, maskIdx } = selectBestMask(modules, reserved, qrSize);

  // Place format bits
  placeFormatBits(masked, qrSize, maskIdx);

  // Generate SVG
  const cellSize = size / (qrSize + 8); // 4-module quiet zone on each side
  const offset = cellSize * 4;

  const paths: string[] = [];
  for (let r = 0; r < qrSize; r++) {
    for (let c = 0; c < qrSize; c++) {
      if (masked[r][c] === 1) {
        const x = offset + c * cellSize;
        const y = offset + r * cellSize;
        paths.push(`M${x},${y}h${cellSize}v${cellSize}h${-cellSize}z`);
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`,
    `<rect width="${size}" height="${size}" fill="white"/>`,
    `<path d="${paths.join("")}" fill="black"/>`,
    `</svg>`,
  ].join("");
}

/**
 * Generate a matrix.to room link for QR code sharing.
 */
export function makeMatrixRoomQRData(roomIdOrAlias: string): string {
  return `https://matrix.to/#/${encodeURIComponent(roomIdOrAlias)}`;
}

/**
 * Generate a matrix.to user link for QR code sharing.
 */
export function makeMatrixUserQRData(userId: string): string {
  return `https://matrix.to/#/${encodeURIComponent(userId)}`;
}
