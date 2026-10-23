export const LEVEL_LABEL = {
  ok: 'Nächste Wartung',
  soon: 'In 1 Woche fällig',
  overdue: 'Überfällig',
  none: 'Keine Wartung',
}

const LEVEL_RANK = { none: 0, ok: 1, soon: 2, overdue: 3 }

export function resolveTaskKind(value, fallback = 'wartung') {
  if (value === 'reparatur' || value === 'wartung') return value
  if (value && typeof value === 'object') {
    if (value.taskKind === 'reparatur' || value.taskKind === 'wartung') return value.taskKind
    if (value.kind === 'reparatur' || value.kind === 'wartung') return value.kind
  }
  return fallback === 'reparatur' ? 'reparatur' : 'wartung'
}

export function taskKind(value) {
  return resolveTaskKind(value, 'wartung')
}

export function isRepair(value) {
  return taskKind(value) === 'reparatur'
}

export function taskKindLabel(value) {
  return isRepair(value) ? 'Reparatur Aufgabe' : 'Wartung'
}

function compareTaskKind(a, b) {
  return (isRepair(a) ? 1 : 0) - (isRepair(b) ? 1 : 0)
}

export function roleLabel(role) {
  return role === 'super' ? 'Super Benutzer' : 'Standard Benutzer'
}

export function performedActionLabel(user) {
  const name = String(user?.name ?? '').trim()
  const username = String(user?.username ?? '').trim()
  const who = name || username
  return who ? `Durchgeführt ${who}` : 'Durchgeführt'
}

