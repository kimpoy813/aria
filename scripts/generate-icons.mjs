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

// Pre-sample cubic Bezier flag: M 35.5 16 c 6 0 11 3.8 11 10
const BEZIER_SAMPLES = (() => {
  const p0 = [35.5, 16.0];
  const p1 = [41.5, 16.0];
  const p2 = [46.5, 19.8];
  const p3 = [46.5, 26.0];
  const pts = [];
  const N = 96;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const mt = 1 - t;
    const x =
      mt * mt * mt * p0[0] +
      3 * mt * mt * t * p1[0] +
      3 * mt * t * t * p2[0] +
      t * t * t * p3[0];
    const y =
      mt * mt * mt * p0[1] +
      3 * mt * mt * t * p1[1] +
      3 * mt * t * t * p2[1] +
      t * t * t * p3[1];
    pts.push([x, y]);
  }
  return pts;
})();

function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2)) : 0;
  const dx = px - (ax + t * vx);
  const dy = py - (ay + t * vy);
  return Math.hypot(dx, dy);
}

function roundedRectSDF(px, py, cx, cy, halfW, halfH, radius) {
  const qx = Math.abs(px - cx) - (halfW - radius);
  const qy = Math.abs(py - cy) - (halfH - radius);
  const outDist = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inDist = Math.min(Math.max(qx, qy), 0);
  return outDist + inDist - radius;
}

function glyphSDF(x, y) {
  const halfStroke = 5.6 / 2;

  // 1. Bowl of 'a' / notehead: circle at (26.5, 38), r = 9
  const dCircle = Math.abs(Math.hypot(x - 26.5, y - 38.0) - 9.0) - halfStroke;

  // 2. Stem: (35.5, 16) -> (35.5, 47)
  const dStem = distToSegment(x, y, 35.5, 16.0, 35.5, 47.0) - halfStroke;

  // 3. Flag: cubic Bezier sampled polyline
  let minBez = Infinity;
  for (let i = 0; i < BEZIER_SAMPLES.length - 1; i++) {
    const a = BEZIER_SAMPLES[i];
    const b = BEZIER_SAMPLES[i + 1];
    const d = distToSegment(x, y, a[0], a[1], b[0], b[1]);
    if (d < minBez) minBez = d;
  }
  const dFlag = minBez - halfStroke;

  return Math.min(dCircle, dStem, dFlag);
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function renderIcon(size, { maskable = false, opaqueSquare = false } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  // Top (#16bd88 -> 22, 189, 136) to Bottom (#0d9468 -> 13, 148, 104)
  const topRGB = [0x16, 0xbd, 0x88];
  const botRGB = [0x0d, 0x94, 0x68];

  // In 64-unit space, pixel size in SVG units:
  // For maskable icons, scale glyph to 76% inside the center safe zone.
  const glyphScale = maskable ? 0.76 : 1.0;
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
        const dBg = roundedRectSDF(ux, uy, 32, 32, 32, 32, 16);
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
