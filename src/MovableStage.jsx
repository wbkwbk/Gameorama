import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  layoutPanelPositions,
  readPanelPosition,
  viewportHostWidth,
  writePanelPosition,
} from './panelPosition.js'

const MovableStageContext = createContext(null)

export function useMovableStage() {
  return useContext(MovableStageContext)
}

const BLOCKED = 'a, input, textarea, select, option, label, .device-row, .device-open, .resize-handle, button'

export function canStartPanelDrag(target, root) {
  const element = target instanceof Element ? target : target?.parentElement
  if (!element || !root?.contains(element)) return false
  if (element.closest('.drag-handle')) return true
  if (element.closest(BLOCKED)) return false
  const surface = element.closest('.drag-surface')
  return Boolean(surface && root.contains(surface))
}

function sameLayout(current, next) {
  const keys = Object.keys(next)
  if (keys.length !== Object.keys(current).length) return false
  return keys.every((key) => {
    const left = current[key]
    const right = next[key]
    return left
      && left.x === right.x
      && left.y === right.y
      && Boolean(left.pinned) === Boolean(right.pinned)
  })
}

function measureHeight(nodes, positions) {
  let bottom = 0
  for (const [key, node] of nodes) {
    const pos = positions[key]
    if (!pos || !node) continue
    bottom = Math.max(bottom, pos.y + node.offsetHeight)
  }
  return bottom
}

export default function MovableStage({ children, className = '' }) {
  const stageRef = useRef(null)
  const nodesRef = useRef(new Map())
  const boxesRef = useRef({})
  const [boxes, setBoxes] = useState({})
  const [stageHeight, setStageHeight] = useState(0)
  const [tick, setTick] = useState(0)

  const register = useCallback((key, node) => {
    if (!key || !node) return () => {}
    nodesRef.current.set(key, node)
    setTick((value) => value + 1)
    return () => {
      if (nodesRef.current.get(key) === node) nodesRef.current.delete(key)
      setTick((value) => value + 1)
    }
  }, [])

  const applyBoxes = useCallback((next) => {
    boxesRef.current = next
    setBoxes((current) => (sameLayout(current, next) ? current : next))
    const bottom = measureHeight(nodesRef.current, next)
    setStageHeight((current) => (Math.abs(current - bottom) < 1 ? current : bottom))
  }, [])

  const move = useCallback((key, pos) => {
    const next = {
      ...boxesRef.current,
      [key]: { x: pos.x, y: pos.y, pinned: true },
    }
    applyBoxes(next)
  }, [applyBoxes])

  const pinAll = useCallback(() => {
    const next = {}
    for (const key of nodesRef.current.keys()) {
      const pos = boxesRef.current[key] || { x: 0, y: 0 }
      next[key] = { x: pos.x, y: pos.y, pinned: true }
    }
    applyBoxes(next)
  }, [applyBoxes])

  const commitAll = useCallback(() => {
    const next = {}
    for (const [key, pos] of Object.entries(boxesRef.current)) {
      if (!nodesRef.current.has(key)) continue
      next[key] = { x: pos.x, y: pos.y, pinned: true }
      writePanelPosition(key, next[key])
    }
    applyBoxes(next)
  }, [applyBoxes])

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return undefined

    function sync() {
      const hostWidth = viewportHostWidth(stage.getBoundingClientRect().left, window.innerWidth)
      const entries = [...nodesRef.current.entries()].map(([key, node]) => ({
        key,
        width: node.getBoundingClientRect().width,
        height: node.offsetHeight,
        stored: readPanelPosition(key),
        live: boxesRef.current[key] || null,
      }))
      const layout = layoutPanelPositions(entries, { hostWidth })
      const next = {}
      for (const pos of layout.positions) {
        next[pos.key] = { x: pos.x, y: pos.y, pinned: pos.pinned }
        const entry = entries.find((item) => item.key === pos.key)
        if (!entry?.stored || entry.live?.pinned) continue
        if (entry.stored.x !== pos.x || entry.stored.y !== pos.y) writePanelPosition(pos.key, pos)
      }
      applyBoxes(next)
    }

    sync()
    const observer = new ResizeObserver(() => sync())
    observer.observe(stage)
    for (const node of nodesRef.current.values()) observer.observe(node)
    window.addEventListener('resize', sync)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', sync)
    }
  }, [tick, applyBoxes])

  const value = useMemo(() => ({
    register,
    move,
    pinAll,
    commitAll,
    boxes,
    stageRef,
  }), [register, move, pinAll, commitAll, boxes])

  const classes = ['movable-stage', className].filter(Boolean).join(' ')
  return (
    <MovableStageContext.Provider value={value}>
      <div
        ref={stageRef}
        className={classes}
        style={stageHeight > 0 ? { minHeight: `${stageHeight}px` } : undefined}
      >
        {children}
      </div>
    </MovableStageContext.Provider>
  )
}
