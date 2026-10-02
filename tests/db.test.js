import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import {
  describeUpload,
  isState,
  listDocuments,
  openDatabase,
  readState,
  resolveUploadPath,
  saveDocument,
  uploadsDirectory,
  writeState,
} from '../server/db.js'
import { startServer } from '../server/index.js'
import { hashPassword, verifyPassword } from '../server/passwords.js'
import { addWeeks, markPerformed, openMaintenances } from '../src/model.js'

test('a new database stores the seed in SQLite', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gameorama-'))
  const file = path.join(dir, 'app.sqlite')
  try {
    const database = openDatabase(file)
    const state = readState(database)
    assert.equal(isState(state), true)
    assert.equal(state.groups.length, 3)
    assert.ok(state.devices.some((device) => device.name.includes('Flipper')))
    assert.equal(state.devices.find((device) => device.id === 'd-flipper').number, 1)
    assert.equal(state.devices.find((device) => device.id === 'd-klima').number, 5)
    assert.equal(state.maintenances.every((item) => item.status === 'offen' && item.createdBy === 'Jonas Keller'), true)
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
    const beforeDue = before.maintenances.find((item) => item.id === 'm-klima').dueDate
    const result = markPerformed(before, 'm-klima', user, '2026-10-01')
    const hacked = structuredClone(result.db)
    const spoofed = hacked.maintenances.find((item) => item.id === 'm-klima')
    spoofed.performedBy = 'Hacker'
    spoofed.dueDate = '2030-01-01'
    writeState(database, hacked, user)
    const after = readState(database)
    assert.equal(after.nextDocNumber, before.nextDocNumber)
    assert.equal(after.documentation.length, before.documentation.length)
    assert.equal(after.documentation[0].userName, 'Jonas Keller')
    const klima = after.maintenances.find((item) => item.id === 'm-klima')
    assert.equal(klima.status, 'erledigt')
    assert.equal(klima.performedBy, 'Anna Berger')
    assert.equal(klima.completedAt, '2026-10-01')
    assert.equal(klima.dueDate, beforeDue)
    assert.equal(after.devices.find((device) => device.id === 'd-flipper').number, 1)
    const open = openMaintenances(after.maintenances, 'd-klima')
    assert.equal(open.length, 1)
    assert.equal(open.some((item) => item.status === 'erledigt'), false)
    const successor = open[0]
    const source = before.maintenances.find((item) => item.id === 'm-klima')
    assert.notEqual(successor.id, 'm-klima')
    assert.equal(successor.status, 'offen')
    assert.equal(successor.performedBy, '')
    assert.equal(successor.completedAt, null)
    assert.equal(successor.createdBy, 'Anna Berger')
    assert.equal(successor.deviceId, 'd-klima')
    assert.equal(successor.dueDate, addWeeks(source.dueDate, source.intervalWeeks))
    assert.equal(successor.intervalWeeks, source.intervalWeeks)
    assert.equal(successor.description, source.description)
    assert.equal(successor.detail, source.detail)

    const locked = structuredClone(after)
    locked.maintenances.find((item) => item.id === 'm-klima').detail = 'Nachträglich geändert'
    writeState(database, locked, user)
    const kept = readState(database)
    assert.equal(kept.maintenances.find((item) => item.id === 'm-klima').detail, source.detail)

    const extra = structuredClone(after)
    extra.maintenances.push({
      id: 'm-extra',
      deviceId: 'd-klima',
      dueDate: '2026-12-01',
      intervalWeeks: 1,
      description: 'Nicht erlaubt',
      detail: '',
      createdBy: 'Anna Berger',
      status: 'offen',
      performedBy: '',
      completedAt: null,
      createdAt: '2026-10-01T12:00:00.000Z',
    })
    assert.throws(() => writeState(database, extra, user), /Keine Berechtigung/)
    database.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('marking a maintenance done schedules the next due date from the old due date', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gameorama-'))
  const file = path.join(dir, 'app.sqlite')
  try {
    const database = openDatabase(file)
    const before = readState(database)
    const edited = structuredClone(before)
    const klima = edited.maintenances.find((item) => item.id === 'm-klima')
    klima.dueDate = '2026-10-30'
    klima.intervalWeeks = 4
    writeState(database, edited, { name: 'Jonas Keller', role: 'super' })
    const stored = readState(database)
    const result = markPerformed(stored, 'm-klima', { name: 'Anna Berger', role: 'standard' }, '2026-10-02')
    assert.equal(result.ok, true)
    writeState(database, result.db, { name: 'Anna Berger', role: 'standard' })
    const after = readState(database)
    const completed = after.maintenances.find((item) => item.id === 'm-klima')
    assert.equal(completed.status, 'erledigt')
    assert.equal(completed.dueDate, '2026-10-30')
    assert.equal(completed.completedAt, '2026-10-02')
    const successor = openMaintenances(after.maintenances, 'd-klima')[0]
    assert.equal(successor.status, 'offen')
    assert.equal(successor.dueDate, '2026-11-27')
    assert.equal(successor.dueDate, addWeeks('2026-10-30', 4))
    assert.notEqual(successor.dueDate, addWeeks('2026-10-02', 4))
    assert.equal(successor.intervalWeeks, 4)
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
    assert.equal(next.devices.find((device) => device.id === 'd-flipper').number, 1)

    const duplicate = structuredClone(next)
    duplicate.devices[1].number = duplicate.devices[0].number
    const duplicateResponse = await fetch(`http://127.0.0.1:${port}/api/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(duplicate),
    })
    assert.equal(duplicateResponse.status, 400)
    assert.equal((await duplicateResponse.json()).error, 'Nummer schon vergeben.')

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

test('startup assigns stable device numbers in position order', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gameorama-'))
  const file = path.join(dir, 'legacy.sqlite')
  try {
    const database = new DatabaseSync(file)
    database.exec(`
      CREATE TABLE groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        position INTEGER NOT NULL
      );
      CREATE TABLE devices (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL,
        name TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL,
        number INTEGER
      );
      CREATE TABLE maintenances (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        due_date TEXT NOT NULL,
        interval_weeks INTEGER NOT NULL,
        description TEXT NOT NULL
      );
      CREATE TABLE documentation (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        maintenance_id TEXT,
        date TEXT NOT NULL,
        number INTEGER NOT NULL,
        user_name TEXT NOT NULL,
        description TEXT NOT NULL
      );
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO meta (key, value) VALUES ('seeded', '1');
      INSERT INTO meta (key, value) VALUES ('next_doc_number', '3');
      INSERT INTO groups (id, name, position) VALUES ('g1', 'Halle', 0);
      INSERT INTO devices (id, group_id, name, notes, position, number) VALUES
        ('d-c', 'g1', 'C', '', 2, NULL),
        ('d-a', 'g1', 'A', '', 0, 1),
        ('d-b', 'g1', 'B', '', 1, 4);
      INSERT INTO maintenances (id, device_id, due_date, interval_weeks, description)
        VALUES ('m1', 'd-a', '2026-10-01', 4, 'Prüfen');
      INSERT INTO documentation (id, device_id, maintenance_id, date, number, user_name, description)
        VALUES ('doc-old', 'd-a', 'm1', '2026-01-01', 1, 'Jonas Keller', 'Prüfen');
    `)
    database.close()

    const opened = openDatabase(file)
    const once = readState(opened)
    const numbers = Object.fromEntries(once.devices.map((device) => [device.id, device.number]))
    assert.deepEqual(numbers, { 'd-a': 1, 'd-b': 4, 'd-c': 2 })
    const maintenance = once.maintenances.find((item) => item.id === 'm1')
    assert.equal(maintenance.status, 'offen')
    assert.equal(maintenance.performedBy, '')
    assert.equal(maintenance.createdBy, '')
    assert.ok(maintenance.createdAt)
    assert.equal(once.documentation[0].userName, 'Jonas Keller')
    opened.close()

    const again = openDatabase(file)
    const twice = readState(again)
    assert.deepEqual(
      twice.devices.map((device) => [device.id, device.number]),
      once.devices.map((device) => [device.id, device.number]),
    )
    again.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('Erfasser and Durchgeführt durch come from the session', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gameorama-'))
  const file = path.join(dir, 'app.sqlite')
  const { server } = await startServer({ port: 0, dbPath: file })
  const { port } = server.address()
  const base = `http://127.0.0.1:${port}`
  try {
    const admin = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'super' }),
    }).then((response) => response.json())
    const anna = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'anna', password: 'wartung' }),
    }).then((response) => response.json())

    const state = await fetch(`${base}/api/state`).then((response) => response.json())
    const originalDue = state.maintenances.find((item) => item.id === 'm-klima').dueDate
    state.maintenances.push({
      id: 'm-new',
      deviceId: 'd-vr',
      dueDate: '2026-12-01',
      intervalWeeks: 3,
      description: 'Kabel prüfen',
      createdBy: 'Hacker',
      status: 'erledigt',
      performedBy: 'Hacker',
      completedAt: '2026-10-02',
    })
    const createdResponse = await fetch(`${base}/api/state`, {
      method: 'PUT',
      headers: authHeaders(admin.token),
      body: JSON.stringify(state),
    })
    assert.equal(createdResponse.status, 200)
    const createdState = await createdResponse.json()
    const created = createdState.maintenances.find((item) => item.id === 'm-new')
    assert.equal(created.status, 'offen')
    assert.equal(created.createdBy, 'Jonas Keller')
    assert.equal(created.performedBy, '')
    assert.equal(created.completedAt, null)

    const blocked = structuredClone(createdState)
    blocked.maintenances.push({
      id: 'm-anna',
      deviceId: 'd-vr',
      dueDate: '2026-12-02',
      intervalWeeks: 1,
      description: 'Nicht erlaubt',
      createdBy: 'Anna Berger',
      status: 'offen',
    })
    const blockedResponse = await fetch(`${base}/api/state`, {
      method: 'PUT',
      headers: authHeaders(anna.token),
      body: JSON.stringify(blocked),
    })
    assert.equal(blockedResponse.status, 403)

    const done = structuredClone(createdState)
    const klima = done.maintenances.find((item) => item.id === 'm-klima')
    klima.status = 'erledigt'
    klima.performedBy = 'Hacker'
    klima.completedAt = '2026-10-02'
    klima.dueDate = '2031-01-01'
    const anonymous = await fetch(`${base}/api/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(done),
    })
    assert.equal(anonymous.status, 403)

    const performed = await fetch(`${base}/api/state`, {
      method: 'PUT',
      headers: authHeaders(anna.token),
      body: JSON.stringify(done),
    })
    assert.equal(performed.status, 200)
    const after = await performed.json()
    const finished = after.maintenances.find((item) => item.id === 'm-klima')
    assert.equal(finished.status, 'erledigt')
    assert.equal(finished.performedBy, 'Anna Berger')
    assert.equal(finished.completedAt, '2026-10-02')
    assert.equal(finished.dueDate, originalDue)
    assert.equal(finished.createdBy, 'Jonas Keller')
    assert.equal(after.devices.find((device) => device.id === 'd-flipper').number, 1)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a maintenance stores Wartungsbeschrieb and documents survive state saves', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gameorama-'))
  const file = path.join(dir, 'app.sqlite')
  const { server, database } = await startServer({ port: 0, dbPath: file })
  const { port } = server.address()
  const base = `http://127.0.0.1:${port}`
  try {
    assert.throws(() => describeUpload('../geheim.txt'), /Ungültiger Dateiname/)
    assert.throws(() => describeUpload('skript.exe'), /Dateityp ist nicht erlaubt/)
    assert.throws(() => resolveUploadPath(uploadsDirectory(database), '../geheim.txt'), /Ungültiger Dateiname/)

    const admin = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'super' }),
    }).then((response) => response.json())
    const anna = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'anna', password: 'wartung' }),
    }).then((response) => response.json())

    const state = await fetch(`${base}/api/state`).then((response) => response.json())
    state.maintenances.push({
      id: 'm-detail',
      deviceId: 'd-vr',
      dueDate: '2026-12-15',
      intervalWeeks: 4,
      description: 'Linsen reinigen',
      detail: 'Mikrofasertuch verwenden und die Linsen nicht trocken reiben.',
      createdBy: 'Hacker',
      status: 'offen',
    })
    const createdResponse = await fetch(`${base}/api/state`, {
      method: 'PUT',
      headers: authHeaders(admin.token),
      body: JSON.stringify(state),
    })
    assert.equal(createdResponse.status, 200)
    const created = await createdResponse.json()
    const maintenance = created.maintenances.find((item) => item.id === 'm-detail')
    assert.equal(maintenance.detail, 'Mikrofasertuch verwenden und die Linsen nicht trocken reiben.')
    assert.equal(maintenance.description, 'Linsen reinigen')

    const tampered = structuredClone(created)
    const tamperedItem = tampered.maintenances.find((item) => item.id === 'm-detail')
    tamperedItem.detail = 'Anna ändert den Beschrieb'
    tampered.devices.find((device) => device.id === 'd-vr').notes = 'Anna ändert die Bemerkung'
    const tamperedResponse = await fetch(`${base}/api/state`, {
      method: 'PUT',
      headers: authHeaders(anna.token),
      body: JSON.stringify(tampered),
    })
    assert.equal(tamperedResponse.status, 200)
    const kept = await tamperedResponse.json()
    assert.equal(
      kept.maintenances.find((item) => item.id === 'm-detail').detail,
      maintenance.detail,
    )
    assert.equal(kept.devices.find((device) => device.id === 'd-vr').notes.includes('Anna'), false)

    const upload = await fetch(
      `${base}/api/documents?owner=m-detail&filename=${encodeURIComponent('Anleitung.txt')}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/octet-stream' },
        body: 'Linsen nur feucht reinigen.',
      },
    )
    assert.equal(upload.status, 200)
    const savedDoc = await upload.json()
    assert.equal(savedDoc.originalName, 'Anleitung.txt')
    assert.equal(savedDoc.ownerId, 'm-detail')
    assert.equal(savedDoc.mimeType, 'text/plain')

    const row = database
      .prepare('SELECT id, owner_id, original_name, stored_name, mime_type FROM documents WHERE id = ?')
      .get(savedDoc.id)
    assert.equal(row.original_name, 'Anleitung.txt')
    assert.equal(row.owner_id, 'm-detail')
    assert.equal(row.mime_type, 'text/plain')
    assert.match(row.stored_name, /^[a-f0-9]{32}\.txt$/)
    assert.equal(existsSync(path.join(uploadsDirectory(database), row.stored_name)), true)

    const listedResponse = await fetch(`${base}/api/documents?owner=m-detail`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    })
    assert.equal(listedResponse.status, 200)
    const listed = await listedResponse.json()
    assert.equal(listed.length, 1)
    assert.equal(listed[0].originalName, 'Anleitung.txt')
    assert.equal(listed[0].storedName, undefined)
    assert.deepEqual(listDocuments(database, 'm-detail').map((item) => item.id), [savedDoc.id])

    const roundTrip = await fetch(`${base}/api/state`, {
      method: 'PUT',
      headers: authHeaders(admin.token),
      body: JSON.stringify(kept),
    })
    assert.equal(roundTrip.status, 200)
    assert.equal(listDocuments(database, 'm-detail').length, 1)
    assert.equal(existsSync(path.join(uploadsDirectory(database), row.stored_name)), true)

    const standardUpload = await fetch(
      `${base}/api/documents?owner=m-detail&filename=${encodeURIComponent('Anna.txt')}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${anna.token}`, 'Content-Type': 'application/octet-stream' },
        body: 'darf nicht',
      },
    )
    assert.equal(standardUpload.status, 403)
    assert.equal(listDocuments(database, 'm-detail').length, 1)
    const anonymousUpload = await fetch(
      `${base}/api/documents?owner=m-detail&filename=offen.txt`,
      { method: 'POST', body: 'nein' },
    )
    assert.equal(anonymousUpload.status, 403)

    const blockedOpen = await fetch(`${base}/api/documents/${savedDoc.id}`)
    assert.equal(blockedOpen.status, 401)
    const opened = await fetch(`${base}/api/documents/${savedDoc.id}`, {
      headers: { Authorization: `Bearer ${anna.token}` },
    })
    assert.equal(opened.status, 200)
    assert.match(opened.headers.get('content-disposition'), /^inline;/i)
    assert.match(opened.headers.get('content-disposition'), /Anleitung\.txt/)
    assert.equal(await opened.text(), 'Linsen nur feucht reinigen.')

    const rejected = await fetch(
      `${base}/api/documents?owner=d-vr&filename=${encodeURIComponent('virus.exe')}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${admin.token}` },
        body: 'nope',
      },
    )
    assert.equal(rejected.status, 400)
    assert.match((await rejected.json()).error, /Dateityp ist nicht erlaubt/)
    const traversal = await fetch(
      `${base}/api/documents?owner=d-vr&filename=${encodeURIComponent('../geheim.txt')}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${admin.token}` },
        body: 'geheim',
      },
    )
    assert.equal(traversal.status, 400)
    assert.equal(readdirSync(dir).some((name) => name.includes('geheim')), false)

    const docx = await fetch(
      `${base}/api/documents?owner=d-vr&filename=${encodeURIComponent('Plan.docx')}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${admin.token}` },
        body: 'PK',
      },
    )
    assert.equal(docx.status, 200)
    const docxMeta = await docx.json()
    const downloaded = await fetch(`${base}/api/documents/${docxMeta.id}?token=${anna.token}`)
    assert.equal(downloaded.status, 200)
    assert.match(downloaded.headers.get('content-disposition'), /^attachment;/i)

    const standardDelete = await fetch(`${base}/api/documents/${savedDoc.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${anna.token}` },
    })
    assert.equal(standardDelete.status, 403)

    const removedState = structuredClone(kept)
    removedState.maintenances = removedState.maintenances.filter((item) => item.id !== 'm-detail')
    const removedResponse = await fetch(`${base}/api/state`, {
      method: 'PUT',
      headers: authHeaders(admin.token),
      body: JSON.stringify(removedState),
    })
    assert.equal(removedResponse.status, 200)
    assert.equal(listDocuments(database, 'm-detail').length, 0)
    assert.equal(existsSync(path.join(uploadsDirectory(database), row.stored_name)), false)
    assert.equal(listDocuments(database, 'd-vr').some((item) => item.id === docxMeta.id), true)

    const tooBig = Buffer.alloc(15 * 1024 * 1024 + 1, 1)
    assert.throws(
      () => saveDocument(database, { ownerId: 'd-vr', filename: 'gross.txt', bytes: tooBig }),
      /zu gross/,
    )
  } finally {
    await new Promise((resolve) => server.close(resolve))
    rmSync(dir, { recursive: true, force: true })
  }
})

test('super can rename groups, move devices and maintenances, and copy an open maintenance', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gameorama-'))
  const file = path.join(dir, 'app.sqlite')
  const { server, database } = await startServer({ port: 0, dbPath: file })
  const { port } = server.address()
  const base = `http://127.0.0.1:${port}`
  try {
    const admin = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'super' }),
    }).then((response) => response.json())
    const anna = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'anna', password: 'wartung' }),
    }).then((response) => response.json())

    const state = await fetch(`${base}/api/state`).then((response) => response.json())
    const oilBefore = state.maintenances.find((item) => item.id === 'm-flipper-oil')
    const upload = await fetch(
      `${base}/api/documents?owner=m-flipper-oil&filename=${encodeURIComponent('Oelanleitung.txt')}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/octet-stream' },
        body: 'Lager ölen.',
      },
    )
    assert.equal(upload.status, 200)
    const savedDoc = await upload.json()

    const renamed = structuredClone(state)
    renamed.groups.find((group) => group.id === 'g-arcade').name = 'Spielautomaten'
    const annaRename = await fetch(`${base}/api/state`, {
      method: 'PUT',
      headers: authHeaders(anna.token),
      body: JSON.stringify(renamed),
    })
    assert.equal(annaRename.status, 403)
    const unchanged = await fetch(`${base}/api/state`).then((response) => response.json())
    assert.equal(unchanged.groups.find((group) => group.id === 'g-arcade').name, 'Arcade-Automaten')

    const adminRename = await fetch(`${base}/api/state`, {
      method: 'PUT',
      headers: authHeaders(admin.token),
      body: JSON.stringify(renamed),
    })
    assert.equal(adminRename.status, 200)
    const named = await adminRename.json()
    assert.equal(named.groups.find((group) => group.id === 'g-arcade').name, 'Spielautomaten')

    const movedDevice = structuredClone(named)
    movedDevice.devices.find((device) => device.id === 'd-flipper').groupId = 'g-haus'
    const annaMoveDevice = await fetch(`${base}/api/state`, {
      method: 'PUT',
      headers: authHeaders(anna.token),
      body: JSON.stringify(movedDevice),
    })
    assert.equal(annaMoveDevice.status, 403)
    const stillArcade = await fetch(`${base}/api/state`).then((response) => response.json())
    assert.equal(stillArcade.devices.find((device) => device.id === 'd-flipper').groupId, 'g-arcade')

    const adminMoveDevice = await fetch(`${base}/api/state`, {
      method: 'PUT',
      headers: authHeaders(admin.token),
      body: JSON.stringify(movedDevice),
    })
    assert.equal(adminMoveDevice.status, 200)
    const housed = await adminMoveDevice.json()
    assert.equal(housed.devices.find((device) => device.id === 'd-flipper').groupId, 'g-haus')
    const oilHoused = housed.maintenances.find((item) => item.id === 'm-flipper-oil')
    assert.equal(oilHoused.deviceId, 'd-flipper')
    assert.equal(oilHoused.detail, oilBefore.detail)
    assert.equal(oilHoused.status, 'offen')
    assert.equal(oilHoused.performedBy, '')

    const movedMaintenance = structuredClone(housed)
    const moving = movedMaintenance.maintenances.find((item) => item.id === 'm-flipper-oil')
    moving.deviceId = 'd-vr'
    const annaMoveMaintenance = await fetch(`${base}/api/state`, {
      method: 'PUT',
      headers: authHeaders(anna.token),
      body: JSON.stringify(movedMaintenance),
    })
    assert.equal(annaMoveMaintenance.status, 403)

    const adminMoveMaintenance = await fetch(`${base}/api/state`, {
      method: 'PUT',
      headers: authHeaders(admin.token),
      body: JSON.stringify(movedMaintenance),
    })
    assert.equal(adminMoveMaintenance.status, 200)
    const afterMove = await adminMoveMaintenance.json()
    const movedOil = afterMove.maintenances.find((item) => item.id === 'm-flipper-oil')
    assert.equal(movedOil.deviceId, 'd-vr')
    assert.equal(movedOil.status, 'offen')
    assert.equal(movedOil.performedBy, '')
    assert.equal(movedOil.completedAt, null)
    assert.equal(movedOil.dueDate, oilBefore.dueDate)
    assert.equal(movedOil.detail, oilBefore.detail)
    assert.equal(movedOil.createdBy, 'Jonas Keller')
    assert.equal(listDocuments(database, 'm-flipper-oil').length, 1)
    const stored = database.prepare('SELECT stored_name FROM documents WHERE id = ?').get(savedDoc.id)
    assert.equal(existsSync(path.join(uploadsDirectory(database), stored.stored_name)), true)

    const done = structuredClone(afterMove)
    const klima = done.maintenances.find((item) => item.id === 'm-klima')
    klima.status = 'erledigt'
    klima.performedBy = 'Hacker'
    klima.completedAt = '2026-10-02'
    const performed = await fetch(`${base}/api/state`, {
      method: 'PUT',
      headers: authHeaders(anna.token),
      body: JSON.stringify(done),
    })
    assert.equal(performed.status, 200)
    const performedState = await performed.json()
    const moveDone = structuredClone(performedState)
    moveDone.maintenances.find((item) => item.id === 'm-klima').deviceId = 'd-race'
    const movedDoneResponse = await fetch(`${base}/api/state`, {
      method: 'PUT',
      headers: authHeaders(admin.token),
      body: JSON.stringify(moveDone),
    })
    assert.equal(movedDoneResponse.status, 200)
    const movedDone = await movedDoneResponse.json()
    const finished = movedDone.maintenances.find((item) => item.id === 'm-klima')
    assert.equal(finished.deviceId, 'd-race')
    assert.equal(finished.status, 'erledigt')
    assert.equal(finished.performedBy, 'Anna Berger')
    assert.equal(finished.completedAt, '2026-10-02')

    const copyState = structuredClone(movedDone)
    copyState.maintenances.push({
      id: 'm-copy',
      deviceId: 'd-dance',
      dueDate: movedOil.dueDate,
      intervalWeeks: movedOil.intervalWeeks,
      description: movedOil.description,
      detail: movedOil.detail,
      createdBy: 'Hacker',
      status: 'erledigt',
      performedBy: 'Anna Berger',
      completedAt: '2026-10-02',
    })
    const annaCopy = await fetch(`${base}/api/state`, {
      method: 'PUT',
      headers: authHeaders(anna.token),
      body: JSON.stringify(copyState),
    })
    assert.equal(annaCopy.status, 403)
    const adminCopy = await fetch(`${base}/api/state`, {
      method: 'PUT',
      headers: authHeaders(admin.token),
      body: JSON.stringify(copyState),
    })
    assert.equal(adminCopy.status, 200)
    const copiedState = await adminCopy.json()
    const copy = copiedState.maintenances.find((item) => item.id === 'm-copy')
    assert.equal(copy.status, 'offen')
    assert.equal(copy.performedBy, '')
    assert.equal(copy.completedAt, null)
    assert.equal(copy.createdBy, 'Jonas Keller')
    assert.equal(copy.deviceId, 'd-dance')
    assert.equal(copy.dueDate, movedOil.dueDate)
    assert.equal(copy.intervalWeeks, movedOil.intervalWeeks)
    assert.equal(copy.description, movedOil.description)
    assert.equal(copy.detail, movedOil.detail)
    assert.equal(listDocuments(database, 'm-copy').length, 0)
    assert.equal(listDocuments(database, 'm-flipper-oil').map((item) => item.id).join(','), savedDoc.id)

    const users = database.prepare('SELECT username FROM users ORDER BY username').all()
    assert.deepEqual(users.map((row) => row.username), ['admin', 'anna'])
    const sessions = database.prepare('SELECT COUNT(*) AS count FROM sessions').get()
    assert.equal(Number(sessions.count), 2)
    const stillSuper = await fetch(`${base}/api/users`, { headers: authHeaders(admin.token) })
    assert.equal(stillSuper.status, 200)
    assert.equal(copiedState.documentation.length, state.documentation.length)
    assert.equal(copiedState.documentation[0].userName, 'Jonas Keller')
  } finally {
    await new Promise((resolve) => server.close(resolve))
    rmSync(dir, { recursive: true, force: true })
  }
})

test('super can update all maintenance text fields and a standard token gets 403', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gameorama-'))
  const file = path.join(dir, 'app.sqlite')
  const { server } = await startServer({ port: 0, dbPath: file })
  const { port } = server.address()
  const base = `http://127.0.0.1:${port}`
  try {
    const admin = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'super' }),
    }).then((response) => response.json())
    const anna = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'anna', password: 'wartung' }),
    }).then((response) => response.json())
    const before = await fetch(`${base}/api/state`).then((response) => response.json())
    const count = before.maintenances.length
    const body = {
      dueDate: '2026-12-15',
      intervalWeeks: 6,
      description: 'Filter und Dichtung prüfen',
      detail: 'Neues Filterset aus dem Lager.',
      createdBy: 'Mia Frei',
      status: 'offen',
      performedBy: 'Lea Sommer',
      completedAt: '2026-10-03',
    }
    const savedResponse = await fetch(`${base}/api/maintenances/m-klima`, {
      method: 'PUT',
      headers: authHeaders(admin.token),
      body: JSON.stringify(body),
    })
    assert.equal(savedResponse.status, 200)
    const saved = await savedResponse.json()
    assert.equal(saved.maintenances.length, count)
    const updated = saved.maintenances.find((item) => item.id === 'm-klima')
    assert.equal(updated.dueDate, '2026-12-15')
    assert.equal(updated.intervalWeeks, 6)
    assert.equal(updated.description, 'Filter und Dichtung prüfen')
    assert.equal(updated.detail, 'Neues Filterset aus dem Lager.')
    assert.equal(updated.createdBy, 'Mia Frei')
    assert.equal(updated.status, 'offen')
    assert.equal(updated.performedBy, 'Lea Sommer')
    assert.equal(updated.completedAt, null)
    assert.equal(saved.maintenances.filter((item) => item.deviceId === 'd-klima' && item.status === 'offen').length, 1)

    const doneResponse = await fetch(`${base}/api/maintenances/m-klima`, {
      method: 'PUT',
      headers: authHeaders(admin.token),
      body: JSON.stringify({ ...body, status: 'erledigt' }),
    })
    assert.equal(doneResponse.status, 200)
    const done = await doneResponse.json()
    assert.equal(done.maintenances.length, count)
    const finished = done.maintenances.find((item) => item.id === 'm-klima')
    assert.equal(finished.status, 'erledigt')
    assert.equal(finished.description, 'Filter und Dichtung prüfen')
    assert.equal(finished.detail, 'Neues Filterset aus dem Lager.')
    assert.equal(finished.createdBy, 'Mia Frei')
    assert.equal(finished.performedBy, 'Lea Sommer')
    assert.equal(finished.completedAt, '2026-10-03')
    assert.equal(finished.dueDate, '2026-12-15')
    assert.equal(finished.intervalWeeks, 6)
    assert.equal(
      done.maintenances.some((item) => item.id !== 'm-klima' && item.description === finished.description),
      false,
    )

    const forbidden = await fetch(`${base}/api/maintenances/m-klima`, {
      method: 'PUT',
      headers: authHeaders(anna.token),
      body: JSON.stringify({ ...body, description: 'Anna ändert den Text', status: 'erledigt' }),
    })
    assert.equal(forbidden.status, 403)
    const kept = await fetch(`${base}/api/state`).then((response) => response.json())
    assert.equal(kept.maintenances.find((item) => item.id === 'm-klima').description, 'Filter und Dichtung prüfen')
    assert.equal(kept.maintenances.find((item) => item.id === 'm-klima').performedBy, 'Lea Sommer')

    const bypass = structuredClone(kept)
    bypass.maintenances.find((item) => item.id === 'm-klima').description = 'Anna ändert den Text'
    const bypassResponse = await fetch(`${base}/api/state`, {
      method: 'PUT',
      headers: authHeaders(anna.token),
      body: JSON.stringify(bypass),
    })
    assert.equal(bypassResponse.status, 403)

    const emptyResponse = await fetch(`${base}/api/maintenances/m-klima`, {
      method: 'PUT',
      headers: authHeaders(admin.token),
      body: JSON.stringify({ ...body, description: '   ', status: 'erledigt' }),
    })
    assert.equal(emptyResponse.status, 400)
    assert.equal((await emptyResponse.json()).error, 'Bitte eine Wartungsbeschreibung angeben.')
    const missingDate = await fetch(`${base}/api/maintenances/m-klima`, {
      method: 'PUT',
      headers: authHeaders(admin.token),
      body: JSON.stringify({ ...body, dueDate: '', status: 'erledigt' }),
    })
    assert.equal(missingDate.status, 400)
    assert.equal((await missingDate.json()).error, 'Bitte ein Fälligkeitsdatum angeben.')
    const badInterval = await fetch(`${base}/api/maintenances/m-klima`, {
      method: 'PUT',
      headers: authHeaders(admin.token),
      body: JSON.stringify({ ...body, intervalWeeks: 0, status: 'erledigt' }),
    })
    assert.equal(badInterval.status, 400)
    assert.equal((await badInterval.json()).error, 'Das Intervall muss mindestens 1 Woche sein.')
    const unchanged = await fetch(`${base}/api/state`).then((response) => response.json())
    assert.equal(unchanged.maintenances.find((item) => item.id === 'm-klima').description, 'Filter und Dichtung prüfen')
    assert.equal(unchanged.maintenances.length, count)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    rmSync(dir, { recursive: true, force: true })
  }
})

