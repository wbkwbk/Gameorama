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
    assert.equal(typeof user.token, 'string')
    assert.equal(user.token.length >= 32, true)
    assert.equal(JSON.stringify(user).includes('scrypt$'), false)

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

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

test('super user can manage accounts and the last super stays', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gameorama-'))
  const file = path.join(dir, 'app.sqlite')
  const { server, database } = await startServer({ port: 0, dbPath: file })
  const { port } = server.address()
  const base = `http://127.0.0.1:${port}`
  try {
    const adminLogin = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'super' }),
    })
    const admin = await adminLogin.json()
    assert.equal(adminLogin.status, 200)
    assert.equal(admin.password_hash, undefined)
    assert.equal(JSON.stringify(admin).includes('scrypt$'), false)
    assert.equal(typeof admin.token, 'string')

    const annaLogin = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'anna', password: 'wartung' }),
    })
    const anna = await annaLogin.json()

    const forbidden = await fetch(`${base}/api/users`, { headers: authHeaders(anna.token) })
    assert.equal(forbidden.status, 403)
    const missing = await fetch(`${base}/api/users`)
    assert.equal(missing.status, 403)
    const forbiddenWrite = await fetch(`${base}/api/users`, {
      method: 'POST',
      headers: authHeaders(anna.token),
      body: JSON.stringify({
        username: 'lea',
        password: 'geheim',
        name: 'Lea Frei',
        role: 'standard',
      }),
    })
    assert.equal(forbiddenWrite.status, 403)

    const invalid = await fetch(`${base}/api/users`, {
      method: 'POST',
      headers: authHeaders(admin.token),
      body: JSON.stringify({ username: '', password: 'geheim', name: 'Lea', role: 'standard' }),
    })
    assert.equal(invalid.status, 400)
    assert.match((await invalid.json()).error, /Benutzername/)

    const createdResponse = await fetch(`${base}/api/users`, {
      method: 'POST',
      headers: authHeaders(admin.token),
      body: JSON.stringify({
        username: 'lea',
        password: 'geheim',
        name: 'Lea Frei',
        role: 'standard',
        comment: 'Schicht Abend',
      }),
    })
    const created = await createdResponse.json()
    assert.equal(createdResponse.status, 200)
    assert.equal(created.username, 'lea')
    assert.equal(created.password_hash, undefined)

    const listedResponse = await fetch(`${base}/api/users`, { headers: authHeaders(admin.token) })
    const listedText = await listedResponse.text()
    assert.equal(listedResponse.status, 200)
    assert.equal(listedText.includes('password_hash'), false)
    assert.equal(listedText.includes('scrypt$'), false)
    const listed = JSON.parse(listedText)
    assert.equal(listed.some((user) => user.username === 'lea' && user.comment === 'Schicht Abend'), true)

    const hashBefore = database.prepare('SELECT password_hash FROM users WHERE username = ?').get('lea').password_hash
    const keptResponse = await fetch(`${base}/api/users/lea`, {
      method: 'PUT',
      headers: authHeaders(admin.token),
      body: JSON.stringify({
        username: 'mia',
        name: 'Mia Frei',
        role: 'standard',
        comment: 'Schicht Morgen',
      }),
    })
    const kept = await keptResponse.json()
    assert.equal(keptResponse.status, 200)
    assert.equal(kept.username, 'mia')
    assert.equal(kept.name, 'Mia Frei')
    assert.equal(kept.comment, 'Schicht Morgen')
    assert.equal(kept.password_hash, undefined)
    const hashAfterRename = database.prepare('SELECT password_hash FROM users WHERE username = ?').get('mia').password_hash
    assert.equal(hashAfterRename, hashBefore)
    assert.equal(verifyPassword('geheim', hashAfterRename), true)

    const demoteOnlySuper = await fetch(`${base}/api/users/admin`, {
      method: 'PUT',
      headers: authHeaders(admin.token),
      body: JSON.stringify({ username: 'admin', name: 'Jonas Keller', role: 'standard', comment: '' }),
    })
    assert.equal(demoteOnlySuper.status, 400)
    assert.match((await demoteOnlySuper.json()).error, /letzte Super Benutzer/)

    const oldLogin = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'lea', password: 'geheim' }),
    })
    assert.equal(oldLogin.status, 401)
    const renamedLogin = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'mia', password: 'geheim' }),
    })
    const mia = await renamedLogin.json()
    assert.equal(renamedLogin.status, 200)
    const miaSession = database.prepare('SELECT username FROM sessions WHERE token = ?').get(mia.token)
    assert.equal(miaSession.username, 'mia')

    const changedResponse = await fetch(`${base}/api/users/mia`, {
      method: 'PUT',
      headers: authHeaders(admin.token),
      body: JSON.stringify({
        username: 'mia',
        password: 'neues-geheim',
        name: 'Mia Frei',
        role: 'super',
        comment: 'Vertretung',
      }),
    })
    assert.equal(changedResponse.status, 200)
    const hashChanged = database.prepare('SELECT password_hash FROM users WHERE username = ?').get('mia').password_hash
    assert.notEqual(hashChanged, hashBefore)
    assert.equal(hashChanged.includes('neues-geheim'), false)
    assert.equal(verifyPassword('neues-geheim', hashChanged), true)
    assert.equal(verifyPassword('geheim', hashChanged), false)
    const sessionFollowed = database.prepare('SELECT username FROM sessions WHERE token = ?').get(mia.token)
    assert.equal(sessionFollowed.username, 'mia')

    const renamedSelf = await fetch(`${base}/api/users/admin`, {
      method: 'PUT',
      headers: authHeaders(admin.token),
      body: JSON.stringify({
        username: 'chef',
        name: 'Jonas Keller',
        role: 'super',
        comment: 'Super Benutzer. Darf Geräte, Gruppen und Wartungen verwalten.',
      }),
    })
    assert.equal(renamedSelf.status, 200)
    const adminSession = database.prepare('SELECT username FROM sessions WHERE token = ?').get(admin.token)
    assert.equal(adminSession.username, 'chef')
    const stillAllowed = await fetch(`${base}/api/users`, { headers: authHeaders(admin.token) })
    assert.equal(stillAllowed.status, 200)

    const stateResponse = await fetch(`${base}/api/state`)
    const state = await stateResponse.json()
    state.groups.push({ id: 'g-lager', name: 'Lager' })
    const savedState = await fetch(`${base}/api/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    })
    assert.equal(savedState.status, 200)
    const usersAfterState = database.prepare('SELECT username FROM users ORDER BY username').all()
    assert.deepEqual(usersAfterState.map((row) => row.username), ['anna', 'chef', 'mia'])
    const sessionsAfterState = database.prepare('SELECT COUNT(*) AS count FROM sessions').get()
    assert.equal(Number(sessionsAfterState.count) >= 2, true)
    const stillThere = await fetch(`${base}/api/users`, { headers: authHeaders(admin.token) })
    assert.equal(stillThere.status, 200)

    const deleteOtherSuper = await fetch(`${base}/api/users/mia`, {
      method: 'DELETE',
      headers: authHeaders(admin.token),
    })
    assert.equal(deleteOtherSuper.status, 200)
    const miaGone = database.prepare('SELECT username FROM users WHERE username = ?').get('mia')
    assert.equal(miaGone, undefined)
    const miaTokenDead = await fetch(`${base}/api/users`, { headers: authHeaders(mia.token) })
    assert.equal(miaTokenDead.status, 403)

    const deleteLast = await fetch(`${base}/api/users/chef`, {
      method: 'DELETE',
      headers: authHeaders(admin.token),
    })
    assert.equal(deleteLast.status, 400)
    assert.match((await deleteLast.json()).error, /letzte Super Benutzer/)
    const chefRemains = database.prepare('SELECT role FROM users WHERE username = ?').get('chef')
    assert.equal(chefRemains.role, 'super')

    const demoteLast = await fetch(`${base}/api/users/chef`, {
      method: 'PUT',
      headers: authHeaders(admin.token),
      body: JSON.stringify({ username: 'chef', name: 'Jonas Keller', role: 'standard', comment: '' }),
    })
    assert.equal(demoteLast.status, 400)
    assert.match((await demoteLast.json()).error, /letzte Super Benutzer/)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    rmSync(dir, { recursive: true, force: true })
  }
})
