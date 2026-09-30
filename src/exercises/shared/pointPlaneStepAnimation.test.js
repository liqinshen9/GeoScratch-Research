import { describe, expect, it, vi } from 'vitest'
import THREE from '@/utils/three'
import { installPointPlaneStepAnimation } from './pointPlaneStepAnimation'

const block = (id) => ({ id })
const sceneObject = (id, geoType = 'group') => {
  const object = new THREE.Group()
  object.userData.srcBlockId = id
  object.userData.geoType = geoType
  object.userData.labels = [{ text: id }]
  return object
}

describe('point-plane step animation', () => {
  it('projects a copy onto n before revealing the distance label', () => {
    const blocks = {
      plane: block('plane'),
      pointP: block('point-p'),
      pointQ: block('point-q'),
      difference: block('difference'),
      normalFromQ: block('normal-from-q'),
      projection: block('projection'),
      magnitude: block('magnitude'),
    }
    const plane = sceneObject('plane', 'point_normal_plane_group')
    const planePoint = sceneObject(null, 'parametric_plane_point_marker')
    plane.add(planePoint)
    const pointP = sceneObject('point-p', 'exercise_point_p')
    const pointQ = sceneObject('point-q', 'annotated_object')
    const qMarker = sceneObject(null, 'selectable_point_marker')
    pointQ.add(plane, qMarker)
    const difference = sceneObject('difference')
    difference.userData.vectorLength = 10
    difference.userData.setVectorLength = vi.fn()
    const normal = sceneObject('normal-from-q', 'distance_normal_arrow')
    normal.userData.vectorLength = 12
    normal.userData.setVectorLength = vi.fn()
    const projection = sceneObject('projection')
    const magnitude = sceneObject('magnitude')
    magnitude.userData.labelAnchors = { distanceMid: { position: [0, 0, 0] } }
    projection.userData.setDistanceConstructionProgress = vi.fn((progress) => {
      projection.userData.distanceConstructionMidpoint = new THREE.Vector3(progress, 0, 0)
    })
    projection.userData.setDistanceConstructionPhase = vi.fn()
    const workspace = { highlightBlock: vi.fn() }
    const objects = [pointP, pointQ, difference, normal, projection, magnitude]

    const target = installPointPlaneStepAnimation({ objects, workspace, blocks })
    expect(target).toBe(projection)

    target.userData.animateSteps(0)
    expect(workspace.highlightBlock).toHaveBeenLastCalledWith('plane')
    expect(pointP.visible).toBe(false)
    expect(qMarker.visible).toBe(false)
    expect(planePoint.visible).toBe(true)

    target.userData.animateSteps(0.16)
    expect(workspace.highlightBlock).toHaveBeenLastCalledWith('point-p')
    expect(pointP.visible).toBe(true)
    expect(planePoint.visible).toBe(false)

    target.userData.animateSteps(0.31)
    expect(workspace.highlightBlock).toHaveBeenLastCalledWith('point-q')
    expect(qMarker.visible).toBe(true)

    target.userData.animateSteps(0.46)
    expect(workspace.highlightBlock).toHaveBeenLastCalledWith('normal-from-q')
    expect(normal.visible).toBe(true)
    expect(normal.userData.setVectorLength.mock.calls.at(-1)[0]).toBeCloseTo(12 * 0.22)
    expect(difference.visible).toBe(false)

    target.userData.animateSteps(0.6)
    expect(workspace.highlightBlock).toHaveBeenLastCalledWith('difference')
    expect(normal.userData.setVectorLength).toHaveBeenLastCalledWith(12)
    expect(difference.visible).toBe(true)
    expect(difference.userData.setVectorLength.mock.calls.at(-1)[0]).toBeCloseTo(2)
    expect(projection.userData.setDistanceConstructionProgress).toHaveBeenLastCalledWith(0)
    expect(projection.userData.setDistanceConstructionPhase).toHaveBeenLastCalledWith('normal')

    target.userData.animateSteps(0.75)
    expect(projection.userData.setDistanceConstructionPhase).toHaveBeenLastCalledWith('projection')
    expect(projection.userData.setDistanceConstructionProgress).toHaveBeenLastCalledWith(0.25)
    expect(difference.visible).toBe(true)
    expect(magnitude.visible).toBe(false)

    target.userData.animateSteps(0.95, (value) => value)
    expect(projection.userData.setDistanceConstructionProgress).toHaveBeenLastCalledWith(1)
    expect(projection.userData.setDistanceConstructionPhase).toHaveBeenLastCalledWith('distance')
    expect(workspace.highlightBlock).toHaveBeenLastCalledWith('magnitude')
    expect(magnitude.visible).toBe(true)
    expect(magnitude.userData.labelAnchors.distanceMid.position[0]).toBe(1)

    target.userData.animateSteps(1)
    expect(projection.userData.setDistanceConstructionProgress).toHaveBeenLastCalledWith(1)
    expect(projection.userData.setDistanceConstructionPhase).toHaveBeenLastCalledWith('distance')
    expect(workspace.highlightBlock).toHaveBeenLastCalledWith(null)
    expect(planePoint.visible).toBe(false)
  })

  it('installs when the connected normal has no standalone scene object', () => {
    const blocks = {
      plane: block('plane'),
      pointP: block('point-p'),
      pointQ: block('point-q'),
      difference: block('difference'),
      normalFromQ: block('normal-from-q'),
      projection: block('projection'),
      magnitude: block('magnitude'),
    }
    const plane = sceneObject('plane', 'point_normal_plane_group')
    plane.add(sceneObject(null, 'parametric_plane_point_marker'))
    const pointP = sceneObject('point-p', 'exercise_point_p')
    const pointQ = sceneObject('point-q', 'annotated_object')
    pointQ.add(plane, sceneObject(null, 'selectable_point_marker'))
    const difference = sceneObject('difference')
    const projection = sceneObject('projection')
    projection.userData.setDistanceConstructionProgress = vi.fn()
    projection.userData.setDistanceConstructionPhase = vi.fn()
    projection.userData.setDistanceNormalProgress = vi.fn()
    const magnitude = sceneObject('magnitude')

    const target = installPointPlaneStepAnimation({
      objects: [pointP, pointQ, difference, projection, magnitude],
      workspace: { highlightBlock: vi.fn() },
      blocks,
    })

    expect(target).toBe(projection)
    target.userData.animateSteps(0.46)
    expect(projection.userData.setDistanceNormalProgress.mock.calls.at(-1)[0]).toBeCloseTo(0.22)
  })
})