test('deleting an erledigt maintenance leaves the open copy in place', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gameorama-'))
  const file = path.join(dir, 'app.sqlite')
  const { server, database } = await startServer({ port: 0, dbPath: file })
  const { port } = server.address()
  const base = `http://127.0.0.1:${port}`
  try {
    const admin = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'super' }),
    }).then((response) => response.json())
    const anna = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'anna', password: 'wartung' }),
    }).then((response) => response.json())
    const before = await fetch(`${base}/api/state`).then((response) => response.json())
    const performed = markPerformed(before, 'm-klima', { name: 'Anna Berger', role: 'standard' }, '2026-10-02')
    assert.equal(performed.ok, true)
    const savedResponse = await fetch(`${base}/api/state`, {
      method: 'PUT',
      headers: authHeaders(anna.token),
      body: JSON.stringify(performed.db),
    })
    assert.equal(savedResponse.status, 200)
    const saved = await savedResponse.json()
    const open = openMaintenances(saved.maintenances, 'd-klima')
    assert.equal(open.length, 1)
    const successor = open[0]
    assert.notEqual(successor.id, 'm-klima')
    assert.equal(successor.status, 'offen')

    const completedUpload = await fetch(
      `${base}/api/documents?owner=m-klima&filename=${encodeURIComponent('Filter.pdf')}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/octet-stream' },
        body: 'Filterprotokoll',
      },
    )
    assert.equal(completedUpload.status, 200)
    const completedDoc = await completedUpload.json()
    const successorUpload = await fetch(
      `${base}/api/documents?owner=${encodeURIComponent(successor.id)}&filename=${encodeURIComponent('Naechste.txt')}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/octet-stream' },
        body: 'Folgewartung',
      },
    )
    assert.equal(successorUpload.status, 200)
    const successorDoc = await successorUpload.json()
    const completedFile = database.prepare('SELECT stored_name FROM documents WHERE id = ?').get(completedDoc.id).stored_name
    const successorFile = database.prepare('SELECT stored_name FROM documents WHERE id = ?').get(successorDoc.id).stored_name
    assert.equal(existsSync(path.join(uploadsDirectory(database), completedFile)), true)

    const omitted = structuredClone(saved)
    omitted.maintenances = omitted.maintenances.filter((item) => item.id !== 'm-klima')
    const omittedResponse = await fetch(`${base}/api/state`, {
      method: 'PUT',
      headers: authHeaders(anna.token),
      body: JSON.stringify(omitted),
    })
    assert.equal(omittedResponse.status, 403)

    const annaDelete = await fetch(`${base}/api/maintenances/m-klima`, {
      method: 'DELETE',
      headers: authHeaders(anna.token),
    })
    assert.equal(annaDelete.status, 403)
    const still = await fetch(`${base}/api/state`).then((response) => response.json())
    assert.equal(still.maintenances.some((item) => item.id === 'm-klima' && item.status === 'erledigt'), true)
    assert.equal(still.maintenances.some((item) => item.id === successor.id && item.status === 'offen'), true)
    assert.equal(existsSync(path.join(uploadsDirectory(database), completedFile)), true)

    const removedResponse = await fetch(`${base}/api/maintenances/m-klima`, {
      method: 'DELETE',
      headers: authHeaders(admin.token),
    })
    assert.equal(removedResponse.status, 200)
    const removed = await removedResponse.json()
    assert.equal(removed.maintenances.some((item) => item.id === 'm-klima'), false)
    const remaining = removed.maintenances.find((item) => item.id === successor.id)
    assert.equal(remaining.status, 'offen')
    assert.equal(remaining.deviceId, 'd-klima')
    assert.equal(remaining.description, successor.description)
    assert.equal(listDocuments(database, 'm-klima').length, 0)
    assert.equal(existsSync(path.join(uploadsDirectory(database), completedFile)), false)
    assert.equal(listDocuments(database, successor.id).map((item) => item.id).join(','), successorDoc.id)
    assert.equal(existsSync(path.join(uploadsDirectory(database), successorFile)), true)
    assert.equal(removed.maintenances.some((item) => item.id === 'm-flipper-oil'), true)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    rmSync(dir, { recursive: true, force: true })
  }
})

