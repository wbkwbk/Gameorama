import { useEffect, useRef, useState } from 'react'
import {
  addDevice,
  addGroup,
  addMaintenance,
  copyMaintenance,
  deleteDevice,
  deleteGroup,
  deleteMaintenance,
  markPerformed,
  moveDevice,
  moveMaintenance,
  renameGroup,
  roleLabel,
  todayISO,
  updateMaintenanceDetail,
} from './model.js'
import {
  clearSession,
  deleteMaintenanceRecordRequest,
  loadDb,
  loadSession,
  loginRequest,
  logoutRequest,
  saveDb,
  saveSession,
  updateMaintenanceRequest,
} from './storage.js'
import LoginScreen from './screens/LoginScreen.jsx'
import OverviewScreen from './screens/OverviewScreen.jsx'
import DeviceScreen from './screens/DeviceScreen.jsx'
import MaintenanceEditScreen from './screens/MaintenanceEditScreen.jsx'
import UsersScreen from './screens/UsersScreen.jsx'
import GroupsScreen from './screens/GroupsScreen.jsx'

function SuperMenu({ onUsers, onGroups }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    function closeOnOutside(event) {
      if (!ref.current?.contains(event.target)) setOpen(false)
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className="btn ghost menu-button"
        aria-label="Menü"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="super-menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">☰</span>
      </button>
      {open && (
        <div className="menu-panel" id="super-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onUsers()
            }}
          >
            Benutzerverwaltung
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onGroups()
            }}
          >
            Gruppen verwalten
          </button>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState(() => loadSession())
  const [db, setDb] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [route, setRoute] = useState({ name: 'overview' })
  const [notice, setNotice] = useState(null)
  const [confirm, setConfirm] = useState(null)

  useEffect(() => {
    let active = true
    loadDb()
      .then((next) => {
        if (active) setDb(next)
      })
      .catch(() => {
        if (active) setLoadError('Die SQLite-Datenbank ist nicht erreichbar.')
      })
    return () => {
      active = false
    }
  }, [])

  const today = todayISO()
  const isSuper = user?.role === 'super'

  async function commit(next) {
    setDb(next)
    try {
      setDb(await saveDb(next, user?.token))
      return true
    } catch {
      setNotice({ tone: 'error', text: 'Speichern in der Datenbank ist fehlgeschlagen.' })
      try {
        setDb(await loadDb())
      } catch {
        setLoadError('Die SQLite-Datenbank ist nicht erreichbar.')
      }
      return false
    }
  }

  async function login(username, password) {
    try {
      const nextUser = await loginRequest(username, password)
      if (!nextUser) return 'Benutzername oder Passwort ist falsch.'
      setUser(nextUser)
      saveSession(nextUser)
      setRoute({ name: 'overview' })
      setNotice(null)
      return null
    } catch {
      return 'Die Anmeldung ist gerade nicht möglich.'
    }
  }

  function logout() {
    const token = user?.token
    clearSession()
    setUser(null)
    setRoute({ name: 'overview' })
    setNotice(null)
    logoutRequest(token).catch(() => {})
  }

  function applySessionUser(next) {
    const stored = { ...next, token: user.token }
    setUser(stored)
    saveSession(stored)
    if (stored.role !== 'super') {
      setRoute({ name: 'overview' })
      setNotice({ tone: 'ok', text: 'Deine Rolle ist jetzt Standard Benutzer.' })
    }
  }

  function openDevice(deviceId) {
    setNotice(null)
    setRoute({ name: 'device', deviceId })
  }

  function askConfirm(next) {
    setConfirm(next)
  }

  if (!user) {
    return <LoginScreen onLogin={login} />
  }

  if (loadError) {
    return <p className="loading-page">{loadError}</p>
  }

  if (!db) {
    return <p className="loading-page">Daten werden aus SQLite geladen …</p>
  }

  const device = route.name === 'device' || route.name === 'maintenance-edit'
    ? db.devices.find((item) => item.id === route.deviceId)
    : null
  const editing = route.name === 'maintenance-edit'
    ? db.maintenances.find((item) => item.id === route.maintenanceId && item.deviceId === route.deviceId)
    : null

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <p className="brand-mark">Gameorama</p>
          <p className="brand-sub">Wartungstool</p>
        </div>
        <div className="session">
          <div>
            <strong>{user.name}</strong>
            <span className={`role role-${user.role}`}>{roleLabel(user.role)}</span>
          </div>
          {isSuper && (
            <SuperMenu
              onUsers={() => {
                setNotice(null)
                setRoute({ name: 'users' })
              }}
              onGroups={() => {
                setNotice(null)
                setRoute({ name: 'groups' })
              }}
            />
          )}
          <button type="button" className="btn ghost" onClick={logout}>
            Abmelden
          </button>
        </div>
      </header>

      <main>
        {route.name === 'maintenance-edit' && isSuper && device && editing ? (
          <MaintenanceEditScreen
            device={device}
            maintenance={editing}
            token={user.token}
            onCancel={() => {
              setNotice(null)
              setRoute({ name: 'device', deviceId: device.id })
            }}
            onSave={async (fields) => {
              const next = await updateMaintenanceRequest(user.token, editing.id, fields)
              setDb(next)
              setNotice({ tone: 'ok', text: 'Wartung gespeichert.' })
              setRoute({ name: 'device', deviceId: device.id })
            }}
          />
        ) : route.name === 'device' && device ? (
          <DeviceScreen
            db={db}
            device={device}
            user={user}
            today={today}
            isSuper={isSuper}
            notice={notice}
            onBack={() => {
              setNotice(null)
              setRoute({ name: 'overview' })
            }}
            onDone={(maintenanceId) => {
              const result = markPerformed(db, maintenanceId, user, today)
              if (!result.ok) {
                setNotice({ tone: 'error', text: result.error })
                return
              }
              commit(result.db)
              setNotice({
                tone: 'ok',
                text: `Als erledigt markiert. Durchgeführt durch ${user.name}. Die nächste Wartung ist angelegt.`,
              })
            }}
            onSaveDetail={(maintenanceId, detail) => {
              const result = updateMaintenanceDetail(db, maintenanceId, detail)
              if (!result.ok) {
                setNotice({ tone: 'error', text: result.error })
                return
              }
              commit(result.db)
            }}
            onAddMaintenance={async (input) => {
              const result = addMaintenance(db, { ...input, deviceId: device.id, createdBy: user.name })
              if (!result.ok) return result.error
              const saved = await commit(result.db)
              if (!saved) return 'Speichern in der Datenbank ist fehlgeschlagen.'
              const previous = new Set(db.maintenances.map((item) => item.id))
              const created = result.db.maintenances.find((item) => !previous.has(item.id))
              if (!created) return 'Wartung konnte nicht gespeichert werden.'
              setNotice({ tone: 'ok', text: 'Wartung hinzugefügt.' })
              return { id: created.id }
            }}
            onDeleteMaintenance={(maintenanceId, description) => {
              askConfirm({
                title: 'Wartung löschen',
                message: `«${description}» wird aus der Liste entfernt. Dokumente dieser Wartung werden gelöscht. Bestehende Dokumentationseinträge bleiben erhalten.`,
                confirmLabel: 'Löschen',
                action: () => {
                  commit(deleteMaintenance(db, maintenanceId))
                  setNotice({ tone: 'ok', text: 'Wartung gelöscht.' })
                },
              })
            }}
            onEditMaintenance={(maintenanceId) => {
              setNotice(null)
              setRoute({ name: 'maintenance-edit', deviceId: device.id, maintenanceId })
            }}
            onDeleteDocumentation={(maintenanceId, description) => {
              askConfirm({
                title: 'Dokumentation löschen',
                message: `«${description}» wird aus der Dokumentation entfernt. Dokumente dieser Wartung werden gelöscht. Die offene Folgewartung bleibt erhalten.`,
                confirmLabel: 'Dokumentation löschen',
                action: () => {
                  deleteMaintenanceRecordRequest(user.token, maintenanceId)
                    .then((next) => {
                      setDb(next)
                      setNotice({ tone: 'ok', text: 'Dokumentation gelöscht.' })
                    })
                    .catch((error) => {
                      setNotice({
                        tone: 'error',
                        text: error instanceof Error ? error.message : 'Dokumentation konnte nicht gelöscht werden.',
                      })
                    })
                },
              })
            }}
            onMoveMaintenance={(maintenanceId, targetDeviceId) => {
              const result = moveMaintenance(db, maintenanceId, targetDeviceId)
              if (!result.ok) {
                setNotice({ tone: 'error', text: result.error })
                return
              }
              const target = db.devices.find((item) => item.id === targetDeviceId)
              commit(result.db)
              setNotice({
                tone: 'ok',
                text: `Wartung wurde ${target ? `«${target.name}»` : 'dem anderen Gerät'} zugeordnet.`,
              })
            }}
            onCopyMaintenance={(maintenanceId, targetDeviceId) => {
              const result = copyMaintenance(db, maintenanceId, targetDeviceId, user.name)
              if (!result.ok) {
                setNotice({ tone: 'error', text: result.error })
                return
              }
              const target = db.devices.find((item) => item.id === targetDeviceId)
              commit(result.db)
              setNotice({
                tone: 'ok',
                text: `Wartung wurde nach ${target ? `«${target.name}»` : 'dem Gerät'} kopiert. Nur die Textfelder, keine Dokumente.`,
              })
            }}
            onDeleteDevice={() => {
              askConfirm({
                title: 'Gerät löschen',
                message: `«${device.name}» inklusive Wartungen und Dokumentation wird gelöscht.`,
                confirmLabel: 'Gerät löschen',
                action: () => {
                  commit(deleteDevice(db, device.id))
                  setRoute({ name: 'overview' })
                  setNotice({ tone: 'ok', text: `${device.name} wurde gelöscht.` })
                },
              })
            }}
          />
        ) : route.name === 'groups' && isSuper ? (
          <GroupsScreen
            db={db}
            notice={notice}
            onBack={() => {
              setNotice(null)
              setRoute({ name: 'overview' })
            }}
            onRenameGroup={(groupId, name) => {
              const result = renameGroup(db, groupId, name)
              if (!result.ok) return result.error
              commit(result.db)
              setNotice({ tone: 'ok', text: 'Gruppe umbenannt.' })
              return null
            }}
            onMoveDevice={(deviceId, groupId) => {
              const result = moveDevice(db, deviceId, groupId)
              if (!result.ok) return result.error
              const deviceItem = db.devices.find((item) => item.id === deviceId)
              const group = result.db.groups.find((item) => item.id === groupId)
              commit(result.db)
              setNotice({
                tone: 'ok',
                text: `${deviceItem?.name || 'Das Gerät'} ist jetzt in «${group?.name || 'der Gruppe'}».`,
              })
              return null
            }}
          />
        ) : route.name === 'users' && isSuper ? (
          <UsersScreen
            token={user.token}
            currentUsername={user.username}
            onBack={() => {
              setNotice(null)
              setRoute({ name: 'overview' })
            }}
            onSessionUser={applySessionUser}
            onSelfDeleted={logout}
            onAskConfirm={askConfirm}
          />
        ) : (
          <OverviewScreen
            db={db}
            today={today}
            isSuper={isSuper}
            notice={route.name === 'overview' ? notice : null}
            onOpenDevice={openDevice}
            onAddGroup={(name) => {
              const result = addGroup(db, name)
              if (!result.ok) return result.error
              commit(result.db)
              return null
            }}
            onDeleteGroup={(group) => {
              const count = db.devices.filter((item) => item.groupId === group.id).length
              askConfirm({
                title: 'Gruppe löschen',
                message:
                  count === 0
                    ? `Gruppe «${group.name}» wird gelöscht.`
                    : `Gruppe «${group.name}» und ${count} Gerät${count === 1 ? '' : 'e'} werden gelöscht.`,
                confirmLabel: 'Löschen',
                action: () => commit(deleteGroup(db, group.id)),
              })
            }}
            onAddDevice={(groupId, name, number) => {
              const result = addDevice(db, groupId, name, number)
              if (!result.ok) return result.error
              commit(result.db)
              return null
            }}
            onDeleteDevice={(deviceItem) => {
              askConfirm({
                title: 'Gerät löschen',
                message: `«${deviceItem.name}» inklusive Wartungen und Dokumentation wird gelöscht.`,
                confirmLabel: 'Gerät löschen',
                action: () => commit(deleteDevice(db, deviceItem.id)),
              })
            }}
          />
        )}
      </main>

      {confirm && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <h2 id="confirm-title">{confirm.title}</h2>
            <p>{confirm.message}</p>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setConfirm(null)}>
                Abbrechen
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  confirm.action()
                  setConfirm(null)
                }}
              >
                {confirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
