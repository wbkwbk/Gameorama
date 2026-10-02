import { useEffect, useState } from 'react'
import Attachments from '../Attachments.jsx'
import ResizableCard from '../ResizableCard.jsx'
import { MIN_DETAIL_WIDTH } from '../panelSize.js'
import { listDocuments } from '../storage.js'
import {
  addWeeks,
  deviceStatus,
  formatDisplayDate,
  maintenanceStatus,
  sortedDocumentation,
  todayISO,
} from '../model.js'

function MaintenanceDetail({ item, isSuper, documents, token, onSave, onDocuments, storageKey }) {
  const [text, setText] = useState(item.detail || '')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setText(item.detail || '')
    setSaved(false)
  }, [item.id])

  useEffect(() => {
    setText(item.detail || '')
  }, [item.detail])

  return (
    <ResizableCard
      className="maint-detail"
      storageKey={storageKey}
      label={`Wartungsbeschrieb ${item.description}`}
      minReadable={MIN_DETAIL_WIDTH}
    >
      {isSuper ? (
        <div className="detail-editor">
          <textarea
            aria-label={`Wartungsbeschrieb für ${item.description}`}
            value={text}
            rows={4}
            onChange={(event) => {
              setText(event.target.value)
              setSaved(false)
            }}
          />
          <button
            type="button"
            className="btn tiny secondary"
            onClick={() => {
              onSave(item.id, text)
              setSaved(true)
            }}
          >
            Speichern
          </button>
          {saved && <p className="form-ok">Gespeichert.</p>}
        </div>
      ) : (
        <p className="detail-read">{item.detail?.trim() ? item.detail : 'Kein Wartungsbeschrieb.'}</p>
      )}
      <Attachments
        ownerId={item.id}
        documents={documents}
        token={token}
        isSuper={isSuper}
        onChange={onDocuments}
      />
    </ResizableCard>
  )
}

