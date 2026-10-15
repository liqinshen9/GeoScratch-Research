import THREE from '@/utils/three'
import { useEffect } from 'react'
import FeedbackSteps from './shared/FeedbackSteps'
import { distanceFeedback } from './shared/formativeFeedback'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { createVectorNotationRuntime } from '@/utils/vectorNotation'
import { createPointMarker } from '@/utils/pointMarker'
import { buildNormalVectorGlyph } from '@/utils/distanceIllustration'
import usePivotPlaybackStore from '@/store/usePivotPlaybackStore'
import { installPointPlaneStepAnimation } from './shared/pointPlaneStepAnimation'
import { buildNormalPlaneRightAngle } from './shared/normalPlaneRightAngle'
import {
  blockMatchesVec3,
  closeNumber,
  findAnswerGeometry,
  getInputBlock,
  objectOrChildMatches,
  planeNormalFromBlock,
  vec3FromBlock,
  vectorMatches,
  POINT_VECTOR_BLOCK_TYPES,
} from './shared/blockQueries'

const POINT_P = new THREE.Vector3(-9, 8, 7)
const PLANE_POINT_A = new THREE.Vector3(-5, 0, 2)
const PLANE_NORMAL = new THREE.Vector3(0.5, 1, 0.5)
// Derived, not typed: |n| is sqrt(1.5), so the distance is not a round number
// and hardcoding it would drift the moment any of the three above changed.
const CORRECT_DISTANCE =
  Math.abs(POINT_P.clone().sub(PLANE_POINT_A).dot(PLANE_NORMAL)) / PLANE_NORMAL.length()
// planeNormalFromBlock returns the UNIT normal, mirroring what the renderer
// draws, so a comparison against it has to be unit too. This was invisible
// while PLANE_NORMAL happened to be a unit vector.
const PLANE_NORMAL_UNIT = PLANE_NORMAL.clone().normalize()

const POINT_P_COLOR_SEED = 'exercise:point-plane-distance:P'
const POINT_MARKER_FALLBACK_COLOR = '#94a3b8'

const vectorNotation = createVectorNotationRuntime()

function isUserStudyLiPointPlaneRuntime() {
  const runtimeMode = String(window.__geoScratchRuntimeMode || '')
  return (
    runtimeMode === 'userstudy-Li-point-plane-distance' ||
    (runtimeMode.startsWith('userstudy-Li-') && runtimeMode.endsWith('-point-plane-distance'))
  )
}

// The worked solution, loaded by the dev-only "Fill solution" control. Kept
// beside the checker so a change to what counts as correct is made next to the
// blocks that are supposed to satisfy it.
const SOLUTION_XML = `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="vector_magnitude" x="60" y="60">
    <value name="V">
      <block type="vector_project">
        <value name="U">
          <block type="vector_arithmetic">
            <field name="OP">subtract</field>
            <value name="U">
              <block type="linalg_point">
                <field name="X">-9</field><field name="Y">8</field><field name="Z">7</field>
              </block>
            </value>
            <value name="V">
              <block type="geo_show_point_on_object">
                <value name="OBJECT">
                  <block type="parametric_plane">
                    <value name="point">
                      <block type="linalg_point">
                        <field name="X">-5</field><field name="Y">0</field><field name="Z">2</field>
                      </block>
                    </value>
                    <value name="norm">
                      <block type="linalg_vec3">
                        <field name="X">0.5</field><field name="Y">1</field><field name="Z">0.5</field>
                      </block>
                    </value>
                  </block>
                </value>
              </block>
            </value>
          </block>
        </value>
        <value name="V">
          <block type="linalg_vec3">
            <field name="X">0.5</field><field name="Y">1</field><field name="Z">0.5</field>
          </block>
        </value>
      </block>
    </value>
  </block>
</xml>`

const POINT_PLANE_DISTANCE_BLOCK_XML =
  '<xml xmlns="https://developers.google.com/blockly/xml"><block type="point_plane_distance" x="0" y="0"></block></xml>'

function pointLiesOnExercisePlane(point, tolerance = 1e-5) {
  if (!point?.isVector3) return false
  return Math.abs(point.clone().sub(PLANE_POINT_A).dot(PLANE_NORMAL)) <= tolerance
}

