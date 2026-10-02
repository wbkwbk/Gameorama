import { createReadStream, existsSync, statSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MAX_UPLOAD_BYTES,
  contentDisposition,
  createSession,
  deleteDocument,
  deleteSession,
  deleteUser,
  isState,
  listDocuments,
  listUsers,
  loginUser,
  openDatabase,
  readDocumentFile,
  deleteMaintenanceRecord,
  readState,
  saveDocument,
  saveUser,
  sessionUser,
  updateMaintenance,
  updateUser,
  writeState,
} from './db.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(root, 'dist')

const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
}

function send(response, status, body) {
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  })
  response.end(payload)
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > 1_000_000) {
        reject(new Error('Zu grosse Anfrage'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

function tokenFrom(request) {
  const header = request.headers.authorization || ''
  const match = /^Bearer\s+(\S+)$/.exec(header)
  return match ? match[1] : ''
}

async function readJson(request) {
  const text = await readBody(request)
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Ungültige Daten')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Ungültige Daten')
  }
  return parsed
}

function decodeUsername(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function requireSuper(database, request) {
  const user = sessionUser(database, tokenFrom(request))
  if (!user || user.role !== 'super') return null
  return user
}

function readUpload(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let failed = false
    request.on('data', (chunk) => {
      if (failed) return
      size += chunk.length
      if (size > MAX_UPLOAD_BYTES) {
        failed = true
        reject(new Error('Die Datei ist zu gross. Maximal 15 MB.'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      if (!failed) resolve(Buffer.concat(chunks))
    })
    request.on('error', (error) => {
      if (!failed) reject(error)
    })
  })
}

function distFile(urlPath) {
  let decoded
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    return null
  }
  if (decoded.includes('\0')) return null
  const relative = decoded.replace(/^[/\\]+/, '')
  const file = path.resolve(distDir, relative)
  const fromDist = path.relative(distDir, file)
  if (fromDist.startsWith('..') || path.isAbsolute(fromDist)) return null
  return file
}

function pipeFile(response, filePath, method) {
  const stat = statSync(filePath)
  const ext = path.extname(filePath).toLowerCase()
  response.writeHead(200, {
    'Content-Type': STATIC_TYPES[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  })
  if (method === 'HEAD') {
    response.end()
    return
  }
  createReadStream(filePath).pipe(response)
}

function serveFrontend(response, pathname, method) {
  const file = distFile(pathname)
  if (file && existsSync(file) && statSync(file).isFile()) {
    pipeFile(response, file, method)
    return true
  }
  const index = path.join(distDir, 'index.html')
  if (!existsSync(index)) return false
  pipeFile(response, index, method)
  return true
}

function streamDocument(response, doc) {
  if (!existsSync(doc.path)) {
    send(response, 404, { error: 'Dokument nicht gefunden' })
    return
  }
  const stat = statSync(doc.path)
  const type = doc.mimeType === 'text/plain' ? 'text/plain; charset=utf-8' : doc.mimeType
  response.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Content-Disposition': contentDisposition(doc.originalName, doc.mimeType),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  })
  createReadStream(doc.path).pipe(response)
}

async function handleDocuments(request, response, database, url) {
  const { pathname } = url

  if (pathname === '/api/documents' && request.method === 'GET') {
    const user = sessionUser(database, tokenFrom(request))
    if (!user) {
      send(response, 401, { error: 'Nicht angemeldet' })
      return
    }
    send(response, 200, listDocuments(database, url.searchParams.get('owner') || ''))
    return
  }

  if (pathname === '/api/documents' && request.method === 'POST') {
    const user = requireSuper(database, request)
    if (!user) {
      request.resume()
      send(response, 403, { error: 'Keine Berechtigung' })
      return
    }
    const saved = saveDocument(database, {
      ownerId: url.searchParams.get('owner') || '',
      filename: url.searchParams.get('filename') || '',
      bytes: await readUpload(request),
    })
    send(response, 200, saved)
    return
  }

  if (!pathname.startsWith('/api/documents/')) {
    send(response, 404, { error: 'Nicht gefunden' })
    return
  }

  const id = decodeURIComponent(pathname.slice('/api/documents/'.length))
  if (!id || id.includes('/')) {
    send(response, 404, { error: 'Nicht gefunden' })
    return
  }

  if (request.method === 'GET') {
    const queryToken = url.searchParams.get('token') || ''
    const user = sessionUser(database, tokenFrom(request) || queryToken)
    if (!user) {
      send(response, 401, { error: 'Nicht angemeldet' })
      return
    }
    const doc = readDocumentFile(database, id)
    if (!doc) {
      send(response, 404, { error: 'Dokument nicht gefunden' })
      return
    }
    streamDocument(response, doc)
    return
  }

  if (request.method === 'DELETE') {
    if (!requireSuper(database, request)) {
      send(response, 403, { error: 'Keine Berechtigung' })
      return
    }
    deleteDocument(database, id)
    send(response, 200, { ok: true })
    return
  }

  send(response, 404, { error: 'Nicht gefunden' })
}

async function handleUsers(request, response, database, pathname) {
  if (request.method === 'GET' && pathname === '/api/users') {
    send(response, 200, listUsers(database))
    return
  }

  if (request.method === 'POST' && pathname === '/api/users') {
    const parsed = await readJson(request)
    const username = String(parsed.username ?? '').trim()
    const existing = database.prepare('SELECT username FROM users WHERE username = ?').get(username)
    if (username && existing) throw new Error('Dieser Benutzername ist bereits vergeben')
    const created = saveUser(database, {
      username: parsed.username,
      password: parsed.password,
      name: parsed.name,
      role: parsed.role,
      comment: parsed.comment ?? '',
    })
    send(response, 200, created)
    return
  }

  if (!pathname.startsWith('/api/users/')) {
    send(response, 404, { error: 'Nicht gefunden' })
    return
  }

  const username = decodeUsername(pathname.slice('/api/users/'.length))
  if (!username || username.includes('/')) {
    send(response, 404, { error: 'Nicht gefunden' })
    return
  }

  if (request.method === 'PUT') {
    const parsed = await readJson(request)
    send(response, 200, updateUser(database, username, parsed))
    return
  }

  if (request.method === 'DELETE') {
    deleteUser(database, username)
    send(response, 200, { ok: true })
    return
  }

  send(response, 404, { error: 'Nicht gefunden' })
}

export function startServer({ port = 3001, dbPath }) {
  const database = openDatabase(dbPath)
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1')
      const { pathname } = url

      if (request.method === 'POST' && pathname === '/api/login') {
        const parsed = await readJson(request)
        const user = loginUser(database, parsed.username, parsed.password)
        if (!user) {
          send(response, 401, { error: 'Benutzername oder Passwort ist falsch.' })
          return
        }
        const token = createSession(database, user.username)
        send(response, 200, { ...user, token })
        return
      }

      if (request.method === 'POST' && pathname === '/api/logout') {
        deleteSession(database, tokenFrom(request))
        send(response, 200, { ok: true })
        return
      }

      if (pathname === '/api/documents' || pathname.startsWith('/api/documents/')) {
        await handleDocuments(request, response, database, url)
        return
      }

      if (pathname.startsWith('/api/maintenances/')) {
        const id = decodeUsername(pathname.slice('/api/maintenances/'.length))
        if (!id || id.includes('/')) {
          send(response, 404, { error: 'Nicht gefunden' })
          return
        }
        if (request.method !== 'PUT' && request.method !== 'DELETE') {
          send(response, 404, { error: 'Nicht gefunden' })
          return
        }
        if (!requireSuper(database, request)) {
          send(response, 403, { error: 'Keine Berechtigung' })
          return
        }
        if (request.method === 'DELETE') {
          send(response, 200, deleteMaintenanceRecord(database, id))
          return
        }
        const parsed = await readJson(request)
        send(response, 200, updateMaintenance(database, id, parsed))
        return
      }

      if (pathname === '/api/users' || pathname.startsWith('/api/users/')) {
        if (!requireSuper(database, request)) {
          send(response, 403, { error: 'Keine Berechtigung' })
          return
        }
        await handleUsers(request, response, database, pathname)
        return
      }

      if (request.method === 'GET' && pathname === '/api/state') {
        send(response, 200, readState(database))
        return
      }
      if (request.method === 'PUT' && pathname === '/api/state') {
        const parsed = await readJson(request)
        if (!isState(parsed)) {
          send(response, 400, { error: 'Ungültige Daten' })
          return
        }
        writeState(database, parsed, sessionUser(database, tokenFrom(request)))
        send(response, 200, readState(database))
        return
      }
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        send(response, 404, { error: 'Nicht gefunden' })
        return
      }
      if (
        (request.method === 'GET' || request.method === 'HEAD') &&
        serveFrontend(response, pathname, request.method)
      ) {
        return
      }
      send(response, 404, { error: 'Nicht gefunden' })
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Ungültige Daten'
      const status =
        message === 'Benutzer nicht gefunden' ||
        message === 'Dokument nicht gefunden' ||
        message === 'Diese Wartung gibt es nicht mehr.'
          ? 404
          : message === 'Nicht angemeldet'
            ? 401
            : message === 'Keine Berechtigung'
              ? 403
              : 400
      send(response, status, { error: message })
    }
  })

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({ server, database }))
  })
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
  const port = Number(process.env.PORT || 3001)
  const dbPath = process.env.GAMEORAMA_DB || path.join(root, 'data', 'gameorama.sqlite')
  startServer({ port, dbPath }).then(() => {
    console.log(`SQLite bereit: ${dbPath}`)
    console.log(`API bereit: http://127.0.0.1:${port}`)
    if (process.env.npm_lifecycle_event === 'start') {
      if (existsSync(path.join(distDir, 'index.html'))) {
        console.log(`Oberfläche bereit: http://127.0.0.1:${port}`)
      } else {
        console.log('Kein Produktionsbuild in dist/. Zuerst npm run build ausführen.')
      }
    }
  })
}
