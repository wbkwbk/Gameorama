import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addDevice,
  addMaintenance,
  copyMaintenance,
  createSeedDb,
  deleteDevice,
  deviceStatus,
  dueLevel,
  markPerformed,
  moveDevice,
  moveMaintenance,
  nextFreeDeviceNumber,
  renameGroup,
  sortDevices,
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

test('device lists sort by urgency and then by name', () => {
  const devices = [
    { id: 'zulu', name: 'Zulu' },
    { id: 'alpha', name: 'Alpha' },
    { id: 'mitte', name: 'Mitte' },
    { id: 'bald', name: 'Bald' },
    { id: 'gruen', name: 'Grün' },
    { id: 'apfel', name: 'Apfel' },
    { id: 'ohne', name: 'ohne Gerät' },
    { id: 'zebra', name: 'Zebra' },
    { id: 'frueh', name: 'Früh' },
  ]
  const maintenances = [
    { id: '1', deviceId: 'zulu', dueDate: '2026-08-01', status: 'offen' },
    { id: '2', deviceId: 'alpha', dueDate: '2026-09-20', status: 'offen' },
    { id: '3', deviceId: 'mitte', dueDate: '2026-10-02', status: 'offen' },
    { id: '4', deviceId: 'bald', dueDate: '2026-10-08', status: 'offen' },
    { id: '5', deviceId: 'gruen', dueDate: '2026-11-01', status: 'offen' },
    { id: '6', deviceId: 'apfel', dueDate: '2026-12-01', status: 'offen' },
    { id: '7', deviceId: 'frueh', dueDate: '2026-12-20', status: 'offen' },
    { id: '8', deviceId: 'frueh', dueDate: '2026-09-01', status: 'offen' },
    { id: '9', deviceId: 'zebra', dueDate: '2026-01-01', status: 'erledigt' },
  ]
  assert.deepEqual(
    sortDevices(devices, maintenances, today, 'due').map((device) => device.id),
    ['alpha', 'frueh', 'zulu', 'bald', 'mitte', 'apfel', 'gruen', 'ohne', 'zebra'],
  )
  assert.deepEqual(
    sortDevices(devices, maintenances, today).map((device) => device.name),
    ['Alpha', 'Früh', 'Zulu', 'Bald', 'Mitte', 'Apfel', 'Grün', 'ohne Gerät', 'Zebra'],
  )
  const byName = sortDevices(devices, maintenances, today, 'name-asc').map((device) => device.id)
  assert.deepEqual(byName, ['alpha', 'apfel', 'bald', 'frueh', 'gruen', 'mitte', 'ohne', 'zebra', 'zulu'])
  assert.deepEqual(
    sortDevices(devices, maintenances, today, 'name-desc').map((device) => device.id),
    byName.slice().reverse(),
  )
  assert.deepEqual(
    sortDevices(
      [{ id: 'b', name: 'beta' }, { id: 'a', name: 'Alpha' }],
      [],
      today,
      'name-asc',
    ).map((device) => device.id),
    ['a', 'b'],
  )
  assert.deepEqual(devices.map((device) => device.id)[0], 'zulu')
})

test('rename group and move device keep the maintenance records', () => {
  const db = createSeedDb(new Date(2026, 9, 1))
  const renamed = renameGroup(db, 'g-arcade', '  Spielautomaten  ')
  assert.equal(renamed.ok, true)
  assert.equal(renamed.db.groups.find((group) => group.id === 'g-arcade').name, 'Spielautomaten')
  assert.equal(renamed.db.maintenances.length, db.maintenances.length)
  assert.equal(renamed.db.devices.find((device) => device.id === 'd-flipper').groupId, 'g-arcade')
  assert.equal(renameGroup(db, 'g-arcade', '   ').ok, false)
  assert.equal(renameGroup(db, 'missing', 'Lager').ok, false)

  const moved = moveDevice(renamed.db, 'd-flipper', 'g-haus')
  assert.equal(moved.ok, true)
  assert.equal(moved.db.devices.find((device) => device.id === 'd-flipper').groupId, 'g-haus')
  assert.equal(moved.db.maintenances.filter((item) => item.deviceId === 'd-flipper').length, 2)
  assert.equal(moved.db.maintenances.find((item) => item.id === 'm-flipper-oil').description, 'Mechanik ölen und Kugeln prüfen')
  assert.equal(moveDevice(db, 'missing', 'g-haus').ok, false)
  assert.equal(moveDevice(db, 'd-flipper', 'missing').ok, false)
  assert.equal(db.devices.find((device) => device.id === 'd-flipper').groupId, 'g-arcade')
})

test('move maintenance keeps completion state and leaves the source device', () => {
  const db = createSeedDb(new Date(2026, 9, 1))
  const done = markPerformed(db, 'm-klima', { name: 'Anna Berger' }, today)
  const moved = moveMaintenance(done.db, 'm-klima', 'd-vr')
  assert.equal(moved.ok, true)
  const item = moved.db.maintenances.find((entry) => entry.id === 'm-klima')
  assert.equal(item.deviceId, 'd-vr')
  assert.equal(item.status, 'erledigt')
  assert.equal(item.performedBy, 'Anna Berger')
  assert.equal(item.completedAt, today)
  assert.equal(item.dueDate, done.db.maintenances.find((entry) => entry.id === 'm-klima').dueDate)
  assert.equal(moved.db.maintenances.filter((entry) => entry.deviceId === 'd-klima').length, 0)
  assert.equal(moveMaintenance(db, 'missing', 'd-vr').ok, false)
  assert.equal(moveMaintenance(db, 'm-klima', 'missing').ok, false)
})

test('copy maintenance is offen and does not copy performed-by', () => {
  const db = createSeedDb(new Date(2026, 9, 1))
  const done = markPerformed(db, 'm-flipper-oil', { name: 'Anna Berger' }, today)
  const source = done.db.maintenances.find((item) => item.id === 'm-flipper-oil')
  const copied = copyMaintenance(done.db, 'm-flipper-oil', 'd-dance', 'Jonas Keller', '2026-10-02T12:00:00.000Z')
  assert.equal(copied.ok, true)
  const copy = copied.db.maintenances.find((item) => item.createdAt === '2026-10-02T12:00:00.000Z')
  assert.equal(copy.status, 'offen')
  assert.equal(copy.performedBy, '')
  assert.equal(copy.completedAt, null)
  assert.equal(copy.createdBy, 'Jonas Keller')
  assert.equal(copy.deviceId, 'd-dance')
  assert.equal(copy.dueDate, source.dueDate)
  assert.equal(copy.intervalWeeks, source.intervalWeeks)
  assert.equal(copy.description, source.description)
  assert.equal(copy.detail, source.detail)
  assert.notEqual(copy.id, source.id)
  const still = copied.db.maintenances.find((item) => item.id === source.id)
  assert.equal(still.status, 'erledigt')
  assert.equal(still.performedBy, 'Anna Berger')
  assert.equal(still.deviceId, 'd-flipper')
  assert.equal(copied.db.maintenances.length, done.db.maintenances.length + 1)
  assert.equal(copyMaintenance(done.db, 'm-flipper-oil', 'd-dance', '   ').ok, false)
})

test('today uses the local calendar date', () => {
  assert.equal(todayISO(new Date(2026, 9, 1)), '2026-10-01')
})
