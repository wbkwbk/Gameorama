import { useEffect, useState } from 'react'
import Attachments from '../Attachments.jsx'
import { isRepair, maintenanceEditError, taskKind } from '../model.js'
import { listDocuments } from '../storage.js'

function initialFields(maintenance) {
  return {
    kind: taskKind(maintenance),
    dueDate: maintenance.dueDate || '',
    intervalWeeks: String(maintenance.intervalWeeks ?? ''),
    description: maintenance.description || '',
    detail: maintenance.detail || '',
    createdBy: maintenance.createdBy || '',
    status: maintenance.status === 'erledigt' ? 'erledigt' : 'offen',
    performedBy: maintenance.performedBy || '',
    completedAt: maintenance.completedAt || '',
  }
}

export default function MaintenanceEditScreen({ device, maintenance, token, onCancel, onOverview, onSave }) {
  const [fields, setFields] = useState(() => initialFields(maintenance))
  const [documents, setDocuments] = useState([])
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let active = true
    listDocuments(token)
      .then((rows) => {
        if (active) setDocuments(rows)
      })
      .catch(() => {
        if (active) setDocuments([])
      })
    return () => {
      active = false
    }
  }, [token])

  async function reloadDocuments() {
    setDocuments(await listDocuments(token))
  }

  function set(key, value) {
    setFields((current) => ({ ...current, [key]: value }))
    setError(null)
  }

  async function save(event) {
    event.preventDefault()
    const payload = {
      ...fields,
      kind: fields.kind,
      intervalWeeks: fields.kind === 'reparatur' ? null : Number(fields.intervalWeeks),
    }
    const message = maintenanceEditError(payload)
    if (message) {
      setError(message)
      return
    }
    setPending(true)
    setError(null)
    try {
      await onSave(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wartung konnte nicht gespeichert werden.')
      setPending(false)
    }
  }

  const repair = isRepair(fields)
  return (
    <div className="device-page maintenance-edit">
      <button type="button" className="btn secondary device-back" onClick={onOverview}>
        ← Zurück zur Übersicht
      </button>
      <header className="device-title">
        <div>
          <h1>
            <span className="device-title-name">{device.name}</span>
            <span className="device-number">Nr. {device.number}</span>
          </h1>
          <p className="muted">{repair ? 'Reparatur Aufgabe bearbeiten' : 'Wartung bearbeiten'}</p>
        </div>
      </header>

      <section>
        <h2>{fields.description.trim() || 'Wartung'}</h2>
        <form className="maintenance-form" autoComplete="off" noValidate onSubmit={save}>
          <label>
            Art
            <select aria-label="Art" value={fields.kind} disabled>
              <option value="wartung">Wartung</option>
              <option value="reparatur">Reparatur Aufgabe</option>
            </select>
          </label>
          <label>
            Fällig am
            <input
              type="date"
              value={fields.dueDate}
              onChange={(event) => set('dueDate', event.target.value)}
            />
          </label>
          {repair ? null : (
            <label>
              Intervall in Wochen
              <input
                type="number"
                min="1"
                step="1"
                value={fields.intervalWeeks}
                onChange={(event) => set('intervalWeeks', event.target.value)}
              />
            </label>
          )}
          <label className="grow">
            {repair ? 'Reparatur Beschreibung' : 'Wartungsbeschreibung'}
            <input
              value={fields.description}
              onChange={(event) => set('description', event.target.value)}
            />
          </label>
          <label className="wide">
            {repair ? 'Reparaturbeschrieb' : 'Wartungsbeschrieb'}
            <textarea
              rows={4}
              value={fields.detail}
              onChange={(event) => set('detail', event.target.value)}
            />
          </label>
          <label>
            Erfasser der Wartung
            <input
              value={fields.createdBy}
              onChange={(event) => set('createdBy', event.target.value)}
            />
          </label>
          <label>
            Wartungstatus
            <select value={fields.status} onChange={(event) => set('status', event.target.value)}>
              <option value="offen">offen</option>
              <option value="erledigt">erledigt</option>
            </select>
          </label>
          <label>
            Wartung durchgeführt durch
            <input
              value={fields.performedBy}
              onChange={(event) => set('performedBy', event.target.value)}
            />
          </label>
          <label>
            Durchgeführt am
            <input
              type="date"
              value={fields.completedAt}
              onChange={(event) => set('completedAt', event.target.value)}
            />
          </label>
          <div className="wide">
            <Attachments
              ownerId={maintenance.id}
              documents={documents}
              token={token}
              isSuper
              onChange={reloadDocuments}
            />
          </div>
          <div className="user-actions wide">
            <button type="submit" className="btn secondary" disabled={pending}>
              Speichern
            </button>
            <button type="button" className="btn ghost" onClick={onCancel} disabled={pending}>
              Abbrechen
            </button>
          </div>
          {error && (
            <p className="form-error wide" role="alert">
              {error}
            </p>
          )}
        </form>
      </section>
    </div>
  )
}