function isExercisePlaneObject(object) {
  const point = object?.userData?.point
  const normal = object?.userData?.normalRaw
  return (
    object.userData?.geoType === 'point_normal_plane_group' &&
    vectorMatches(point, PLANE_POINT_A) &&
    vectorMatches(normal, PLANE_NORMAL)
  )
}

function findPointPBlock(workspace) {
  if (!workspace) return null
  for (const type of POINT_VECTOR_BLOCK_TYPES) {
    const match = workspace
      .getBlocksByType(type, false)
      .find((block) => blockMatchesVec3(block, POINT_P))
    if (match) return match
  }
  return null
}

function workspaceHasPointPVector(workspace) {
  return Boolean(findPointPBlock(workspace))
}

function isExercisePlaneBlock(block) {
  return (
    block?.type === 'parametric_plane' &&
    blockMatchesVec3(getInputBlock(block, 'point'), PLANE_POINT_A) &&
    vectorMatches(planeNormalFromBlock(block), PLANE_NORMAL_UNIT)
  )
}

function isExercisePointQBlock(block) {
  if (block?.type === 'linalg_point') return pointLiesOnExercisePlane(vec3FromBlock(block))
  return (
    block?.type === 'geo_show_point_on_object' &&
    isExercisePlaneBlock(getInputBlock(block, 'OBJECT'))
  )
}

function isPointPBlock(block) {
  return blockMatchesVec3(block, POINT_P)
}

function isNormalVectorBlock(block) {
  return blockMatchesVec3(block, PLANE_NORMAL)
}

function isNormalFromPointBlock(block) {
  return isNormalVectorBlock(block) && getInputBlock(block, 'ORIGIN')?.type === 'linalg_point'
}

function isPointDifferenceBlock(block) {
  return (
    block?.type === 'vector_arithmetic' &&
    block.getFieldValue('OP') === 'subtract' &&
    isPointPBlock(getInputBlock(block, 'U')) &&
    isExercisePointQBlock(getInputBlock(block, 'V'))
  )
}

function objectIsAtPointP(object) {
  const position = object?.userData?.point ?? object?.position
  return (
    position?.isVector3 &&
    closeNumber(position.x, POINT_P.x) &&
    closeNumber(position.y, POINT_P.y) &&
    closeNumber(position.z, POINT_P.z)
  )
}

function createPointPMarker(name, blockId) {
  // Colour comes off the window surface rather than a static import so this
  // module stays importable outside the browser (its checker logic is
  // unit-tested in a node environment).
  const color =
    window.GeoScratchColors?.forInstance('point', POINT_P_COLOR_SEED) ?? POINT_MARKER_FALLBACK_COLOR
  const marker = createPointMarker({ color, geoType: 'exercise_point_p', srcBlockId: blockId })

  marker.position.copy(POINT_P)
  marker.userData.labelAnchors = {
    p: { type: 'world', position: [POINT_P.x, POINT_P.y, POINT_P.z] },
  }
  marker.userData.labels = [
    {
      anchor: 'p',
      name,
      value: vectorNotation.formatVector(POINT_P),
      distanceFactor: 8,
      offset: [0.12, 0.12, 0],
      color,
    },
  ]

  return marker
}

function applyExercisePointPIdentity(object, blockId) {
  object.userData = {
    ...(object.userData || {}),
    geoType: 'exercise_point_p',
    srcBlockId: blockId,
  }
  object.traverse?.((child) => {
    child.userData?.labels?.forEach((label) => {
      label.name = 'P'
      label.className = 'label--study-coordinate'
      delete label.text
    })
  })
  return object
}

function addExercisePointPIfNeeded(objects, workspace) {
  // The plane's defining point may consume the registry's first P-name. This
  // exercise names its given point semantically, so never expose that internal
  // numbering as P2 in the scene.
  const block = findPointPBlock(workspace)
  if (!block) return objects
  const existing = objects.find(objectIsAtPointP)
  if (existing) {
    applyExercisePointPIdentity(existing, block.id)
    return objects
  }
  return [...objects, createPointPMarker('P', block.id)]
}

function findExercisePlaneBlock(workspace) {
  return workspace?.getBlocksByType('parametric_plane', false).find(isExercisePlaneBlock) ?? null
}

