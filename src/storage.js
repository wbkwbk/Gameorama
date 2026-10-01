const LEGACY_KEY = 'gameorama-wartung-v1'
const SESSION_KEY = 'gameorama-session-v1'

async function fetchState() {
  const response = await fetch('/api/state')
  if (!response.ok) throw new Error('Datenbank nicht erreichbar')
  return response.json()
}

export async function saveDb(db) {
  const response = await fetch('/api/state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(db),
  })
  if (!response.ok) throw new Error('Speichern fehlgeschlagen')
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

export async function loadDb() {
  const legacy = window.localStorage.getItem(LEGACY_KEY)
  if (legacy) {
    try {
      const saved = await saveDb(JSON.parse(legacy))
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
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(user))
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY)
}
