import { getInputBlock, vec3FromBlock, closeNumber } from './blockQueries'
import { feedbackText } from './feedbackMessages'

const blocks = (workspace, type) => workspace?.getBlocksByType(type, false) ?? []
const fmt = (value) => Number.isFinite(Number(value)) ? String(Number(Number(value).toFixed(4))) : '—'
const vector = (v) => `(${v.map(fmt).join(', ')})`
const read = (block, fields = ['X', 'Y', 'Z']) => fields.map((field) => block.getFieldValue(field))
const axes = (actual, expected) => ['X', 'Y', 'Z'].filter((_, i) => !closeNumber(actual[i], expected[i])).join(', ')
const issue = (id, detail, block, values) => ({ message: feedbackText(id, values), detail: detail ? feedbackText(detail, values) : null, blockId: block?.id })
const missing = (name) => issue('missing', null, null, { name })
// Prefer the attempt with the fewest failed checks; do not diagnose an unrelated
// incomplete block when another candidate satisfies more of the current step.
function best(candidates, checks) {
  return candidates.map((block) => ({ block, score: checks.filter((check) => check(block)).length }))
    .sort((a, b) => b.score - a.score)[0]?.block
}
export function coordinateFeedback(block, expected, name) {
  const value = vec3FromBlock(block)
  if (!value) return issue('input', 'inputHelp', block, { name, expected: 'a Point or Vector with numeric coordinates' })
  const actual = value.toArray()
  return axes(actual, expected) ? issue('coordinate', 'coordinateHelp', block, {
    name, actual: vector(actual), expected: vector(expected), axes: axes(actual, expected),
  }) : null
}

export function constructionFeedback(workspace, steps) {
  const cube = best(blocks(workspace, 'geo_cube'), [
    (b) => !coordinateFeedback(getInputBlock(b, 'CENTRE'), [1, 1, 1], 'cube centre'),
    (b) => closeNumber(getInputBlock(b, 'SIDE_LENGTH_INPUT')?.getFieldValue('scalar'), 2),
  ])
  let cubeIssue = missing('Cube')
  if (cube) {
    const centre = getInputBlock(cube, 'CENTRE')
    const side = getInputBlock(cube, 'SIDE_LENGTH_INPUT')
    cubeIssue = !centre ? issue('input', 'inputHelp', cube, { name: 'cube centre', expected: 'Vector (1, 1, 1)' })
      : coordinateFeedback(centre, [1, 1, 1], 'cube centre')
    if (!cubeIssue) cubeIssue = side?.type !== 'scalar'
      ? issue('input', 'sideHelp', cube, { name: 'side length' })
      : issue('side', 'sideHelp', side, { actual: fmt(side.getFieldValue('scalar')) })
  }
  const point = best(blocks(workspace, 'linalg_point'), [
    (b) => closeNumber(b.getFieldValue('X'), 0), (b) => closeNumber(b.getFieldValue('Y'), 2), (b) => closeNumber(b.getFieldValue('Z'), 2),
  ])
  return {
    cube: steps.cube ? issue('cubeSuccess') : cubeIssue,
    point: steps.point ? issue('pointSuccess') : point ? coordinateFeedback(point, [0, 2, 2], 'corner point') : missing('Point'),
    pair: steps.pair ? issue('saveSuccess') : steps.cube && steps.point ? issue('save', 'saveHelp') : issue('buildBeforeSave'),
  }
}

export function rotationFeedback(workspace, pipeline, chain, steps) {
  const feedback = { pipeline: steps.pipeline ? issue('pipelineSuccess') : blocks(workspace, 'transform_pipeline').length
    ? issue('pipeline', 'pipelineHelp', blocks(workspace, 'transform_pipeline')[0]) : missing('Transform Pipeline') }
  for (const [index, key, type, success] of [[0, 'toOrigin', 'trans_matrix', 'originSuccess'], [1, 'rotate', 'rot_matrix', 'rotationSuccess'], [2, 'back', 'trans_matrix', 'backSuccess']]) {
    const block = chain[index]
    if (steps[key]) feedback[key] = issue(success)
    else if (!pipeline) feedback[key] = issue('pipeline', 'pipelineHelp', blocks(workspace, 'transform_pipeline')[0])
    else if (!block) feedback[key] = missing(type === 'trans_matrix' ? 'Translation' : 'Rotation')
    else if (block.type !== type) feedback[key] = issue('order', 'orderHelp', block, { position: index + 1 })
    else if (type === 'trans_matrix') {
      const actual = read(block, ['TX', 'TY', 'TZ'])
      feedback[key] = issue('translation', key === 'toOrigin' ? 'originHelp' : 'backHelp', block, {
        actual: vector(actual), axes: axes(actual, Array(3).fill(key === 'toOrigin' ? -1 : 1)),
      })
    } else feedback[key] = block.getFieldValue('AXIS') !== 'Y' ? issue('axis', 'axisHelp', block, { actual: block.getFieldValue('AXIS') })
      : issue('angle', 'angleHelp', block, { actual: fmt(block.getFieldValue('DEGREES')) })
  }
  if (chain.length > 3) feedback.back = { ...issue('extra', 'extraHelp', chain[3], { count: chain.length }), incomplete: true }
  return feedback
}

