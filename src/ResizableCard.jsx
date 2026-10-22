import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState } from 'react'
import { canStartPanelDrag, useMovableStage } from './MovableStage.jsx'
import { clampPanelPosition, viewportHostWidth } from './panelPosition.js'
import {
  MIN_PANEL_WIDTH,
  NUDGE_STEP,
  NUDGE_STEP_LARGE,
  clampSize,
  horizontalBounds,
  readPanelSize,
  writePanelSize,
} from './panelSize.js'

const PanelResizeContext = createContext(null)

export function usePanelResize() {
  return useContext(PanelResizeContext)
}

export function trackPointer(event, onMove, onEnd) {
  if (event.button != null && event.button !== 0) return
  const handle = event.currentTarget
  const origin = { x: event.clientX, y: event.clientY }
  handle.setPointerCapture(event.pointerId)
  function move(moveEvent) {
    onMove(moveEvent, origin)
  }
  function end(endEvent) {
    handle.removeEventListener('pointermove', move)
    handle.removeEventListener('pointerup', end)
    handle.removeEventListener('pointercancel', end)
    if (handle.hasPointerCapture(endEvent.pointerId)) handle.releasePointerCapture(endEvent.pointerId)
    onEnd?.(endEvent)
  }
  handle.addEventListener('pointermove', move)
  handle.addEventListener('pointerup', end)
  handle.addEventListener('pointercancel', end)
}

function startingBounds(minReadable) {
  const viewport = typeof window === 'undefined' ? 8192 : window.innerWidth
  const max = Math.max(viewport, minReadable)
  return { min: Math.min(minReadable, max), max }
}

export function useHorizontalResize(storageKey, { minReadable = MIN_PANEL_WIDTH } = {}) {
  const ref = useRef(null)
  const boundsRef = useRef(startingBounds(minReadable))
  const [bounds, setBounds] = useState(boundsRef.current)
  const [preferred, setPreferred] = useState(() => readPanelSize(storageKey).width ?? null)
  const [measured, setMeasured] = useState(0)

  const refreshBounds = useCallback(() => {
    const element = ref.current
    if (!element) return boundsRef.current
    const next = horizontalBounds(element, { minReadable })
    boundsRef.current = next
    setBounds((current) => (current.min === next.min && current.max === next.max ? current : next))
    setMeasured(element.getBoundingClientRect().width)
    return next
  }, [minReadable])

  useLayoutEffect(() => {
    refreshBounds()
    window.addEventListener('resize', refreshBounds)
    return () => window.removeEventListener('resize', refreshBounds)
  }, [refreshBounds])

  const shown = preferred == null ? null : clampSize(preferred, bounds.min, bounds.max)

  const commit = useCallback((next) => {
    const { min, max } = boundsRef.current
    const value = clampSize(next, min, max)
    setPreferred(value)
    writePanelSize(storageKey, { width: value })
    return value
  }, [storageKey])

  const onPointerDown = useCallback((event) => {
    const element = ref.current
    if (!element) return
    refreshBounds()
    const startWidth = element.getBoundingClientRect().width
    trackPointer(event, (move, origin) => {
      commit(startWidth + move.clientX - origin.x)
    })
  }, [commit, refreshBounds])

  const onKeyDown = useCallback((event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const element = ref.current
    if (!element) return
    refreshBounds()
    const step = event.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP
    const current = element.getBoundingClientRect().width
    commit(current + (event.key === 'ArrowRight' ? step : -step))
  }, [commit, refreshBounds])

  const style = shown == null
    ? undefined
    : {
        width: `${shown}px`,
        minWidth: `${bounds.min}px`,
        maxWidth: `${bounds.max}px`,
      }

  const rawValue = shown ?? measured
  const value = Math.round(Math.min(bounds.max, Math.max(bounds.min, rawValue || bounds.min)))

  return {
    ref,
    bounds,
    shown,
    value,
    custom: preferred != null,
    style,
    commit,
    onPointerDown,
    onKeyDown,
    refreshBounds,
  }
}

