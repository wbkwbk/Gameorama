import { useLayoutEffect, useRef, useState } from 'react'
import { trackPointer, usePanelResize } from './ResizableCard.jsx'
import { NUDGE_STEP, NUDGE_STEP_LARGE, readPanelSize, writePanelSize } from './panelSize.js'

export default function ResizableList({
  children,
  itemKey,
  storageKey,
  label,
  rowSelector,
  className,
  as: Tag = 'ul',
}) {
  const frameRef = useRef(null)
  const listRef = useRef(null)
  const widthApi = usePanelResize()
  const preferredHeightRef = useRef(readPanelSize(storageKey).height ?? null)
  const [height, setHeight] = useState(preferredHeightRef.current)
  const boundsRef = useRef({ min: 160, max: 640 })
  const [bounds, setBounds] = useState(boundsRef.current)

  useLayoutEffect(() => {
    const frame = frameRef.current
    const list = listRef.current
    if (!frame || !list) return undefined

    function measure() {
      const row = list.querySelector(rowSelector)
      if (!row) return null
      const styles = getComputedStyle(list)
      const gap = parseFloat(styles.rowGap || styles.gap) || 0
      const min = Math.ceil(row.getBoundingClientRect().height * 3 + gap * 2) + 2
      const max = Math.max(min, Math.round(window.innerHeight * 0.7))
      return { min, max }
    }

    function apply() {
      const nextBounds = measure()
      if (!nextBounds) return
      boundsRef.current = nextBounds
      setBounds((current) =>
        current.min === nextBounds.min && current.max === nextBounds.max ? current : nextBounds,
      )
      const preferred = preferredHeightRef.current
      setHeight((current) => {
        const next = preferred == null
          ? nextBounds.min
          : Math.min(nextBounds.max, Math.max(nextBounds.min, preferred))
        return current === next ? current : next
      })
    }

    apply()
    let width = frame.getBoundingClientRect().width
    const observer = new ResizeObserver(() => {
      const nextWidth = frame.getBoundingClientRect().width
      if (Math.abs(nextWidth - width) < 1) return
      width = nextWidth
      apply()
    })
    observer.observe(frame)
    return () => observer.disconnect()
  }, [itemKey, rowSelector])

  function clamp(value) {
    const { min, max } = boundsRef.current
    return Math.min(max, Math.max(min, value))
  }

  function commitHeight(value) {
    const next = clamp(value)
    preferredHeightRef.current = next
    setHeight(next)
    writePanelSize(storageKey, { height: next })
    return next
  }

  function onPointerDown(event) {
    const startH = listRef.current.getBoundingClientRect().height
    trackPointer(event, (move, origin) => {
      commitHeight(startH + move.clientY - origin.y)
    })
  }

  function onKeyDown(event) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const current = listRef.current.getBoundingClientRect().height
    const step = event.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP
    commitHeight(current + (event.key === 'ArrowDown' ? step : -step))
  }

  function onCornerPointerDown(event) {
    if (!widthApi?.ref.current || !listRef.current) return
    widthApi.refreshBounds()
    const startWidth = widthApi.ref.current.getBoundingClientRect().width
    const startH = listRef.current.getBoundingClientRect().height
    trackPointer(event, (move, origin) => {
      widthApi.commit(startWidth + move.clientX - origin.x)
      commitHeight(startH + move.clientY - origin.y)
    })
  }

  function onCornerKeyDown(event) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      widthApi?.onKeyDown(event)
      return
    }
    onKeyDown(event)
  }

  return (
    <div className="device-list-frame" ref={frameRef}>
      <Tag
        className={className}
        ref={listRef}
        style={
          height
            ? { height: `${height}px`, minHeight: `${bounds.min}px`, maxHeight: `${bounds.max}px` }
            : undefined
        }
      >
        {children}
      </Tag>
      <button
        type="button"
        className="resize-handle resize-handle-y"
        role="slider"
        aria-label={`Höhe: ${label}`}
        aria-orientation="vertical"
        aria-valuemin={Math.round(bounds.min)}
        aria-valuemax={Math.round(bounds.max)}
        aria-valuenow={Math.round(height ?? bounds.min)}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
      />
      {widthApi && (
        <button
          type="button"
          className="resize-handle resize-handle-xy"
          aria-label={`Größe: ${label}`}
          onPointerDown={onCornerPointerDown}
          onKeyDown={onCornerKeyDown}
        />
      )}
    </div>
  )
}
