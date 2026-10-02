import { useEffect, useRef, useState } from 'react'
import {
  addDevice,
  addGroup,
  addMaintenance,
  deleteDevice,
  deleteGroup,
  deleteMaintenance,
  markPerformed,
  roleLabel,
  todayISO,
  updateDeviceNotes,
} from './model.js'
import { clearSession, loadDb, loadSession, loginRequest, logoutRequest, saveDb, saveSession } from './storage.js'
import LoginScreen from './screens/LoginScreen.jsx'
import OverviewScreen from './screens/OverviewScreen.jsx'
import DeviceScreen from './screens/DeviceScreen.jsx'
import UsersScreen from './screens/UsersScreen.jsx'

function SuperMenu({ onUsers }) {
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
      setDb(await saveDb(next))
    } catch {
      setNotice({ tone: 'error', text: 'Speichern in der Datenbank ist fehlgeschlagen.' })
      try {
        setDb(await loadDb())
      } catch {
        setLoadError('Die SQLite-Datenbank ist nicht erreichbar.')
      }
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

  const device = route.name === 'device'
    ? db.devices.find((item) => item.id === route.deviceId)
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
            />
          )}
          <button type="button" className="btn ghost" onClick={logout}>
            Abmelden
          </button>
        </div>
      </header>

      <main>
        {route.name === 'device' && device ? (
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
                text: `Dokumentiert als Wartung Nr. ${result.entry.number} für ${user.name}. Nächster Termin in ${
                  db.maintenances.find((item) => item.id === maintenanceId).intervalWeeks
                } Wochen.`,
              })
            }}
            onSaveNotes={(notes) => commit(updateDeviceNotes(db, device.id, notes))}
            onAddMaintenance={(input) => {
              const result = addMaintenance(db, { ...input, deviceId: device.id })
              if (!result.ok) return result.error
              commit(result.db)
              setNotice({ tone: 'ok', text: 'Wartung hinzugefügt.' })
              return null
            }}
            onDeleteMaintenance={(maintenanceId, description) => {
              askConfirm({
                title: 'Wartung löschen',
                message: `«${description}» wird aus der Liste entfernt. Bestehende Dokumentationseinträge bleiben erhalten.`,
                confirmLabel: 'Löschen',
                action: () => {
                  commit(deleteMaintenance(db, maintenanceId))
                  setNotice({ tone: 'ok', text: 'Wartung gelöscht.' })
                },
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
            onAddDevice={(groupId, name) => {
              const result = addDevice(db, groupId, name)
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
