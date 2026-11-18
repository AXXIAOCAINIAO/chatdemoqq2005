import { createWriteStream } from 'node:fs'
import { mkdir, rename, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const [url, output] = process.argv.slice(2)
if (!url || !output) {
  console.error('usage: node download.mjs <url> <output>')
  process.exit(2)
}

await mkdir(dirname(output), { recursive: true })
const tmp = `${output}.part`

const response = await fetch(url, { redirect: 'follow' })
if (!response.ok || !response.body) {
  console.error(`HTTP ${response.status} for ${url}`)
  process.exit(1)
}

const total = Number(response.headers.get('content-length') ?? 0)
let received = 0
let lastReport = 0

const source = Readable.fromWeb(response.body)
source.on('data', (chunk) => {
  received += chunk.length
  const now = Date.now()
  if (now - lastReport > 3000) {
    lastReport = now
    const pct = total ? ((received / total) * 100).toFixed(1) : '?'
    process.stdout.write(`  ${(received / 1048576).toFixed(1)}MB / ${(total / 1048576).toFixed(1)}MB (${pct}%)\n`)
  }
})

await pipeline(source, createWriteStream(tmp))
await rename(tmp, output)
const info = await stat(output)
console.log(`saved ${output} (${(info.size / 1048576).toFixed(1)}MB)`)
