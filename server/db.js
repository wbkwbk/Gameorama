import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createSeedDb } from '../src/model.js'
import { hashPassword, verifyPassword } from './passwords.js'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  name TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL,
  FOREIGN KEY (group_id) REFERENCES groups(id)
);
CREATE TABLE IF NOT EXISTS maintenances (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  due_date TEXT NOT NULL,
  interval_weeks INTEGER NOT NULL,
  description TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id)
);
CREATE TABLE IF NOT EXISTS documentation (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  maintenance_id TEXT,
  date TEXT NOT NULL,
  number INTEGER NOT NULL,
  user_name TEXT NOT NULL,
  description TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('standard', 'super')),
  comment TEXT NOT NULL DEFAULT ''
);
`

const SEED_USERS = [
  {
    username: 'anna',
    password: 'wartung',
    name: 'Anna Berger',
    role: 'standard',
    comment: 'Standard Benutzer. Darf Wartungen als durchgeführt markieren.',
  },
  {
    username: 'admin',
    password: 'super',
    name: 'Jonas Keller',
    role: 'super',
    comment: 'Super Benutzer. Darf Geräte, Gruppen und Wartungen verwalten.',
  },
]

export function isState(value) {
  return Boolean(
    value &&
      Array.isArray(value.groups) &&
      Array.isArray(value.devices) &&
      Array.isArray(value.maintenances) &&
      Array.isArray(value.documentation) &&
      Number.isInteger(value.nextDocNumber) &&
      value.nextDocNumber > 0,
  )
}

export function openDatabase(filePath) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  const database = new DatabaseSync(filePath)
  database.exec('PRAGMA foreign_keys = ON')
  database.exec(SCHEMA)
  const seeded = database.prepare(`SELECT value FROM meta WHERE key = 'seeded'`).get()
  if (!seeded) {
    writeState(database, createSeedDb())
    database.prepare(`INSERT INTO meta (key, value) VALUES ('seeded', '1')`).run()
  }
  const userCount = database.prepare('SELECT COUNT(*) AS count FROM users').get()
  if (Number(userCount.count) === 0) {
    for (const user of SEED_USERS) saveUser(database, user)
  }
  return database
}

function publicUser(row) {
  return {
    username: row.username,
    name: row.name,
    role: row.role,
    comment: row.comment,
  }
}

export function listUsers(database) {
  return database
    .prepare('SELECT username, name, role, comment FROM users ORDER BY username')
    .all()
    .map(publicUser)
}

export function loginUser(database, username, password) {
  const row = database
    .prepare('SELECT username, password_hash, name, role, comment FROM users WHERE username = ?')
    .get(String(username ?? '').trim())
  if (!row || !verifyPassword(password, row.password_hash)) return null
  return publicUser(row)
}

export function saveUser(database, { username, password, name, role, comment = '' }) {
  const cleanName = String(username ?? '').trim()
  const cleanRole = role === 'super' ? 'super' : role === 'standard' ? 'standard' : ''
  if (!cleanName) throw new Error('Benutzername fehlt')
  if (!password) throw new Error('Passwort fehlt')
  if (!String(name ?? '').trim()) throw new Error('Name fehlt')
  if (!cleanRole) throw new Error('Rolle muss standard oder super sein')
  database
    .prepare(
      `INSERT INTO users (username, password_hash, name, role, comment)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(username) DO UPDATE SET
         password_hash = excluded.password_hash,
         name = excluded.name,
         role = excluded.role,
         comment = excluded.comment`,
    )
    .run(cleanName, hashPassword(password), String(name).trim(), cleanRole, String(comment ?? ''))
}

export function setPassword(database, username, password) {
  if (!password) throw new Error('Passwort fehlt')
  const result = database
    .prepare('UPDATE users SET password_hash = ? WHERE username = ?')
    .run(hashPassword(password), String(username).trim())
  if (result.changes === 0) throw new Error('Benutzer nicht gefunden')
}

export function setComment(database, username, comment) {
  const result = database
    .prepare('UPDATE users SET comment = ? WHERE username = ?')
    .run(String(comment ?? ''), String(username).trim())
  if (result.changes === 0) throw new Error('Benutzer nicht gefunden')
}

export function deleteUser(database, username) {
  const cleanName = String(username).trim()
  const existing = database.prepare('SELECT role FROM users WHERE username = ?').get(cleanName)
  if (!existing) throw new Error('Benutzer nicht gefunden')
  if (existing.role === 'super') {
    const supers = database.prepare(`SELECT COUNT(*) AS count FROM users WHERE role = 'super'`).get()
    if (Number(supers.count) <= 1) throw new Error('Der letzte Super Benutzer kann nicht gelöscht werden')
  }
  database.prepare('DELETE FROM users WHERE username = ?').run(cleanName)
}

export function readState(database) {
  const groups = database.prepare('SELECT id, name FROM groups ORDER BY position, id').all()
  const devices = database
    .prepare(
      'SELECT id, group_id AS groupId, name, notes FROM devices ORDER BY position, id',
    )
    .all()
  const maintenances = database
    .prepare(
      `SELECT id, device_id AS deviceId, due_date AS dueDate,
              interval_weeks AS intervalWeeks, description
       FROM maintenances ORDER BY due_date, id`,
    )
    .all()
    .map((item) => ({ ...item, intervalWeeks: Number(item.intervalWeeks) }))
  const documentation = database
    .prepare(
      `SELECT id, device_id AS deviceId, maintenance_id AS maintenanceId, date,
              number, user_name AS userName, description
       FROM documentation ORDER BY number DESC, id`,
    )
    .all()
    .map((item) => ({ ...item, number: Number(item.number) }))
  const counter = database.prepare(`SELECT value FROM meta WHERE key = 'next_doc_number'`).get()
  return {
    groups,
    devices,
    maintenances,
    documentation,
    nextDocNumber: Number(counter?.value ?? 1),
  }
}

export function writeState(database, state) {
  if (!isState(state)) {
    throw new Error('Ungültige Daten')
  }

  const insertGroup = database.prepare(
    'INSERT INTO groups (id, name, position) VALUES (?, ?, ?)',
  )
  const insertDevice = database.prepare(
    'INSERT INTO devices (id, group_id, name, notes, position) VALUES (?, ?, ?, ?, ?)',
  )
  const insertMaintenance = database.prepare(
    `INSERT INTO maintenances (id, device_id, due_date, interval_weeks, description)
     VALUES (?, ?, ?, ?, ?)`,
  )
  const insertDocumentation = database.prepare(
    `INSERT INTO documentation
       (id, device_id, maintenance_id, date, number, user_name, description)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  const saveCounter = database.prepare(
    `INSERT INTO meta (key, value) VALUES ('next_doc_number', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  )

  database.exec('BEGIN IMMEDIATE')
  try {
    database.exec(`
      DELETE FROM documentation;
      DELETE FROM maintenances;
      DELETE FROM devices;
      DELETE FROM groups;
    `)
    state.groups.forEach((group, index) => {
      insertGroup.run(String(group.id), String(group.name ?? '').trim(), index)
    })
    state.devices.forEach((device, index) => {
      insertDevice.run(
        String(device.id),
        String(device.groupId),
        String(device.name ?? '').trim(),
        String(device.notes ?? ''),
        index,
      )
    })
    for (const item of state.maintenances) {
      insertMaintenance.run(
        String(item.id),
        String(item.deviceId),
        String(item.dueDate),
        Number(item.intervalWeeks),
        String(item.description ?? '').trim(),
      )
    }
    for (const entry of state.documentation) {
      insertDocumentation.run(
        String(entry.id),
        String(entry.deviceId),
        entry.maintenanceId ? String(entry.maintenanceId) : null,
        String(entry.date),
        Number(entry.number),
        String(entry.userName ?? ''),
        String(entry.description ?? ''),
      )
    }
    saveCounter.run(String(state.nextDocNumber))
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}
