import { useMemo, useState } from 'react'
import { dueLevel, formatDisplayDate, maintenanceOverviewRows, sortMaintenanceOverview } from '../model.js'

function displayDate(value) {
  const iso = String(value ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return ''
  return formatDisplayDate(iso)
}

export default function MaintenanceOverviewScreen({ db, today, onBack, onOpenDevice }) {
  const [sortMode, setSortMode] = useState('due')
  const rows = useMemo(
    () => sortMaintenanceOverview(maintenanceOverviewRows(db), sortMode),
    [db, sortMode],
  )

  return (
    <div className="maintenance-overview-page">
      <button type="button" className="btn secondary device-back" onClick={onBack}>
        ← Zurück zur Übersicht
      </button>

      <header className="board-head">
        <div>
          <h1>Wartungsübersicht</h1>
          <p className="muted">
            Alle Wartungen mit Gerätegruppe. Offene Aufgaben, erledigte Einträge und das Dokumentationsprotokoll. Nur zum Ansehen.
          </p>
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

      <section className="group">
        <h2>Alle Wartungen</h2>
        {rows.length === 0 ? (
          <p className="empty">Noch keine Wartungen.</p>
        ) : (
          <div className="table-wrap">
            <table className="maint-table overview-table">
              <thead>
                <tr>
                  <th>Gerätegruppe</th>
                  <th>Gerätename</th>
                  <th>Gerätenummer</th>
                  <th>Fällig am</th>
                  <th>Intervall in Wochen</th>
                  <th>Wartungsbeschreibung</th>
                  <th>Wartungsbeschrieb</th>
                  <th>Erfasser</th>
                  <th>Wartungsstatus</th>
                  <th>Durchgeführt durch</th>
                  <th>Durchgeführt am</th>
                  <th>Erfasst am</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const level = row.status === 'offen' && row.dueDate ? dueLevel(row.dueDate, today) : ''
                  return (
                    <tr key={row.id} className={level ? `level-${level}` : undefined}>
                      <td>{row.groupName}</td>
                      <td>
                        {row.deviceId ? (
                          <button type="button" className="text-link" onClick={() => onOpenDevice(row.deviceId)}>
                            {row.deviceName}
                          </button>
                        ) : (
                          row.deviceName
                        )}
                      </td>
                      <td>{row.deviceNumber}</td>
                      <td>{displayDate(row.dueDate)}</td>
                      <td>{row.intervalWeeks}</td>
                      <td>{row.description}</td>
                      <td className="detail-cell">{row.detail}</td>
                      <td>{row.createdBy}</td>
                      <td>
                        <span className={`maint-status ${row.status}`}>{row.statusLabel}</span>
                      </td>
                      <td>{row.performedBy}</td>
                      <td>{displayDate(row.completedAt)}</td>
                      <td>{displayDate(row.createdAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