export function formatISODate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseISODate(iso) {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function todayISO(now = new Date()) {
  return formatISODate(now)
}

export function addDays(iso, days) {
  const date = parseISODate(iso)
  date.setDate(date.getDate() + days)
  return formatISODate(date)
}

export function addWeeks(iso, weeks) {
  return addDays(iso, weeks * 7)
}

export function formatDisplayDate(iso) {
  return parseISODate(iso).toLocaleDateString('de-CH')
}

export function daysUntil(iso, today) {
  const due = parseISODate(iso).getTime()
  const start = parseISODate(today).getTime()
  return Math.round((due - start) / 86400000)
}

export function dueLevel(iso, today) {
  const days = daysUntil(iso, today)
  if (days < 0) return 'overdue'
  if (days <= 7) return 'soon'
  return 'ok'
}

export function maintenanceStatus(maintenance, today) {
  const level = dueLevel(maintenance.dueDate, today)
  return {
    level,
    label: LEVEL_LABEL[level],
    dueDate: maintenance.dueDate,
  }
}

function compareDeviceNames(a, b) {
  return String(a.name ?? '').localeCompare(String(b.name ?? ''), 'de', { sensitivity: 'accent' })
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function wildcardMatch(value, pattern) {
  const source = pattern.includes('*') ? pattern : `*${pattern}*`
  const expression = source.split('*').map(escapeRegExp).join('.*')
  return new RegExp(`^${expression}$`, 'iu').test(String(value ?? ''))
}

export function deviceMatchesQuery(device, groupName, query) {
  const pattern = String(query ?? '').trim()
  if (pattern === '') return true
  return [device?.name, device?.number, groupName].some((value) => wildcardMatch(value, pattern))
}

function compareDeviceNumbers(a, b) {
  const left = Number(a.number)
  const right = Number(b.number)
  if (Number.isFinite(left) && Number.isFinite(right) && left !== right) return left - right
  return compareDeviceNames(a, b)
}

const URGENCY_ORDER = { overdue: 0, soon: 1, ok: 2, none: 3 }

export function sortDevices(devices, maintenances, today, mode = 'due') {
  const list = devices.slice()
  if (mode === 'name-asc') return list.sort(compareDeviceNames)
  if (mode === 'name-desc') return list.sort((a, b) => compareDeviceNames(b, a))
  if (mode === 'number-asc') return list.sort(compareDeviceNumbers)
  if (mode === 'number-desc') {
    return list.sort((a, b) => {
      const left = Number(a.number)
      const right = Number(b.number)
      if (Number.isFinite(left) && Number.isFinite(right) && left !== right) return right - left
      return compareDeviceNames(a, b)
    })
  }
  if (mode === 'kind') {
    return list.sort((a, b) => {
      const left = leadingOpenTask(a.id, maintenances)
      const right = leadingOpenTask(b.id, maintenances)
      if (!left && !right) return compareDeviceNames(a, b)
      if (left && !right) return -1
      if (!left && right) return 1
      const byKind = compareTaskKind(left, right)
      if (byKind !== 0) return byKind
      const byDate = String(left.dueDate).localeCompare(String(right.dueDate))
      if (byDate !== 0) return byDate
      return compareDeviceNames(a, b)
    })
  }
  return list.sort((a, b) => {
    const left = URGENCY_ORDER[deviceStatus(a.id, maintenances, today).level]
    const right = URGENCY_ORDER[deviceStatus(b.id, maintenances, today).level]
    if (left !== right) return left - right
    return compareDeviceNames(a, b)
  })
}

export function deviceStatus(deviceId, maintenances, today) {
  const items = maintenances.filter(
    (item) => item.deviceId === deviceId && item.status !== 'erledigt',
  )
  if (items.length === 0) {
    return { level: 'none', label: LEVEL_LABEL.none, dueDate: null, description: null, kind: null }
  }

  let worst = null
  for (const item of items) {
    const level = dueLevel(item.dueDate, today)
    const candidate = {
      level,
      label: LEVEL_LABEL[level],
      dueDate: item.dueDate,
      description: item.description,
      kind: taskKind(item),
    }
    if (
      !worst ||
      LEVEL_RANK[level] > LEVEL_RANK[worst.level] ||
      (LEVEL_RANK[level] === LEVEL_RANK[worst.level] && item.dueDate < worst.dueDate)
    ) {
      worst = candidate
    }
  }
  return worst
}

function uid() {
  return crypto.randomUUID()
}

export function nextFreeDeviceNumber(devices) {
  const used = new Set()
  for (const device of devices) {
    const number = Number(device.number)
    if (Number.isInteger(number) && number > 0) used.add(number)
  }
  let candidate = 1
  while (used.has(candidate)) candidate += 1
  return candidate
}

export function prepareDeviceNumbers(devices) {
  const used = new Set()
  return devices.map((device) => {
    const missing = device.number == null || device.number === ''
    const number = Number(device.number)
    if (!missing) {
      if (!Number.isInteger(number) || number < 1) {
        throw new Error('Bitte eine gültige Gerätenummer angeben.')
      }
      if (used.has(number)) throw new Error('Nummer schon vergeben.')
      used.add(number)
      return { ...device, number }
    }
    let candidate = 1
    while (used.has(candidate)) candidate += 1
    used.add(candidate)
    return { ...device, number: candidate }
  })
}

export function documentationTime(item) {
  if (item.completedAt) return `${String(item.completedAt).slice(0, 10)}T23:59:59`
  return String(item.createdAt || '')
}

export function filterByTaskKind(items, filter = 'alle') {
  if (filter === 'wartung') return items.filter((item) => !isRepair(item))
  if (filter === 'reparatur') return items.filter((item) => isRepair(item))
  return items.slice()
}

export function sortOpenMaintenances(items, mode = 'date') {
  return items.slice().sort((a, b) => {
    if (mode === 'kind') {
      const byKind = compareTaskKind(a, b)
      if (byKind !== 0) return byKind
    }
    const byDate = String(a.dueDate).localeCompare(String(b.dueDate))
    if (byDate !== 0) return byDate
    return String(a.id).localeCompare(String(b.id))
  })
}

export function leadingOpenTask(deviceId, maintenances) {
  const open = maintenances.filter((item) => item.deviceId === deviceId && item.status !== 'erledigt')
  return sortOpenMaintenances(open, 'kind')[0] ?? null
}

export function deviceOverviewTasks(deviceId, maintenances, mode = 'date') {
  const sort = mode === 'kind' ? 'kind' : 'date'
  return openMaintenances(maintenances, deviceId, { sort }).map((item) => ({
    id: item.id,
    kind: taskKind(item),
    dueDate: item.dueDate,
    description: item.description || '',
  }))
}

export function openMaintenances(maintenances, deviceId, options = {}) {
  const filter = options.filter ?? 'alle'
  const sort = options.sort ?? 'date'
  const open = maintenances.filter((item) => item.deviceId === deviceId && item.status !== 'erledigt')
  return sortOpenMaintenances(filterByTaskKind(open, filter), sort)
}

export function filterMaintenanceRows(rows, filter = 'alle') {
  return filterByTaskKind(rows, filter)
}

export function sortedDocumentation(maintenances, deviceId) {
  return maintenances
    .filter((item) => item.deviceId === deviceId && item.status === 'erledigt')
    .slice()
    .sort((a, b) => {
      const byTime = documentationTime(b).localeCompare(documentationTime(a))
      if (byTime !== 0) return byTime
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    })
}

function compareOverviewText(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), 'de', { sensitivity: 'accent' })
}

