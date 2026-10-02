const LEGACY_KEY = 'gameorama-wartung-v1'
const SESSION_KEY = 'gameorama-session-v1'

async function fetchState() {
  const response = await fetch('/api/state')
  if (!response.ok) throw new Error('Datenbank nicht erreichbar')
  return response.json()
}

export async function saveDb(db, token) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch('/api/state', {
    method: 'PUT',
    headers,
    body: JSON.stringify(db),
  })
  if (!response.ok) throw new Error(await apiError(response, 'Speichern fehlgeschlagen'))
  return response.json()
}

export async function loginRequest(username, password) {
  const response = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (response.status === 401) return null
  if (!response.ok) throw new Error('Anmeldung fehlgeschlagen')
  return response.json()
}

async function apiError(response, fallback) {
  try {
    const data = await response.json()
    if (data && typeof data.error === 'string' && data.error) return data.error
  } catch {
    // Die Oberfläche zeigt dann den allgemeinen Hinweis.
  }
  return fallback
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` }
}

export async function logoutRequest(token) {
  if (!token) return
  await fetch('/api/logout', { method: 'POST', headers: bearer(token) })
}

export async function fetchUsers(token) {
  const response = await fetch('/api/users', { headers: bearer(token) })
  if (!response.ok) throw new Error(await apiError(response, 'Benutzer konnten nicht geladen werden.'))
  return response.json()
}

export async function createUser(token, fields) {
  const response = await fetch('/api/users', {
    method: 'POST',
    headers: { ...bearer(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  if (!response.ok) throw new Error(await apiError(response, 'Benutzer konnte nicht angelegt werden.'))
  return response.json()
}

export async function updateUser(token, username, fields) {
  const response = await fetch(`/api/users/${encodeURIComponent(username)}`, {
    method: 'PUT',
    headers: { ...bearer(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  if (!response.ok) throw new Error(await apiError(response, 'Benutzer konnte nicht gespeichert werden.'))
  return response.json()
}

export async function deleteUser(token, username) {
  const response = await fetch(`/api/users/${encodeURIComponent(username)}`, {
    method: 'DELETE',
    headers: bearer(token),
  })
  if (!response.ok) throw new Error(await apiError(response, 'Benutzer konnte nicht gelöscht werden.'))
  return response.json()
}

export async function loadDb() {
  const legacy = window.localStorage.getItem(LEGACY_KEY)
  if (legacy) {
    try {
      const session = loadSession()
      const saved = await saveDb(JSON.parse(legacy), session?.token)
      window.localStorage.removeItem(LEGACY_KEY)
      return saved
    } catch {
      // Der Server liefert sonst den bestehenden Datenbestand.
    }
  }
  return fetchState()
}

export function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveSession(user) {
  const { token, username, name, role, comment } = user
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ token, username, name, role, comment }),
  )
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY)
}