test('groups and devices can only be deleted when nothing still belongs to them', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gameorama-'))
  const file = path.join(dir, 'app.sqlite')
  const { server, database } = await startServer({ port: 0, dbPath: file })
  const { port } = server.address()
  const base = `http://127.0.0.1:${port}`
  try {
    const admin = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'super' }),
    }).then((response) => response.json())
    const state = await fetch(`${base}/api/state`).then((response) => response.json())

    const occupied = structuredClone(state)
    const arcadeDeviceIds = new Set(
      occupied.devices.filter((device) => device.groupId === 'g-arcade').map((device) => device.id),
    )
    occupied.groups = occupied.groups.filter((group) => group.id !== 'g-arcade')
    occupied.devices = occupied.devices.filter((device) => device.groupId !== 'g-arcade')
    occupied.maintenances = occupied.maintenances.filter((item) => !arcadeDeviceIds.has(item.deviceId))
    occupied.documentation = occupied.documentation.filter((item) => !arcadeDeviceIds.has(item.deviceId))
    const occupiedResponse = await fetch(`${base}/api/state`, {
      method: 'PUT',
      headers: authHeaders(admin.token),
      body: JSON.stringify(occupied),
    })
    assert.equal(occupiedResponse.status, 400)
    assert.equal(
      (await occupiedResponse.json()).error,
      'Die Gruppe kann nicht gelöscht werden, solange sie Geräte enthält.',
    )
    const keptGroups = await fetch(`${base}/api/state`).then((response) => response.json())
    assert.equal(keptGroups.groups.some((group) => group.id === 'g-arcade'), true)
    assert.equal(keptGroups.devices.some((device) => device.groupId === 'g-arcade'), true)

    const withEmpty = structuredClone(keptGroups)
    withEmpty.groups.push({ id: 'g-empty', name: 'Lager' })
    const createdResponse = await fetch(`${base}/api/state`, {
      method: 'PUT',
      headers: authHeaders(admin.token),
      body: JSON.stringify(withEmpty),
    })
    assert.equal(createdResponse.status, 200)
    const created = await createdResponse.json()
    assert.equal(created.groups.some((group) => group.id === 'g-empty'), true)
    const withoutEmpty = structuredClone(created)
    withoutEmpty.groups = withoutEmpty.groups.filter((group) => group.id !== 'g-empty')
    const deletedGroupResponse = await fetch(`${base}/api/state`, {
      method: 'PUT',
      headers: authHeaders(admin.token),
      body: JSON.stringify(withoutEmpty),
    })
    assert.equal(deletedGroupResponse.status, 200)
    const deletedGroup = await deletedGroupResponse.json()
    assert.equal(deletedGroup.groups.some((group) => group.id === 'g-empty'), false)
    assert.equal(deletedGroup.devices.length, state.devices.length)
    assert.equal(deletedGroup.groups.some((group) => group.id === 'g-arcade'), true)

    const blockedDevice = structuredClone(deletedGroup)
    blockedDevice.devices = blockedDevice.devices.filter((device) => device.id !== 'd-klima')
    blockedDevice.maintenances = blockedDevice.maintenances.filter((item) => item.deviceId !== 'd-klima')
    blockedDevice.documentation = blockedDevice.documentation.filter((item) => item.deviceId !== 'd-klima')
    const blockedDeviceResponse = await fetch(`${base}/api/state`, {
      method: 'PUT',
      headers: authHeaders(admin.token),
      body: JSON.stringify(blockedDevice),
    })
    assert.equal(blockedDeviceResponse.status, 400)
    assert.equal(
      (await blockedDeviceResponse.json()).error,
      'Das Gerät kann nicht gelöscht werden, solange offene Wartungen vorhanden sind.',
    )
    const stillThere = await fetch(`${base}/api/state`).then((response) => response.json())
    assert.equal(stillThere.devices.some((device) => device.id === 'd-klima'), true)
    assert.equal(openMaintenances(stillThere.maintenances, 'd-klima').length > 0, true)

    const klima = stillThere.maintenances.find((item) => item.id === 'm-klima')
    const doneResponse = await fetch(`${base}/api/maintenances/m-klima`, {
      method: 'PUT',
      headers: authHeaders(admin.token),
      body: JSON.stringify({
        dueDate: klima.dueDate,
        intervalWeeks: klima.intervalWeeks,
        description: klima.description,
        detail: klima.detail,
        createdBy: klima.createdBy,
        status: 'erledigt',
        performedBy: 'Jonas Keller',
        completedAt: '2026-10-02',
      }),
    })
    assert.equal(doneResponse.status, 200)
    const done = await doneResponse.json()
    assert.equal(openMaintenances(done.maintenances, 'd-klima').length, 0)
    assert.equal(done.maintenances.some((item) => item.id === 'm-klima' && item.status === 'erledigt'), true)

    async function upload(ownerId, filename, body) {
      const response = await fetch(
        `${base}/api/documents?owner=${encodeURIComponent(ownerId)}&filename=${encodeURIComponent(filename)}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/octet-stream' },
          body,
        },
      )
      assert.equal(response.status, 200)
      return response.json()
    }

    const klimaDoc = await upload('m-klima', 'Filter.txt', 'Filterprotokoll')
    const deviceDoc = await upload('d-klima', 'Anlage.txt', 'Anlagendokument')
    const keptDoc = await upload('m-flipper-oil', 'Oel.txt', 'Oelplan')
    function storedName(id) {
      return database.prepare('SELECT stored_name FROM documents WHERE id = ?').get(id).stored_name
    }
    const klimaFile = storedName(klimaDoc.id)
    const deviceFile = storedName(deviceDoc.id)
    const keptFile = storedName(keptDoc.id)
    const uploads = uploadsDirectory(database)
    assert.equal(existsSync(path.join(uploads, klimaFile)), true)
    assert.equal(existsSync(path.join(uploads, deviceFile)), true)

    const withDocumentation = structuredClone(done)
    withDocumentation.documentation.push({
      id: 'doc-klima',
      deviceId: 'd-klima',
      maintenanceId: 'm-klima',
      date: '2026-10-02',
      number: 9,
      userName: 'Jonas Keller',
      description: 'Filter wechseln',
    })
    const documentedResponse = await fetch(`${base}/api/state`, {
      method: 'PUT',
      headers: authHeaders(admin.token),
      body: JSON.stringify(withDocumentation),
    })
    assert.equal(documentedResponse.status, 200)
    const documented = await documentedResponse.json()
    const removedDevice = structuredClone(documented)
    removedDevice.devices = removedDevice.devices.filter((device) => device.id !== 'd-klima')
    removedDevice.maintenances = removedDevice.maintenances.filter((item) => item.deviceId !== 'd-klima')
    removedDevice.documentation = removedDevice.documentation.filter((item) => item.deviceId !== 'd-klima')
    const removedResponse = await fetch(`${base}/api/state`, {
      method: 'PUT',
      headers: authHeaders(admin.token),
      body: JSON.stringify(removedDevice),
    })
    assert.equal(removedResponse.status, 200)
    const removed = await removedResponse.json()
    assert.equal(removed.devices.some((device) => device.id === 'd-klima'), false)
    assert.equal(removed.maintenances.some((item) => item.deviceId === 'd-klima'), false)
    assert.equal(removed.documentation.some((item) => item.deviceId === 'd-klima'), false)
    assert.equal(removed.devices.some((device) => device.id === 'd-flipper'), true)
    assert.equal(removed.maintenances.some((item) => item.id === 'm-flipper-oil'), true)
    assert.equal(listDocuments(database, 'm-klima').length, 0)
    assert.equal(listDocuments(database, 'd-klima').length, 0)
    assert.equal(existsSync(path.join(uploads, klimaFile)), false)
    assert.equal(existsSync(path.join(uploads, deviceFile)), false)
    assert.equal(listDocuments(database, 'm-flipper-oil').map((item) => item.id).join(','), keptDoc.id)
    assert.equal(existsSync(path.join(uploads, keptFile)), true)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    rmSync(dir, { recursive: true, force: true })
  }
})
