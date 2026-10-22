const PREFIX = 'gameorama-panel-pos:'

export const PANEL_VISIBLE_PX = 64
export const PANEL_MAX_Y = 12000
export const PANEL_GAP = 16

export function viewportHostWidth(stageLeft, viewportWidth) {
  const left = Number.isFinite(stageLeft) ? stageLeft : 0
  const viewport = Number.isFinite(viewportWidth) ? viewportWidth : 0
  return Math.max(0, viewport - Math.max(0, left))
}

export function clampPanelPosition(x, y, {
  width = 0,
  hostWidth = 0,
  visible = PANEL_VISIBLE_PX,
  maxY = PANEL_MAX_Y,
} = {}) {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 0
  const safeHost = Number.isFinite(hostWidth) && hostWidth > 0 ? hostWidth : 0
  const keep = Math.max(1, Math.min(visible, safeWidth || visible))
  const maxX = Math.max(0, safeHost - keep)
  const maxTop = Number.isFinite(maxY) && maxY >= 0 ? maxY : PANEL_MAX_Y
  const nextX = Math.min(maxX, Math.max(0, Number.isFinite(x) ? x : 0))
  const nextY = Math.min(maxTop, Math.max(0, Number.isFinite(y) ? y : 0))
  return { x: Math.round(nextX), y: Math.round(nextY) }
}

function storageOf(storage) {
  return storage === undefined ? globalThis.localStorage : storage
}

export function readPanelPosition(key, storage) {
  const store = storageOf(storage)
  if (!key || !store) return null
  try {
    const raw = store.getItem(PREFIX + key)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') return null
    if (!Number.isFinite(data.x) || !Number.isFinite(data.y)) return null
    return { x: data.x, y: data.y }
  } catch {
    return null
  }
}

export function writePanelPosition(key, position, storage) {
  const store = storageOf(storage)
  if (!key || !store || !position) return
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return
  try {
    store.setItem(PREFIX + key, JSON.stringify({ x: position.x, y: position.y }))
  } catch {
    // UI preference only. Ignore private-mode and quota failures.
  }
}

function placed(entry, hostWidth) {
  const live = entry.live
  const stored = entry.stored
  if (live?.pinned) {
    return { ...clampPanelPosition(live.x, live.y, { width: entry.width, hostWidth }), pinned: true }
  }
  if (!live && stored) {
    return { ...clampPanelPosition(stored.x, stored.y, { width: entry.width, hostWidth }), pinned: true }
  }
  return null
}

export function layoutPanelPositions(entries, { hostWidth = 0, gap = PANEL_GAP } = {}) {
  const pinned = new Map()
  const loose = []
  let pinnedBottom = 0
  for (const entry of entries) {
    const pos = placed(entry, hostWidth)
    if (pos) {
      pinned.set(entry.key, pos)
      pinnedBottom = Math.max(pinnedBottom, pos.y + Math.max(0, entry.height || 0))
    } else {
      loose.push(entry)
    }
  }
  const positions = new Map(pinned)
  let cursor = pinned.size === 0 ? 0 : pinnedBottom + (pinnedBottom > 0 && loose.length > 0 ? gap : 0)
  for (const entry of loose) {
    positions.set(entry.key, { x: 0, y: cursor, pinned: false })
    cursor += Math.max(0, entry.height || 0) + gap
  }
  let height = 0
  const ordered = entries.map((entry) => {
    const pos = positions.get(entry.key)
    height = Math.max(height, pos.y + Math.max(0, entry.height || 0))
    return { key: entry.key, x: pos.x, y: pos.y, pinned: pos.pinned }
  })
  return { positions: ordered, height }
}
