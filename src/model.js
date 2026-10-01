export const LEVEL_LABEL = {
  ok: 'Nächste Wartung',
  soon: 'In 1 Woche fällig',
  overdue: 'Überfällig',
  none: 'Keine Wartung',
}

const LEVEL_RANK = { none: 0, ok: 1, soon: 2, overdue: 3 }

export function roleLabel(role) {
  return role === 'super' ? 'Super Benutzer' : 'Standard Benutzer'
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

export function deviceStatus(deviceId, maintenances, today) {
  const items = maintenances.filter((item) => item.deviceId === deviceId)
  if (items.length === 0) {
    return { level: 'none', label: LEVEL_LABEL.none, dueDate: null, description: null }
  }

  let worst = null
  for (const item of items) {
    const level = dueLevel(item.dueDate, today)
    const candidate = {
      level,
      label: LEVEL_LABEL[level],
      dueDate: item.dueDate,
      description: item.description,
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
      name: 'Flipper «Medieval Madness»',
      notes: 'Handbuch im Schrank A.\nErsatzteile: https://example.com/flipper-teile',
    },
    {
      id: 'd-dance',
      groupId: 'g-arcade',
      name: 'Tanzautomat «StepX»',
      notes: 'Sensor-Matte erst im März ersetzt.',
    },
    {
      id: 'd-race',
      groupId: 'g-arcade',
      name: 'Rennsimulator «Grid»',
      notes: 'Kalibrierungsanleitung liegt in der Schublade unter dem Sitz.',
    },
    {
      id: 'd-vr',
      groupId: 'g-vr',
      name: 'VR-Station «Quest-Raum»',
      notes: 'Brillen nach jeder Schicht desinfizieren.\nhttps://example.com/vr-reinigung',
    },
    {
      id: 'd-klima',
      groupId: 'g-haus',
      name: 'Klimaanlage Spielhalle',
      notes: 'Filtertyp: F7. Lieferant Meier Gebäudetechnik.',
    },
  ]
  const maintenances = [
    {
      id: 'm-flipper-oil',
      deviceId: 'd-flipper',
      dueDate: addDays(today, -10),
      intervalWeeks: 12,
      description: 'Mechanik ölen und Kugeln prüfen',
    },
    {
      id: 'm-flipper-clean',
      deviceId: 'd-flipper',
      dueDate: addDays(today, 21),
      intervalWeeks: 8,
      description: 'Spielfeld reinigen',
    },
    {
      id: 'm-dance',
      deviceId: 'd-dance',
      dueDate: addDays(today, 3),
      intervalWeeks: 6,
      description: 'Riemen und Sensoren prüfen',
    },
    {
      id: 'm-race',
      deviceId: 'd-race',
      dueDate: addDays(today, 28),
      intervalWeeks: 24,
      description: 'Software-Update und Lenkrad kalibrieren',
    },
    {
      id: 'm-vr',
      deviceId: 'd-vr',
      dueDate: addDays(today, 6),
      intervalWeeks: 4,
      description: 'Linsen reinigen und Tracking prüfen',
    },
    {
      id: 'm-klima',
      deviceId: 'd-klima',
      dueDate: addDays(today, -2),
      intervalWeeks: 16,
      description: 'Filter wechseln',
    },
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

  const entry = {
    id: uid(),
    deviceId: maintenance.deviceId,
    maintenanceId: maintenance.id,
    date: today,
    number: db.nextDocNumber,
    userName: user.name,
    description: maintenance.description,
  }

  return {
    ok: true,
    entry,
    db: {
      ...db,
      nextDocNumber: db.nextDocNumber + 1,
      maintenances: db.maintenances.map((item) =>
        item.id === maintenance.id
          ? { ...item, dueDate: addWeeks(today, item.intervalWeeks) }
          : item,
      ),
      documentation: [entry, ...db.documentation],
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

export function deleteGroup(db, groupId) {
  const deviceIds = new Set(
    db.devices.filter((device) => device.groupId === groupId).map((device) => device.id),
  )
  return {
    ...db,
    groups: db.groups.filter((group) => group.id !== groupId),
    devices: db.devices.filter((device) => device.groupId !== groupId),
    maintenances: db.maintenances.filter((item) => !deviceIds.has(item.deviceId)),
    documentation: db.documentation.filter((item) => !deviceIds.has(item.deviceId)),
  }
}

export function addDevice(db, groupId, name) {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, error: 'Bitte einen Gerätenamen angeben.' }
  if (!db.groups.some((group) => group.id === groupId)) {
    return { ok: false, error: 'Die Gruppe gibt es nicht mehr.' }
  }
  return {
    ok: true,
    db: {
      ...db,
      devices: [...db.devices, { id: uid(), groupId, name: trimmed, notes: '' }],
    },
  }
}

export function deleteDevice(db, deviceId) {
  return {
    ...db,
    devices: db.devices.filter((device) => device.id !== deviceId),
    maintenances: db.maintenances.filter((item) => item.deviceId !== deviceId),
    documentation: db.documentation.filter((item) => item.deviceId !== deviceId),
  }
}

export function updateDeviceNotes(db, deviceId, notes) {
  return {
    ...db,
    devices: db.devices.map((device) =>
      device.id === deviceId ? { ...device, notes } : device,
    ),
  }
}

export function addMaintenance(db, { deviceId, dueDate, intervalWeeks, description }) {
  const text = description.trim()
  const interval = Number(intervalWeeks)
  if (!db.devices.some((device) => device.id === deviceId)) {
    return { ok: false, error: 'Das Gerät gibt es nicht mehr.' }
  }
  if (!text) return { ok: false, error: 'Bitte eine Wartungsbeschreibung angeben.' }
  if (!dueDate) return { ok: false, error: 'Bitte ein Fälligkeitsdatum angeben.' }
  if (!Number.isInteger(interval) || interval < 1) {
    return { ok: false, error: 'Das Intervall muss mindestens 1 Woche sein.' }
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
          description: text,
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