function findExercisePointQBlock(workspace) {
  const usedQ = getInputBlock(findPointDifferenceBlock(workspace), 'V')
  if (usedQ) return usedQ
  const displayedQ = workspace?.getBlocksByType('geo_show_point_on_object', false).find(isExercisePointQBlock)
  if (displayedQ) return displayedQ
  // The point defining the plane is not, by itself, a separate Q1 attempt.
  const definingPoints = new Set(workspace?.getBlocksByType('parametric_plane', false).map((plane) => getInputBlock(plane, 'point')))
  return (
    workspace?.getBlocksByType('linalg_point', false).find((block) => !definingPoints.has(block) && isExercisePointQBlock(block)) ??
    null
  )
}

function findPointDifferenceBlock(workspace) {
  return workspace?.getBlocksByType('vector_arithmetic', false).find(isPointDifferenceBlock) ?? null
}

function addManualPointQIfNeeded(objects, workspace) {
  const block = findExercisePointQBlock(workspace)
  if (block?.type !== 'linalg_point') return objects
  if (objects.some((object) => object.userData?.geoType === 'exercise_point_q' && object.userData.srcBlockId === block.id)) return objects
  const point = vec3FromBlock(block)
  const color = window.GeoScratchColors?.forInstance('point', block.id) ?? POINT_MARKER_FALLBACK_COLOR
  const existing = objects.find((object) => object.userData?.srcBlockId === block.id && object.userData.geoType === 'linalg_point_marker')
  const marker = existing ?? createPointMarker({ color, geoType: 'selectable_point_marker', srcBlockId: block.id })
  marker.position.copy(point)
  marker.userData.geoType = 'selectable_point_marker'
  marker.userData.coordinate = point.clone()
  marker.userData.clickLabelAnchor = 'q'
  marker.userData.labels = []
  const group = new THREE.Group()
  group.add(marker)
  group.userData = {
    geoType: 'exercise_point_q', srcBlockId: block.id, point: point.clone(), toggleLabelsOnClick: true,
    labelAnchors: { q: { type: 'world', position: point.toArray() } },
    labels: [{ anchor: 'q', name: 'Q1', value: vectorNotation.formatVector(point),
      distanceFactor: 8, offset: [0.12, 0.12, 0], color, className: 'label--study-coordinate' }],
  }
  const difference = findPointDifferenceBlock(workspace)
  for (const object of objects) {
    object.traverse?.((child) => {
      if (child.userData?.srcBlockId !== difference?.id) return
      for (const label of child.userData.labels ?? []) {
        if (label.anchor !== 'rTip') continue
        if (label.text !== undefined) label.text = 'P − Q1'
        else label.name = 'P − Q1'
      }
    })
  }
  return [...objects.filter((object) => object !== existing), group]
}

function findProjectionBlock(workspace) {
  return (
    workspace
      ?.getBlocksByType('vector_project', false)
      .find(
        (block) =>
          isPointDifferenceBlock(getInputBlock(block, 'U')) &&
          isNormalVectorBlock(getInputBlock(block, 'V')),
      ) ?? null
  )
}

function findMagnitudeBlock(workspace) {
  return (
    workspace?.getBlocksByType('vector_magnitude', false).find((block) => {
      const projectBlock = getInputBlock(block, 'V')
      return projectBlock && projectBlock === findProjectionBlock(workspace)
    }) ?? null
  )
}

function findNormalFromQBlock(workspace) {
  return workspace?.getBlocksByType('linalg_vec3', false).find(isNormalFromPointBlock) ?? null
}

function findPointQCoordinates(objects, workspace) {
  // Q1 exists independently of the subtraction in step 4. Read it directly
  // so a correctly constructed normal can complete step 5 in any order.
  const pointQBlock = findExercisePointQBlock(workspace)
  if (pointQBlock?.type === 'linalg_point') return vec3FromBlock(pointQBlock)
  return (
    objects.find(
      (object) =>
        object?.userData?.geoType === 'annotated_object' &&
        object.userData.srcBlockId === pointQBlock?.id,
    )?.userData?.point ?? null
  )
}

function normalStartsAtRecordedQ(objects, workspace) {
  const normalBlock = findNormalFromQBlock(workspace)
  const qPoint = findPointQCoordinates(objects, workspace)
  const enteredPoint = vec3FromBlock(getInputBlock(normalBlock, 'ORIGIN'))
  // Q1 is shown to two decimal places, so accept the coordinates the
  // participant can actually read and enter from the 3D label.
  return Boolean(qPoint?.isVector3 && vectorMatches(enteredPoint, qPoint, 0.005000001))
}

