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
  todayISO,
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

test('marking a maintenance writes documentation and moves the due date', () => {
  const db = createSeedDb(new Date(2026, 9, 1))
  const user = { name: 'Anna Berger', role: 'standard' }
  const result = markPerformed(db, 'm-klima', user, today)
  assert.equal(result.ok, true)
  assert.equal(result.entry.number, 2)
  assert.equal(result.entry.userName, 'Anna Berger')
  assert.equal(result.entry.date, today)
  const updated = result.db.maintenances.find((item) => item.id === 'm-klima')
  assert.equal(updated.dueDate, '2027-01-21')
  assert.equal(result.db.documentation[0].description, 'Filter wechseln')
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
  })
  assert.equal(added.ok, true)
  assert.equal(added.db.maintenances.at(-1).description, 'Kabel prüfen')

  const device = addDevice(db, 'g-haus', 'Kasse')
  assert.equal(device.ok, true)
  const removed = deleteDevice(device.db, 'd-klima')
  assert.equal(removed.devices.some((item) => item.id === 'd-klima'), false)
  assert.equal(removed.maintenances.some((item) => item.deviceId === 'd-klima'), false)
})

test('today uses the local calendar date', () => {
  assert.equal(todayISO(new Date(2026, 9, 1)), '2026-10-01')
})
