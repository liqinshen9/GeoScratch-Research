// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import usePalettePointerDrag from './usePalettePointerDrag'

let host, root, source, target, onDrop, onStart, onClick
function TestPalette() {
  const drag = usePalettePointerDrag({ onStart, onDrop })
  return <div data-source {...drag} onClick={onClick}><svg><text>Cube</text></svg></div>
}
function pointer(type, x, y, options = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: options.button ?? 0 })
  Object.defineProperties(event, { pointerId: { value: options.pointerId ?? 1 }, pointerType: { value: 'mouse' } })
  act(() => (type === 'pointerdown' ? source.querySelector('text') : window).dispatchEvent(event))
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  onDrop = vi.fn(); onStart = vi.fn(); onClick = vi.fn()
  host = document.createElement('div')
  target = document.createElement('div')
  document.body.append(host, target)
  document.elementFromPoint = () => target
  root = createRoot(host)
  act(() => root.render(<TestPalette />))
  source = host.querySelector('[data-source]')
})
afterEach(() => {
  act(() => root.unmount())
  host.remove(); target.remove()
  vi.restoreAllMocks()
  delete document.elementFromPoint
  delete globalThis.IS_REACT_ACT_ENVIRONMENT
})

describe('pointer-based palette dragging', () => {
  it('hands live movement to Blockly and does not create a second block on release', () => {
    const delegate = { move: vi.fn(), end: vi.fn(() => true), cancel: vi.fn() }
    onStart.mockReturnValue(delegate)
    pointer('pointerdown', 10, 10)
    pointer('pointermove', 100, 100)
    pointer('pointermove', 180, 140)
    expect(delegate.move).toHaveBeenCalledTimes(2)
    expect(document.querySelector('[aria-hidden="true"]')).toBeNull()
    pointer('pointerup', 220, 180)
    expect(delegate.end).toHaveBeenCalledOnce()
    expect(delegate.cancel).not.toHaveBeenCalled()
    expect(onDrop).not.toHaveBeenCalled()
  })

  it('cancels the live Blockly drag on Escape and allows a fresh gesture', () => {
    const delegate = { move: vi.fn(), end: vi.fn(() => true), cancel: vi.fn() }
    onStart.mockReturnValue(delegate)
    pointer('pointerdown', 10, 10)
    pointer('pointermove', 100, 100)
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(delegate.cancel).toHaveBeenCalledOnce()
    pointer('pointerup', 220, 180)
    expect(delegate.end).not.toHaveBeenCalled()
    pointer('pointerdown', 10, 10)
    pointer('pointermove', 100, 100)
    pointer('pointerup', 220, 180)
    expect(delegate.end).toHaveBeenCalledOnce()
  })

  it('drops once at the release position, removes its preview, and suppresses the trailing click', () => {
    pointer('pointerdown', 10, 10)
    pointer('pointermove', 100, 100)
    expect(onStart).toHaveBeenCalledOnce()
    expect(document.querySelector('[aria-hidden="true"]')).toBeTruthy()
    pointer('pointerup', 220, 180)
    expect(onDrop).toHaveBeenCalledExactlyOnceWith({ clientX: 220, clientY: 180 }, target)
    expect(document.querySelector('[aria-hidden="true"]')).toBeNull()
    act(() => source.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })))
    expect(onClick).not.toHaveBeenCalled()
    pointer('pointerdown', 10, 10)
    pointer('pointerup', 10, 10)
    act(() => source.click())
    expect(onClick).toHaveBeenCalledOnce()
  })

  it.each(['pointercancel', 'blur', 'Escape'])('recovers from %s and allows the next drag', (reason) => {
    pointer('pointerdown', 10, 10)
    pointer('pointermove', 100, 100)
    if (reason === 'pointercancel') pointer('pointercancel', 100, 100)
    else act(() => window.dispatchEvent(reason === 'blur' ? new Event('blur') : new KeyboardEvent('keydown', { key: 'Escape' })))
    pointer('pointerup', 220, 180)
    expect(onDrop).not.toHaveBeenCalled()
    expect(document.querySelector('[aria-hidden="true"]')).toBeNull()
    pointer('pointerdown', 10, 10)
    pointer('pointermove', 100, 100)
    pointer('pointerup', 220, 180)
    expect(onDrop).toHaveBeenCalledOnce()
  })

  it('ignores small movements, right clicks, and another pointer', () => {
    pointer('pointerdown', 10, 10, { button: 2 })
    pointer('pointermove', 100, 100)
    pointer('pointerup', 100, 100)
    pointer('pointerdown', 10, 10)
    pointer('pointermove', 12, 12)
    pointer('pointerup', 12, 12)
    expect(onStart).not.toHaveBeenCalled()
    pointer('pointerdown', 10, 10)
    pointer('pointermove', 100, 100, { pointerId: 2 })
    pointer('pointerup', 100, 100, { pointerId: 2 })
    expect(onDrop).not.toHaveBeenCalled()
  })

  it('removes the preview and listeners if the palette unmounts mid-drag', () => {
    pointer('pointerdown', 10, 10)
    pointer('pointermove', 100, 100)
    act(() => root.render(null))
    pointer('pointerup', 220, 180)
    expect(onDrop).not.toHaveBeenCalled()
    expect(document.querySelector('[aria-hidden="true"]')).toBeNull()
  })
})
