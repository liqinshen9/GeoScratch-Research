import { describe, expect, it } from 'vitest'
import THREE from '@/utils/three'
import { describeCamera, describeSceneHit } from './sceneTracking'

describe('3D study object identification', () => {
  it('identifies the semantic point and its source block when a child mesh is hit', () => {
    const point = new THREE.Group()
    point.userData = { geoType: 'exercise_point_p', srcBlockId: 'point-block', point: new THREE.Vector3(-9, 8, 7) }
    point.position.set(-9, 8, 7)
    const mesh = new THREE.Mesh()
    point.add(mesh)
    const result = describeSceneHit({ object: mesh, point: new THREE.Vector3(-9, 8, 7) }, (node) => node === point ? [{ name: 'P', value: '(-9, 8, 7)', anchor: 'p' }] : [])
    expect(result).toMatchObject({ objectId: point.uuid, geoType: 'exercise_point_p', sourceBlockId: 'point-block',
      worldPosition: [-9, 8, 7], pointCoordinates: [-9, 8, 7], labels: [{ name: 'P', value: '(-9, 8, 7)', anchor: 'p' }] })
  })

  it('handles empty-space clicks and saves the camera orientation and focus', () => {
    expect(describeSceneHit(null)).toBeNull()
    const camera = new THREE.PerspectiveCamera()
    camera.position.set(10, 20, 30)
    const controls = { target: new THREE.Vector3(1, 1, 1) }
    expect(describeCamera(camera, controls)).toMatchObject({ position: [10, 20, 30], target: [1, 1, 1], zoom: 1 })
  })
})
