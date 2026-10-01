import { useEffect, useState } from 'react'
import {
  addWeeks,
  deviceStatus,
  formatDisplayDate,
  maintenanceStatus,
  todayISO,
} from '../model.js'

export default function DeviceScreen({
  db,
  device,
  user,
  today,
  isSuper,
  notice,
  onBack,
  onDone,
  onSaveNotes,
  onAddMaintenance,
  onDeleteMaintenance,
  onDeleteDevice,
}) {
  const [notes, setNotes] = useState(device.notes)
  const [notesSaved, setNotesSaved] = useState(false)
  const [form, setForm] = useState({
    dueDate: addWeeks(todayISO(), 4),
    intervalWeeks: 4,
    description: '',
  })
  const [formError, setFormError] = useState(null)

  useEffect(() => {
    setNotes(device.notes)
    setNotesSaved(false)
  }, [device.id, device.notes])

  const status = deviceStatus(device.id, db.maintenances, today)
  const maintenances = db.maintenances
    .filter((item) => item.deviceId === device.id)
    .slice()
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const documentation = db.documentation.filter((item) => item.deviceId === device.id)

  function saveNotes(event) {
    event.preventDefault()
    onSaveNotes(notes)
    setNotesSaved(true)
  }

  function submitMaintenance(event) {
    event.preventDefault()
    const error = onAddMaintenance({
      dueDate: form.dueDate,
      intervalWeeks: Number(form.intervalWeeks),
      description: form.description,
    })
    setFormError(error)
    if (!error) {
      setForm({ dueDate: addWeeks(todayISO(), 4), intervalWeeks: 4, description: '' })
    }
  }

  return (
    <div className="device-page">
      <button type="button" className="text-link" onClick={onBack}>
        ← Übersicht
      </button>

      <header className="device-title">
        <div>
          <h1>{device.name}</h1>
          <p className={`status-line level-${status.level}`}>
            Status: {status.label}
            {status.dueDate ? ` · ${formatDisplayDate(status.dueDate)}` : ''}
          </p>
        </div>
        {isSuper && (
          <button type="button" className="btn danger" onClick={onDeleteDevice}>
            Gerät löschen
          </button>
        )}
      </header>

      {notice && <p className={`banner banner-${notice.tone}`} role="status">{notice.text}</p>}

      <section>
        <h2>Wartungsliste</h2>
        {maintenances.length === 0 ? (
          <p className="empty">Für dieses Gerät ist noch keine Wartung angelegt.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Datum fällig</th>
                  <th>Intervall in Wochen</th>
                  <th>Wartungsbeschreibung</th>
                  <th>Durchgeführt</th>
                </tr>
              </thead>
              <tbody>
                {maintenances.map((item) => {
                  const itemStatus = maintenanceStatus(item, today)
                  return (
                    <tr key={item.id} className={`level-${itemStatus.level}`}>
                      <td>
                        <span className={`pill level-${itemStatus.level}`}>{itemStatus.label}</span>
                        <span className="date-line">{formatDisplayDate(item.dueDate)}</span>
                      </td>
                      <td>{item.intervalWeeks}</td>
                      <td>{item.description}</td>
                      <td>
                        <button type="button" className="done-btn" onClick={() => onDone(item.id)}>
                          <span>Durchgeführt</span>
                          <small>{user.name}</small>
                        </button>
                        {isSuper && (
                          <button
                            type="button"
                            className="btn tiny danger"
                            onClick={() => onDeleteMaintenance(item.id, item.description)}
                          >
                            Löschen
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2>Bemerkungen und Links</h2>
        {isSuper ? (
          <form onSubmit={saveNotes} className="notes-form">
            <label>
              Freitext und Verweise
              <textarea
                value={notes}
                onChange={(event) => {
                  setNotes(event.target.value)
                  setNotesSaved(false)
                }}
                rows={5}
              />
            </label>
            <button type="submit" className="btn secondary">Speichern</button>
            {notesSaved && <p className="form-ok">Gespeichert.</p>}
          </form>
        ) : (
          <p className="notes-read">{notes.trim() ? notes : 'Keine Bemerkungen hinterlegt.'}</p>
        )}
      </section>

      {isSuper && (
        <section>
          <h2>Wartung hinzufügen / löschen</h2>
          <form className="maintenance-form" onSubmit={submitMaintenance}>
            <label>
              Datum fällig
              <input
                type="date"
                value={form.dueDate}
                onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
                required
              />
            </label>
            <label>
              Intervall in Wochen
              <input
                type="number"
                min="1"
                step="1"
                value={form.intervalWeeks}
                onChange={(event) =>
                  setForm((current) => ({ ...current, intervalWeeks: event.target.value }))
                }
                required
              />
            </label>
            <label className="grow">
              Wartungsbeschreibung
              <input
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                placeholder="Was ist zu tun?"
                required
              />
            </label>
            <button type="submit" className="btn secondary">Wartung hinzufügen</button>
            {formError && <p className="form-error">{formError}</p>}
          </form>
        </section>
      )}

      <section>
        <h2>Dokumentationsbereich</h2>
        <p className="muted">Wird gefüllt, wenn eine Wartung als durchgeführt markiert wird.</p>
        {documentation.length === 0 ? (
          <p className="empty">Noch keine Durchführung dokumentiert.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Wartungsnummer</th>
                  <th>Benutzer Name</th>
                  <th>Wartung</th>
                </tr>
              </thead>
              <tbody>
                {documentation.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatDisplayDate(entry.date)}</td>
                    <td>{entry.number}</td>
                    <td>{entry.userName}</td>
                    <td>{entry.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
