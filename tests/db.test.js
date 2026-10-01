import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { isState, openDatabase, readState, writeState } from '../server/db.js'
import { startServer } from '../server/index.js'
import { hashPassword, verifyPassword } from '../server/passwords.js'
import { markPerformed } from '../src/model.js'

test('a new database stores the seed in SQLite', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gameorama-'))
  const file = path.join(dir, 'app.sqlite')
  try {
    const database = openDatabase(file)
    const state = readState(database)
    assert.equal(isState(state), true)
    assert.equal(state.groups.length, 3)
    assert.ok(state.devices.some((device) => device.name.includes('Flipper')))
    assert.equal(state.maintenances[0].intervalWeeks > 0, true)
    database.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('maintenance changes survive a round trip through SQLite', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gameorama-'))
  const file = path.join(dir, 'app.sqlite')
  try {
    const database = openDatabase(file)
    const before = readState(database)
    const user = { name: 'Anna Berger', role: 'standard' }
    const result = markPerformed(before, 'm-klima', user, '2026-10-01')
    writeState(database, result.db)
    const after = readState(database)
    assert.equal(after.nextDocNumber, before.nextDocNumber + 1)
    assert.equal(after.documentation[0].userName, 'Anna Berger')
    assert.equal(after.documentation[0].number, 2)
    const klima = after.maintenances.find((item) => item.id === 'm-klima')
    assert.equal(klima.dueDate, '2027-01-21')
    database.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the HTTP API reads and writes the database', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gameorama-'))
  const file = path.join(dir, 'app.sqlite')
  const { server } = await startServer({ port: 0, dbPath: file })
  const { port } = server.address()
  try {
    const first = await fetch(`http://127.0.0.1:${port}/api/state`)
    const state = await first.json()
    state.groups.push({ id: 'g-test', name: 'Lager' })
    const saved = await fetch(`http://127.0.0.1:${port}/api/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    })
    assert.equal(saved.status, 200)
    const again = await fetch(`http://127.0.0.1:${port}/api/state`)
    const next = await again.json()
    assert.equal(next.groups.at(-1).name, 'Lager')

    const rejected = await fetch(`http://127.0.0.1:${port}/api/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{"groups":[]}',
    })
    assert.equal(rejected.status, 400)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    rmSync(dir, { recursive: true, force: true })
  }
})

test('users live in SQLite and passwords are scrypt hashes', async () => {
  const stored = hashPassword('wartung')
  assert.equal(stored.includes('wartung'), false)
  assert.equal(verifyPassword('wartung', stored), true)
  assert.equal(verifyPassword('falsch', stored), false)

  const dir = mkdtempSync(path.join(tmpdir(), 'gameorama-'))
  const file = path.join(dir, 'app.sqlite')
  const { server, database } = await startServer({ port: 0, dbPath: file })
  const { port } = server.address()
  try {
    const ok = await fetch(`http://127.0.0.1:${port}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'anna', password: 'wartung' }),
    })
    const user = await ok.json()
    assert.equal(ok.status, 200)
    assert.equal(user.role, 'standard')
    assert.match(user.comment, /Standard Benutzer/)
    assert.equal(user.password_hash, undefined)

    const bad = await fetch(`http://127.0.0.1:${port}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'anna', password: 'super' }),
    })
    assert.equal(bad.status, 401)

    const row = database.prepare('SELECT password_hash FROM users WHERE username = ?').get('anna')
    assert.match(row.password_hash, /^scrypt\$/)
    const state = await fetch(`http://127.0.0.1:${port}/api/state`).then((response) => response.text())
    assert.equal(state.includes('password_hash'), false)
    assert.equal(state.includes('scrypt$'), false)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    rmSync(dir, { recursive: true, force: true })
  }
})
