import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState } from 'react'
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

export function trackPointer(event, onMove) {
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
  }
  handle.addEventListener('pointermove', move)
  handle.addEventListener('pointerup', end)
  handle.addEventListener('pointercancel', end)
}

export function useHorizontalResize(storageKey, { minReadable = MIN_PANEL_WIDTH } = {}) {
  const ref = useRef(null)
  const boundsRef = useRef({ min: minReadable, max: minReadable })
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

export default function ResizableCard({
  storageKey,
  label,
  className = '',
  as: Tag = 'div',
  minReadable,
  children,
}) {
  const api = useHorizontalResize(storageKey, { minReadable })
  const classes = ['resizable-card', className, api.custom ? 'is-custom-width' : ''].filter(Boolean).join(' ')
  return (
    <PanelResizeContext.Provider value={api}>
      <Tag ref={api.ref} className={classes} style={api.style}>
        <div className="resizable-card-body">{children}</div>
        <HorizontalHandle label={label} api={api} />
      </Tag>
    </PanelResizeContext.Provider>
  )
}
