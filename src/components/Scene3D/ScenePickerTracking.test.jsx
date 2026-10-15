// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import THREE from '@/utils/three'
import ScenePicker from './ScenePicker'

const state = vi.hoisted(() => ({ three: null }))
vi.mock('@react-three/fiber', () => ({ useThree: () => state.three }))
let root, host, canvas, events, onSelect, onToggle, collect
function pointer(target, type, button = 0) {
  const event = new MouseEvent(type, { bubbles: true, clientX: 100, clientY: 100, button })
  Object.assign(event, { pointerId: 1, pointerType: 'mouse' })
  target.dispatchEvent(event)
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  window.__geoScratchRuntimeMode = 'userstudy-Li-participant-tutorial'
  host = document.createElement('div')
  canvas = document.createElement('canvas')
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 300 })
  document.body.append(host, canvas)
  state.three = { camera: new THREE.PerspectiveCamera(), scene: new THREE.Scene(), gl: { domElement: canvas } }
  events = []
  collect = (event) => events.push(event.detail)
  window.addEventListener('geoscratch:study-event', collect)
  onSelect = vi.fn()
  onToggle = vi.fn()
  root = createRoot(host)
  act(() => root.render(<ScenePicker onSelectBlock={onSelect} onToggleLabels={onToggle} toggleLabelsOnLeftClick />))
})
afterEach(() => {
  act(() => root.unmount())
  window.removeEventListener('geoscratch:study-event', collect)
  host.remove()
  canvas.remove()
  vi.restoreAllMocks()
  delete globalThis.IS_REACT_ACT_ENVIRONMENT
  delete window.__geoScratchRuntimeMode
})

describe('3D picker study events', () => {
  it.each(['create-complex-object', 'cube-point-pivot-rotation', 'point-plane-distance'])('records 3D object clicks while preserving selection in %s', (exerciseId) => {
    window.__geoScratchRuntimeMode = `userstudy-Li-participant-${exerciseId}`
    const object = new THREE.Mesh()
    object.userData = { geoType: 'geo_sphere', srcBlockId: 'sphere-block' }
    vi.spyOn(THREE.Raycaster.prototype, 'intersectObjects').mockReturnValue([{ object, point: new THREE.Vector3() }])
    pointer(canvas, 'pointerdown')
    pointer(window, 'pointerup')
    expect(onSelect).toHaveBeenCalledWith('sphere-block')
    expect(events[0]).toMatchObject({ type: 'scene_object_click', details: { selectedBlockId: 'sphere-block' } })
  })
  it('emits the picked object identity and block reference while preserving selection behavior', () => {
    const object = new THREE.Group()
    object.userData = { geoType: 'exercise_point_p', srcBlockId: 'P-block', point: new THREE.Vector3(-9, 8, 7) }
    const mesh = new THREE.Mesh()
    object.add(mesh)
    vi.spyOn(THREE.Raycaster.prototype, 'intersectObjects').mockReturnValue([{ object: mesh, point: new THREE.Vector3(-9, 8, 7) }])
    pointer(canvas, 'pointerdown')
    pointer(window, 'pointerup')
    expect(onSelect).toHaveBeenCalledWith('P-block')
    expect(events.find((event) => event.type === 'scene_object_click').details).toMatchObject({ selectedBlockId: 'P-block', object: { geoType: 'exercise_point_p', sourceBlockId: 'P-block', pointCoordinates: [-9, 8, 7] } })
    pointer(canvas, 'pointerdown', 2)
    canvas.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2, clientX: 100, clientY: 100 }))
    expect(events.find((event) => event.type === 'scene_context_menu').details.object.sourceBlockId).toBe('P-block')
  })

  it('toggles the manual Q1 label when its marker is clicked', () => {
    const q = new THREE.Group()
    q.userData = { geoType: 'exercise_point_q', srcBlockId: 'manual-q', labels: [{ anchor: 'q', name: 'Q1', value: '(1, -2.5, 1)' }] }
    const marker = new THREE.Mesh()
    marker.userData = { geoType: 'selectable_point_marker', srcBlockId: 'manual-q', clickLabelAnchor: 'q' }
    q.add(marker)
    vi.spyOn(THREE.Raycaster.prototype, 'intersectObjects').mockReturnValue([{ object: marker }])
    pointer(canvas, 'pointerdown')
    pointer(window, 'pointerup')
    expect(onSelect).toHaveBeenCalledWith('manual-q')
    expect(onToggle).toHaveBeenLastCalledWith(['manual-q:q:0'])
    pointer(canvas, 'pointerdown')
    pointer(window, 'pointerup')
    expect(onToggle).toHaveBeenCalledTimes(2)
    expect(onToggle).toHaveBeenLastCalledWith(['manual-q:q:0'])
  })

  it('records deselection on an empty click and does not mislabel a camera drag as an object click', () => {
    vi.spyOn(THREE.Raycaster.prototype, 'intersectObjects').mockReturnValue([])
    pointer(canvas, 'pointerdown')
    pointer(window, 'pointerup')
    expect(onSelect).toHaveBeenCalledWith(null)
    expect(events[0].details.object).toBeNull()
    events.length = 0
    pointer(canvas, 'pointerdown')
    const move = new MouseEvent('pointermove', { clientX: 200, clientY: 100 })
    Object.assign(move, { pointerId: 1 })
    window.dispatchEvent(move)
    pointer(window, 'pointerup')
    expect(events).toEqual([])
  })
})
