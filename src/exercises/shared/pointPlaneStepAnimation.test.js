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
  const durationUnits = 9.7
  const constructionStageUnits = 1.2
  const atConstructionStage = (stage, localProgress) =>
    (stage * constructionStageUnits + localProgress * constructionStageUnits) / durationUnits
  const atFinalGlowUnit = (unit) => (6 * constructionStageUnits + unit) / durationUnits

  it('keeps the P-to-normal perpendicular fixed while blinking d on the normal', () => {
    const blocks = {
      plane: block('plane'),
      pointP: block('point-p'),
      pointQ: block('point-q'),
      difference: block('difference'),
      normalFromQ: block('normal-from-q'),
      projection: block('projection'),
      magnitude: block('magnitude'),
    }
    const planePointInput = block('plane-point-input')
    const planeNormalInput = block('plane-normal-input')
    const projectionNormalInput = block('projection-normal-input')
    const magnitudeNestedInput = block('magnitude-nested-input')
    blocks.plane.inputList = [
      { connection: { targetBlock: () => planePointInput } },
      { connection: { targetBlock: () => planeNormalInput } },
    ]
    blocks.projection.getInputTargetBlock = (name) => (name === 'V' ? projectionNormalInput : null)
    blocks.magnitude.inputList = [{ connection: { targetBlock: () => magnitudeNestedInput } }]
    const plane = sceneObject('plane', 'point_normal_plane_group')
    plane.userData.point = new THREE.Vector3(-5, 0, 2)
    plane.userData.labels = [{ anchor: 'point', name: 'Plane' }]
    const planeDefinition = sceneObject(null, 'parametric_plane_point_normal_group')
    const planePoint = sceneObject(null, 'parametric_plane_point_marker')
    const planeNormal = sceneObject(null, 'parametric_plane_normal_arrow')
    planeDefinition.add(planePoint, planeNormal)
    plane.add(planeDefinition)
    const pointP = sceneObject('point-p', 'exercise_point_p')
    const pointQ = sceneObject('point-q', 'annotated_object')
    const qMarker = sceneObject(null, 'selectable_point_marker')
    pointQ.add(plane, qMarker)
    const difference = sceneObject('difference')
    difference.userData.vectorLength = 10
    difference.userData.setVectorLength = vi.fn()
    const normal = sceneObject('normal-from-q', 'distance_normal_arrow')
    normal.userData.vectorLength = 12
    normal.userData.vectorOrigin = new THREE.Vector3(2, 3, 4)
    normal.userData.setVectorLength = vi.fn()
    const normalRightAngle = sceneObject(null, 'normal_plane_right_angle')
    normal.add(normalRightAngle)
    const projection = sceneObject('projection')
    const magnitude = sceneObject('magnitude')
    magnitude.userData.labelAnchors = { distanceMid: { position: [0, 0, 0] } }
    projection.userData.setDistanceConstructionProgress = vi.fn((progress) => {
      projection.userData.distanceConstructionMidpoint = new THREE.Vector3(progress, 0, 0)
    })
    projection.userData.setDistanceConstructionPhase = vi.fn()
    projection.userData.setDistanceFinalProgress = vi.fn((progress) => {
      projection.userData.distanceConstructionMidpoint = new THREE.Vector3(progress, 0, 0)
    })
    projection.userData.setDistanceFinalBlink = vi.fn()
    projection.userData.setDistanceConstructionNormalOrigin = vi.fn()
    const workspace = { highlightBlock: vi.fn() }
    const objects = [pointP, pointQ, difference, normal, projection, magnitude]

    const target = installPointPlaneStepAnimation({ objects, workspace, blocks })
    expect(target).toBe(projection)
    expect(target.userData.animateSteps.durationScale).toBeCloseTo(durationUnits)
    expect(projection.userData.setDistanceConstructionNormalOrigin).toHaveBeenCalledWith(
      normal.userData.vectorOrigin,
    )

    target.userData.animateSteps(0)
    expect(workspace.highlightBlock).toHaveBeenCalledWith('plane')
    expect(workspace.highlightBlock).toHaveBeenCalledWith('plane-point-input', true)
    expect(workspace.highlightBlock).toHaveBeenCalledWith('plane-normal-input', true)
    expect(pointP.visible).toBe(false)
    expect(qMarker.visible).toBe(false)
    expect(planeDefinition.visible).toBe(false)
    expect(plane.userData.labels[0].revealed()).toBe(true)

    target.userData.animateSteps(atConstructionStage(1, 0.2))
    expect(workspace.highlightBlock).toHaveBeenLastCalledWith('point-p')
    expect(pointP.visible).toBe(true)
    expect(planeDefinition.visible).toBe(false)

    target.userData.animateSteps(atConstructionStage(2, 0.01))
    expect(planeDefinition.visible).toBe(false)
    expect(plane.userData.labels[0].revealed()).toBe(false)

    target.userData.animateSteps(atConstructionStage(2, 0.2))
    expect(workspace.highlightBlock).toHaveBeenLastCalledWith('point-q')
    expect(qMarker.visible).toBe(true)

    target.userData.animateSteps(atConstructionStage(3, 0.22))
    expect(workspace.highlightBlock).toHaveBeenLastCalledWith('normal-from-q')
    expect(normal.visible).toBe(true)
    expect(normalRightAngle.visible).toBe(true)
    expect(normal.userData.setVectorLength.mock.calls.at(-1)[0]).toBeCloseTo(12 * 0.22)
    expect(difference.visible).toBe(false)

    target.userData.animateSteps(atConstructionStage(4, 0.2))
    expect(workspace.highlightBlock).toHaveBeenLastCalledWith('difference')
    expect(normal.userData.setVectorLength).toHaveBeenLastCalledWith(12)
    expect(difference.visible).toBe(true)
    expect(difference.userData.setVectorLength.mock.calls.at(-1)[0]).toBeCloseTo(2)
    expect(projection.userData.setDistanceConstructionProgress).toHaveBeenLastCalledWith(0)
    expect(projection.userData.setDistanceConstructionPhase).toHaveBeenLastCalledWith('normal')

    target.userData.animateSteps(atConstructionStage(5, 0.25))
    expect(projection.userData.setDistanceConstructionPhase).toHaveBeenLastCalledWith('projection')
    expect(projection.userData.setDistanceConstructionProgress.mock.calls.at(-1)[0]).toBeCloseTo(
      0.25,
    )
    expect(projection.userData.setDistanceFinalProgress).toHaveBeenLastCalledWith(0)
    expect(difference.visible).toBe(true)
    expect(magnitude.visible).toBe(false)
    expect(workspace.highlightBlock).toHaveBeenCalledWith('projection')
    expect(workspace.highlightBlock).toHaveBeenCalledWith('difference', true)
    expect(workspace.highlightBlock).toHaveBeenCalledWith('projection-normal-input', true)

    workspace.highlightBlock.mockClear()
    target.userData.animateSteps(atFinalGlowUnit(0.5))
    expect(projection.userData.setDistanceConstructionProgress).toHaveBeenLastCalledWith(1)
    expect(projection.userData.setDistanceConstructionPhase).toHaveBeenLastCalledWith('distance')
    expect(projection.userData.setDistanceFinalProgress).toHaveBeenLastCalledWith(1)
    expect(projection.userData.setDistanceFinalBlink.mock.calls.at(-1)[0]).toBeCloseTo(0.5 / 2.5)
    expect(workspace.highlightBlock).toHaveBeenLastCalledWith('magnitude')
    expect(workspace.highlightBlock).not.toHaveBeenCalledWith('magnitude-nested-input', true)
    expect(magnitude.visible).toBe(true)
    expect(magnitude.userData.labels[0].revealed()).toBe(true)
    expect(magnitude.userData.labelAnchors.distanceMid.position[0]).toBe(1)

    target.userData.animateSteps(atFinalGlowUnit(2.25))
    expect(projection.userData.setDistanceFinalProgress).toHaveBeenLastCalledWith(1)
    expect(projection.userData.setDistanceFinalBlink.mock.calls.at(-1)[0]).toBeCloseTo(2.25 / 2.5)
    expect(magnitude.userData.labels[0].revealed()).toBe(true)
    expect(magnitude.userData.labelAnchors.distanceMid.position[0]).toBe(1)

    target.userData.animateSteps(1)
    expect(projection.userData.setDistanceConstructionProgress).toHaveBeenLastCalledWith(1)
    expect(projection.userData.setDistanceConstructionPhase).toHaveBeenLastCalledWith('distance')
    expect(projection.userData.setDistanceFinalProgress).toHaveBeenLastCalledWith(1)
    expect(projection.userData.setDistanceFinalBlink).toHaveBeenLastCalledWith(1)
    expect(workspace.highlightBlock).toHaveBeenLastCalledWith(null)
    expect(planeDefinition.visible).toBe(false)
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
    const normalGlyph = sceneObject(null, 'distance_normal_arrow')
    normalGlyph.userData.vectorOrigin = new THREE.Vector3(2, 3, 4)
    normalGlyph.userData.vectorTip = new THREE.Vector3(2.5, 4, 4.5)
    projection.add(normalGlyph)
    projection.userData.setDistanceConstructionProgress = vi.fn()
    projection.userData.setDistanceConstructionPhase = vi.fn()
    projection.userData.setDistanceFinalProgress = vi.fn()
    projection.userData.setDistanceFinalBlink = vi.fn()
    projection.userData.setDistanceNormalProgress = vi.fn()
    const magnitude = sceneObject('magnitude')

    const target = installPointPlaneStepAnimation({
      objects: [pointP, pointQ, difference, projection, magnitude],
      workspace: { highlightBlock: vi.fn() },
      blocks,
    })

    expect(target).toBe(projection)
    const rightAngle = normalGlyph.children.find((child) => child.userData.geoType === 'normal_plane_right_angle')
    expect(rightAngle).toBeDefined()
    target.userData.animateSteps(atConstructionStage(2, 0.2))
    expect(rightAngle.visible).toBe(false)
    target.userData.animateSteps(atConstructionStage(3, 0.22))
    expect(rightAngle.visible).toBe(true)
    expect(projection.userData.setDistanceNormalProgress.mock.calls.at(-1)[0]).toBeCloseTo(0.22)
    target.userData.animateSteps(1)
    expect(rightAngle.visible).toBe(true)
  })
})
