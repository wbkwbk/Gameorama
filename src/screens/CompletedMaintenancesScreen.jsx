import { useMemo, useState } from 'react'
import { completedMaintenanceRows, sortCompletedMaintenances } from '../model.js'
import { useDocuments } from '../DocumentLinks.jsx'
import MaintenanceRecordTable from './MaintenanceRecordTable.jsx'

export default function CompletedMaintenancesScreen({ db, token, onBack, onOpenDevice }) {
  const [sortMode, setSortMode] = useState('date')
  const documents = useDocuments(token)
  const rows = useMemo(
    () => sortCompletedMaintenances(completedMaintenanceRows(db), sortMode),
    [db, sortMode],
  )

  return (
    <div className="maintenance-overview-page">
      <button type="button" className="btn secondary device-back" onClick={onBack}>
        ← Zurück zur Übersicht
      </button>

      <header className="board-head">
        <div>
          <h1>Durchgeführte Wartungen</h1>
          <p className="muted">
            Erledigte Wartungen aus dem Dokumentationsbereich. Nach Datum: neueste Durchführung zuerst. Nur zum Ansehen.
          </p>
        </div>
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
            className={sortMode === 'group' ? 'btn secondary' : 'btn ghost'}
            aria-pressed={sortMode === 'group'}
            onClick={() => setSortMode('group')}
          >
            Nach Gruppe
          </button>
        </div>
      </header>

      <section className="group">
        <h2>Dokumentationsbereich</h2>
        {rows.length === 0 ? (
          <p className="empty">Noch keine durchgeführten Wartungen.</p>
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
