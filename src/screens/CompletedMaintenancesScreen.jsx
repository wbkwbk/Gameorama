import { useMemo, useState } from 'react'
import { completedMaintenanceRows, filterMaintenanceRows, sortCompletedMaintenances } from '../model.js'
import { useDocuments } from '../DocumentLinks.jsx'
import MaintenanceRecordTable from './MaintenanceRecordTable.jsx'

export default function CompletedMaintenancesScreen({ db, token, onBack, onOpenDevice }) {
  const [sortMode, setSortMode] = useState('date')
  const [filter, setFilter] = useState('alle')
  const documents = useDocuments(token)
  const allRows = useMemo(() => completedMaintenanceRows(db), [db])
  const rows = useMemo(
    () => sortCompletedMaintenances(filterMaintenanceRows(allRows, filter), sortMode),
    [allRows, filter, sortMode],
  )

  return (
    <div className="maintenance-overview-page">
      <button type="button" className="btn secondary device-back" onClick={onBack}>
        ← Zurück zur Übersicht
      </button>

      <header className="board-head">
        <div>
          <h1>Durchgeführte Wartungen /Reparaturen</h1>
          <p className="muted">
            Erledigte Wartungen und Reparatur Aufgaben. Nach Datum: neueste Durchführung zuerst. Nur zum Ansehen.
          </p>
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
              className={sortMode === 'date' ? 'btn secondary' : 'btn ghost'}
              aria-pressed={sortMode === 'date'}
              onClick={() => setSortMode('date')}
            >
              Nach Datum
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

      <section className="group">
        <h2>Dokumentationsbereich</h2>
        {allRows.length === 0 ? (
          <p className="empty">Noch keine durchgeführten Wartungen.</p>
        ) : rows.length === 0 ? (
          <p className="empty">Keine Einträge für diese Auswahl.</p>
        ) : (
          <MaintenanceRecordTable
            rows={rows}
            documents={documents}
            token={token}
            onOpenDevice={onOpenDevice}
          />
        )}
      </section>
    </div>
  )
}
