import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createSession,
  deleteSession,
  deleteUser,
  isState,
  listUsers,
  loginUser,
  openDatabase,
  readState,
  saveUser,
  sessionUser,
  updateUser,
  writeState,
} from './db.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

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
      send(response, 404, { error: 'Nicht gefunden' })
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Ungültige Daten'
      const status = message === 'Benutzer nicht gefunden' ? 404 : message === 'Keine Berechtigung' ? 403 : 400
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
  })
}
