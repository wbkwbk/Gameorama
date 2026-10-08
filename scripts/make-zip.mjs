import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateRawSync } from 'node:zlib'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const includeRoots = [
  'install.cmd',
  'start.cmd',
  'neue-datenbank.cmd',
  'package.json',
  'package-lock.json',
  'README.md',
  '.gitignore',
  '.gitattributes',
  'index.html',
  'vite.config.js',
  'server',
  'src',
  'scripts',
  'tests',
]

const output = path.resolve(process.argv[2] || path.join(root, 'Gameorama-Wartungstool.zip'))

function isExcluded(rel) {
  const parts = rel.split('/')
  const base = parts[parts.length - 1]
  if (parts.includes('.git') || parts.includes('node_modules') || parts.includes('dist')) return true
  if (parts.includes('logs') || base.endsWith('.log')) return true
  if (base === '.DS_Store' || base === 'Thumbs.db' || base === 'desktop.ini') return true
  if (base.endsWith('.swp') || base.endsWith('~') || base.startsWith('.#')) return true
  if (parts[0] === '.idea' || parts[0] === '.vscode') return true
  if (rel === 'data/uploads' || rel.startsWith('data/uploads/')) return true
  if (/^data\/[^/]+\.sqlite(?:-.*)?$/.test(rel)) return true
  return false
}

function collect(relPath, files) {
  const abs = path.join(root, relPath)
  if (!existsSync(abs)) return
  if (path.resolve(abs) === output) return
  const stat = lstatSync(abs)
  if (stat.isSymbolicLink() || isExcluded(relPath)) return
  if (stat.isDirectory()) {
    for (const name of readdirSync(abs).sort()) collect(`${relPath}/${name}`, files)
    return
  }
  if (!stat.isFile()) return
  files.push({
    name: relPath,
    data: readFileSync(abs),
    mtime: stat.mtime,
  })
}

function u16(value) {
  const buffer = Buffer.alloc(2)
  buffer.writeUInt16LE(value & 0xffff)
  return buffer
}

function u32(value) {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32LE(value >>> 0)
  return buffer
}

function dosDateTime(date) {
  const year = Math.min(2107, Math.max(1980, date.getFullYear()))
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

function zipEntries(entries) {
  const locals = []
  const centrals = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const data = entry.data ?? Buffer.alloc(0)
    const directory = entry.name.endsWith('/')
    let method = 0
    let stored = data
    if (!directory && data.length > 0) {
      const compressed = deflateRawSync(data)
      if (compressed.length < data.length) {
        method = 8
        stored = compressed
      }
    }
    const checksum = directory ? 0 : crc32(data) >>> 0
    const stamp = dosDateTime(entry.mtime ?? new Date())
    const flags = 0x0800
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(flags),
      u16(method),
      u16(stamp.time),
      u16(stamp.date),
      u32(checksum),
      u32(stored.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
      stored,
    ])
    locals.push(local)
    centrals.push(
      Buffer.concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(flags),
        u16(method),
        u16(stamp.time),
        u16(stamp.date),
        u32(checksum),
        u32(stored.length),
        u32(data.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(directory ? 0x10 : 0x20),
        u32(offset),
        name,
      ]),
    )
    offset += local.length
  }

  const central = Buffer.concat(centrals)
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ])
  return Buffer.concat([...locals, central, end])
}

const files = []
for (const name of includeRoots) collect(name, files)
files.sort((a, b) => a.name.localeCompare(b.name))

const required = [
  'install.cmd',
  'start.cmd',
  'neue-datenbank.cmd',
  'scripts/neue-datenbank.mjs',
  'package.json',
  'README.md',
  'index.html',
  'vite.config.js',
  'server/index.js',
  'src/main.jsx',
]
const missing = required.filter((name) => !files.some((file) => file.name === name))
if (missing.length > 0) {
  console.error(`Diese Dateien fehlen im Paket: ${missing.join(', ')}`)
  process.exit(1)
}

const directories = new Set()
for (const file of files) {
  const parts = file.name.split('/')
  parts.pop()
  let current = ''
  for (const part of parts) {
    current = current ? `${current}/${part}` : part
    directories.add(current)
  }
}

const entries = []
for (const directory of [...directories].sort()) {
  const abs = path.join(root, directory)
  entries.push({
    name: `${directory}/`,
    data: Buffer.alloc(0),
    mtime: existsSync(abs) ? lstatSync(abs).mtime : new Date(),
  })
}
entries.push(...files)

const archive = zipEntries(entries)
mkdirSync(path.dirname(output), { recursive: true })
writeFileSync(output, archive)

console.log(`${output}`)
console.log(`${files.length} Dateien, ${archive.length} Bytes`)
for (const file of files) console.log(file.name)
