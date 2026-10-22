import { useMemo, useState } from 'react'
import { maintenanceOverviewRows, performedActionLabel, sortMaintenanceOverview } from '../model.js'
import { useDocuments } from '../DocumentLinks.jsx'
import MaintenanceRecordTable from './MaintenanceRecordTable.jsx'

export default function MaintenanceOverviewScreen({ db, today, token, user, notice, onBack, onOpenDevice, onDone }) {
  const [sortMode, setSortMode] = useState('due')
  const documents = useDocuments(token)
  const rows = useMemo(
    () => sortMaintenanceOverview(maintenanceOverviewRows(db), sortMode),
    [db, sortMode],
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
          <p className="muted">Offene Wartungen, die noch zu erledigen sind.</p>
        </div>
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
            className={sortMode === 'group' ? 'btn secondary' : 'btn ghost'}
            aria-pressed={sortMode === 'group'}
            onClick={() => setSortMode('group')}
          >
            Nach Gruppe
          </button>
        </div>
      </header>

      {notice && <p className={`banner banner-${notice.tone}`} role="status">{notice.text}</p>}

      <section className="group">
        <h2>Offene Wartungen</h2>
        {rows.length === 0 ? (
          <p className="empty">Keine offenen Wartungen.</p>
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
