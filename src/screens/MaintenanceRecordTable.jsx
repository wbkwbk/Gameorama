import { dueLevel, formatDisplayDate } from '../model.js'
import DocumentLinks from '../DocumentLinks.jsx'

function displayDate(value) {
  const iso = String(value ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return ''
  return formatDisplayDate(iso)
}

export default function MaintenanceRecordTable({
  rows,
  today,
  documents,
  token,
  onOpenDevice,
  colorByDue = false,
  renderAction = null,
}) {
  return (
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
            <th>Dokumente</th>
            {renderAction && <th></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const level = colorByDue && row.status === 'offen' && row.dueDate ? dueLevel(row.dueDate, today) : ''
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
                <td className="overview-docs">
                  <DocumentLinks ownerId={row.maintenanceId} documents={documents} token={token} />
                </td>
                {renderAction && <td>{renderAction(row)}</td>}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