function MaintenanceDetailRead({ item, documents, token, isSuper, onDocuments, storageKey }) {
  return (
    <ResizableCard
      className="maint-detail"
      storageKey={storageKey}
      label={`Wartungsbeschrieb ${item.description}`}
      minReadable={MIN_DETAIL_WIDTH}
    >
      <p className="detail-read">{item.detail?.trim() ? item.detail : 'Kein Wartungsbeschrieb.'}</p>
      <Attachments
        ownerId={item.id}
        documents={documents}
        token={token}
        isSuper={isSuper}
        onChange={onDocuments}
      />
    </ResizableCard>
  )
}

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
  onSaveDetail,
  onAddMaintenance,
  onDeleteMaintenance,
  onDeleteDevice,
}) {
  const [notes, setNotes] = useState(device.notes)
  const [notesSaved, setNotesSaved] = useState(false)
  const [documents, setDocuments] = useState([])
  const [form, setForm] = useState({
    dueDate: addWeeks(todayISO(), 4),
    intervalWeeks: 4,
    description: '',
    detail: '',
  })
  const [formError, setFormError] = useState(null)

  useEffect(() => {
    let active = true
    listDocuments(user.token)
      .then((rows) => {
        if (active) setDocuments(rows)
      })
      .catch(() => {
        if (active) setDocuments([])
      })
    return () => {
      active = false
    }
  }, [user.token])

  async function reloadDocuments() {
    setDocuments(await listDocuments(user.token))
  }

  useEffect(() => {
    setNotes(device.notes)
    setNotesSaved(false)
  }, [device.id])

  useEffect(() => {
    setNotes(device.notes)
  }, [device.notes])

  const status = deviceStatus(device.id, db.maintenances, today)
  const maintenances = db.maintenances
    .filter((item) => item.deviceId === device.id)
    .slice()
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const documentation = sortedDocumentation(db.maintenances, device.id)
  const legacy = db.documentation.filter((item) => item.deviceId === device.id)

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
      detail: form.detail,
    })
    setFormError(error)
    if (!error) {
      setForm({ dueDate: addWeeks(todayISO(), 4), intervalWeeks: 4, description: '', detail: '' })
    }
  }

  return (
    <div className="device-page">
      <button type="button" className="text-link" onClick={onBack}>
        ← Übersicht
      </button>

      <header className="device-title">
        <div>
          <h1>
            <span className="device-title-name">{device.name}</span>
            <span className="device-number">Nr. {device.number}</span>
          </h1>
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

      <ResizableCard as="section" storageKey={`device-list:${device.id}`} label="Wartungsliste">
        <h2>Wartungsliste</h2>
        {maintenances.length === 0 ? (
          <p className="empty">Für dieses Gerät ist noch keine Wartung angelegt.</p>
        ) : (
          <div className="table-wrap">
            <table className="maint-table">
              <thead>
                <tr>
                  <th>Fällig am</th>
                  <th>Intervall in Wochen</th>
                  <th>Wartungsbeschreibung</th>
                  <th>Wartungsbeschrieb</th>
                  <th>Erfasser der Wartung</th>
                  <th>Wartungstatus</th>
                  <th>Wartung durchgeführt durch</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {maintenances.map((item) => {
                  const open = item.status !== 'erledigt'
                  const itemStatus = open ? maintenanceStatus(item, today) : null
                  return (
                    <tr key={item.id} className={itemStatus ? `level-${itemStatus.level}` : undefined}>
                      <td>{formatDisplayDate(item.dueDate)}</td>
                      <td>{item.intervalWeeks}</td>
                      <td>{item.description}</td>
                      <td>
                        <MaintenanceDetail
                          item={item}
                          isSuper={isSuper}
                          documents={documents}
                          token={user.token}
                          onSave={onSaveDetail}
                          onDocuments={reloadDocuments}
                          storageKey={`maint-detail:${item.id}`}
                        />
                      </td>
                      <td>{item.createdBy}</td>
                      <td>
                        <span className={`maint-status ${open ? 'offen' : 'erledigt'}`}>
                          {open ? 'offen' : 'erledigt'}
                        </span>
                      </td>
                      <td>{item.performedBy}</td>
                      <td>
                        {open && (
                          <button type="button" className="done-btn" onClick={() => onDone(item.id)}>
                            <span>Durchgeführt</span>
                            <small>{user.name}</small>
                          </button>
                        )}
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
      </ResizableCard>

      <ResizableCard as="section" storageKey={`device-notes:${device.id}`} label="Bemerkungen und Links">
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
        <Attachments
          ownerId={device.id}
          documents={documents}
          token={user.token}
          isSuper={isSuper}
          onChange={reloadDocuments}
        />
      </ResizableCard>

      {isSuper && (
        <ResizableCard as="section" storageKey={`device-add:${device.id}`} label="Wartung hinzufügen">
          <h2>Wartung hinzufügen / löschen</h2>
          <form className="maintenance-form" onSubmit={submitMaintenance}>
            <label>
              Fällig am
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
            <label className="wide">
              Wartungsbeschrieb
              <textarea
                value={form.detail}
                rows={4}
                onChange={(event) =>
                  setForm((current) => ({ ...current, detail: event.target.value }))
                }
                placeholder="Ausführlicher Beschrieb zur Wartung"
              />
            </label>
            <button type="submit" className="btn secondary">Wartung hinzufügen</button>
            {formError && <p className="form-error">{formError}</p>}
          </form>
        </ResizableCard>
      )}

      <ResizableCard as="section" storageKey={`device-docs:${device.id}`} label="Dokumentationsbereich">
        <h2>Dokumentationsbereich</h2>
        <p className="muted">Alle Wartungen dieses Geräts, die neueste zuerst.</p>
        {documentation.length === 0 ? (
          <p className="empty">Für dieses Gerät ist noch keine Wartung angelegt.</p>
        ) : (
          <div className="table-wrap">
            <table className="maint-table">
              <thead>
                <tr>
                  <th>Fällig am</th>
                  <th>Intervall in Wochen</th>
                  <th>Wartungsbeschreibung</th>
                  <th>Wartungsbeschrieb</th>
                  <th>Erfasser der Wartung</th>
                  <th>Wartungstatus</th>
                  <th>Wartung durchgeführt durch</th>
                  <th>Durchgeführt am</th>
                </tr>
              </thead>
              <tbody>
                {documentation.map((item) => (
                  <tr key={item.id}>
                    <td>{formatDisplayDate(item.dueDate)}</td>
                    <td>{item.intervalWeeks}</td>
                    <td>{item.description}</td>
                    <td>
                      <MaintenanceDetailRead
                        item={item}
                        documents={documents}
                        token={user.token}
                        isSuper={isSuper}
                        onDocuments={reloadDocuments}
                        storageKey={`maint-doc-detail:${item.id}`}
                      />
                    </td>
                    <td>{item.createdBy}</td>
                    <td>
                      <span className={`maint-status ${item.status === 'erledigt' ? 'erledigt' : 'offen'}`}>
                        {item.status === 'erledigt' ? 'erledigt' : 'offen'}
                      </span>
                    </td>
                    <td>{item.performedBy}</td>
                    <td>{item.completedAt ? formatDisplayDate(item.completedAt) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {legacy.length > 0 && (
          <>
            <h3 className="legacy-title">Bisherige Einträge</h3>
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
                  {legacy.map((entry) => (
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
          </>
        )}
      </ResizableCard>
    </div>
  )
}
