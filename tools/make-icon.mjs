import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const SIZE = 256
const pixels = Buffer.alloc(SIZE * SIZE * 4)

const setPixel = (x, y, r, g, b, a = 255) => {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return
  const i = (y * SIZE + x) * 4
  if (a === 255) {
    pixels[i] = r
    pixels[i + 1] = g
    pixels[i + 2] = b
    pixels[i + 3] = 255
    return
  }
  const alpha = a / 255
  const current = pixels[i + 3] / 255
  const outAlpha = alpha + current * (1 - alpha)
  if (outAlpha === 0) return
  pixels[i] = Math.round((r * alpha + pixels[i] * current * (1 - alpha)) / outAlpha)
  pixels[i + 1] = Math.round((g * alpha + pixels[i + 1] * current * (1 - alpha)) / outAlpha)
  pixels[i + 2] = Math.round((b * alpha + pixels[i + 2] * current * (1 - alpha)) / outAlpha)
  pixels[i + 3] = Math.round(outAlpha * 255)
}

/** 圆角矩形覆盖判定 */
const insideRoundRect = (x, y, left, top, right, bottom, radius) => {
  if (x < left || x > right || y < top || y > bottom) return false
  const cx = Math.min(Math.max(x, left + radius), right - radius)
  const cy = Math.min(Math.max(y, top + radius), bottom - radius)
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius
}

const fillRoundRect = (rect, radius, colorAt) => {
  const [left, top, right, bottom] = rect
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      if (insideRoundRect(x, y, left, top, right, bottom, radius)) {
        const [r, g, b] = colorAt(x, y)
        setPixel(x, y, r, g, b)
      }
    }
  }
}

const fillCircle = (cx, cy, radius, color) => {
  for (let y = Math.floor(cy - radius); y <= cy + radius; y += 1) {
    for (let x = Math.floor(cx - radius); x <= cx + radius; x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius * radius) {
        setPixel(x, y, color[0], color[1], color[2])
      }
    }
  }
}

const lerp = (from, to, t) => Math.round(from + (to - from) * t)

// 蓝底圆角方块（XP 标题栏配色）
fillRoundRect([16, 16, 239, 239], 44, (x, y) => {
  const t = (y - 16) / 223
  return [lerp(140, 31, t), lerp(196, 111, t), lerp(247, 196, t)]
})

// 白色对话气泡 + 小尾巴
fillRoundRect([52, 56, 204, 158], 26, () => [255, 255, 255])
for (let y = 150; y <= 196; y += 1) {
  const width = Math.round((196 - y) * 0.9)
  for (let x = 64; x <= 64 + width; x += 1) {
    setPixel(x, y, 255, 255, 255)
  }
}

// 气泡里三个 QQ 蓝点
for (const cx of [92, 128, 164]) {
  fillCircle(cx, 107, 11, [18, 183, 245])
}

// 右下角在线绿点
fillCircle(196, 196, 34, [255, 255, 255])
fillCircle(196, 196, 27, [62, 193, 62])

// ---- PNG 编码 ----
const crcTable = new Int32Array(256)
for (let n = 0; n < 256; n += 1) {
  let c = n
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  crcTable[n] = c
}

const crc32 = (buffer) => {
  let c = 0xffffffff
  for (const byte of buffer) {
    c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

const chunk = (type, data) => {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeBuffer = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])))
  return Buffer.concat([length, typeBuffer, data, crc])
}

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
for (let y = 0; y < SIZE; y += 1) {
  raw[y * (SIZE * 4 + 1)] = 0
  pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4)
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8
ihdr[9] = 6

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

writeFileSync('desktop/app/icon.png', png)

// ---- ICO 封装（PNG 负载，Vista+ 与 Electron 均支持）----
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(1, 4)

const entry = Buffer.alloc(16)
entry[0] = 0 // 0 表示 256
entry[1] = 0
entry[2] = 0
entry[3] = 0
entry.writeUInt16LE(1, 4)
entry.writeUInt16LE(32, 6)
entry.writeUInt32LE(png.length, 8)
entry.writeUInt32LE(22, 12)

writeFileSync('desktop/app/icon.ico', Buffer.concat([header, entry, png]))
console.log(`icon.png ${png.length}B, icon.ico ${22 + png.length}B`)
