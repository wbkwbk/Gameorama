const PREFIX = 'gameorama-panel-size:'

export const MIN_PANEL_WIDTH = 280
export const MIN_DETAIL_WIDTH = 256
export const NUDGE_STEP = 16
export const NUDGE_STEP_LARGE = 48

export function clampSize(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function boundsForRect(left, viewportWidth, { minReadable = MIN_PANEL_WIDTH, gutter = 12 } = {}) {
  const available = Math.max(0, Math.floor(Number(viewportWidth) - Math.max(0, Number(left) || 0) - gutter))
  const min = Math.min(minReadable, available)
  return { min, max: available }
}

export function horizontalBounds(element, options) {
  const left = element.getBoundingClientRect().left
  return boundsForRect(left, window.innerWidth || 0, options)
}

function storageOf(storage) {
  return storage === undefined ? globalThis.localStorage : storage
}

export function readPanelSize(key, storage) {
  const store = storageOf(storage)
  if (!key || !store) return {}
  try {
    const raw = store.getItem(PREFIX + key)
    if (!raw) return {}
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') return {}
    const size = {}
    if (Number.isFinite(data.width) && data.width > 0) size.width = data.width
    if (Number.isFinite(data.height) && data.height > 0) size.height = data.height
    return size
  } catch {
    return {}
  }
}

export function writePanelSize(key, patch, storage) {
  const store = storageOf(storage)
  if (!key || !store || !patch) return
  try {
    const next = { ...readPanelSize(key, store), ...patch }
    for (const name of ['width', 'height']) {
      if (!Number.isFinite(next[name]) || next[name] <= 0) delete next[name]
    }
    store.setItem(PREFIX + key, JSON.stringify(next))
  } catch {
    // UI preference only. Ignore private-mode and quota failures.
  }
}
