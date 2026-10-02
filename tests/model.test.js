import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addDevice,
  addMaintenance,
  createSeedDb,
  deleteDevice,
  deviceStatus,
  dueLevel,
  markPerformed,
  nextFreeDeviceNumber,
  sortedDocumentation,
  todayISO,
  updateMaintenanceDetail,
} from '../src/model.js'

const today = '2026-10-01'

test('color rules follow the sketch', () => {
  assert.equal(dueLevel('2026-09-30', today), 'overdue')
  assert.equal(dueLevel('2026-10-01', today), 'soon')
  assert.equal(dueLevel('2026-10-08', today), 'soon')
  assert.equal(dueLevel('2026-10-09', today), 'ok')
})

test('a device takes the most urgent maintenance', () => {
  const db = createSeedDb(new Date(2026, 9, 1))
  const flipper = deviceStatus('d-flipper', db.maintenances, today)
  assert.equal(flipper.level, 'overdue')
  assert.equal(deviceStatus('d-dance', db.maintenances, today).level, 'soon')
  assert.equal(deviceStatus('d-race', db.maintenances, today).level, 'ok')
})

test('Durchgeführt sets erledigt and performed-by without moving the due date', () => {
  const db = createSeedDb(new Date(2026, 9, 1))
  const user = { name: 'Anna Berger', role: 'standard' }
  const original = db.maintenances.find((item) => item.id === 'm-klima')
  const result = markPerformed(db, 'm-klima', user, today)
  assert.equal(result.ok, true)
  const updated = result.db.maintenances.find((item) => item.id === 'm-klima')
  assert.equal(updated.status, 'erledigt')
  assert.equal(updated.performedBy, 'Anna Berger')
  assert.equal(updated.completedAt, today)
  assert.equal(updated.dueDate, original.dueDate)
  assert.equal(result.db.documentation.length, db.documentation.length)
  assert.equal(result.db.nextDocNumber, db.nextDocNumber)
  assert.equal(deviceStatus('d-klima', result.db.maintenances, today).level, 'none')
  const again = markPerformed(result.db, 'm-klima', user, today)
  assert.equal(again.ok, false)
})

test('super-user maintenance and device changes validate input', () => {
  const db = createSeedDb(new Date(2026, 9, 1))
  const missing = addMaintenance(db, {
    deviceId: 'd-vr',
    dueDate: '',
    intervalWeeks: 0,
    description: '   ',
  })
  assert.equal(missing.ok, false)

  const added = addMaintenance(db, {
    deviceId: 'd-vr',
    dueDate: '2026-11-01',
    intervalWeeks: 2,
    description: 'Kabel prüfen',
    createdBy: 'Jonas Keller',
  })
  assert.equal(added.ok, true)
  const created = added.db.maintenances.at(-1)
  assert.equal(created.description, 'Kabel prüfen')
  assert.equal(created.status, 'offen')
  assert.equal(created.createdBy, 'Jonas Keller')
  assert.equal(created.performedBy, '')
  assert.equal(created.completedAt, null)

  const device = addDevice(db, 'g-haus', 'Kasse', 6)
  assert.equal(device.ok, true)
  assert.equal(device.db.devices.at(-1).number, 6)
  const removed = deleteDevice(device.db, 'd-klima')
  assert.equal(removed.devices.some((item) => item.id === 'd-klima'), false)
  assert.equal(removed.maintenances.some((item) => item.deviceId === 'd-klima'), false)
  assert.equal(nextFreeDeviceNumber(removed.devices), 5)
})

test('next free device number is the smallest missing positive integer', () => {
  assert.equal(nextFreeDeviceNumber([]), 1)
  assert.equal(nextFreeDeviceNumber([{ number: 1 }, { number: 2 }, { number: 4 }]), 3)
  const db = createSeedDb(new Date(2026, 9, 1))
  assert.equal(nextFreeDeviceNumber(db.devices), 6)
})

test('a duplicate device number is rejected', () => {
  const db = createSeedDb(new Date(2026, 9, 1))
  const taken = addDevice(db, 'g-haus', 'Kasse', 1)
  assert.equal(taken.ok, false)
  assert.equal(taken.error, 'Nummer schon vergeben.')
  assert.equal(db.devices.some((device) => device.name === 'Kasse'), false)
  const gap = addDevice(db, 'g-haus', 'Kasse', 3)
  assert.equal(gap.ok, false)
  assert.equal(gap.error, 'Nummer schon vergeben.')
})

test('documentation order is newest completion or creation first', () => {
  const maintenances = [
    { id: 'old', deviceId: 'd', completedAt: null, createdAt: '2026-10-01T08:00:00.000Z' },
    { id: 'done-early', deviceId: 'd', completedAt: '2026-10-03', createdAt: '2026-09-01T08:00:00.000Z' },
    { id: 'open-later', deviceId: 'd', completedAt: null, createdAt: '2026-10-04T10:00:00.000Z' },
    { id: 'done-later', deviceId: 'd', completedAt: '2026-10-04', createdAt: '2026-08-01T08:00:00.000Z' },
    { id: 'other', deviceId: 'other', completedAt: '2026-12-01', createdAt: '2026-01-01T00:00:00.000Z' },
  ]
  assert.deepEqual(
    sortedDocumentation(maintenances, 'd').map((item) => item.id),
    ['done-later', 'open-later', 'done-early', 'old'],
  )
})

test('a maintenance stores Wartungsbeschrieb separately from the short description', () => {
  const db = createSeedDb(new Date(2026, 9, 1))
  const seeded = db.maintenances.find((item) => item.id === 'm-flipper-oil')
  assert.equal(seeded.detail.includes('Schrank A'), true)
  assert.notEqual(seeded.detail, seeded.description)

  const added = addMaintenance(db, {
    deviceId: 'd-vr',
    dueDate: '2026-11-01',
    intervalWeeks: 2,
    description: 'Kabel prüfen',
    detail: 'Stecker lösen und den Kabelzug an der Rückseite prüfen.',
    createdBy: 'Jonas Keller',
  })
  assert.equal(added.ok, true)
  const created = added.db.maintenances.at(-1)
  assert.equal(created.detail, 'Stecker lösen und den Kabelzug an der Rückseite prüfen.')
  assert.notEqual(created.detail, created.description)

  const performed = markPerformed(added.db, created.id, { name: 'Anna Berger' }, today)
  assert.equal(performed.ok, true)
  assert.equal(
    performed.db.maintenances.find((item) => item.id === created.id).detail,
    created.detail,
  )

  const edited = updateMaintenanceDetail(performed.db, created.id, 'Neuer Beschrieb mit Link.')
  assert.equal(edited.ok, true)
  assert.equal(edited.db.maintenances.find((item) => item.id === created.id).detail, 'Neuer Beschrieb mit Link.')
  assert.equal(edited.db.maintenances.find((item) => item.id === created.id).description, 'Kabel prüfen')

  const empty = addMaintenance(db, {
    deviceId: 'd-vr',
    dueDate: '2026-11-02',
    intervalWeeks: 2,
    description: 'Kurz',
    createdBy: 'Jonas Keller',
  })
  assert.equal(empty.db.maintenances.at(-1).detail, '')
})

test('today uses the local calendar date', () => {
  assert.equal(todayISO(new Date(2026, 9, 1)), '2026-10-01')
})
