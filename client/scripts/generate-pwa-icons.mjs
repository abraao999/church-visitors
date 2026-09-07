import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size, paint) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = paint(x, y, size);
      const i = row + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function paintIcon(x, y, size, { padded = false } = {}) {
  const inset = padded ? size * 0.12 : 0;
  const inner = size - inset * 2;
  const nx = (x - inset) / inner;
  const ny = (y - inset) / inner;
  if (padded && (nx < 0 || ny < 0 || nx > 1 || ny > 1)) return [248, 246, 242, 255];

  const gold = [232, 177, 61, 255];
  const white = [255, 255, 255, 255];
  const inCircle = (nx - 0.5) ** 2 + (ny - 0.5) ** 2 <= 0.46 ** 2;
  if (!inCircle && padded) return [248, 246, 242, 255];

  const vertical = nx > 0.42 && nx < 0.58 && ny > 0.18 && ny < 0.82;
  const horizontal = nx > 0.28 && nx < 0.72 && ny > 0.28 && ny < 0.44;
  return vertical || horizontal ? white : gold;
}

const files = [
  ['icons/icon-192.png', png(192, (x, y, size) => paintIcon(x, y, size))],
  ['icons/icon-512.png', png(512, (x, y, size) => paintIcon(x, y, size))],
  ['icons/icon-maskable-512.png', png(512, (x, y, size) => paintIcon(x, y, size, { padded: true }))],
  ['icons/apple-touch-icon.png', png(180, (x, y, size) => paintIcon(x, y, size))],
  ['icon-192.png', png(192, (x, y, size) => paintIcon(x, y, size))],
  ['icon-512.png', png(512, (x, y, size) => paintIcon(x, y, size))],
  ['apple-touch-icon.png', png(180, (x, y, size) => paintIcon(x, y, size))],
  ['favicon-32x32.png', png(32, (x, y, size) => paintIcon(x, y, size))],
];

mkdirSync(join(root, 'icons'), { recursive: true });
for (const [name, data] of files) {
  writeFileSync(join(root, name), data);
}
