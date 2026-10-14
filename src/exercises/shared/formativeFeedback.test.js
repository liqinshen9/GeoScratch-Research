import { describe, expect, it } from 'vitest'
import THREE from '@/utils/three'
import { constructionFeedback, coordinateFeedback, rotationFeedback, distanceFeedback } from './formativeFeedback'

let id = 0
const block = (type, fields = {}, inputs = {}) => ({ id: `feedback-${id++}`, type,
  getFieldValue: (name) => fields[name], getInputTargetBlock: (name) => inputs[name] ?? null })
const vec = (x, y, z, inputs = {}) => block('linalg_vec3', { X: x, Y: y, Z: z }, inputs)
const point = (x, y, z) => block('linalg_point', { X: x, Y: y, Z: z })
const workspace = (...all) => ({ getBlocksByType: (type) => all.filter((b) => b.type === type) })

describe('formative feedback diagnoses', () => {
  it('identifies only incorrect coordinates and preserves the actual values', () => {
    const result = coordinateFeedback(vec(1, 0, 1), [1, 1, 1], 'cube centre')
    expect(result.message).toContain('(1, 0, 1)')
    expect(result.message).toContain('Y coordinate')
    expect(result.message).not.toContain('X, Y')
    expect(coordinateFeedback(vec(1, 1, 1), [1, 1, 1], 'cube centre')).toBeNull()
  })
  it('distinguishes missing cube inputs and supports named input wrappers', () => {
    const cube = block('geo_cube')
    expect(constructionFeedback(workspace(cube), {}).cube.message).toContain('input is missing')
    const centre = block('geo_variable', {}, { VALUE: vec(1, 1, 1) })
    const side = block('scalar', { scalar: 3 })
    const attempt = block('geo_cube', {}, { CENTRE: centre, SIDE_LENGTH_INPUT: side })
    const result = constructionFeedback(workspace(cube, attempt), {})
    expect(result.cube.message).toContain('side length is currently 3')
    expect(result.cube.blockId).toBe(side.id)
  })
  it('diagnoses transformation order, axis, angle, and extra steps separately', () => {
    const pipeline = block('transform_pipeline')
    const translate = block('trans_matrix', { TX: 1, TY: -1, TZ: -1 })
    const rotate = block('rot_matrix', { AXIS: 'X', DEGREES: -90 })
    expect(rotationFeedback(workspace(), pipeline, [rotate], {}).toOrigin.message).toContain('different transformation type')
    expect(rotationFeedback(workspace(), pipeline, [translate, rotate], {}).rotate.message).toContain('X axis')
    const result = rotationFeedback(workspace(), pipeline, [translate], {})
    expect(result.toOrigin.message).toContain('X component')
    expect(result.toOrigin.detail).toContain('(-1, -1, -1)')
    const yRotate = block('rot_matrix', { AXIS: 'Y', DEGREES: -90 })
    expect(rotationFeedback(workspace(), pipeline, [translate, yRotate], {}).rotate.message).toContain('-90 degrees')
    expect(rotationFeedback(workspace(), pipeline, [translate, yRotate, translate, rotate], { back: true }).back.message).toContain('4 transformations')
  })
  it('returns actionable feedback for an empty workspace without inventing values', () => {
    expect(constructionFeedback(null, {}).cube.message).toBe('Add a Cube block for this step.')
    expect(rotationFeedback(null, null, [], {}).pipeline.message).toBe('Add a Transform Pipeline block for this step.')
  })
  it('explains reversed subtraction and projection without claiming the distance must be wrong', () => {
    const p = point(-9, 8, 7)
    const q = block('geo_show_point_on_object')
    const n = vec(0.5, 1, 0.5)
    const reversed = block('vector_arithmetic', { OP: 'subtract' }, { U: q, V: p })
    const difference = block('vector_arithmetic', { OP: 'subtract' }, { U: p, V: q })
    const project = block('vector_project', {}, { U: n, V: difference })
    const args = { workspace: workspace(reversed, project, p, n, q), steps: {}, qPoint: null, distance: null, expectedDistance: 6.94,
      isPlane: () => false, isQ: (b) => b === q, isP: (b) => b === p, isNormal: (b) => b === n,
      isDifference: (b) => b === difference, isProjection: () => false }
    const result = distanceFeedback(args)
    expect(result.difference.message).toContain('Q₁ − P')
    expect(result.difference.detail).toContain('same distance')
    expect(result.projection.message).toContain('inputs are swapped')
    expect(result.normalFromQ.message).toContain('Display Q₁')
  })
  it('uses the student’s own displayed Q coordinates and honours successful checks', () => {
    const origin = point(0, 0, 0)
    const n = vec(0.5, 1, 0.5, { ORIGIN: origin })
    const args = { workspace: workspace(n), steps: {}, qPoint: new THREE.Vector3(-3, -2, 4), distance: null, expectedDistance: 6.94,
      isPlane: () => false, isQ: () => false, isP: () => false, isNormal: (b) => b === n, isDifference: () => false, isProjection: () => false }
    expect(distanceFeedback(args).normalFromQ.message).toContain('Q₁ = (-3, -2, 4)')
    expect(distanceFeedback({ ...args, steps: { normalFromQ: true, pointQ: true } }).normalFromQ.message).toContain('your displayed Q₁')
  })
})
