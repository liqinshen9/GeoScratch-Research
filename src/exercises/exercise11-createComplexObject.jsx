import rotationExercise, {
  Diagram,
  Steps as TaskSteps,
  cubeMatches,
  cubeHasRequiredInputs,
  pointMatches,
  getReusableBlockTemplate,
} from './exercise10-cubePointPivot'

const TASKS = [
  ['cube', 'Create: a Cube with Scalar 2 for side length and Vector (1, 1, 1) for its centre.'],
  ['point', 'Create: a Point at the input corner P1 = (0, 2, 2).'],
  ['pair', 'My Blocks: save the cube and point as a composite block. Enter a name of your choice. You will use this saved block in the next exercise.'],
]

function Givens() {
  return <div className="exercise-given-values">
    <section><p>Create a complex object consisting of a cube with side length 2, centred at C = (1, 1, 1), and a corner point P = (0, 2, 2), as illustrated below. Save them together in My Blocks for the next exercise.</p><Diagram /></section>
  </div>
}

function Steps(props) {
  return <TaskSteps {...props} tasks={TASKS} />
}

function evaluate({ workspace, userBlocks = [] }) {
  const cubes = workspace?.getBlocksByType('geo_cube', false) ?? []
  const points = workspace?.getBlocksByType('linalg_point', false) ?? []
  const steps = {
    cube: cubes.some(cubeMatches),
    point: points.some(pointMatches),
    pair: userBlocks.some((block) => block.name?.trim() && /<block\b[^>]*\btype=["']geo_special_cube["']/.test(block.xmlText ?? '')),
  }
  const passed = Object.values(steps).every(Boolean)
  return {
    passed,
    correct: passed,
    incorrect: false,
    steps,
    partialSteps: {
      cube: !steps.cube && cubes.some(cubeHasRequiredInputs),
      point: !steps.point && points.length > 0,
    },
    answer: { type: 'scaleAndRotation' },
  }
}

export default {
  id: 'create-complex-object',
  kind: 'transform',
  hideAnswerCard: true,
  Givens,
  Steps,
  evaluate,
  getReusableBlockTemplate,
  decorateObjects: rotationExercise.decorateObjects,
  settingsOverrides: rotationExercise.settingsOverrides,
}
