import THREE from '@/utils/three'

const POINT_TYPES = new Set(['linalg_point_marker', 'attached_corner_point', 'selectable_point_marker'])

export function getAxisCoordinates(objects) {
  const values = { x: new Set(), y: new Set(), z: new Set() }
  const add = (point) => {
    for (const axis of ['x', 'y', 'z']) {
      const value = Number(point[axis].toFixed(3))
      if (Number.isFinite(value) && value !== 0) values[axis].add(value)
    }
  }
  for (const object of objects) {
    if (!object) continue
    object.updateWorldMatrix(true, true)
    object.traverseVisible((child) => {
      if (child.userData.geoType === 'geo_cube' && child.geometry) {
        child.geometry.computeBoundingBox()
        const bounds = child.geometry.boundingBox.clone().applyMatrix4(child.matrixWorld)
        add(bounds.min)
        add(bounds.max)
      } else if (POINT_TYPES.has(child.userData.geoType)) {
        add(child.getWorldPosition(new THREE.Vector3()))
      }
    })
  }
  // One extent per axis: furthest from zero, preferring positive on a tie.
  return Object.fromEntries(Object.entries(values).map(([axis, ticks]) => [
    axis,
    [...ticks].sort((a, b) => Math.abs(b) - Math.abs(a) || b - a).slice(0, 1),
  ]))
}

