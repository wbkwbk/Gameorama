import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createSeedDb } from '../src/model.js'

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
`

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
  return database
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
