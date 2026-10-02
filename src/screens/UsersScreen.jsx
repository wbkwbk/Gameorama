import { useEffect, useState } from 'react'
import { roleLabel } from '../model.js'
import { createUser, deleteUser, fetchUsers, updateUser } from '../storage.js'

const EMPTY = { username: '', password: '', name: '', role: 'standard', comment: '' }

function validate(fields, mode) {
  if (!fields.username.trim()) return 'Benutzername fehlt'
  if (mode === 'create' && !fields.password) return 'Passwort fehlt'
  if (!fields.name.trim()) return 'Name fehlt'
  if (fields.role !== 'standard' && fields.role !== 'super') {
    return 'Rolle muss standard oder super sein'
  }
  return null
}

function payload(fields, mode) {
  const body = {
    username: fields.username.trim(),
    name: fields.name.trim(),
    role: fields.role,
    comment: fields.comment,
  }
  if (mode === 'create' || fields.password) body.password = fields.password
  return body
}

function UserForm({ mode, initial, onSubmit, onCancel }) {
  const [fields, setFields] = useState(initial)
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(false)

  function set(key, value) {
    setFields((current) => ({ ...current, [key]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    const message = validate(fields, mode)
    if (message) {
      setError(message)
      return
    }
    setPending(true)
    setError(null)
    try {
      await onSubmit(payload(fields, mode))
    } catch (err) {
      setError(err.message || 'Speichern ist fehlgeschlagen.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="user-form" autoComplete="off" onSubmit={submit}>
      <label>
        Benutzername
        <input
          name="username"
          autoComplete="off"
          value={fields.username}
          onChange={(event) => set('username', event.target.value)}
        />
      </label>
      <label>
        Passwort
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          value={fields.password}
          placeholder={mode === 'edit' ? 'leer lassen, um das Passwort zu behalten' : ''}
          onChange={(event) => set('password', event.target.value)}
        />
      </label>
      <label>
        Name
        <input
          name="display-name"
          autoComplete="off"
          value={fields.name}
          onChange={(event) => set('name', event.target.value)}
        />
      </label>
      <label>
        Rolle
        <select value={fields.role} onChange={(event) => set('role', event.target.value)}>
          <option value="standard">Standard Benutzer</option>
          <option value="super">Super Benutzer</option>
        </select>
      </label>
      <label className="wide">
        Kommentar
        <textarea
          rows={3}
          value={fields.comment}
          onChange={(event) => set('comment', event.target.value)}
        />
      </label>
      {error && <p className="form-error wide" role="alert">{error}</p>}
      <div className="user-actions wide">
        <button type="submit" className="btn primary" disabled={pending}>
          {mode === 'create' ? 'Benutzer anlegen' : 'Speichern'}
        </button>
        {mode === 'edit' && (
          <button type="button" className="btn ghost" onClick={onCancel}>
            Abbrechen
          </button>
        )}
      </div>
    </form>
  )
}

export default function UsersScreen({
  token,
  currentUsername,
  onBack,
  onSessionUser,
  onSelfDeleted,
  onAskConfirm,
}) {
  const [users, setUsers] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [banner, setBanner] = useState(null)
  const [editing, setEditing] = useState(null)
  const [createKey, setCreateKey] = useState(0)

  async function reload() {
    const list = await fetchUsers(token)
    setUsers(list)
    return list
  }

  useEffect(() => {
    if (!token) {
      setLoadError('Bitte melde dich erneut an.')
      return undefined
    }
    let active = true
    fetchUsers(token)
      .then((list) => {
        if (active) setUsers(list)
      })
      .catch((error) => {
        if (active) setLoadError(error.message)
      })
    return () => {
      active = false
    }
  }, [token])

  async function handleCreate(fields) {
    await createUser(token, fields)
    setCreateKey((value) => value + 1)
    setBanner({ tone: 'ok', text: `${fields.username} wurde angelegt.` })
    await reload()
  }

  async function handleUpdate(fields) {
    const original = editing
    const updated = await updateUser(token, original, fields)
    if (original === currentUsername) {
      onSessionUser(updated)
      if (updated.role !== 'super') return
    }
    setEditing(null)
    setBanner({ tone: 'ok', text: `${updated.username} wurde gespeichert.` })
    await reload()
  }

  function askDelete(account) {
    const self = account.username === currentUsername
    onAskConfirm({
      title: 'Benutzer löschen',
      message: self
        ? `«${account.name}» (${account.username}) ist dein eigenes Konto. Es wird gelöscht und du wirst abgemeldet.`
        : `«${account.name}» (${account.username}) wird gelöscht.`,
      confirmLabel: 'Löschen',
      action: () => {
        deleteUser(token, account.username)
          .then(() => {
            if (self) {
              onSelfDeleted()
              return
            }
            setBanner({ tone: 'ok', text: `${account.username} wurde gelöscht.` })
            if (editing === account.username) setEditing(null)
            return reload()
          })
          .catch((error) => {
            setBanner({ tone: 'error', text: error.message })
          })
      },
    })
  }

  const editingUser = users?.find((account) => account.username === editing)

  return (
    <div className="users-page">
      <button type="button" className="text-link" onClick={onBack}>
        ← Übersicht
      </button>
      <header className="board-head">
        <div>
          <h1>Benutzerverwaltung</h1>
          <p className="muted">
            Benutzer anlegen, ändern und löschen. Passwörter bleiben als Hash in der Datenbank und werden hier nicht angezeigt.
          </p>
        </div>
      </header>

      {banner && <p className={`banner banner-${banner.tone}`} role="status">{banner.text}</p>}
      {loadError && <p className="banner banner-error" role="alert">{loadError}</p>}

      <section className="group">
        <h2>Neuer Benutzer</h2>
        <UserForm key={createKey} mode="create" initial={EMPTY} onSubmit={handleCreate} />
      </section>

      <section className="group">
        <h2>Benutzer</h2>
        {users === null && !loadError && <p className="empty">Benutzer werden geladen …</p>}
        {users && users.length === 0 && <p className="empty">Noch keine Benutzer.</p>}
        {users && users.length > 0 && (
          <div className="table-wrap">
            <table className="user-table">
              <thead>
                <tr>
                  <th>Benutzername</th>
                  <th>Name</th>
                  <th>Rolle</th>
                  <th>Kommentar</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((account) => (
                  <tr key={account.username}>
                    <td data-label="Benutzername">{account.username}</td>
                    <td data-label="Name">{account.name}</td>
                    <td data-label="Rolle">{roleLabel(account.role)}</td>
                    <td data-label="Kommentar">{account.comment}</td>
                    <td className="user-row-actions">
                      <button type="button" className="btn tiny secondary" onClick={() => {
                        setBanner(null)
                        setEditing(account.username)
                      }}>
                        Bearbeiten
                      </button>
                      <button type="button" className="btn tiny danger" onClick={() => askDelete(account)}>
                        Löschen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {editingUser && (
          <div className="user-edit">
            <h3>{editingUser.username} bearbeiten</h3>
            <UserForm
              key={editingUser.username}
              mode="edit"
              initial={{
                username: editingUser.username,
                password: '',
                name: editingUser.name,
                role: editingUser.role,
                comment: editingUser.comment || '',
              }}
              onSubmit={handleUpdate}
              onCancel={() => setEditing(null)}
            />
          </div>
        )}
      </section>
    </div>
  )
}