function replaceStudyNormalGlyph(objects, workspace) {
  if (!isUserStudyLiPointPlaneRuntime()) return objects

  const normalBlock = findNormalFromQBlock(workspace)
  const objectIndex = objects.findIndex(
    (object) => object?.userData?.srcBlockId === normalBlock?.id,
  )
  const origin = vec3FromBlock(getInputBlock(normalBlock, 'ORIGIN'))
  const normal = vec3FromBlock(normalBlock)
  if (objectIndex < 0 || !origin || !normal) return objects

  const color = window.GeoScratchColors.forRole('operandB')
  const { glyph, tip } = buildNormalVectorGlyph(THREE, {
    blockId: normalBlock.id,
    origin,
    normal,
    length: Math.max(8, CORRECT_DISTANCE + 5),
    color,
  })
  const rightAngle = buildNormalPlaneRightAngle(origin, normal, color)
  rightAngle.userData.srcBlockId = normalBlock.id
  glyph.add(rightAngle)
  glyph.userData.labelAnchors = { normal: { type: 'world', position: tip.toArray() } }
  glyph.userData.labels = [
    { anchor: 'normal', text: 'n', distanceFactor: 8, offset: [0.12, 0.12, 0], color },
  ]
  window.threeObjStore[normalBlock.id] = glyph

  const decorated = [...objects]
  decorated[objectIndex] = glyph
  return decorated
}

function decoratePlaneDefinition(objects, visible) {
  objects.forEach((root) =>
    root?.traverse?.((object) => {
      if (!isExercisePlaneObject(object)) return
      const helper = object.children?.find(
        (child) => child.userData?.geoType === 'parametric_plane_point_normal_group',
      )
      if (helper) helper.visible = visible
      object.userData.renderNestedLabels = true
      object.userData.toggleLabelsOnClick = true
      object.userData?.labels?.forEach((label) => {
        if (label.anchor !== 'point') return
        label.hiddenByDefault = !visible
      })
    }),
  )
  return objects
}

function decorateObjects(objects, workspace) {
  let decorated = addExercisePointPIfNeeded(objects, workspace)
  decorated = addManualPointQIfNeeded(decorated, workspace)
  decorated = replaceStudyNormalGlyph(decorated, workspace)
  decorated = decoratePlaneDefinition(decorated, !workspaceHasPointPVector(workspace))
  const blocks = {
    plane: findExercisePlaneBlock(workspace),
    pointP: findPointPBlock(workspace),
    pointQ: findExercisePointQBlock(workspace),
    difference: findPointDifferenceBlock(workspace),
    normalFromQ: findNormalFromQBlock(workspace),
    projection: findProjectionBlock(workspace),
    magnitude: findMagnitudeBlock(workspace),
  }
  if (Object.values(blocks).every(Boolean)) {
    installPointPlaneStepAnimation({ objects: decorated, workspace, blocks })
  }
  return decorated
}

function AnimationButton({ objects, workspace }) {
  const target = objects.find((object) => typeof object?.userData?.animateSteps === 'function')
  useEffect(
    () => () => {
      usePivotPlaybackStore.getState().stop()
      workspace?.highlightBlock?.(null)
    },
    [workspace],
  )
  return (
    <button
      type="button"
      className="exercise-step-animation"
      disabled={!target}
      onClick={() => usePivotPlaybackStore.getState().play(target)}
    >
      <FontAwesomeIcon icon="fa-solid fa-play" /> Show animation
    </button>
  )
}

function hasExercisePlane(objects) {
  return objects.some((object) => objectOrChildMatches(object, isExercisePlaneObject))
}

function hasPointQOnExercisePlane(objects, workspace) {
  const pointQBlock = findExercisePointQBlock(workspace)
  if (pointQBlock?.type === 'linalg_point') return pointLiesOnExercisePlane(vec3FromBlock(pointQBlock))
  return objects.some(
    (object) =>
      object?.userData?.geoType === 'annotated_object' &&
      pointLiesOnExercisePlane(object.userData.point) &&
      objectOrChildMatches(object, isExercisePlaneObject),
  )
}

function hasPointDifferenceBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('vector_arithmetic', false).some(isPointDifferenceBlock)
}

function hasProjectionOntoNormalBlock(workspace) {
  if (!workspace) return false
  return workspace
    .getBlocksByType('vector_project', false)
    .some(
      (block) =>
        isPointDifferenceBlock(getInputBlock(block, 'U')) &&
        isNormalVectorBlock(getInputBlock(block, 'V')),
    )
}

function hasProjectionDistanceBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('vector_magnitude', false).some((block) => {
    const projectBlock = getInputBlock(block, 'V')
    return (
      projectBlock?.type === 'vector_project' &&
      isPointDifferenceBlock(getInputBlock(projectBlock, 'U')) &&
      isNormalVectorBlock(getInputBlock(projectBlock, 'V'))
    )
  })
}

function hasAnyBlockOfType(workspace, type) {
  return Boolean(workspace?.getBlocksByType(type, false).length)
}

function hasAnyPointOrVectorBlock(workspace) {
  return POINT_VECTOR_BLOCK_TYPES.some((type) => hasAnyBlockOfType(workspace, type))
}

function hasAnyPointOnObjectBlock(workspace) {
  return hasAnyBlockOfType(workspace, 'geo_show_point_on_object')
}

function hasAnyPointDifferenceAttempt(workspace) {
  return Boolean(
    workspace
      ?.getBlocksByType('vector_arithmetic', false)
      .some((block) => block.getFieldValue('OP') === 'subtract'),
  )
}

function hasAnyNormalVectorAttempt(workspace) {
  return Boolean(workspace?.getBlocksByType('linalg_vec3', false).some(isNormalVectorBlock))
}

function hasAnyProjectionAttempt(workspace) {
  return hasAnyBlockOfType(workspace, 'vector_project')
}

function hasAnyMagnitudeAttempt(workspace) {
  return hasAnyBlockOfType(workspace, 'vector_magnitude')
}

// Projection only. The dot product of (P - Q) and n equals the distance just
// when |n| = 1, and this plane's normal is (0.5, 1, 0.5), so |n| is sqrt(1.5).
// A student taking that route would read 8.5 instead of 6.94, fail the value
// check, and have nothing to tell them why.
function hasValidDistanceComputation(workspace) {
  return hasProjectionDistanceBlock(workspace)
}

function Givens() {
  return (
    <div className="exercise-given-values" aria-label="Given values">
      <section>
        <h3>Plane</h3>
        <p>Point A = (-5, 0, 2)</p>
        <p>Normal n = (0.5, 1, 0.5)</p>
      </section>
      <section>
        <h3>Point</h3>
        <p>P = (-9, 8, 7)</p>
      </section>
    </div>
  )
}

function Steps(props) {
  const tasks = [
    ['plane', 'Create: a plane using point A = (-5, 0, 2) and normal n = (0.5, 1, 0.5).'],
    ['pointP', 'Create: Point P = (-9, 8, 7).'],
    [
      'pointQ',
      'Create: any point Q1 on the plane using a Point block or Show any point on object block. Check its coordinates in the 3D view.',
    ],
    ['difference', 'Compute: P - Q1 with the Vector Arithmetic block.'],
    [
      'normalFromQ',
      'Create: the normal n = (0.5, 1, 0.5) from Point Q1.',
    ],
    ['projection', 'Project: P - Q1 onto n with the Vector Project block.'],
    [
      'distance',
      'Compute: the Vector Magnitude of that projection. This is the distance from P to the plane.',
    ],
  ]

  return <FeedbackSteps {...props} tasks={tasks} />
}

/** Reads the computed distance out of whichever block produced it. */
function readDistance(objects) {
  const distanceObject = objects.find(
    (object) =>
      object?.userData?.geoType === 'point_plane_distance_dot' ||
      object?.userData?.geoType === 'point_plane_distance_projection_magnitude',
  )
  const scalarObjects = objects.filter(
    (object) => object?.userData?.geoType === 'scalar_arithmetic_result',
  )
  // Prefer a scalar block whose value already matches, so an unrelated scalar
  // elsewhere in the workspace cannot masquerade as the answer.
  const scalarAnswer = scalarObjects.find((object) =>
    closeNumber(object.userData?.value, CORRECT_DISTANCE, 0.01),
  )
  const distance = Number(distanceObject?.userData?.distance ?? scalarAnswer?.userData?.value)
  if (!Number.isFinite(distance)) return { distance: null, target: null }
  return { distance, target: findAnswerGeometry(objects) ?? distanceObject ?? scalarAnswer ?? null }
}

