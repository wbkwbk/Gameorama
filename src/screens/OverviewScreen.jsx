import { useState } from 'react'
import {
  deviceDeleteBlockReason,
  deviceMatchesQuery,
  deviceOverviewTasks,
  deviceStatus,
  formatDisplayDate,
  groupDeleteBlockReason,
  nextFreeDeviceNumber,
  sortDevices,
  taskKindLabel,
} from '../model.js'
import MovableStage from '../MovableStage.jsx'
import ResizableCard from '../ResizableCard.jsx'
import ResizableList from '../ResizableList.jsx'

const SORT_KEY = 'gameorama-device-sort'

function readDeviceSort() {
  try {
    const value = window.localStorage.getItem(SORT_KEY)
    if (
      value === 'name-asc' ||
      value === 'name-desc' ||
      value === 'number-asc' ||
      value === 'number-desc' ||
      value === 'due' ||
      value === 'kind'
    ) {
      return value
    }
  } catch {
    // Die Vorgabe gilt, wenn der Browser keinen Speicher freigibt.
  }
  return 'due'
}

export default function OverviewScreen({
  db,
  today,
  isSuper,
  notice,
  onOpenDevice,
  onAddGroup,
  onDeleteGroup,
  onAddDevice,
  onDeleteDevice,
}) {
  const [groupName, setGroupName] = useState('')
  const [groupError, setGroupError] = useState(null)
  const [deviceDrafts, setDeviceDrafts] = useState({})
  const [deviceNumbers, setDeviceNumbers] = useState({})
  const [deviceErrors, setDeviceErrors] = useState({})
  const [sortMode, setSortMode] = useState(readDeviceSort)
  const [deviceQuery, setDeviceQuery] = useState('')

  function changeSort(value) {
    setSortMode(value)
    try {
      window.localStorage.setItem(SORT_KEY, value)
    } catch {
      // Die Auswahl gilt dann nur für diesen Besuch.
    }
  }

  const counts = { overdue: 0, soon: 0, ok: 0, none: 0 }
  for (const device of db.devices) {
    counts[deviceStatus(device.id, db.maintenances, today).level] += 1
  }

  function submitGroup(event) {
    event.preventDefault()
    const error = onAddGroup(groupName)
    setGroupError(error)
    if (!error) setGroupName('')
  }

  const suggestedNumber = String(nextFreeDeviceNumber(db.devices))

  function submitDevice(event, groupId) {
    event.preventDefault()
    const name = deviceDrafts[groupId] || ''
    const number = Number(deviceNumbers[groupId] ?? suggestedNumber)
    const error = onAddDevice(groupId, name, number)
    setDeviceErrors((current) => ({ ...current, [groupId]: error }))
    if (!error) {
      setDeviceDrafts((current) => ({ ...current, [groupId]: '' }))
      setDeviceNumbers((current) => {
        const next = { ...current }
        delete next[groupId]
        return next
      })
      return
    }
    if (error === 'Nummer schon vergeben.') {
      setDeviceNumbers((current) => ({ ...current, [groupId]: suggestedNumber }))
    }
  }

  const queryActive = deviceQuery.trim() !== ''
  const groups = db.groups.flatMap((group) => {
    const devices = sortDevices(
      db.devices.filter((device) => (
        device.groupId === group.id && deviceMatchesQuery(device, group.name, deviceQuery)
      )),
      db.maintenances,
      today,
      sortMode,
    )
    if (queryActive && devices.length === 0) return []
    return [{ group, devices }]
  })

  return (
    <div className="board">
      <div className="board-head">
        <div className="board-intro">
          <h1>Übersicht</h1>
          <p className="muted">
            Geräte nach Gruppe. Die Farbe zeigt den dringendsten offenen Termin.
          </p>
        </div>
        <label className="device-search">
          <input
            type="text"
            value={deviceQuery}
            onChange={(event) => setDeviceQuery(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            placeholder="Gerät suchen"
            aria-label="Gerät suchen"
            autoComplete="off"
            spellCheck="false"
          />
        </label>
        <ul className="summary">
          <li className="overdue">{counts.overdue} überfällig</li>
          <li className="soon">{counts.soon} in 1 Woche</li>
          <li className="ok">{counts.ok} geplant</li>
        </ul>
      </div>

      {notice && <p className={`banner banner-${notice.tone}`} role="status">{notice.text}</p>}

      <MovableStage>
        {groups.map(({ group, devices }) => {
        return (
          <ResizableCard
            as="section"
            className="group"
            key={group.id}
            movable
            storageKey={`group-list:${group.id}`}
            label={`Geräteliste ${group.name}`}
          >
            <header className="group-head drag-surface">
              <div className="group-title">
                <button type="button" className="drag-handle" aria-label={`${group.name} verschieben`} />
                <h2>{group.name}</h2>
              </div>
              <div className="group-tools">
                <label className="sort-field">
                  Sortierung
                  <select
                    aria-label={`Sortierung für ${group.name}`}
                    value={sortMode}
                    onChange={(event) => changeSort(event.target.value)}
                  >
                    <option value="name-asc">Gerätename aufsteigend</option>
                    <option value="name-desc">Gerätename absteigend</option>
                    <option value="number-asc">Nummer aufsteigend</option>
                    <option value="number-desc">Nummer absteigend</option>
                    <option value="due">Wartungsdatum</option>
                    <option value="kind">Wartung / Reparatur, dann Datum</option>
                  </select>
                </label>
                {isSuper && (
                  <button
                    type="button"
                    className="btn tiny danger"
                    disabled={Boolean(groupDeleteBlockReason(db, group.id))}
                    onClick={() => onDeleteGroup(group)}
                  >
                    Gruppe löschen
                  </button>
                )}
              </div>
            </header>
            {devices.length === 0 ? (
              <p className="empty">Keine Geräte in dieser Gruppe.</p>
            ) : (
              <ResizableList
                itemKey={`${group.id}:${devices.length}`}
                storageKey={`group-list:${group.id}`}
                label={`Geräteliste ${group.name}`}
                rowSelector=".device-row"
                className="device-list"
              >
                {devices.map((device) => {
                  const status = deviceStatus(device.id, db.maintenances, today)
                  const tasks = deviceOverviewTasks(device.id, db.maintenances, sortMode)
                  return (
                    <li key={device.id} className={`device-row level-${status.level}`}>
                      <button type="button" className="device-open" onClick={() => onOpenDevice(device.id)}>
                        <span className={`pill level-${status.level}`}>{status.label}</span>
                        <span className="device-name">
                          {device.name}
                          <span className="device-number">Nr. {device.number}</span>
                        </span>
                        <span className="device-meta">
                          {tasks.length === 0
                            ? 'Noch keine Wartung angelegt'
                            : tasks.map((task) => (
                                <span key={task.id} className="device-task">
                                  <span className={`task-kind ${task.kind}`}>{taskKindLabel(task.kind)}</span>
                                  {`Fällig ${formatDisplayDate(task.dueDate)}${task.description ? ` · ${task.description}` : ''}`}
                                </span>
                              ))}
                        </span>
                      </button>
                      {isSuper && (
                        <button
                          type="button"
                          className="btn tiny danger"
                          disabled={Boolean(deviceDeleteBlockReason(db, device.id))}
                          onClick={() => onDeleteDevice(device)}
                        >
                          Löschen
                        </button>
                      )}
                    </li>
                  )
                })}
              </ResizableList>
            )}
            {isSuper && (
              <form className="inline-form" onSubmit={(event) => submitDevice(event, group.id)}>
                <label className="number-field">
                  Nummer
                  <input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    aria-label={`Nummer für ${group.name}`}
                    value={deviceNumbers[group.id] ?? suggestedNumber}
                    onChange={(event) =>
                      setDeviceNumbers((current) => ({ ...current, [group.id]: event.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  Gerät hinzufügen
                  <input
                    value={deviceDrafts[group.id] || ''}
                    onChange={(event) =>
                      setDeviceDrafts((current) => ({ ...current, [group.id]: event.target.value }))
                    }
                    placeholder="Gerätename"
                  />
                </label>
                <button type="submit" className="btn secondary">Hinzufügen</button>
                {deviceErrors[group.id] && <p className="form-error">{deviceErrors[group.id]}</p>}
              </form>
            )}
          </ResizableCard>
        )
        })}
      </MovableStage>
      {queryActive && groups.length === 0 && (
        <p className="empty">Keine Geräte gefunden.</p>
      )}

      {isSuper && (
        <form className="inline-form group-create" onSubmit={submitGroup}>
          <label>
            Gruppe hinzufügen
            <input
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              placeholder="Gruppenname"
            />
          </label>
          <button type="submit" className="btn secondary">Gruppe hinzufügen</button>
          {groupError && <p className="form-error">{groupError}</p>}
        </form>
      )}
    </div>
  )
}