function compareOverviewDueDate(a, b) {
  const left = String(a.dueDate ?? '').trim()
  const right = String(b.dueDate ?? '').trim()
  if (left && right && left !== right) return left < right ? -1 : 1
  if (left && !right) return -1
  if (!left && right) return 1
  return 0
}

function maintenanceStatusLabel(status) {
  if (status === 'erledigt') return 'erledigt'
  if (status === 'dokumentation') return 'Dokumentation'
  return 'offen'
}

function maintenanceRecordRows(db, include) {
  const groups = new Map((db.groups || []).map((group) => [group.id, group]))
  const devices = new Map((db.devices || []).map((device) => [device.id, device]))

  function place(deviceId) {
    const device = devices.get(deviceId)
    const group = device ? groups.get(device.groupId) : null
    return {
      deviceId: device?.id || '',
      groupName: group?.name || '',
      deviceName: device?.name || '',
      deviceNumber: device?.number ?? '',
    }
  }

  return (db.maintenances || []).filter(include).map((item) => {
    const status = item.status === 'erledigt' ? 'erledigt' : 'offen'
    return {
      ...place(item.deviceId),
      id: `maintenance:${item.id}`,
      maintenanceId: item.id,
      kind: 'maintenance',
      taskKind: taskKind(item),
      dueDate: item.dueDate || '',
      intervalWeeks: isRepair(item) ? null : item.intervalWeeks,
      description: item.description || '',
      detail: item.detail || '',
      createdBy: item.createdBy || '',
      status,
      statusLabel: maintenanceStatusLabel(status),
      performedBy: item.performedBy || '',
      completedAt: item.completedAt || '',
      createdAt: item.createdAt || '',
    }
  })
}

export function maintenanceOverviewRows(db) {
  return maintenanceRecordRows(db, (item) => item.status !== 'erledigt')
}

export function completedMaintenanceRows(db) {
  return maintenanceRecordRows(db, (item) => item.status === 'erledigt')
}

export function sortMaintenanceOverview(rows, mode = 'due') {
  const selected = mode === 'group' ? 'group' : mode === 'kind' ? 'kind' : 'due'
  return rows.slice().sort((a, b) => {
    if (selected === 'group') {
      const byGroup = compareOverviewText(a.groupName, b.groupName)
      if (byGroup !== 0) return byGroup
    }
    if (selected === 'kind') {
      const byKind = compareTaskKind(a, b)
      if (byKind !== 0) return byKind
    }
    const byDue = compareOverviewDueDate(a, b)
    if (byDue !== 0) return byDue
    if (selected !== 'group') {
      const byGroup = compareOverviewText(a.groupName, b.groupName)
      if (byGroup !== 0) return byGroup
    }
    const byDevice = compareOverviewText(a.deviceName, b.deviceName)
    if (byDevice !== 0) return byDevice
    const byDescription = compareOverviewText(a.description, b.description)
    if (byDescription !== 0) return byDescription
    return compareOverviewText(a.id, b.id)
  })
}

function completedSortKey(row) {
  const completed = String(row.completedAt ?? '').trim().slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(completed)) return completed
  const due = String(row.dueDate ?? '').trim().slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(due)) return due
  return ''
}

