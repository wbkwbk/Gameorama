import { useEffect, useRef, useState } from 'react'
import Attachments from '../Attachments.jsx'
import MovableStage from '../MovableStage.jsx'
import ResizableCard from '../ResizableCard.jsx'
import ResizableList from '../ResizableList.jsx'
import { MIN_DETAIL_WIDTH } from '../panelSize.js'
import { listDocuments, uploadDocument } from '../storage.js'
import {
  addWeeks,
  deviceStatus,
  formatDisplayDate,
  isRepair,
  maintenanceStatus,
  deviceDeleteBlockReason,
  openMaintenances,
  sortedDocumentation,
  taskKindLabel,
  todayISO,
} from '../model.js'

function detailCopy(item) {
  if (isRepair(item)) {
    return { label: 'Reparaturbeschrieb', empty: 'Kein Reparaturbeschrieb.' }
  }
  return { label: 'Wartungsbeschrieb', empty: 'Kein Wartungsbeschrieb.' }
}

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

  const copy = detailCopy(item)
  return (
    <ResizableCard
      className="maint-detail"
      storageKey={storageKey}
      label={`${copy.label} ${item.description}`}
      minReadable={MIN_DETAIL_WIDTH}
    >
      {isSuper ? (
        <div className="detail-editor">
          <textarea
            aria-label={`${copy.label} für ${item.description}`}
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
        <p className="detail-read">{item.detail?.trim() ? item.detail : copy.empty}</p>
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

const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024
const DOCUMENT_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'doc', 'docx', 'xlsx'])

function pendingFileError(file) {
  const name = String(file?.name ?? '').trim()
  if (!name || name.length > 180 || /[\\/\0]/.test(name) || name.includes('..')) {
    return 'Ungültiger Dateiname'
  }
  const extension = name.includes('.') ? name.split('.').pop().toLowerCase() : ''
  if (!DOCUMENT_EXTENSIONS.has(extension)) return 'Dieser Dateityp ist nicht erlaubt.'
  if (file.size > MAX_DOCUMENT_BYTES) return 'Die Datei ist zu gross. Maximal 15 MB.'
  return null
}

function deviceChoiceLabel(item, groups) {
  const group = groups.find((entry) => entry.id === item.groupId)
  return `${item.name} (Nr. ${item.number})${group ? ` · ${group.name}` : ''}`
}

function MaintenanceTransfer({ item, devices, groups, onMove, onCopy }) {
  const [moveOpen, setMoveOpen] = useState(false)
  const [copyOpen, setCopyOpen] = useState(false)
  const [moveTarget, setMoveTarget] = useState(devices[0]?.id || '')
  const [copyTarget, setCopyTarget] = useState(devices[0]?.id || '')

  useEffect(() => {
    setMoveTarget((current) => (devices.some((device) => device.id === current) ? current : devices[0]?.id || ''))
    setCopyTarget((current) => (devices.some((device) => device.id === current) ? current : devices[0]?.id || ''))
  }, [devices])

  if (devices.length === 0) return null
  const noun = isRepair(item) ? 'Reparatur Aufgabe' : 'Wartung'

  return (
    <div className="maint-transfer">
      {moveOpen ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            onMove(item.id, moveTarget)
          }}
        >
          <label>
            Zielgerät
            <select
              aria-label={`Zielgerät für ${item.description}`}
              value={moveTarget}
              onChange={(event) => setMoveTarget(event.target.value)}
            >
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {deviceChoiceLabel(device, groups)}
                </option>
              ))}
            </select>
          </label>
          <div className="user-actions">
            <button type="submit" className="btn tiny secondary">Zuordnen</button>
            <button type="button" className="btn tiny ghost" onClick={() => setMoveOpen(false)}>
              Abbrechen
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn tiny secondary" onClick={() => setMoveOpen(true)}>
          {noun} einem anderen Gerät zuordnen
        </button>
      )}
      {copyOpen ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            onCopy(item.id, copyTarget)
            setCopyOpen(false)
          }}
        >
          <label>
            Zielgerät
            <select
              aria-label={`Kopie von ${item.description} zuordnen`}
              value={copyTarget}
              onChange={(event) => setCopyTarget(event.target.value)}
            >
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {deviceChoiceLabel(device, groups)}
                </option>
              ))}
            </select>
          </label>
          <p className="maint-note">Es werden nur die Textfelder kopiert, keine Dokumente.</p>
          <div className="user-actions">
            <button type="submit" className="btn tiny secondary">Kopieren</button>
            <button type="button" className="btn tiny ghost" onClick={() => setCopyOpen(false)}>
              Abbrechen
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn tiny secondary" onClick={() => setCopyOpen(true)}>
          {noun} kopieren
        </button>
      )}
    </div>
  )
}

