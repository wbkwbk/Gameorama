import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addDevice,
  addGroup,
  addMaintenance,
  addWeeks,
  copyMaintenance,
  createSeedDb,
  deleteDevice,
  deleteGroup,
  deviceStatus,
  dueLevel,
  markPerformed,
  moveDevice,
  moveMaintenance,
  maintenanceEditError,
  maintenanceEditFields,
  nextFreeDeviceNumber,
  openMaintenances,
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

test('Durchgeführt sets erledigt, creates an open copy, and leaves erledigt out of the open list', () => {
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
  assert.equal(updated.intervalWeeks, original.intervalWeeks)
  assert.equal(updated.description, original.description)
  assert.equal(updated.detail, original.detail)
  assert.equal(updated.createdBy, original.createdBy)
  assert.equal(result.db.documentation.length, db.documentation.length)
  assert.equal(result.db.nextDocNumber, db.nextDocNumber)
  assert.equal(result.db.maintenances.length, db.maintenances.length + 1)

  const open = openMaintenances(result.db.maintenances, 'd-klima')
  assert.equal(open.length, 1)
  assert.equal(open.some((item) => item.status === 'erledigt'), false)
  const copy = open[0]
  assert.notEqual(copy.id, original.id)
  assert.equal(copy.status, 'offen')
  assert.equal(copy.performedBy, '')
  assert.equal(copy.completedAt, null)
  assert.equal(copy.createdBy, 'Anna Berger')
  assert.equal(copy.deviceId, 'd-klima')
  assert.equal(copy.dueDate, addWeeks(original.dueDate, original.intervalWeeks))
  assert.equal(copy.intervalWeeks, original.intervalWeeks)
  assert.equal(copy.description, original.description)
  assert.equal(copy.detail, original.detail)
  assert.deepEqual(
    sortedDocumentation(result.db.maintenances, 'd-klima').map((item) => item.id),
    ['m-klima'],
  )
  assert.equal(deviceStatus('d-klima', result.db.maintenances, today).dueDate, copy.dueDate)
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
  const doneKlima = {
    ...device.db,
    maintenances: device.db.maintenances.map((item) =>
      item.deviceId === 'd-klima' ? { ...item, status: 'erledigt' } : item,
    ),
  }
  const removed = deleteDevice(doneKlima, 'd-klima')
  assert.equal(removed.ok, true)
  assert.equal(removed.db.devices.some((item) => item.id === 'd-klima'), false)
  assert.equal(removed.db.maintenances.some((item) => item.deviceId === 'd-klima'), false)
  assert.equal(nextFreeDeviceNumber(removed.db.devices), 5)
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

test('documentation lists only completed maintenances, newest completion first', () => {
  const maintenances = [
    { id: 'old', deviceId: 'd', status: 'erledigt', completedAt: null, createdAt: '2026-10-01T08:00:00.000Z' },
    { id: 'done-early', deviceId: 'd', status: 'erledigt', completedAt: '2026-10-03', createdAt: '2026-09-01T08:00:00.000Z' },
    { id: 'open-later', deviceId: 'd', status: 'offen', completedAt: null, createdAt: '2026-10-04T10:00:00.000Z' },
    { id: 'done-later', deviceId: 'd', status: 'erledigt', completedAt: '2026-10-04', createdAt: '2026-08-01T08:00:00.000Z' },
    { id: 'other', deviceId: 'other', status: 'erledigt', completedAt: '2026-12-01', createdAt: '2026-01-01T00:00:00.000Z' },
  ]
  assert.deepEqual(
    sortedDocumentation(maintenances, 'd').map((item) => item.id),
    ['done-later', 'done-early', 'old'],
  )
  assert.deepEqual(openMaintenances(maintenances, 'd').map((item) => item.id), ['open-later'])
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

  const edited = updateMaintenanceDetail(added.db, created.id, 'Neuer Beschrieb mit Link.')
  assert.equal(edited.ok, true)
  assert.equal(edited.db.maintenances.find((item) => item.id === created.id).detail, 'Neuer Beschrieb mit Link.')
  assert.equal(edited.db.maintenances.find((item) => item.id === created.id).description, 'Kabel prüfen')

  const performed = markPerformed(edited.db, created.id, { name: 'Anna Berger' }, today)
  assert.equal(performed.ok, true)
  assert.equal(
    performed.db.maintenances.find((item) => item.id === created.id).detail,
    'Neuer Beschrieb mit Link.',
  )
  const blocked = updateMaintenanceDetail(performed.db, created.id, 'Darf nicht mehr geändert werden.')
  assert.equal(blocked.ok, false)
  assert.equal(
    performed.db.maintenances.find((item) => item.id === created.id).detail,
    'Neuer Beschrieb mit Link.',
  )
  const successor = openMaintenances(performed.db.maintenances, 'd-vr').find((item) => item.description === 'Kabel prüfen')
  assert.equal(successor.detail, 'Neuer Beschrieb mit Link.')
  assert.equal(successor.status, 'offen')

  const empty = addMaintenance(db, {
    deviceId: 'd-vr',
    dueDate: '2026-11-02',
    intervalWeeks: 2,
    description: 'Kurz',
    createdBy: 'Jonas Keller',
  })
  assert.equal(empty.db.maintenances.at(-1).detail, '')
})

test('editing a maintenance validates the text fields and does not invent a completion date', () => {
  assert.equal(
    maintenanceEditError({ description: '   ', dueDate: '2026-12-01', intervalWeeks: 2, status: 'offen' }),
    'Bitte eine Wartungsbeschreibung angeben.',
  )
  assert.equal(
    maintenanceEditError({ description: 'Filter prüfen', dueDate: '', intervalWeeks: 2, status: 'offen' }),
    'Bitte ein Fälligkeitsdatum angeben.',
  )
  assert.equal(
    maintenanceEditError({ description: 'Filter prüfen', dueDate: '2026-12-01', intervalWeeks: 0, status: 'offen' }),
    'Das Intervall muss mindestens 1 Woche sein.',
  )
  const done = maintenanceEditFields({
    description: ' Filter prüfen ',
    dueDate: '2026-12-15',
    intervalWeeks: 6,
    detail: 'Neues Filterset.',
    createdBy: 'Mia Frei',
    status: 'erledigt',
    performedBy: 'Lea Sommer',
    completedAt: '2026-10-03',
  })
  assert.equal(done.description, 'Filter prüfen')
  assert.equal(done.detail, 'Neues Filterset.')
  assert.equal(done.createdBy, 'Mia Frei')
  assert.equal(done.performedBy, 'Lea Sommer')
  assert.equal(done.completedAt, '2026-10-03')
  assert.equal(done.status, 'erledigt')
  const open = maintenanceEditFields({ ...done, status: 'offen', completedAt: '' })
  assert.equal(open.status, 'offen')
  assert.equal(open.completedAt, null)
  assert.equal(open.performedBy, 'Lea Sommer')
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

test('device lists sort by number ascending and descending', () => {
  const devices = [
    { id: 'c', name: 'C', number: 12 },
    { id: 'a', name: 'A', number: 2 },
    { id: 'b', name: 'B', number: 2 },
    { id: 'd', name: 'D', number: 7 },
  ]
  assert.deepEqual(
    sortDevices(devices, [], today, 'number-asc').map((device) => device.id),
    ['a', 'b', 'd', 'c'],
  )
  assert.deepEqual(
    sortDevices(devices, [], today, 'number-desc').map((device) => device.id),
    ['c', 'd', 'a', 'b'],
  )
})

test('the next open due date is the completed due date plus the interval', () => {
  assert.equal(addWeeks('2026-10-30', 4), '2026-11-27')
  const db = createSeedDb(new Date(2026, 9, 1))
  const prepared = {
    ...db,
    maintenances: db.maintenances.map((item) =>
      item.id === 'm-klima' ? { ...item, dueDate: '2026-10-30', intervalWeeks: 4 } : item,
    ),
  }
  const result = markPerformed(prepared, 'm-klima', { name: 'Anna Berger' }, '2026-10-02')
  assert.equal(result.ok, true)
  const successor = openMaintenances(result.db.maintenances, 'd-klima')[0]
  assert.equal(successor.status, 'offen')
  assert.equal(successor.dueDate, '2026-11-27')
  assert.equal(successor.intervalWeeks, 4)
  const completed = result.db.maintenances.find((item) => item.id === 'm-klima')
  assert.equal(completed.status, 'erledigt')
  assert.equal(completed.dueDate, '2026-10-30')
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
  const successor = moved.db.maintenances.find((entry) => entry.deviceId === 'd-klima')
  assert.equal(successor.status, 'offen')
  assert.equal(successor.dueDate, addWeeks(item.dueDate, item.intervalWeeks))
  assert.equal(moved.db.maintenances.filter((entry) => entry.deviceId === 'd-klima' && entry.status === 'erledigt').length, 0)
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

test('a group can be deleted only when it has no devices', () => {
  const db = createSeedDb(new Date(2026, 9, 1))
  const blocked = deleteGroup(db, 'g-haus')
  assert.equal(blocked.ok, false)
  assert.equal(blocked.error, 'Die Gruppe kann nicht gelöscht werden, solange sie Geräte enthält.')
  assert.equal(db.groups.some((group) => group.id === 'g-haus'), true)
  assert.equal(db.devices.some((device) => device.groupId === 'g-haus'), true)

  const added = addGroup(db, 'Lager')
  assert.equal(added.ok, true)
  const empty = added.db.groups.find((group) => group.name === 'Lager')
  const removed = deleteGroup(added.db, empty.id)
  assert.equal(removed.ok, true)
  assert.equal(removed.db.groups.some((group) => group.id === empty.id), false)
  assert.equal(removed.db.devices.length, db.devices.length)
  assert.equal(removed.db.groups.some((group) => group.id === 'g-haus'), true)
})

test('a device can be deleted only when its open maintenance list is empty', () => {
  const db = createSeedDb(new Date(2026, 9, 1))
  const blocked = deleteDevice(db, 'd-klima')
  assert.equal(blocked.ok, false)
  assert.equal(blocked.error, 'Das Gerät kann nicht gelöscht werden, solange offene Wartungen vorhanden sind.')
  assert.equal(db.devices.some((device) => device.id === 'd-klima'), true)

  const doneOnly = {
    ...db,
    maintenances: db.maintenances.map((item) =>
      item.deviceId === 'd-klima'
        ? { ...item, status: 'erledigt', performedBy: 'Anna Berger', completedAt: '2026-10-01' }
        : item,
    ),
    documentation: [
      ...db.documentation,
      {
        id: 'doc-klima',
        deviceId: 'd-klima',
        maintenanceId: 'm-klima',
        date: '2026-10-01',
        number: 2,
        userName: 'Anna Berger',
        description: 'Filter wechseln',
      },
    ],
  }
  assert.equal(openMaintenances(doneOnly.maintenances, 'd-klima').length, 0)
  const removed = deleteDevice(doneOnly, 'd-klima')
  assert.equal(removed.ok, true)
  assert.equal(removed.db.devices.some((device) => device.id === 'd-klima'), false)
  assert.equal(removed.db.maintenances.some((item) => item.deviceId === 'd-klima'), false)
  assert.equal(removed.db.documentation.some((item) => item.deviceId === 'd-klima'), false)
  assert.equal(removed.db.documentation.some((item) => item.id === 'doc-1'), true)
  assert.equal(removed.db.devices.some((device) => device.id === 'd-flipper'), true)
})
