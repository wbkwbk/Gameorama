import { createSeedDb } from './model.js'

const DB_KEY = 'gameorama-wartung-v1'
const SESSION_KEY = 'gameorama-session-v1'

export function loadDb() {
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (!raw) {
      const seeded = createSeedDb()
      localStorage.setItem(DB_KEY, JSON.stringify(seeded))
      return seeded
    }
    return JSON.parse(raw)
  } catch {
    return createSeedDb()
  }
}

export function saveDb(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db))
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