function MaintenanceDetailRead({ item, documents, token, storageKey }) {
  const copy = detailCopy(item)
  return (
    <ResizableCard
      className="maint-detail"
      storageKey={storageKey}
      label={`${copy.label} ${item.description}`}
      minReadable={MIN_DETAIL_WIDTH}
    >
      <p className="detail-read">{item.detail?.trim() ? item.detail : copy.empty}</p>
      <Attachments
        ownerId={item.id}
        documents={documents}
        token={token}
        isSuper={false}
        onChange={() => {}}
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
  onSaveDetail,
  onAddMaintenance,
  onDeleteMaintenance,
  onEditMaintenance,
  onMoveMaintenance,
  onCopyMaintenance,
  onDeleteDocumentation,
  onDeleteDevice,
}) {
  const [documents, setDocuments] = useState([])
  const [pendingDocs, setPendingDocs] = useState([])
  const [saving, setSaving] = useState(false)
  const pendingKey = useRef(1)
  const [form, setForm] = useState({
    kind: 'wartung',
    dueDate: addWeeks(todayISO(), 4),
    intervalWeeks: 4,
    description: '',
    detail: '',
  })
  const [listFilter, setListFilter] = useState('alle')
  const [listSort, setListSort] = useState('date')
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

  useEffect(() => {
    setPendingDocs([])
    setFormError(null)
  }, [device.id])

  async function reloadDocuments() {
    setDocuments(await listDocuments(user.token))
  }

  function addPendingFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const error = pendingFileError(file)
    if (error) {
      setFormError(error)
      return
    }
    setFormError(null)
    const id = `pending-${pendingKey.current}`
    pendingKey.current += 1
    setPendingDocs((current) => [...current, { id, file }])
  }

  function removePendingFile(id) {
    setPendingDocs((current) => current.filter((item) => item.id !== id))
    setFormError(null)
  }

  const status = deviceStatus(device.id, db.maintenances, today)
  const openItems = openMaintenances(db.maintenances, device.id)
  const maintenances = openMaintenances(db.maintenances, device.id, { filter: listFilter, sort: listSort })
  const otherDevices = db.devices.filter((item) => item.id !== device.id)
  const documentation = sortedDocumentation(db.maintenances, device.id)
  const repairForm = form.kind === 'reparatur'

  async function submitMaintenance(event) {
    event.preventDefault()
    if (saving) return
    const chosen = pendingDocs
    for (const item of chosen) {
      const invalid = pendingFileError(item.file)
      if (invalid) {
        setFormError(invalid)
        return
      }
    }
    setSaving(true)
    setFormError(null)
    try {
      const outcome = await onAddMaintenance({
        kind: form.kind,
        dueDate: form.dueDate,
        intervalWeeks: form.kind === 'reparatur' ? null : Number(form.intervalWeeks),
        description: form.description,
        detail: form.detail,
      })
      if (typeof outcome === 'string') {
        setFormError(outcome)
        return
      }
      if (!outcome?.id) {
        setFormError(
          form.kind === 'reparatur'
            ? 'Reparatur Aufgabe konnte nicht gespeichert werden.'
            : 'Wartung konnte nicht gespeichert werden.',
        )
        return
      }
      const failed = []
      let uploadError = null
      for (const item of chosen) {
        try {
          await uploadDocument(user.token, outcome.id, item.file)
        } catch (err) {
          failed.push(item)
          uploadError = err instanceof Error ? err.message : 'Dokument konnte nicht hochgeladen werden.'
        }
      }
      await reloadDocuments()
      setPendingDocs(failed)
      setForm((current) => ({
        kind: current.kind,
        dueDate: addWeeks(todayISO(), 4),
        intervalWeeks: 4,
        description: '',
        detail: '',
      }))
      if (uploadError) setFormError(uploadError)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="device-page">
      <button type="button" className="btn secondary device-back" onClick={onBack}>
        ← Zurück zur Übersicht
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
          <button
            type="button"
            className="btn danger"
            disabled={Boolean(deviceDeleteBlockReason(db, device.id))}
            onClick={onDeleteDevice}
          >
            Gerät löschen
          </button>
        )}
      </header>

      {notice && <p className={`banner banner-${notice.tone}`} role="status">{notice.text}</p>}

      <MovableStage>
      <ResizableCard as="section" movable storageKey={`device-list:${device.id}`} label="Wartungsliste">
        <header className="group-head">
          <div className="section-head drag-surface">
            <button type="button" className="drag-handle" aria-label="Wartungsliste verschieben" />
            <h2>Wartungsliste</h2>
          </div>
          <div className="list-tools">
            <label className="sort-field">
              Anzeige
              <select
                aria-label="Anzeige der Wartungsliste"
                value={listFilter}
                onChange={(event) => setListFilter(event.target.value)}
              >
                <option value="alle">Alle</option>
                <option value="wartung">nur Wartung</option>
                <option value="reparatur">nur Reparatur Aufgabe</option>
              </select>
            </label>
            <label className="sort-field">
              Sortierung
              <select
                aria-label="Sortierung der Wartungsliste"
                value={listSort}
                onChange={(event) => setListSort(event.target.value)}
              >
                <option value="date">Nach Datum</option>
                <option value="kind">Nach Art, dann Datum</option>
              </select>
            </label>
          </div>
        </header>
        {openItems.length === 0 ? (
          <p className="empty">Für dieses Gerät ist noch keine Wartung angelegt.</p>
        ) : maintenances.length === 0 ? (
          <p className="empty">Keine Einträge für diese Auswahl.</p>
        ) : (
          <ResizableList
            as="div"
            className="table-wrap maint-list-scroll"
            itemKey={`${device.id}:${listFilter}:${listSort}:${maintenances.map((item) => item.id).join(',')}`}
            storageKey={`device-list:${device.id}`}
            label="Wartungsliste"
            rowSelector="tbody tr"
            minPx={160}
            fitContent
          >
            <table className="maint-table">
              <thead>
                <tr>
                  <th>Art</th>
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
                  const itemStatus = maintenanceStatus(item, today)
                  return (
                    <tr key={item.id} className={`level-${itemStatus.level}`}>
                      <th scope="row" className="task-kind-cell">
                        <span className={`task-kind ${isRepair(item) ? 'reparatur' : 'wartung'}`}>
                          {taskKindLabel(item)}
                        </span>
                      </th>
                      <td>{formatDisplayDate(item.dueDate)}</td>
                      <td>{isRepair(item) ? '' : item.intervalWeeks}</td>
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
                        <span className="maint-status offen">offen</span>
                      </td>
                      <td>{item.performedBy}</td>
                      <td>
                        <div className="maint-actions">
                          <button type="button" className="done-btn" onClick={() => onDone(item.id)}>
                            <span>Durchgeführt</span>
                            <small>{user.name}</small>
                          </button>
                          {isSuper && (
                            <button
                              type="button"
                              className="btn tiny secondary"
                              onClick={() => onEditMaintenance(item.id)}
                            >
                              Bearbeiten
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
                          {isSuper && (
                            <MaintenanceTransfer
                              item={item}
                              devices={otherDevices}
                              groups={db.groups}
                              onMove={onMoveMaintenance}
                              onCopy={onCopyMaintenance}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </ResizableList>
        )}
      </ResizableCard>
      </MovableStage>

      {isSuper && (
        <ResizableCard
          as="section"
          storageKey={`device-add:${device.id}`}
          label={repairForm ? 'Reparatur Aufgabe hinzufügen' : 'Wartung hinzufügen'}
        >
          <h2>{repairForm ? 'Reparatur Aufgabe hinzufügen / löschen' : 'Wartung hinzufügen / löschen'}</h2>
          <form className="maintenance-form" onSubmit={submitMaintenance}>
            <label>
              Art
              <select
                aria-label="Art"
                value={form.kind}
                onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value }))}
              >
                <option value="wartung">Wartung</option>
                <option value="reparatur">Reparatur Aufgabe</option>
              </select>
            </label>
            <label>
              Fällig am
              <input
                type="date"
                value={form.dueDate}
                onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
                required
              />
            </label>
            {repairForm ? null : (
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
            )}
            <label className="grow">
              {repairForm ? 'Reparatur Beschreibung' : 'Wartungsbeschreibung'}
              <input
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                placeholder={repairForm ? 'Was ist zu reparieren?' : 'Was ist zu tun?'}
                required
              />
            </label>
            <label className="wide">
              {repairForm ? 'Reparaturbeschrieb' : 'Wartungsbeschrieb'}
              <textarea
                value={form.detail}
                rows={4}
                onChange={(event) =>
                  setForm((current) => ({ ...current, detail: event.target.value }))
                }
                placeholder={
                  repairForm ? 'Ausführlicher Beschrieb zur Reparatur' : 'Ausführlicher Beschrieb zur Wartung'
                }
              />
            </label>
            <div className="wide attachments pending-docs">
              {pendingDocs.length > 0 && (
                <ul className="doc-list" aria-label="Ausgewählte Dokumente">
                  {pendingDocs.map((item) => (
                    <li key={item.id} className="doc-row">
                      <span className="doc-name">{item.file.name}</span>
                      <button
                        type="button"
                        className="btn tiny danger"
                        onClick={() => removePendingFile(item.id)}
                        disabled={saving}
                      >
                        Löschen
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <label className="upload-row">
                Dokument hinzufügen
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx,.xlsx"
                  onChange={addPendingFile}
                  disabled={saving}
                />
              </label>
            </div>
            <button type="submit" className="btn secondary" disabled={saving}>
              {saving ? 'Wird gespeichert …' : repairForm ? 'Reparatur hinzufügen' : 'Wartung hinzufügen'}
            </button>
            {formError && <p className="form-error">{formError}</p>}
          </form>
        </ResizableCard>
      )}

      <ResizableCard as="section" storageKey={`device-docs:${device.id}`} label="Dokumentationsbereich">
        <h2>Dokumentationsbereich</h2>
        <p className="muted">Erledigte Wartungen, die neueste Durchführung zuerst.</p>
        {documentation.length === 0 && (
          <p className="empty">Noch keine erledigte Wartung.</p>
        )}
        {documentation.length > 0 && (
          <div className="table-wrap">
            <table className="maint-table">
              <thead>
                <tr>
                  <th>Art</th>
                  <th>Fällig am</th>
                  <th>Intervall in Wochen</th>
                  <th>Wartungsbeschreibung</th>
                  <th>Wartungsbeschrieb</th>
                  <th>Erfasser der Wartung</th>
                  <th>Wartungstatus</th>
                  <th>Wartung durchgeführt durch</th>
                  <th>Durchgeführt am</th>
                  {isSuper && <th></th>}
                </tr>
              </thead>
              <tbody>
                {documentation.map((item) => (
                  <tr key={item.id}>
                    <th scope="row" className="task-kind-cell">
                      <span className={`task-kind ${isRepair(item) ? 'reparatur' : 'wartung'}`}>
                        {taskKindLabel(item)}
                      </span>
                    </th>
                    <td>{formatDisplayDate(item.dueDate)}</td>
                    <td>{isRepair(item) ? '' : item.intervalWeeks}</td>
                    <td>{item.description}</td>
                    <td>
                      <MaintenanceDetailRead
                        item={item}
                        documents={documents}
                        token={user.token}
                        storageKey={`maint-doc-detail:${item.id}`}
                      />
                    </td>
                    <td>{item.createdBy}</td>
                    <td>
                      <span className="maint-status erledigt">erledigt</span>
                    </td>
                    <td>{item.performedBy}</td>
                    <td>{item.completedAt ? formatDisplayDate(item.completedAt) : ''}</td>
                    {isSuper && (
                      <td>
                        <button
                          type="button"
                          className="btn tiny danger"
                          onClick={() => onDeleteDocumentation(item.id, item.description)}
                        >
                          Dokumentation löschen
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ResizableCard>
    </div>
  )
}
