import { randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createSeedDb, formatISODate, prepareDeviceNumbers } from '../src/model.js'
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
  number INTEGER,
  FOREIGN KEY (group_id) REFERENCES groups(id)
);
CREATE TABLE IF NOT EXISTS maintenances (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  due_date TEXT NOT NULL,
  interval_weeks INTEGER NOT NULL,
  description TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'offen',
  performed_by TEXT NOT NULL DEFAULT '',
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (device_id) REFERENCES devices(id)
);
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime_type TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS documents_owner_idx ON documents(owner_id);
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
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (username) REFERENCES users(username) ON UPDATE CASCADE ON DELETE CASCADE
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

function tableColumns(database, table) {
  return new Set(database.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name))
}

function ensureColumn(database, table, name, definition) {
  if (!tableColumns(database, table).has(name)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`)
  }
}

const uploadRoots = new WeakMap()

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024

const ALLOWED_TYPES = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  txt: 'text/plain',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

const INLINE_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
])

export function uploadsDirectory(database) {
  const directory = uploadRoots.get(database)
  if (!directory) throw new Error('Upload-Ordner fehlt')
  return directory
}

export function describeUpload(filename) {
  const originalName = String(filename ?? '').trim()
  if (!originalName || originalName.length > 180) throw new Error('Dateiname fehlt')
  if (
    /[\\/\0]/.test(originalName) ||
    originalName.includes('..') ||
    path.basename(originalName) !== originalName
  ) {
    throw new Error('Ungültiger Dateiname')
  }
  const extension = originalName.includes('.') ? originalName.split('.').pop().toLowerCase() : ''
  const mimeType = ALLOWED_TYPES[extension]
  if (!mimeType) throw new Error('Dieser Dateityp ist nicht erlaubt.')
  return {
    originalName,
    mimeType,
    storedExt: extension === 'jpeg' ? 'jpg' : extension,
  }
}

export function resolveUploadPath(directory, storedName) {
  const name = String(storedName ?? '')
  if (!/^[a-f0-9]{32}\.(pdf|png|jpg|webp|txt|doc|docx|xlsx)$/.test(name)) {
    throw new Error('Ungültiger Dateiname')
  }
  const root = path.resolve(directory)
  const full = path.resolve(root, name)
  if (path.dirname(full) !== root) throw new Error('Ungültiger Dateiname')
  return full
}

export function contentDisposition(originalName, mimeType) {
  const kind = INLINE_TYPES.has(mimeType) ? 'inline' : 'attachment'
  const fallback = originalName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_')
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(originalName)}`
}

function publicDocument(row) {
  return {
    id: row.id,
    ownerId: row.ownerId,
    originalName: row.originalName,
    mimeType: row.mimeType,
  }
}

export function listDocuments(database, ownerId = '') {
  const owner = String(ownerId ?? '').trim()
  const rows = owner
    ? database
        .prepare(
          `SELECT id, owner_id AS ownerId, original_name AS originalName, mime_type AS mimeType
           FROM documents WHERE owner_id = ? ORDER BY rowid`,
        )
        .all(owner)
    : database
        .prepare(
          `SELECT id, owner_id AS ownerId, original_name AS originalName, mime_type AS mimeType
           FROM documents ORDER BY rowid`,
        )
        .all()
  return rows.map(publicDocument)
}

export function saveDocument(database, { ownerId, filename, bytes }) {
  const owner = String(ownerId ?? '').trim()
  if (!/^[A-Za-z0-9_-]+$/.test(owner)) throw new Error('Ungültiger Bezug')
  const device = database.prepare('SELECT id FROM devices WHERE id = ?').get(owner)
  const maintenance = database.prepare('SELECT id FROM maintenances WHERE id = ?').get(owner)
  if (!device && !maintenance) throw new Error('Das Gerät oder die Wartung gibt es nicht mehr.')
  if (!Buffer.isBuffer(bytes)) throw new Error('Datei fehlt')
  if (bytes.length > MAX_UPLOAD_BYTES) throw new Error('Die Datei ist zu gross. Maximal 15 MB.')
  const { originalName, mimeType, storedExt } = describeUpload(filename)
  const id = randomUUID()
  const storedName = `${randomBytes(16).toString('hex')}.${storedExt}`
  const directory = uploadsDirectory(database)
  mkdirSync(directory, { recursive: true })
  const full = resolveUploadPath(directory, storedName)
  writeFileSync(full, bytes)
  try {
    database
      .prepare(
        `INSERT INTO documents (id, owner_id, original_name, stored_name, mime_type)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, owner, originalName, storedName, mimeType)
  } catch (error) {
    try {
      unlinkSync(full)
    } catch {
      // Die Datei bleibt sonst neben einer fehlgeschlagenen Zeile liegen.
    }
    throw error
  }
  return { id, ownerId: owner, originalName, mimeType }
}

export function readDocumentFile(database, id) {
  const clean = String(id ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(clean)) return null
  const row = database
    .prepare(
      `SELECT id, owner_id AS ownerId, original_name AS originalName,
              stored_name AS storedName, mime_type AS mimeType
       FROM documents WHERE id = ?`,
    )
    .get(clean)
  if (!row) return null
  return {
    ...publicDocument(row),
    path: resolveUploadPath(uploadsDirectory(database), row.storedName),
  }
}

export function deleteDocument(database, id) {
  const found = readDocumentFile(database, id)
  if (!found) throw new Error('Dokument nicht gefunden')
  database.prepare('DELETE FROM documents WHERE id = ?').run(found.id)
  try {
    unlinkSync(found.path)
  } catch {
    // Die Zeile ist weg, auch wenn die Datei schon fehlte.
  }
}

function pruneDocuments(database, state) {
  const keep = new Set([
    ...state.devices.map((device) => String(device.id)),
    ...state.maintenances.map((item) => String(item.id)),
  ])
  const rows = database
    .prepare('SELECT id, owner_id AS ownerId, stored_name AS storedName FROM documents')
    .all()
  const stale = rows.filter((row) => !keep.has(String(row.ownerId)))
  if (stale.length === 0) return
  const remove = database.prepare('DELETE FROM documents WHERE id = ?')
  const directory = uploadsDirectory(database)
  for (const row of stale) {
    remove.run(row.id)
    try {
      unlinkSync(resolveUploadPath(directory, row.storedName))
    } catch {
      // Eine fehlende Datei blockiert das Entfernen der Zeile nicht.
    }
  }
}

function migrate(database) {
  ensureColumn(database, 'devices', 'number', 'INTEGER')
  const rows = database.prepare('SELECT id, number FROM devices ORDER BY position, id').all()
  const used = new Set()
  for (const row of rows) {
    const number = Number(row.number)
    if (Number.isInteger(number) && number > 0) used.add(number)
  }
  const updateNumber = database.prepare('UPDATE devices SET number = ? WHERE id = ?')
  for (const row of rows) {
    const number = Number(row.number)
    if (Number.isInteger(number) && number > 0) continue
    let candidate = 1
    while (used.has(candidate)) candidate += 1
    updateNumber.run(candidate, row.id)
    used.add(candidate)
  }
  database.exec('CREATE UNIQUE INDEX IF NOT EXISTS devices_number_unique ON devices(number)')

  ensureColumn(database, 'maintenances', 'detail', "TEXT NOT NULL DEFAULT ''")
  database.prepare(`UPDATE maintenances SET detail = '' WHERE detail IS NULL`).run()
  ensureColumn(database, 'maintenances', 'created_by', "TEXT NOT NULL DEFAULT ''")
  ensureColumn(database, 'maintenances', 'status', "TEXT NOT NULL DEFAULT 'offen'")
  ensureColumn(database, 'maintenances', 'performed_by', "TEXT NOT NULL DEFAULT ''")
  ensureColumn(database, 'maintenances', 'completed_at', 'TEXT')
  ensureColumn(database, 'maintenances', 'created_at', "TEXT NOT NULL DEFAULT ''")
  const missingCreated = database
    .prepare(
      `SELECT id, rowid AS rowid FROM maintenances
       WHERE created_at IS NULL OR created_at = ''
       ORDER BY rowid`,
    )
    .all()
  const updateCreated = database.prepare('UPDATE maintenances SET created_at = ? WHERE id = ?')
  for (const row of missingCreated) {
    updateCreated.run(new Date(Date.UTC(2020, 0, 1, 0, 0, Number(row.rowid))).toISOString(), row.id)
  }
  database.prepare(`UPDATE maintenances SET status = 'offen' WHERE status IS NULL OR status = ''`).run()
  database.prepare(`UPDATE maintenances SET performed_by = '' WHERE performed_by IS NULL`).run()
  database.prepare(`UPDATE maintenances SET created_by = '' WHERE created_by IS NULL`).run()
}

export function openDatabase(filePath) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  const database = new DatabaseSync(filePath)
  database.exec('PRAGMA foreign_keys = ON')
  database.exec(SCHEMA)
  migrate(database)
  const uploads = path.join(path.dirname(path.resolve(filePath)), 'uploads')
  mkdirSync(uploads, { recursive: true })
  uploadRoots.set(database, uploads)
  const seeded = database.prepare(`SELECT value FROM meta WHERE key = 'seeded'`).get()
  if (!seeded) {
    seedState(database, createSeedDb())
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

function cleanUserFields({ username, name, role, comment = '' }) {
  const cleanName = String(username ?? '').trim()
  const cleanDisplay = String(name ?? '').trim()
  const cleanRole = role === 'super' ? 'super' : role === 'standard' ? 'standard' : ''
  const cleanComment = String(comment ?? '')
  if (!cleanName) throw new Error('Benutzername fehlt')
  if (cleanName.includes('/')) throw new Error('Benutzername darf kein / enthalten')
  if (!cleanDisplay) throw new Error('Name fehlt')
  if (!cleanRole) throw new Error('Rolle muss standard oder super sein')
  return { username: cleanName, name: cleanDisplay, role: cleanRole, comment: cleanComment }
}

function passwordHashForSave(password, existingHash) {
  if (password == null || password === '') {
    if (!existingHash) throw new Error('Passwort fehlt')
    return existingHash
  }
  if (typeof password !== 'string') throw new Error('Passwort fehlt')
  return hashPassword(password)
}

function assertRoleChangeAllowed(database, currentRole, nextRole) {
  if (currentRole === 'super' && nextRole !== 'super') {
    const supers = database.prepare(`SELECT COUNT(*) AS count FROM users WHERE role = 'super'`).get()
    if (Number(supers.count) <= 1) {
      throw new Error('Der letzte Super Benutzer kann nicht herabgestuft werden')
    }
  }
}

export function saveUser(database, { username, password, name, role, comment = '' }) {
  const fields = cleanUserFields({ username, name, role, comment })
  const existing = database
    .prepare('SELECT password_hash, role FROM users WHERE username = ?')
    .get(fields.username)
  if (existing) assertRoleChangeAllowed(database, existing.role, fields.role)
  const hash = passwordHashForSave(password, existing?.password_hash)
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
    .run(fields.username, hash, fields.name, fields.role, fields.comment)
  return publicUser(
    database
      .prepare('SELECT username, name, role, comment FROM users WHERE username = ?')
      .get(fields.username),
  )
}

export function updateUser(database, currentUsername, fields) {
  const current = String(currentUsername ?? '').trim()
  const existing = database
    .prepare('SELECT username, password_hash, role FROM users WHERE username = ?')
    .get(current)
  if (!existing) throw new Error('Benutzer nicht gefunden')

  const next = cleanUserFields(fields)
  if (next.username !== current) {
    const clash = database.prepare('SELECT username FROM users WHERE username = ?').get(next.username)
    if (clash) throw new Error('Dieser Benutzername ist bereits vergeben')
  }
  assertRoleChangeAllowed(database, existing.role, next.role)
  const hash = passwordHashForSave(fields.password, existing.password_hash)

  database.exec('BEGIN IMMEDIATE')
  try {
    const result = database
      .prepare(
        `UPDATE users
         SET username = ?, password_hash = ?, name = ?, role = ?, comment = ?
         WHERE username = ?`,
      )
      .run(next.username, hash, next.name, next.role, next.comment, current)
    if (result.changes === 0) throw new Error('Benutzer nicht gefunden')
    if (next.username !== current) {
      database.prepare('UPDATE sessions SET username = ? WHERE username = ?').run(next.username, current)
    }
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }

  return publicUser(
    database
      .prepare('SELECT username, name, role, comment FROM users WHERE username = ?')
      .get(next.username),
  )
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
  database.exec('BEGIN IMMEDIATE')
  try {
    const existing = database.prepare('SELECT role FROM users WHERE username = ?').get(cleanName)
    if (!existing) throw new Error('Benutzer nicht gefunden')
    if (existing.role === 'super') {
      const supers = database.prepare(`SELECT COUNT(*) AS count FROM users WHERE role = 'super'`).get()
      if (Number(supers.count) <= 1) throw new Error('Der letzte Super Benutzer kann nicht gelöscht werden')
    }
    database.prepare('DELETE FROM sessions WHERE username = ?').run(cleanName)
    database.prepare('DELETE FROM users WHERE username = ?').run(cleanName)
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

export function createSession(database, username) {
  const token = randomBytes(32).toString('hex')
  database
    .prepare('INSERT INTO sessions (token, username, created_at) VALUES (?, ?, ?)')
    .run(token, username, new Date().toISOString())
  return token
}

export function deleteSession(database, token) {
  if (!token) return
  database.prepare('DELETE FROM sessions WHERE token = ?').run(String(token))
}

export function sessionUser(database, token) {
  if (!token) return null
  const row = database
    .prepare(
      `SELECT u.username AS username, u.name AS name, u.role AS role, u.comment AS comment
       FROM sessions s
       JOIN users u ON u.username = s.username
       WHERE s.token = ?`,
    )
    .get(String(token))
  return row ? publicUser(row) : null
}

export function readState(database) {
  const groups = database.prepare('SELECT id, name FROM groups ORDER BY position, id').all()
  const devices = database
    .prepare(
      'SELECT id, group_id AS groupId, name, notes, number FROM devices ORDER BY position, id',
    )
    .all()
    .map((device) => ({ ...device, number: Number(device.number) }))
  const maintenances = database
    .prepare(
      `SELECT id, device_id AS deviceId, due_date AS dueDate,
              interval_weeks AS intervalWeeks, description, detail,
              created_by AS createdBy, status, performed_by AS performedBy,
              completed_at AS completedAt, created_at AS createdAt
       FROM maintenances ORDER BY due_date, id`,
    )
    .all()
    .map((item) => ({
      ...item,
      intervalWeeks: Number(item.intervalWeeks),
      detail: item.detail || '',
      createdBy: item.createdBy || '',
      status: item.status === 'erledigt' ? 'erledigt' : 'offen',
      performedBy: item.performedBy || '',
      completedAt: item.completedAt || null,
      createdAt: item.createdAt || '',
    }))
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

function completionDate(value) {
  const text = String(value ?? '')
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  return formatISODate(new Date())
}

function trustedMaintenance(item) {
  const done = item.status === 'erledigt'
  return {
    id: String(item.id),
    deviceId: String(item.deviceId),
    dueDate: String(item.dueDate),
    intervalWeeks: Number(item.intervalWeeks),
    description: String(item.description ?? '').trim(),
    detail: String(item.detail ?? ''),
    createdBy: String(item.createdBy ?? ''),
    status: done ? 'erledigt' : 'offen',
    performedBy: done ? String(item.performedBy ?? '') : '',
    completedAt: done && item.completedAt ? String(item.completedAt).slice(0, 10) : null,
    createdAt: String(item.createdAt || new Date().toISOString()),
  }
}

function editableDetail(item, previousDetail, actor) {
  if (actor?.role === 'super' && item.detail != null) return String(item.detail)
  return String(previousDetail ?? '')
}

function mergeMaintenances(incoming, previous, actor) {
  const previousById = new Map(previous.map((item) => [String(item.id), item]))
  return incoming.map((item) => {
    const prev = previousById.get(String(item.id))
    if (!prev) {
      if (!actor || actor.role !== 'super') throw new Error('Keine Berechtigung')
      return {
        id: String(item.id),
        deviceId: String(item.deviceId),
        dueDate: String(item.dueDate),
        intervalWeeks: Number(item.intervalWeeks),
        description: String(item.description ?? '').trim(),
        detail: String(item.detail ?? ''),
        createdBy: actor.name,
        status: 'offen',
        performedBy: '',
        completedAt: null,
        createdAt: new Date().toISOString(),
      }
    }
    const detail = editableDetail(item, prev.detail, actor)
    const wasDone = prev.status === 'erledigt'
    if (!wasDone && item.status === 'erledigt') {
      if (!actor) throw new Error('Keine Berechtigung')
      return {
        id: prev.id,
        deviceId: prev.deviceId,
        dueDate: prev.dueDate,
        intervalWeeks: prev.intervalWeeks,
        description: prev.description,
        detail,
        createdBy: prev.createdBy,
        status: 'erledigt',
        performedBy: actor.name,
        completedAt: completionDate(item.completedAt),
        createdAt: prev.createdAt,
      }
    }
    return {
      id: prev.id,
      deviceId: String(item.deviceId),
      dueDate: wasDone ? prev.dueDate : String(item.dueDate),
      intervalWeeks: wasDone ? prev.intervalWeeks : Number(item.intervalWeeks),
      description: wasDone ? prev.description : String(item.description ?? '').trim(),
      detail,
      createdBy: prev.createdBy,
      status: wasDone ? 'erledigt' : 'offen',
      performedBy: wasDone ? prev.performedBy : '',
      completedAt: wasDone ? prev.completedAt : null,
      createdAt: prev.createdAt,
    }
  })
}

function preserveNotes(devices, previousDevices, actor) {
  if (actor?.role === 'super') return devices
  const previousNotes = new Map(
    previousDevices.map((device) => [String(device.id), String(device.notes ?? '')]),
  )
  return devices.map((device) => ({
    ...device,
    notes: previousNotes.has(String(device.id)) ? previousNotes.get(String(device.id)) : '',
  }))
}

function persistState(database, state) {
  const insertGroup = database.prepare(
    'INSERT INTO groups (id, name, position) VALUES (?, ?, ?)',
  )
  const insertDevice = database.prepare(
    'INSERT INTO devices (id, group_id, name, notes, position, number) VALUES (?, ?, ?, ?, ?, ?)',
  )
  const insertMaintenance = database.prepare(
    `INSERT INTO maintenances (
       id, device_id, due_date, interval_weeks, description, detail,
       created_by, status, performed_by, completed_at, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        Number(device.number),
      )
    })
    for (const item of state.maintenances) {
      insertMaintenance.run(
        String(item.id),
        String(item.deviceId),
        String(item.dueDate),
        Number(item.intervalWeeks),
        String(item.description ?? '').trim(),
        String(item.detail ?? ''),
        String(item.createdBy ?? ''),
        item.status === 'erledigt' ? 'erledigt' : 'offen',
        String(item.performedBy ?? ''),
        item.completedAt ? String(item.completedAt) : null,
        String(item.createdAt ?? ''),
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

function seedState(database, state) {
  if (!isState(state)) throw new Error('Ungültige Daten')
  persistState(database, {
    ...state,
    devices: prepareDeviceNumbers(state.devices),
    maintenances: state.maintenances.map(trustedMaintenance),
  })
}

function assertGroupAndAssignmentRights(previous, state, actor) {
  const superUser = actor?.role === 'super'
  const previousGroups = new Map(
    previous.groups.map((group) => [String(group.id), String(group.name ?? '').trim()]),
  )
  for (const group of state.groups) {
    const id = String(group.id)
    const name = String(group.name ?? '').trim()
    if (!previousGroups.has(id) || previousGroups.get(id) === name) continue
    if (!superUser) throw new Error('Keine Berechtigung')
    if (!name) throw new Error('Bitte einen Gruppennamen angeben.')
  }

  const groupIds = new Set(state.groups.map((group) => String(group.id)))
  const previousDevices = new Map(
    previous.devices.map((device) => [String(device.id), String(device.groupId)]),
  )
  for (const device of state.devices) {
    const id = String(device.id)
    const groupId = String(device.groupId)
    if (!previousDevices.has(id) || previousDevices.get(id) === groupId) continue
    if (!superUser) throw new Error('Keine Berechtigung')
    if (!groupIds.has(groupId)) throw new Error('Die Gruppe gibt es nicht mehr.')
  }

  const deviceIds = new Set(state.devices.map((device) => String(device.id)))
  const previousMaintenances = new Map(
    previous.maintenances.map((item) => [String(item.id), String(item.deviceId)]),
  )
  for (const item of state.maintenances) {
    const id = String(item.id)
    const deviceId = String(item.deviceId)
    if (!previousMaintenances.has(id) || previousMaintenances.get(id) === deviceId) continue
    if (!superUser) throw new Error('Keine Berechtigung')
    if (!deviceIds.has(deviceId)) throw new Error('Das Gerät gibt es nicht mehr.')
  }
}

export function writeState(database, state, actor = null) {
  if (!isState(state)) throw new Error('Ungültige Daten')
  const previous = readState(database)
  assertGroupAndAssignmentRights(previous, state, actor)
  const next = {
    ...state,
    devices: preserveNotes(prepareDeviceNumbers(state.devices), previous.devices, actor),
    maintenances: mergeMaintenances(state.maintenances, previous.maintenances, actor),
  }
  persistState(database, next)
  pruneDocuments(database, next)
}