export function HorizontalHandle({ label, api }) {
  return (
    <button
      type="button"
      className="resize-handle resize-handle-x"
      role="slider"
      aria-orientation="horizontal"
      aria-label={`Breite: ${label}`}
      aria-valuemin={Math.round(api.bounds.min)}
      aria-valuemax={Math.round(api.bounds.max)}
      aria-valuenow={api.value}
      onPointerDown={api.onPointerDown}
      onKeyDown={api.onKeyDown}
    />
  )
}

function hostWidthFor(stage) {
  const node = stage?.stageRef.current
  if (!node || typeof window === 'undefined') return 0
  return viewportHostWidth(node.getBoundingClientRect().left, window.innerWidth)
}

export default function ResizableCard({
  storageKey,
  label,
  className = '',
  as: Tag = 'div',
  minReadable,
  movable = false,
  children,
}) {
  const api = useHorizontalResize(storageKey, { minReadable })
  const stage = useMovableStage()
  const placed = Boolean(movable && stage)
  const pos = placed ? stage.boxes[storageKey] : null
  const stageRef = useRef(stage)
  stageRef.current = stage
  const posRef = useRef(pos)
  posRef.current = pos
  const [dragging, setDragging] = useState(false)
  const registerRef = useRef(null)
  registerRef.current = stage?.register

  useLayoutEffect(() => {
    if (!placed) return undefined
    const node = api.ref.current
    const register = registerRef.current
    if (!node || !register) return undefined
    return register(storageKey, node)
  }, [placed, storageKey, api.ref])

  const onDragPointerDown = useCallback((event) => {
    const current = stageRef.current
    const element = api.ref.current
    if (!placed || !current || !element) return
    if (!canStartPanelDrag(event.target, element)) return
    event.preventDefault()
    const start = posRef.current || { x: element.offsetLeft, y: element.offsetTop }
    current.pinAll()
    setDragging(true)
    trackPointer(event, (move, origin) => {
      const next = clampPanelPosition(
        start.x + move.clientX - origin.x,
        start.y + move.clientY - origin.y,
        { width: element.getBoundingClientRect().width, hostWidth: hostWidthFor(current) },
      )
      current.move(storageKey, next)
    }, () => {
      setDragging(false)
      current.commitAll()
    })
  }, [api.ref, placed, storageKey])

  const onDragKeyDown = useCallback((event) => {
    const current = stageRef.current
    const element = api.ref.current
    if (!placed || !current || !element) return
    if (!(event.target instanceof Element) || !event.target.closest('.drag-handle')) return
    const step = event.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP
    const delta = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }[event.key]
    if (!delta) return
    event.preventDefault()
    const start = posRef.current || { x: 0, y: 0 }
    current.pinAll()
    const next = clampPanelPosition(start.x + delta[0], start.y + delta[1], {
      width: element.getBoundingClientRect().width,
      hostWidth: hostWidthFor(current),
    })
    current.move(storageKey, next)
    current.commitAll()
  }, [api.ref, placed, storageKey])

  const classes = [
    'resizable-card',
    className,
    api.custom ? 'is-custom-width' : '',
    placed ? 'movable-card' : '',
    dragging ? 'is-dragging' : '',
  ].filter(Boolean).join(' ')
  const style = {
    ...(pos ? { left: `${pos.x}px`, top: `${pos.y}px` } : null),
    ...api.style,
  }
  return (
    <PanelResizeContext.Provider value={api}>
      <Tag
        ref={api.ref}
        className={classes}
        style={style}
        onPointerDown={placed ? onDragPointerDown : undefined}
        onKeyDown={placed ? onDragKeyDown : undefined}
      >
        <div className="resizable-card-body">{children}</div>
        <HorizontalHandle label={label} api={api} />
      </Tag>
    </PanelResizeContext.Provider>
  )
}