function compareCompletedDate(a, b) {
  const left = completedSortKey(a)
  const right = completedSortKey(b)
  if (left && right && left !== right) return left < right ? 1 : -1
  if (left && !right) return -1
  if (!left && right) return 1
  return 0
}

function compareCompletedIdentity(a, b) {
  const byGroup = compareOverviewText(a.groupName, b.groupName)
  if (byGroup !== 0) return byGroup
  const byDevice = compareOverviewText(a.deviceName, b.deviceName)
  if (byDevice !== 0) return byDevice
  const byDescription = compareOverviewText(a.description, b.description)
  if (byDescription !== 0) return byDescription
  return compareOverviewText(a.id, b.id)
}

export function sortCompletedMaintenances(rows, mode = 'date') {
  const selected = mode === 'group' ? 'group' : mode === 'kind' ? 'kind' : 'date'
  return rows.slice().sort((a, b) => {
    if (selected === 'group') {
      const byGroup = compareOverviewText(a.groupName, b.groupName)
      if (byGroup !== 0) return byGroup
    }
    if (selected === 'kind') {
      const byKind = compareTaskKind(a, b)
      if (byKind !== 0) return byKind
    }
    const byDate = compareCompletedDate(a, b)
    if (byDate !== 0) return byDate
    return compareCompletedIdentity(a, b)
  })
}

export function createSeedDb(now = new Date()) {
  const today = todayISO(now)
  const groups = [
    { id: 'g-arcade', name: 'Arcade-Automaten' },
    { id: 'g-vr', name: 'VR & Konsolen' },
    { id: 'g-haus', name: 'Haustechnik' },
  ]
  const devices = [
    {
      id: 'd-flipper',
      groupId: 'g-arcade',
      number: 1,
      name: 'Flipper «Medieval Madness»',
      notes: 'Handbuch im Schrank A.\nErsatzteile: https://example.com/flipper-teile',
    },
    {
      id: 'd-dance',
      groupId: 'g-arcade',
      number: 2,
      name: 'Tanzautomat «StepX»',
      notes: 'Sensor-Matte erst im März ersetzt.',
    },
    {
      id: 'd-race',
      groupId: 'g-arcade',
      number: 3,
      name: 'Rennsimulator «Grid»',
      notes: 'Kalibrierungsanleitung liegt in der Schublade unter dem Sitz.',
    },
    {
      id: 'd-vr',
      groupId: 'g-vr',
      number: 4,
      name: 'VR-Station «Quest-Raum»',
      notes: 'Brillen nach jeder Schicht desinfizieren.\nhttps://example.com/vr-reinigung',
    },
    {
      id: 'd-klima',
      groupId: 'g-haus',
      number: 5,
      name: 'Klimaanlage Spielhalle',
      notes: 'Filtertyp: F7. Lieferant Meier Gebäudetechnik.',
    },
  ]
  function openMaintenance(fields, ageMs) {
    return {
      detail: '',
      ...fields,
      kind: 'wartung',
      createdBy: 'Jonas Keller',
      status: 'offen',
      performedBy: '',
      completedAt: null,
      createdAt: new Date(now.getTime() - ageMs).toISOString(),
    }
  }
  const maintenances = [
    openMaintenance({
      id: 'm-flipper-oil',
      deviceId: 'd-flipper',
      dueDate: addDays(today, -10),
      intervalWeeks: 12,
      description: 'Mechanik ölen und Kugeln prüfen',
      detail: 'Nur die markierten Lager ölen. Das Handbuch liegt im Schrank A.',
    }, 6 * 86400000),
    openMaintenance({
      id: 'm-flipper-clean',
      deviceId: 'd-flipper',
      dueDate: addDays(today, 21),
      intervalWeeks: 8,
      description: 'Spielfeld reinigen',
    }, 5 * 86400000),
    openMaintenance({
      id: 'm-dance',
      deviceId: 'd-dance',
      dueDate: addDays(today, 3),
      intervalWeeks: 6,
      description: 'Riemen und Sensoren prüfen',
    }, 4 * 86400000),
    openMaintenance({
      id: 'm-race',
      deviceId: 'd-race',
      dueDate: addDays(today, 28),
      intervalWeeks: 24,
      description: 'Software-Update und Lenkrad kalibrieren',
    }, 3 * 86400000),
    openMaintenance({
      id: 'm-vr',
      deviceId: 'd-vr',
      dueDate: addDays(today, 6),
      intervalWeeks: 4,
      description: 'Linsen reinigen und Tracking prüfen',
    }, 2 * 86400000),
    openMaintenance({
      id: 'm-klima',
      deviceId: 'd-klima',
      dueDate: addDays(today, -2),
      intervalWeeks: 16,
      description: 'Filter wechseln',
    }, 86400000),
  ]
  const documentation = [
    {
      id: 'doc-1',
      deviceId: 'd-flipper',
      maintenanceId: 'm-flipper-oil',
      date: addDays(today, -94),
      number: 1,
      userName: 'Jonas Keller',
      description: 'Mechanik ölen und Kugeln prüfen',
    },
  ]

  return {
    groups,
    devices,
    maintenances,
    documentation,
    nextDocNumber: 2,
  }
}

