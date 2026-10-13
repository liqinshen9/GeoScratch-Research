import { useEffect, useRef } from 'react'

// Palette previews are separate Blockly workspaces. Handle the gesture before
// their SVG handlers, without relying on browser-native HTML drag negotiation.
export default function usePalettePointerDrag({ onStart, onDrop }) {
  const handlers = useRef({ onStart, onDrop })
  handlers.current = { onStart, onDrop }
  const active = useRef(null)
  const suppressClick = useRef(false)
  const cleanup = useRef(() => {})
  useEffect(() => () => cleanup.current(), [])

  function onPointerDownCapture(event) {
    if (event.button !== 0 || (event.pointerType && event.pointerType !== 'mouse')) return
    cleanup.current()
    suppressClick.current = false
    const source = event.currentTarget
    const startEvent = event.nativeEvent ?? event
    const start = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
    active.current = { ...start, dragging: false, ghost: null }
    event.preventDefault()
    event.stopPropagation()

    function move(pointer) {
      const drag = active.current
      if (!drag || pointer.pointerId !== drag.pointerId) return
      if (!drag.dragging && Math.hypot(pointer.clientX - start.x, pointer.clientY - start.y) >= 5) {
        drag.dragging = true
        suppressClick.current = true
        drag.delegate = handlers.current.onStart?.(startEvent, source)
        if (drag.delegate) { drag.delegate.move(pointer); return }
        const bounds = source.getBoundingClientRect()
        const ghost = source.cloneNode(true)
        ghost.removeAttribute('id')
        ghost.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'))
        ghost.setAttribute('aria-hidden', 'true')
        Object.assign(ghost.style, { position: 'fixed', pointerEvents: 'none', zIndex: '10000',
          width: `${bounds.width}px`, height: `${bounds.height}px`, opacity: '0.8', margin: '0' })
        // SVG descendants must not override the ghost's pointer-events setting.
        ghost.querySelectorAll('*').forEach((node) => { node.style.pointerEvents = 'none' })
        document.body.append(ghost)
        drag.ghost = ghost
      }
      if (drag.delegate) drag.delegate.move(pointer)
      else if (drag.ghost) Object.assign(drag.ghost.style, { left: `${pointer.clientX + 12}px`, top: `${pointer.clientY + 12}px` })
    }
    function finish(pointer) {
      const drag = active.current
      if (!drag || pointer.pointerId !== drag.pointerId) return
      const dropped = drag.dragging && pointer.type === 'pointerup'
      const delegate = dropped ? drag.delegate : null
      if (delegate) drag.delegate = null
      cleanup.current()
      if (delegate?.end(pointer) !== false && delegate) return
      if (dropped) handlers.current.onDrop?.({ clientX: pointer.clientX, clientY: pointer.clientY },
        document.elementFromPoint(pointer.clientX, pointer.clientY))
    }
    function cancel() { cleanup.current() }
    cleanup.current = () => {
      active.current?.delegate?.cancel()
      active.current?.ghost?.remove()
      active.current = null
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', finish, true)
      window.removeEventListener('pointercancel', finish, true)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('keydown', escape, true)
    }
    function escape(key) { if (key.key === 'Escape') cancel() }
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', finish, true)
    window.addEventListener('pointercancel', finish, true)
    window.addEventListener('blur', cancel)
    window.addEventListener('keydown', escape, true)
  }
  return {
    onPointerDownCapture,
    onDragStartCapture: (event) => event.preventDefault(),
    onClickCapture: (event) => {
      // Keyboard/programmatic activation has no trailing mouse click to suppress.
      if (event.detail === 0) { suppressClick.current = false; return }
      if (!suppressClick.current) return
      suppressClick.current = false
      event.preventDefault()
      event.stopPropagation()
    },
  }
}
