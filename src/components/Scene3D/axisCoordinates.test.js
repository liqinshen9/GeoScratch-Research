import { describe, expect, it } from 'vitest'
import THREE from '@/utils/three'
import { getAxisCoordinates } from './axisCoordinates'

function cube() {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2))
  mesh.position.set(1, 1, 1)
  mesh.userData.geoType = 'geo_cube'
  return mesh
}

describe('object axis coordinates', () => {
  it('removes coordinates when the cube is deleted', () => {
    expect(getAxisCoordinates([cube()])).toEqual({ x: [2], y: [2], z: [2] })
    expect(getAxisCoordinates([])).toEqual({ x: [], y: [], z: [] })
  })

  it('retains shared coordinates and places point values on their own axes', () => {
    const point = new THREE.Object3D()
    point.userData.geoType = 'linalg_point_marker'
    point.position.set(0, 2, 3)
    expect(getAxisCoordinates([cube(), point])).toEqual({ x: [2], y: [2], z: [3] })
    expect(getAxisCoordinates([point])).toEqual({ x: [], y: [2], z: [3] })
  })

  it('tracks transforms of cubes and attached points in composite blocks', () => {
    const group = new THREE.Group()
    const point = new THREE.Object3D()
    point.userData.geoType = 'attached_corner_point'
    point.position.set(0, 2, 2)
    group.add(cube(), point)
    group.position.set(-1, -1, -1)
    expect(getAxisCoordinates([group])).toEqual({ x: [1], y: [1], z: [1] })
  })

  it('shows only three labels for a default cube', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
    mesh.userData.geoType = 'geo_cube'
    expect(getAxisCoordinates([mesh])).toEqual({ x: [0.5], y: [0.5], z: [0.5] })
  })
})