export function markPerformed(db, maintenanceId, user, today) {
  const maintenance = db.maintenances.find((item) => item.id === maintenanceId)
  if (!maintenance) return { ok: false, error: 'Diese Wartung gibt es nicht mehr.' }
  if (maintenance.status === 'erledigt') {
    return { ok: false, error: 'Diese Wartung ist bereits erledigt.' }
  }
  const name = String(user?.name ?? '').trim()
  if (!name) return { ok: false, error: 'Der Benutzer fehlt.' }

  const kind = taskKind(maintenance)
  const completed = {
    ...maintenance,
    kind,
    intervalWeeks: kind === 'reparatur' ? null : maintenance.intervalWeeks,
    status: 'erledigt',
    performedBy: name,
    completedAt: today,
  }
  const maintenances = db.maintenances.map((item) => (item.id === maintenance.id ? completed : item))
  if (kind === 'reparatur') {
    return { ok: true, db: { ...db, maintenances } }
  }
  const interval = Number(maintenance.intervalWeeks)
  if (!Number.isInteger(interval) || interval < 1) {
    return { ok: false, error: 'Das Intervall muss mindestens 1 Woche sein.' }
  }
  const next = {
    id: uid(),
    deviceId: maintenance.deviceId,
    dueDate: addWeeks(maintenance.dueDate, interval),
    intervalWeeks: interval,
    kind: 'wartung',
    description: maintenance.description,
    detail: String(maintenance.detail ?? ''),
    createdBy: name,
    status: 'offen',
    performedBy: '',
    completedAt: null,
    createdAt: new Date().toISOString(),
  }
  return {
    ok: true,
    db: {
      ...db,
      maintenances: maintenances.concat(next),
    },
  }
}

export function addGroup(db, name) {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, error: 'Bitte einen Gruppennamen angeben.' }
  return {
    ok: true,
    db: {
      ...db,
      groups: [...db.groups, { id: uid(), name: trimmed }],
    },
  }
}

export function renameGroup(db, groupId, name) {
  const trimmed = String(name ?? '').trim()
  if (!trimmed) return { ok: false, error: 'Bitte einen Gruppennamen angeben.' }
  if (!db.groups.some((group) => group.id === groupId)) {
    return { ok: false, error: 'Die Gruppe gibt es nicht mehr.' }
  }
  return {
    ok: true,
    db: {
      ...db,
      groups: db.groups.map((group) => (group.id === groupId ? { ...group, name: trimmed } : group)),
    },
  }
}

export function moveDevice(db, deviceId, groupId) {
  if (!db.devices.some((device) => device.id === deviceId)) {
    return { ok: false, error: 'Das Gerät gibt es nicht mehr.' }
  }
  if (!db.groups.some((group) => group.id === groupId)) {
    return { ok: false, error: 'Die Gruppe gibt es nicht mehr.' }
  }
  return {
    ok: true,
    db: {
      ...db,
      devices: db.devices.map((device) => (device.id === deviceId ? { ...device, groupId } : device)),
    },
  }
}

