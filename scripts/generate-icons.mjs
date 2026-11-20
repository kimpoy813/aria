/**
 * Generates crisp Play Store & PWA PNG icons directly from Aria's analytic
 * monogram geometry (zero native binary dependencies; uses Node's built-in zlib).
 *
 * Outputs:
 *   - public/icons/icon-192.png          (192x192, purpose: "any")
 *   - public/icons/icon-512.png          (512x512, purpose: "any" + Play Console 512x512 icon)
 *   - public/icons/icon-maskable-512.png (512x512, purpose: "maskable", Android safe-zone inset)
 *   - public/icons/apple-touch-icon.png  (180x180, iOS home screen)
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'public', 'icons');

/* ----------------------------------------------------------- PNG encoder */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ----------------------------------------------------- SDF logo geometry */

// The beamed pair from src/components/Logo.tsx, expressed as signed distances so
// the PNG icons and the vector mark stay the same drawing.
const HEAD_A = { cx: 17.6, cy: 46.6, rx: 7.4, ry: 5.6, deg: -14 };
const HEAD_B = { cx: 42.4, cy: 39.8, rx: 7.4, ry: 5.6, deg: -14 };
const STEM_A = { x: 25, y0: 20.4, y1: 45.4, width: 5 };
const STEM_B = { x: 49.8, y0: 13.6, y1: 38.6, width: 5 };

// Beam: M 25 19.2 c 8 -3.3 16.6 -4.9 24.8 -6.1
const BEAM_SAMPLES = (() => {
  const p0 = [25.0, 19.2];
  const p1 = [33.0, 15.9];
  const p2 = [41.6, 14.3];
  const p3 = [49.8, 13.1];
  const pts = [];
  const N = 128;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const mt = 1 - t;
    pts.push([
      mt * mt * mt * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t * t * t * p3[0],
      mt * mt * mt * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return pts;
})();
const BEAM_HALF = 6.6 / 2;

function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2)) : 0;
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

function roundedRectSDF(px, py, cx, cy, halfW, halfH, radius) {
  const qx = Math.abs(px - cx) - (halfW - radius);
  const qy = Math.abs(py - cy) - (halfH - radius);
  const outDist = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inDist = Math.min(Math.max(qx, qy), 0);
  return outDist + inDist - radius;
}

/** Approximate ellipse distance; good enough at icon resolutions. */
function ellipseSDF(px, py, head) {
  const rad = (head.deg * Math.PI) / 180;
  const cos = Math.cos(-rad);
  const sin = Math.sin(-rad);
  const dx = px - head.cx;
  const dy = py - head.cy;
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;
  const k = Math.hypot(lx / head.rx, ly / head.ry);
  return (k - 1) * Math.min(head.rx, head.ry);
}

function glyphSDF(x, y) {
  const dA = ellipseSDF(x, y, HEAD_A);
  const dB = ellipseSDF(x, y, HEAD_B);

  const sA =
    distToSegment(x, y, STEM_A.x, STEM_A.y0, STEM_A.x, STEM_A.y1) - STEM_A.width / 2;
  const sB =
    distToSegment(x, y, STEM_B.x, STEM_B.y0, STEM_B.x, STEM_B.y1) - STEM_B.width / 2;

  let dBeam = Infinity;
  for (let i = 0; i < BEAM_SAMPLES.length - 1; i++) {
    const a = BEAM_SAMPLES[i];
    const b = BEAM_SAMPLES[i + 1];
    const d = distToSegment(x, y, a[0], a[1], b[0], b[1]);
    if (d < dBeam) dBeam = d;
  }
  dBeam -= BEAM_HALF;

  return Math.min(dA, dB, sA, sB, dBeam);
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function renderIcon(size, { maskable = false, opaqueSquare = false } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  // Top (#16bd88 -> 22, 189, 136) to Bottom (#0d9468 -> 13, 148, 104)
  const topRGB = [0x13, 0xa3, 0x75];
  const botRGB = [0x0a, 0x6a, 0x4c];

  // In 64-unit space, pixel size in SVG units:
  // For maskable icons, scale glyph to 76% inside the center safe zone.
  // Matches the 0.88 inset in Logo.tsx; maskable needs the extra safe zone.
  const glyphScale = maskable ? 0.66 : 0.88;
  const unitsPerPx = 64 / (size * glyphScale);
  const aaWidth = (64 / size) * 0.85;

  for (let py = 0; py < size; py++) {
    const vGrad = (py + 0.5) / size;
    const bgR = topRGB[0] + (botRGB[0] - topRGB[0]) * vGrad;
    const bgG = topRGB[1] + (botRGB[1] - topRGB[1]) * vGrad;
    const bgB = topRGB[2] + (botRGB[2] - topRGB[2]) * vGrad;

    for (let px = 0; px < size; px++) {
      // Coordinate in 64x64 space for outer container
      const ux = ((px + 0.5) / size) * 64;
      const uy = ((py + 0.5) / size) * 64;

      let bgAlpha = 1.0;
      if (!maskable && !opaqueSquare) {
        const dBg = roundedRectSDF(ux, uy, 32, 32, 32, 32, 17);
        bgAlpha = clamp01(0.5 - dBg / aaWidth);
      }

      const idx = (py * size + px) * 4;
      if (bgAlpha <= 0) {
        buf[idx] = 0;
        buf[idx + 1] = 0;
        buf[idx + 2] = 0;
        buf[idx + 3] = 0;
        continue;
      }

      // Coordinate in 64x64 glyph space (centered at 32, 32)
      const gx = (ux - 32) / glyphScale + 32;
      const gy = (uy - 32) / glyphScale + 32;
      const dGlyph = glyphSDF(gx, gy);
      const fgAlpha = clamp01(0.5 - dGlyph / (unitsPerPx * 0.85));

      const r = bgR * (1 - fgAlpha) + 255 * fgAlpha;
      const g = bgG * (1 - fgAlpha) + 255 * fgAlpha;
      const b = bgB * (1 - fgAlpha) + 255 * fgAlpha;

      buf[idx] = Math.round(r);
      buf[idx + 1] = Math.round(g);
      buf[idx + 2] = Math.round(b);
      buf[idx + 3] = Math.round(bgAlpha * 255);
    }
  }

  return encodePNG(size, size, buf);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const files = [
  ['icon-192.png', renderIcon(192)],
  ['icon-512.png', renderIcon(512)],
  ['icon-maskable-512.png', renderIcon(512, { maskable: true })],
  ['playstore-icon-512.png', renderIcon(512, { opaqueSquare: true })],
  ['apple-touch-icon.png', renderIcon(180, { opaqueSquare: true })],
];

for (const [name, png] of files) {
  const out = path.join(OUT_DIR, name);
  fs.writeFileSync(out, png);
  console.log(`wrote ${out} (${png.length} bytes)`);
}
