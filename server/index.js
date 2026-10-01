import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isState, loginUser, openDatabase, readState, writeState } from './db.js'

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

export function startServer({ port = 3001, dbPath }) {
  const database = openDatabase(dbPath)
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1')
      if (request.method === 'POST' && url.pathname === '/api/login') {
        const parsed = JSON.parse(await readBody(request))
        const user = loginUser(database, parsed.username, parsed.password)
        if (!user) {
          send(response, 401, { error: 'Benutzername oder Passwort ist falsch.' })
          return
        }
        send(response, 200, user)
        return
      }
      if (request.method === 'GET' && url.pathname === '/api/state') {
        send(response, 200, readState(database))
        return
      }
      if (request.method === 'PUT' && url.pathname === '/api/state') {
        const parsed = JSON.parse(await readBody(request))
        if (!isState(parsed)) {
          send(response, 400, { error: 'Ungültige Daten' })
          return
        }
        writeState(database, parsed)
        send(response, 200, readState(database))
        return
      }
      send(response, 404, { error: 'Nicht gefunden' })
    } catch {
      send(response, 400, { error: 'Ungültige Daten' })
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