export function groupDeleteBlockReason(db, groupId) {
  const id = String(groupId)
  if (db.devices.some((device) => String(device.groupId) === id)) {
    return 'Die Gruppe kann nicht gelöscht werden, solange sie Geräte enthält.'
  }
  return null
}

export function deviceDeleteBlockReason(db, deviceId) {
  if (openMaintenances(db.maintenances, deviceId).length > 0) {
    return 'Das Gerät kann nicht gelöscht werden, solange offene Wartungen vorhanden sind.'
  }
  return null
}

export function deleteGroup(db, groupId) {
  const blocked = groupDeleteBlockReason(db, groupId)
  if (blocked) return { ok: false, error: blocked }
  const deviceIds = new Set(
    db.devices.filter((device) => device.groupId === groupId).map((device) => device.id),
  )
  return {
    ok: true,
    db: {
      ...db,
      groups: db.groups.filter((group) => group.id !== groupId),
      devices: db.devices.filter((device) => device.groupId !== groupId),
      maintenances: db.maintenances.filter((item) => !deviceIds.has(item.deviceId)),
      documentation: db.documentation.filter((item) => !deviceIds.has(item.deviceId)),
    },
  }
}

export function addDevice(db, groupId, name, number) {
  const trimmed = name.trim()
  const parsed = Number(number)
  if (!trimmed) return { ok: false, error: 'Bitte einen Gerätenamen angeben.' }
  if (!Number.isInteger(parsed) || parsed < 1) {
    return { ok: false, error: 'Bitte eine gültige Gerätenummer angeben.' }
  }
  if (!db.groups.some((group) => group.id === groupId)) {
    return { ok: false, error: 'Die Gruppe gibt es nicht mehr.' }
  }
  if (db.devices.some((device) => device.number === parsed)) {
    return { ok: false, error: 'Nummer schon vergeben.' }
  }
  return {
    ok: true,
    db: {
      ...db,
      devices: [...db.devices, { id: uid(), groupId, name: trimmed, notes: '', number: parsed }],
    },
  }
}

export function deleteDevice(db, deviceId) {
  const blocked = deviceDeleteBlockReason(db, deviceId)
  if (blocked) return { ok: false, error: blocked }
  return {
    ok: true,
    db: {
      ...db,
      devices: db.devices.filter((device) => device.id !== deviceId),
      maintenances: db.maintenances.filter((item) => item.deviceId !== deviceId),
      documentation: db.documentation.filter((item) => item.deviceId !== deviceId),
    },
  }
}

