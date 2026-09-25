#!/usr/bin/env node
// Verifies generated images: file count, pixel dimensions, and file size. Reads PNG, JPEG,
// and WebP headers directly, so it needs no dependencies and works on any OS.
// Usage: node verify-images.mjs <dir> [--expect N] [--width W --height H] [--scale S] [--max-kb K]
//   --scale multiplies the expected width and height (2 for images rendered at 2x).
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    expect: { type: 'string' },
    width: { type: 'string' },
    height: { type: 'string' },
    scale: { type: 'string', default: '1' },
    'max-kb': { type: 'string' },
  },
});

if (positionals.length !== 1) {
  console.error('Usage: node verify-images.mjs <dir> [--expect N] [--width W --height H] [--scale S] [--max-kb K]');
  process.exit(1);
}

const jpegSize = (buf) => {
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) return null;
    const marker = buf[offset + 1];
    // SOF0-SOF15 carry the frame size, except DHT (C4), JPG (C8), and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { width: buf.readUInt16BE(offset + 7), height: buf.readUInt16BE(offset + 5) };
    }
    offset += 2 + buf.readUInt16BE(offset + 2);
  }
  return null;
};

const webpSize = (buf) => {
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  if (chunk === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  return null;
};

const dimensions = (buf) => {
  try {
    return readHeader(buf);
  } catch {
    return null; // truncated or corrupt file
  }
};

const readHeader = (buf) => {
  if (buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) return jpegSize(buf);
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return webpSize(buf);
  return null;
};

const dir = positionals[0];
if (!fs.existsSync(dir)) {
  console.error(`Error: ${dir} does not exist.`);
  process.exit(1);
}

const files = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort();
const scale = Number(values.scale);
const want = values.width && values.height ? { width: Number(values.width) * scale, height: Number(values.height) * scale } : null;
const maxKb = values['max-kb'] ? Number(values['max-kb']) : null;
const problems = [];
const sizes = [];

for (const file of files) {
  const full = path.join(dir, file);
  const buf = fs.readFileSync(full);
  const kb = Math.round(buf.length / 1024);
  const dim = dimensions(buf);
  sizes.push({ file, kb, ...dim });
  if (!dim) problems.push(`${file}: unreadable image header`);
  else if (want && (dim.width !== want.width || dim.height !== want.height)) problems.push(`${file}: ${dim.width}x${dim.height}, expected ${want.width}x${want.height}`);
  if (buf.length < 1024) problems.push(`${file}: only ${buf.length} bytes, likely blank or failed render`);
  if (maxKb && kb > maxKb) problems.push(`${file}: ${kb} KB, over the ${maxKb} KB budget`);
}

if (values.expect && files.length !== Number(values.expect)) problems.unshift(`found ${files.length} images, expected ${values.expect}`);

const largest = [...sizes].sort((a, b) => b.kb - a.kb).slice(0, 3).map((s) => `${s.file} ${s.kb} KB`);
console.log(`images: ${files.length} in ${dir}`);
if (want) console.log(`expected size: ${want.width}x${want.height}`);
console.log(`largest: ${largest.join(', ') || 'none'}`);
console.log(problems.length ? `problems (${problems.length}):\n${problems.slice(0, 20).map((p) => `  ${p}`).join('\n')}` : 'problems: none');
process.exit(problems.length ? 1 : 0);
