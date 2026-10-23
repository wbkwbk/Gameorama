import { useMemo, useState } from 'react'
import {
  filterMaintenanceRows,
  maintenanceOverviewRows,
  performedActionLabel,
  sortMaintenanceOverview,
} from '../model.js'
import { useDocuments } from '../DocumentLinks.jsx'
import MaintenanceRecordTable from './MaintenanceRecordTable.jsx'

export default function MaintenanceOverviewScreen({ db, today, token, user, notice, onBack, onOpenDevice, onDone }) {
  const [sortMode, setSortMode] = useState('due')
  const [filter, setFilter] = useState('alle')
  const documents = useDocuments(token)
  const allRows = useMemo(() => maintenanceOverviewRows(db), [db])
  const rows = useMemo(
    () => sortMaintenanceOverview(filterMaintenanceRows(allRows, filter), sortMode),
    [allRows, filter, sortMode],
  )
  const actionLabel = performedActionLabel(user)

  return (
    <div className="maintenance-overview-page">
      <button type="button" className="btn secondary device-back" onClick={onBack}>
        ← Zurück zur Übersicht
      </button>

      <header className="board-head">
        <div>
          <h1>Wartungsübersicht</h1>
          <p className="muted">Offene Wartungen und Reparatur Aufgaben, die noch zu erledigen sind.</p>
        </div>
        <div className="overview-tools">
          <label className="sort-field">
            Anzeige
            <select aria-label="Anzeige" value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="alle">Alle</option>
              <option value="wartung">Wartung</option>
              <option value="reparatur">Reparatur</option>
            </select>
          </label>
          <div className="sort-switch" role="group" aria-label="Sortierung">
            <button
              type="button"
              className={sortMode === 'due' ? 'btn secondary' : 'btn ghost'}
              aria-pressed={sortMode === 'due'}
              onClick={() => setSortMode('due')}
            >
              Nach Fälligkeit
            </button>
            <button
              type="button"
              className={sortMode === 'kind' ? 'btn secondary' : 'btn ghost'}
              aria-pressed={sortMode === 'kind'}
              onClick={() => setSortMode('kind')}
            >
              Nach Art und Datum
            </button>
            <button
              type="button"
              className={sortMode === 'group' ? 'btn secondary' : 'btn ghost'}
              aria-pressed={sortMode === 'group'}
              onClick={() => setSortMode('group')}
            >
              Nach Gruppe
            </button>
          </div>
        </div>
      </header>

      {notice && <p className={`banner banner-${notice.tone}`} role="status">{notice.text}</p>}

      <section className="group">
        <h2>Offene Wartungen</h2>
        {allRows.length === 0 ? (
          <p className="empty">Keine offenen Wartungen.</p>
        ) : rows.length === 0 ? (
          <p className="empty">Keine Einträge für diese Auswahl.</p>
        ) : (
          <MaintenanceRecordTable
            rows={rows}
            today={today}
            documents={documents}
            token={token}
            onOpenDevice={onOpenDevice}
            colorByDue
            renderAction={(row) => (
              <button type="button" className="done-btn" onClick={() => onDone(row.maintenanceId)}>
                {actionLabel}
              </button>
            )}
          />
        )}
      </section>
    </div>
  )
}