export function maintenanceEditError(fields) {
  const repair = isRepair(fields)
  const description = String(fields?.description ?? '').trim()
  const dueDate = String(fields?.dueDate ?? '').trim()
  if (!description) {
    return repair ? 'Bitte eine Reparatur Beschreibung angeben.' : 'Bitte eine Wartungsbeschreibung angeben.'
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return 'Bitte ein Fälligkeitsdatum angeben.'
  if (!repair) {
    const interval = Number(fields?.intervalWeeks)
    if (!Number.isInteger(interval) || interval < 1) {
      return 'Das Intervall muss mindestens 1 Woche sein.'
    }
  }
  if (fields?.status !== 'offen' && fields?.status !== 'erledigt') {
    return 'Der Wartungstatus muss offen oder erledigt sein.'
  }
  return null
}

export function maintenanceEditFields(fields) {
  const kind = taskKind(fields)
  const status = fields.status === 'erledigt' ? 'erledigt' : 'offen'
  const completedRaw = String(fields.completedAt ?? '').slice(0, 10)
  const completedAt = status === 'erledigt' && /^\d{4}-\d{2}-\d{2}$/.test(completedRaw) ? completedRaw : null
  return {
    kind,
    dueDate: String(fields.dueDate ?? '').trim(),
    intervalWeeks: kind === 'reparatur' ? null : Number(fields.intervalWeeks),
    description: String(fields.description ?? '').trim(),
    detail: String(fields.detail ?? ''),
    createdBy: String(fields.createdBy ?? '').trim(),
    status,
    performedBy: String(fields.performedBy ?? '').trim(),
    completedAt,
  }
}

export function updateMaintenanceDetail(db, maintenanceId, detail) {
  const current = db.maintenances.find((item) => item.id === maintenanceId)
  if (!current) return { ok: false, error: 'Diese Wartung gibt es nicht mehr.' }
  if (current.status === 'erledigt') {
    return { ok: false, error: 'Erledigte Wartungen können nicht mehr geändert werden.' }
  }
  return {
    ok: true,
    db: {
      ...db,
      maintenances: db.maintenances.map((item) =>
        item.id === maintenanceId ? { ...item, detail: String(detail ?? '') } : item,
      ),
    },
  }
}

export function addMaintenance(db, { deviceId, dueDate, intervalWeeks, description, detail, createdBy, createdAt, kind }) {
  const text = String(description ?? '').trim()
  const creator = String(createdBy ?? '').trim()
  const task = taskKind(kind)
  const repair = task === 'reparatur'
  if (!db.devices.some((device) => device.id === deviceId)) {
    return { ok: false, error: 'Das Gerät gibt es nicht mehr.' }
  }
  if (!text) {
    return {
      ok: false,
      error: repair ? 'Bitte eine Reparatur Beschreibung angeben.' : 'Bitte eine Wartungsbeschreibung angeben.',
    }
  }
  if (!dueDate) return { ok: false, error: 'Bitte ein Fälligkeitsdatum angeben.' }
  let interval = null
  if (!repair) {
    interval = Number(intervalWeeks)
    if (!Number.isInteger(interval) || interval < 1) {
      return { ok: false, error: 'Das Intervall muss mindestens 1 Woche sein.' }
    }
  }
  if (!creator) {
    return {
      ok: false,
      error: repair ? 'Der Erfasser der Reparatur Aufgabe fehlt.' : 'Der Erfasser der Wartung fehlt.',
    }
  }
  return {
    ok: true,
    db: {
      ...db,
      maintenances: [
        ...db.maintenances,
        {
          id: uid(),
          deviceId,
          dueDate,
          intervalWeeks: interval,
          kind: task,
          description: text,
          detail: String(detail ?? ''),
          createdBy: creator,
          status: 'offen',
          performedBy: '',
          completedAt: null,
          createdAt: createdAt || new Date().toISOString(),
        },
      ],
    },
  }
}

export function moveMaintenance(db, maintenanceId, targetDeviceId) {
  const source = db.maintenances.find((item) => item.id === maintenanceId)
  if (!source) return { ok: false, error: 'Diese Wartung gibt es nicht mehr.' }
  if (!db.devices.some((device) => device.id === targetDeviceId)) {
    return { ok: false, error: 'Das Gerät gibt es nicht mehr.' }
  }
  return {
    ok: true,
    db: {
      ...db,
      maintenances: db.maintenances.map((item) =>
        item.id === maintenanceId ? { ...item, deviceId: targetDeviceId } : item,
      ),
    },
  }
}

export function copyMaintenance(db, maintenanceId, targetDeviceId, createdBy, createdAt) {
  const source = db.maintenances.find((item) => item.id === maintenanceId)
  if (!source) return { ok: false, error: 'Diese Wartung gibt es nicht mehr.' }
  if (!db.devices.some((device) => device.id === targetDeviceId)) {
    return { ok: false, error: 'Das Gerät gibt es nicht mehr.' }
  }
  const creator = String(createdBy ?? '').trim()
  if (!creator) return { ok: false, error: 'Der Erfasser der Wartung fehlt.' }
  const kind = taskKind(source)
  return {
    ok: true,
    db: {
      ...db,
      maintenances: [
        ...db.maintenances,
        {
          id: uid(),
          deviceId: targetDeviceId,
          dueDate: source.dueDate,
          intervalWeeks: kind === 'reparatur' ? null : source.intervalWeeks,
          kind,
          description: source.description,
          detail: String(source.detail ?? ''),
          createdBy: creator,
          status: 'offen',
          performedBy: '',
          completedAt: null,
          createdAt: createdAt || new Date().toISOString(),
        },
      ],
    },
  }
}

export function deleteMaintenance(db, maintenanceId) {
  return {
    ...db,
    maintenances: db.maintenances.filter((item) => item.id !== maintenanceId),
  }
}