export function distanceFeedback({ workspace, steps, qPoint, distance, expectedDistance, isPlane, isQ, isP, isNormal, isDifference, isProjection }) {
  const plane = best(blocks(workspace, 'parametric_plane'), [(b) => !coordinateFeedback(getInputBlock(b, 'point'), [-5, 0, 2], 'plane point A'), (b) => !coordinateFeedback(getInputBlock(b, 'norm'), [0.5, 1, 0.5], 'plane normal')])
  const point = best([...blocks(workspace, 'linalg_point'), ...blocks(workspace, 'linalg_vec3')], [
    (b) => closeNumber(b.getFieldValue('X'), -9), (b) => closeNumber(b.getFieldValue('Y'), 8), (b) => closeNumber(b.getFieldValue('Z'), 7),
  ])
  const definingPoints = new Set(blocks(workspace, 'parametric_plane').map((plane) => getInputBlock(plane, 'point')))
  const q = best([...blocks(workspace, 'geo_show_point_on_object'),
    ...blocks(workspace, 'linalg_point').filter((block) => !definingPoints.has(block) && !isP(block))], [isQ])
  const subtraction = best(blocks(workspace, 'vector_arithmetic'), [(b) => b.getFieldValue('OP') === 'subtract', (b) => isP(getInputBlock(b, 'U')), (b) => isQ(getInputBlock(b, 'V'))])
  const normal = best(blocks(workspace, 'linalg_vec3'), [isNormal, (b) => getInputBlock(b, 'ORIGIN')?.type === 'linalg_point'])
  const projection = best(blocks(workspace, 'vector_project'), [(b) => isDifference(getInputBlock(b, 'U')), (b) => isNormal(getInputBlock(b, 'V'))])
  const magnitude = best(blocks(workspace, 'vector_magnitude'), [(b) => isProjection(getInputBlock(b, 'V'))])
  const feedback = {}
  feedback.plane = !plane ? missing('Plane') : coordinateFeedback(getInputBlock(plane, 'point'), [-5, 0, 2], 'plane point A')
    || coordinateFeedback(getInputBlock(plane, 'norm'), [0.5, 1, 0.5], 'plane normal') || issue('planePending', null, plane)
  feedback.pointP = !point ? missing('Point') : coordinateFeedback(point, [-9, 8, 7], 'P') || issue('pSuccess')
  feedback.pointQ = !q ? missing('Point or Show Point on Object')
    : q.type === 'linalg_point' ? issue('qOffPlane', 'qPlaneEquationHelp', q)
      : !isPlane(getInputBlock(q, 'OBJECT')) ? issue('qPlane', 'qPlaneHelp', q) : issue('qPending', null, q)
  feedback.difference = !subtraction ? missing('Vector Arithmetic') : subtraction.getFieldValue('OP') !== 'subtract'
    ? issue('operation', 'operationHelp', subtraction, { actual: subtraction.getFieldValue('OP') })
    : isQ(getInputBlock(subtraction, 'U')) && isP(getInputBlock(subtraction, 'V')) ? issue('reversed', 'reversedHelp', subtraction)
      : issue('differenceInputs', 'differenceHelp', subtraction)
  const origin = getInputBlock(normal, 'ORIGIN')
  feedback.normalFromQ = !normal ? missing('Vector') : coordinateFeedback(normal, [0.5, 1, 0.5], 'normal n')
    || (!qPoint?.isVector3 ? issue('qUnavailable', null, q) : origin?.type !== 'linalg_point' || !vec3FromBlock(origin)
      ? issue('input', 'normalOriginHelp', normal, { name: 'normal origin' })
      : issue('normalOrigin', 'normalOriginHelp', origin, { actual: vector(read(origin)), expected: vector(qPoint.toArray().map((n) => Number(n.toFixed(2)))) }))
  feedback.projection = !projection ? missing('Vector Project') : isNormal(getInputBlock(projection, 'U')) && isDifference(getInputBlock(projection, 'V'))
    ? issue('projectionReversed', 'projectionHelp', projection) : issue('projectionInputs', 'projectionHelp', projection)
  feedback.distance = !magnitude ? missing('Vector Magnitude') : !isProjection(getInputBlock(magnitude, 'V')) ? issue('magnitude', 'magnitudeHelp', magnitude)
    : distance === null ? issue('distancePending', null, magnitude) : issue('distanceValue', 'distanceHelp', magnitude, { actual: fmt(distance), expected: expectedDistance.toFixed(2) })
  for (const [key, id] of Object.entries({ plane: 'planeSuccess', pointP: 'pSuccess', pointQ: 'qSuccess', difference: 'differenceSuccess', normalFromQ: 'normalSuccess', projection: 'projectionSuccess', distance: 'distanceSuccess' })) {
    if (steps[key]) feedback[key] = issue(id)
  }
  return feedback
}