function evaluate({ objects, workspace }) {
  const { distance, target } = readDistance(objects)
  const distanceIsCorrect = distance !== null && closeNumber(distance, CORRECT_DISTANCE, 0.01)
  const normalFromRecordedQ = normalStartsAtRecordedQ(objects, workspace)
  const distanceComputationIsCorrect = distanceIsCorrect && hasValidDistanceComputation(workspace)
  const passed = distanceComputationIsCorrect && normalFromRecordedQ

  const hasPointP = workspaceHasPointPVector(workspace)
  const hasPointQ = hasPointQOnExercisePlane(objects, workspace)
  const steps = {
    plane: hasExercisePlane(objects),
    pointP: hasPointP,
    pointQ: hasPointQ,
    difference: hasPointP && hasPointQ && hasPointDifferenceBlock(workspace),
    normalFromQ: normalFromRecordedQ,
    // The projection ticks on its own, before the magnitude finishes the job.
    projection: hasProjectionOntoNormalBlock(workspace),
    distance: distanceComputationIsCorrect,
  }
  const partialSteps = {
    plane: !steps.plane && hasAnyBlockOfType(workspace, 'parametric_plane'),
    pointP: !steps.pointP && hasAnyPointOrVectorBlock(workspace),
    pointQ: !steps.pointQ && (hasAnyPointOnObjectBlock(workspace) || hasAnyBlockOfType(workspace, 'linalg_point')),
    difference: !steps.difference && hasAnyPointDifferenceAttempt(workspace),
    normalFromQ: !steps.normalFromQ && hasAnyNormalVectorAttempt(workspace),
    projection: !steps.projection && hasAnyProjectionAttempt(workspace),
    distance: !steps.distance && (hasAnyMagnitudeAttempt(workspace) || distance !== null),
  }
  const partialMessages = {
    plane: 'Check that the plane uses point A = (-5, 0, 2) and normal n = (0.5, 1, 0.5).',
    pointP: 'Check that Point P has coordinates (-9, 8, 7).',
    pointQ: 'Use a Point block whose coordinates satisfy 0.5x + y + 0.5z = -1.5, or Show Point on Object connected to the exercise plane.',
    difference: 'Use subtraction with P first and Q1 second: P - Q1.',
    normalFromQ:
      'Look at the coordinate of Q1 in the 3D view. The normal n should start from that point.',
    projection: 'Project P - Q1 as u onto the normal n as v.',
    distance:
      'Connect that projection into Vector Magnitude. The computed distance should be about 6.94.',
  }

  const feedback = distanceFeedback({
    workspace, steps, distance, expectedDistance: CORRECT_DISTANCE,
    qPoint: findPointQCoordinates(objects, workspace),
    isPlane: isExercisePlaneBlock, isQ: isExercisePointQBlock, isP: isPointPBlock,
    isNormal: isNormalVectorBlock, isDifference: isPointDifferenceBlock,
    isProjection: (block) => block?.type === 'vector_project'
      && isPointDifferenceBlock(getInputBlock(block, 'U'))
      && isNormalVectorBlock(getInputBlock(block, 'V')),
  })

  return {
    passed,
    // The answer card goes green on a correct VALUE, before the working is
    // checked; `passed` additionally requires the student to have built the
    // computation rather than typed the number in.
    correct: distanceIsCorrect,
    incorrect: distance !== null && !distanceIsCorrect,
    target,
    answer: { type: 'distance', value: distance },
    steps,
    partialSteps,
    partialMessages,
    feedback,
  }
}

export default {
  id: 'point-plane-distance',
  kind: 'distance',
  Givens,
  Steps,
  evaluate,
  decorateObjects,
  AnimationButton,
  solutionXml: SOLUTION_XML,
  reusableBlockTemplate: {
    defaultName: 'Distance from point to plane',
    description: 'Save a reusable distance block with open inputs for any point and any plane.',
    source: 'exercise',
    xmlText: POINT_PLANE_DISTANCE_BLOCK_XML,
  },
}
