import { TUTORIAL_SPHERES, tutorialProgress } from './tutorialProgress'
import { Steps as ExerciseSteps } from '@/exercises/exercise10-cubePointPivot'
import { useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import usePivotPlaybackStore from '@/store/usePivotPlaybackStore'
import { createSphereStepAnimation } from './sphereStepAnimation'

const TASKS = [
  ['head', 'Create the head: add a Sphere, connect a Scalar for its radius and a Point for its centre. Enter the values shown above.'],
  ['left', 'Create the left ear: add another Sphere with a Scalar and a Point. Enter the left ear’s values.'],
  ['right', 'Create the right ear: right-click the left ear’s Sphere and select Duplicate. Change its centre to the right ear’s coordinates.'],
]

export function MouseHeadPicture({ className = '', showShadow = true, showAxes = false }) {
  return <svg className={className} viewBox="0 0 300 280" role="img" aria-label="A mouse head made from three spheres">
    <defs><radialGradient id="tutorial-sphere" cx="32%" cy="25%" r="75%"><stop offset="0" stopColor="#555555" /><stop offset="0.65" stopColor="#171717" /><stop offset="1" stopColor="#050505" /></radialGradient></defs>
    {showAxes && <g fill="none" strokeWidth="1.5" strokeLinecap="round">
      <path d="M20 236H280M274 232L280 236L274 240" stroke="#bd8585" />
      <path d="M150 260V12M146 18L150 12L154 18" stroke="#85aa85" />
      <path d="M202 202L28 270M32 264L28 270L35 270" stroke="#859cbc" />
      <g stroke="none" fontSize="13" fontFamily="sans-serif">
        <text x="284" y="240" fill="#a66d6d">X</text>
        <text x="158" y="20" fill="#648a64">Y</text>
        <text x="16" y="274" fill="#647ea4">Z</text>
      </g>
    </g>}
    {showShadow && <ellipse cx="150" cy="246" rx="78" ry="9" fill="#cbd5e1" opacity="0.45" />}
    <circle cx="74" cy="83" r="38" fill="url(#tutorial-sphere)" />
    <circle cx="226" cy="83" r="38" fill="url(#tutorial-sphere)" />
    <circle cx="150" cy="159" r="76" fill="url(#tutorial-sphere)" />
  </svg>
}
function Givens() {
  return <div className="exercise-given-values tutorial-goal">
    <p>Build this head using three spheres.</p>
    <MouseHeadPicture showShadow={false} />
    <table><thead><tr><th>Sphere</th><th>Radius</th><th>Centre (x, y, z)</th></tr></thead>
      <tbody>{TUTORIAL_SPHERES.map((sphere) => <tr key={sphere.key}><th>{sphere.name}</th><td data-tutorial-radius={sphere.key}>{sphere.radius}</td><td data-tutorial-centre={sphere.key}>({sphere.centre.join(', ')})</td></tr>)}</tbody>
    </table>
  </div>
}
function Steps(props) { return <ExerciseSteps {...props} tasks={TASKS} /> }
function AnimationButton({ objects, workspace }) {
  const target = objects.find((object) => object.userData?.tutorialPreview)
  const passed = tutorialProgress(workspace).stage === 'done'
  useEffect(() => () => usePivotPlaybackStore.getState().stop(), [])
  return <button type="button" className="exercise-step-animation" data-tutorial-animation disabled={!target || !passed}
    onClick={() => usePivotPlaybackStore.getState().play(target)}>
    <FontAwesomeIcon icon="fa-solid fa-play" /> Show animation
  </button>
}
function evaluate({ workspace }) {
  const progress = tutorialProgress(workspace)
  const hint = progress.stage === 'values'
    ? progress.fieldName === 'scalar'
      ? `Check the radius: the ${progress.part.name.toLowerCase()} needs radius ${progress.part.radius}.`
      : `Check the centre coordinates: the ${progress.part.name.toLowerCase()} needs (${progress.part.centre.join(', ')}).`
    : ['scalar', 'radius'].includes(progress.stage)
      ? 'Connect a Scalar block to the Sphere’s Radius input.'
      : ['point', 'centre'].includes(progress.stage)
        ? 'Connect a Point block to the Sphere’s Centre input.'
        : 'Add a Sphere block and connect its Radius and Centre inputs.'
  return { passed: progress.stage === 'done', correct: progress.stage === 'done', incorrect: false,
    steps: Object.fromEntries(TUTORIAL_SPHERES.map(({ key }) => [key, progress.completed.includes(key)])),
    partialSteps: progress.part && progress.head ? { [progress.part.key]: true } : {},
    partialMessages: progress.part ? { [progress.part.key]: hint } : {},
    answer: { type: 'scaleAndRotation' } }
}
function decorateObjects(objects) {
  for (const object of objects) {
    if (object.userData?.geoType !== 'geo_sphere') continue
    object.userData.materialColorOverride = '#111111'
    object.material.color.set(object.userData.materialColorOverride)
    const name = window.geoNaming?.nameFor?.(object.userData.srcBlockId) || 'Sphere'
    const isHead = object.userData.radius > 1.5
    if (isHead) {
      object.userData.labelAnchors.bottom = {
        type: 'local', position: [0, -object.userData.radius - 0.5, 0],
      }
    }
    object.userData.labels = [{
      anchor: isHead ? 'bottom' : 'centre',
      text: name,
      color: '#111111', clearSilhouette: !isHead, hiddenByDefault: true,
      revealed: () => object.visible,
    }]
  }
  return [...objects, createSphereStepAnimation(objects)]
}
export default {
  id: 'session-sphere-tutorial', title: 'Make a Mickey Mouse head', kind: 'tutorial',
  Givens, Steps, AnimationButton, evaluate, decorateObjects, hideAnswerCard: true,
  settingsOverrides: { showLabels: true, showGrid: true, showBox: true, showAxes: true,
    showAxisScaleLabels: true, showAxisToggleButton: false, showAxisGizmo: true, sphereShowGridlines: false, solidOpacity: 1,
    haloEnabled: false, objectHighlightEnabled: false, objectsReceiveShadows: false,
    primitivesCastShadows: false, pointShadowsEnabled: false, cameraShadowsEnabled: false },
}
