import { useLayoutEffect, useRef, useState } from 'react'
import { deviceStatus, formatDisplayDate, nextFreeDeviceNumber } from '../model.js'
import ResizableCard, { trackPointer, usePanelResize } from '../ResizableCard.jsx'
import { NUDGE_STEP, NUDGE_STEP_LARGE, readPanelSize, writePanelSize } from '../panelSize.js'

function DeviceListFrame({ children, itemKey, storageKey, label }) {
  const frameRef = useRef(null)
  const listRef = useRef(null)
  const widthApi = usePanelResize()
  const [height, setHeight] = useState(() => readPanelSize(storageKey).height ?? null)
  const resizedRef = useRef(height != null)
  const boundsRef = useRef({ min: 160, max: 640 })
  const [bounds, setBounds] = useState(boundsRef.current)

  useLayoutEffect(() => {
    const frame = frameRef.current
    const list = listRef.current
    if (!frame || !list) return undefined

    function measure() {
      const row = list.querySelector('.device-row')
      if (!row) return null
      const styles = getComputedStyle(list)
      const gap = parseFloat(styles.rowGap || styles.gap) || 0
      const min = Math.ceil(row.getBoundingClientRect().height * 3 + gap * 2) + 2
      const max = Math.max(min, Math.round(window.innerHeight * 0.7))
      return { min, max }
    }

    function apply() {
      const nextBounds = measure()
      if (!nextBounds) return
      boundsRef.current = nextBounds
      setBounds((current) =>
        current.min === nextBounds.min && current.max === nextBounds.max ? current : nextBounds,
      )
      setHeight((current) => {
        const next = !resizedRef.current || current == null
          ? nextBounds.min
          : Math.min(nextBounds.max, Math.max(nextBounds.min, current))
        return current === next ? current : next
      })
    }

    apply()
    let width = frame.getBoundingClientRect().width
    const observer = new ResizeObserver(() => {
      const nextWidth = frame.getBoundingClientRect().width
      if (Math.abs(nextWidth - width) < 1) return
      width = nextWidth
      apply()
    })
    observer.observe(frame)
    return () => observer.disconnect()
  }, [itemKey])

  function clamp(value) {
    const { min, max } = boundsRef.current
    return Math.min(max, Math.max(min, value))
  }

  function commitHeight(value) {
    const next = clamp(value)
    resizedRef.current = true
    setHeight(next)
    writePanelSize(storageKey, { height: next })
    return next
  }

  function onPointerDown(event) {
    const startH = listRef.current.getBoundingClientRect().height
    trackPointer(event, (move, origin) => {
      commitHeight(startH + move.clientY - origin.y)
    })
  }

  function onKeyDown(event) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const current = listRef.current.getBoundingClientRect().height
    const step = event.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP
    commitHeight(current + (event.key === 'ArrowDown' ? step : -step))
  }

  function onCornerPointerDown(event) {
    if (!widthApi?.ref.current || !listRef.current) return
    widthApi.refreshBounds()
    const startWidth = widthApi.ref.current.getBoundingClientRect().width
    const startH = listRef.current.getBoundingClientRect().height
    trackPointer(event, (move, origin) => {
      widthApi.commit(startWidth + move.clientX - origin.x)
      commitHeight(startH + move.clientY - origin.y)
    })
  }

  function onCornerKeyDown(event) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      widthApi?.onKeyDown(event)
      return
    }
    onKeyDown(event)
  }

  return (
    <div className="device-list-frame" ref={frameRef}>
      <ul
        className="device-list"
        ref={listRef}
        style={
          height
            ? { height: `${height}px`, minHeight: `${bounds.min}px`, maxHeight: `${bounds.max}px` }
            : undefined
        }
      >
        {children}
      </ul>
      <button
        type="button"
        className="resize-handle resize-handle-y"
        role="slider"
        aria-label={`Höhe: ${label}`}
        aria-orientation="vertical"
        aria-valuemin={Math.round(bounds.min)}
        aria-valuemax={Math.round(bounds.max)}
        aria-valuenow={Math.round(height ?? bounds.min)}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
      />
      {widthApi && (
        <button
          type="button"
          className="resize-handle resize-handle-xy"
          aria-label={`Größe: ${label}`}
          onPointerDown={onCornerPointerDown}
          onKeyDown={onCornerKeyDown}
        />
      )}
    </div>
  )
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

  return (
    <div className="board">
      <div className="board-head">
        <div>
          <h1>Übersicht</h1>
          <p className="muted">
            Geräte nach Gruppe. Die Farbe zeigt den nächsten Wartungstermin. Gespeichert in der SQLite-Datenbank auf diesem Rechner.
          </p>
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
          <ResizableCard
            as="section"
            className="group"
            key={group.id}
            storageKey={`group-list:${group.id}`}
            label={`Geräteliste ${group.name}`}
          >
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
              <DeviceListFrame
                itemKey={`${group.id}:${devices.length}`}
                storageKey={`group-list:${group.id}`}
                label={`Geräteliste ${group.name}`}
              >
                {devices.map((device) => {
                  const status = deviceStatus(device.id, db.maintenances, today)
                  return (
                    <li key={device.id} className={`device-row level-${status.level}`}>
                      <button type="button" className="device-open" onClick={() => onOpenDevice(device.id)}>
                        <span className={`pill level-${status.level}`}>{status.label}</span>
                        <span className="device-name">
                          {device.name}
                          <span className="device-number">Nr. {device.number}</span>
                        </span>
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
              </DeviceListFrame>
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
