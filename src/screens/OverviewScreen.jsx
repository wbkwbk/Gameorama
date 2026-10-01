import { useState } from 'react'
import { deviceStatus, formatDisplayDate } from '../model.js'

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
  const [deviceErrors, setDeviceErrors] = useState({})

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

  function submitDevice(event, groupId) {
    event.preventDefault()
    const name = deviceDrafts[groupId] || ''
    const error = onAddDevice(groupId, name)
    setDeviceErrors((current) => ({ ...current, [groupId]: error }))
    if (!error) {
      setDeviceDrafts((current) => ({ ...current, [groupId]: '' }))
    }
  }

  return (
    <div className="board">
      <div className="board-head">
        <div>
          <h1>Übersicht</h1>
          <p className="muted">Geräte nach Gruppe. Die Farbe zeigt den nächsten Wartungstermin.</p>
        </div>
        <ul className="summary">
          <li className="overdue">{counts.overdue} überfällig</li>
          <li className="soon">{counts.soon} in 1 Woche</li>
          <li className="ok">{counts.ok} geplant</li>
        </ul>
      </div>

      {notice && <p className={`banner banner-${notice.tone}`} role="status">{notice.text}</p>}

      {db.groups.map((group) => {
        const devices = db.devices.filter((device) => device.groupId === group.id)
        return (
          <section className="group" key={group.id}>
            <header className="group-head">
              <h2>{group.name}</h2>
              {isSuper && (
                <button type="button" className="btn tiny danger" onClick={() => onDeleteGroup(group)}>
                  Gruppe löschen
                </button>
              )}
            </header>
            {devices.length === 0 ? (
              <p className="empty">Keine Geräte in dieser Gruppe.</p>
            ) : (
              <ul className="device-list">
                {devices.map((device) => {
                  const status = deviceStatus(device.id, db.maintenances, today)
                  return (
                    <li key={device.id} className={`device-row level-${status.level}`}>
                      <button type="button" className="device-open" onClick={() => onOpenDevice(device.id)}>
                        <span className={`pill level-${status.level}`}>{status.label}</span>
                        <span className="device-name">{device.name}</span>
                        <span className="device-meta">
                          {status.dueDate
                            ? `Fällig ${formatDisplayDate(status.dueDate)} · ${status.description}`
                            : 'Noch keine Wartung angelegt'}
                        </span>
                      </button>
                      {isSuper && (
                        <button
                          type="button"
                          className="btn tiny danger"
                          onClick={() => onDeleteDevice(device)}
                        >
                          Löschen
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            {isSuper && (
              <form className="inline-form" onSubmit={(event) => submitDevice(event, group.id)}>
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
          </section>
        )
      })}

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
