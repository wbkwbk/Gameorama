import { useEffect, useState } from 'react'
import ResizableCard from '../ResizableCard.jsx'
import ResizableList from '../ResizableList.jsx'

function RenameRow({ group, onRename }) {
  const [name, setName] = useState(group.name)
  const [error, setError] = useState(null)

  useEffect(() => {
    setName(group.name)
    setError(null)
  }, [group.name])

  function submit(event) {
    event.preventDefault()
    const message = onRename(group.id, name)
    setError(message)
  }

  return (
    <form className="rename-row" onSubmit={submit}>
      <label>
        Gruppenname
        <input
          aria-label={`Name für ${group.name}`}
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setError(null)
          }}
        />
      </label>
      <button type="submit" className="btn secondary">Speichern</button>
      {error && <p className="form-error">{error}</p>}
    </form>
  )
}

function AssignRow({ device, groups, onMove }) {
  const targets = groups.filter((group) => group.id !== device.groupId)
  const current = groups.find((group) => group.id === device.groupId)
  const [target, setTarget] = useState(targets[0]?.id || '')
  const [error, setError] = useState(null)

  useEffect(() => {
    setTarget((value) => (targets.some((group) => group.id === value) ? value : targets[0]?.id || ''))
    setError(null)
  }, [device.groupId, device.id, groups])

  function submit(event) {
    event.preventDefault()
    const message = onMove(device.id, target)
    setError(message)
  }

  return (
    <form className="assign-row" onSubmit={submit}>
      <div className="assign-device">
        <strong>
          {device.name}
          <span className="device-number">Nr. {device.number}</span>
        </strong>
        <span>Aktuelle Gruppe: {current?.name || '—'}</span>
      </div>
      <label>
        Zielgruppe
        <select
          aria-label={`Zielgruppe für ${device.name}`}
          value={target}
          onChange={(event) => {
            setTarget(event.target.value)
            setError(null)
          }}
          disabled={targets.length === 0}
        >
          {targets.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="btn secondary" disabled={targets.length === 0 || !target}>
        Zuordnen
      </button>
      {error && <p className="form-error">{error}</p>}
    </form>
  )
}

export default function GroupsScreen({ db, notice, onBack, onRenameGroup, onMoveDevice }) {
  const devices = db.devices.slice().sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'accent' }))

  return (
    <div className="groups-page">
      <button type="button" className="btn secondary device-back" onClick={onBack}>
        ← Zurück zur Übersicht
      </button>
      <header className="board-head">
        <div>
          <h1>Gruppen verwalten</h1>
          <p className="muted">Gruppennamen ändern und Geräte einer anderen Gruppe zuordnen.</p>
        </div>
      </header>

      {notice && <p className={`banner banner-${notice.tone}`} role="status">{notice.text}</p>}

      <ResizableCard as="section" className="group" storageKey="groups-rename" label="Gruppen umbenennen">
        <h2>Gruppen umbenennen</h2>
        {db.groups.length === 0 ? (
          <p className="empty">Noch keine Gruppen.</p>
        ) : (
          <ResizableList
            as="div"
            className="rename-list"
            rowSelector=".rename-row"
            itemKey={db.groups.map((group) => group.id).join(',')}
            storageKey="groups-rename"
            label="Gruppen umbenennen"
          >
            {db.groups.map((group) => (
              <RenameRow key={group.id} group={group} onRename={onRenameGroup} />
            ))}
          </ResizableList>
        )}
      </ResizableCard>

      <ResizableCard as="section" className="group" storageKey="groups-assign" label="Geräte zuordnen">
        <h2>Geräte einer Gruppe zuordnen</h2>
        {devices.length === 0 ? (
          <p className="empty">Noch keine Geräte.</p>
        ) : (
          <ResizableList
            as="div"
            className="assign-list"
            rowSelector=".assign-row"
            itemKey={devices.map((device) => device.id).join(',')}
            storageKey="groups-assign"
            label="Geräte einer Gruppe zuordnen"
          >
            {devices.map((device) => (
              <AssignRow key={device.id} device={device} groups={db.groups} onMove={onMoveDevice} />
            ))}
          </ResizableList>
        )}
      </ResizableCard>
    </div>
  )
}
