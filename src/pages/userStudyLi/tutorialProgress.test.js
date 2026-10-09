import { describe, expect, it } from 'vitest'
import { tutorialProgress, TUTORIAL_SPHERES } from './tutorialProgress'

function block(type, fields = {}, inputs = {}, parent = null) {
  return { type, getFieldValue: (name) => fields[name], getInputTargetBlock: (name) => inputs[name], getParent: () => parent }
}
function workspace(blocks) {
  return { getBlocksByType: (type) => blocks.filter((item) => item.type === type) }
}
function sphere(spec) {
  const [x, y, z] = spec.centre
  return block('geo_sphere', {}, {
    RADIUS_INPUT: block('scalar', { scalar: spec.radius }),
    CENTRE: block('linalg_point', { X: x, Y: y, Z: z }),
  })
}
describe('interactive session tutorial', () => {
  it('starts with opening Create and advances after the student adds a sphere', () => {
    expect(tutorialProgress(null).stage).toBe('open')
    expect(tutorialProgress(workspace([]), true).stage).toBe('sphere')
    expect(tutorialProgress(workspace([block('geo_sphere')]), true).stage).toBe('scalar')
  })
  it('teaches adding and connecting as separate real interactions', () => {
    const head = block('geo_sphere')
    const scalar = block('scalar', { scalar: 1 })
    expect(tutorialProgress(workspace([head, scalar]), true).stage).toBe('radius')
    head.getInputTargetBlock = (name) => name === 'RADIUS_INPUT' ? scalar : null
    expect(tutorialProgress(workspace([head]), true).stage).toBe('point')
    const point = block('linalg_point')
    expect(tutorialProgress(workspace([head, point]), true).stage).toBe('centre')
  })
  it('requires the sphere values and all three distinct parts', () => {
    const head = sphere(TUTORIAL_SPHERES[0])
    expect(tutorialProgress(workspace([head]), true).stage).toBe('sphere')
    expect(tutorialProgress(workspace([head]), true).part.key).toBe('left')
    expect(tutorialProgress(workspace([head, head, head]), true).completed).toHaveLength(1)
    expect(tutorialProgress(workspace(TUTORIAL_SPHERES.map(sphere))).stage).toBe('done')
    const wrong = sphere({ ...TUTORIAL_SPHERES[0], radius: 1 })
    expect(tutorialProgress(workspace([wrong])).stage).toBe('values')
  })
  it('responds to deletion instead of retaining stale completion', () => {
    const spheres = TUTORIAL_SPHERES.map(sphere)
    expect(tutorialProgress(workspace(spheres)).completed).toHaveLength(3)
    expect(tutorialProgress(workspace(spheres.slice(0, 2))).completed).toHaveLength(2)
    expect(tutorialProgress(workspace([])).stage).toBe('open')
  })
  it('does not advance when the user adds an unrelated block', () => {
    expect(tutorialProgress(workspace([block('geo_cube')]), true).stage).toBe('sphere')
    const head = block('geo_sphere')
    expect(tutorialProgress(workspace([head, block('linalg_vec3')]), true).stage).toBe('scalar')
    const wrongCentre = block('geo_sphere', {}, { RADIUS_INPUT: block('scalar', { scalar: 2 }), CENTRE: block('linalg_vec3', { X: 0, Y: 2, Z: 0 }) })
    expect(tutorialProgress(workspace([wrongCentre]), true).stage).toBe('point')
  })
  it('guides every missing field, rather than accepting any number edit', () => {
    const fields = { X: 1, Y: 1, Z: 1 }
    const radiusFields = { scalar: 1 }
    const head = block('geo_sphere', {}, {
      RADIUS_INPUT: block('scalar', radiusFields), CENTRE: block('linalg_point', fields),
    })
    const ws = workspace([head])
    expect(tutorialProgress(ws).fieldName).toBe('scalar')
    radiusFields.scalar = 9
    expect(tutorialProgress(ws).expectedValue).toBe(2)
    radiusFields.scalar = 2
    expect(tutorialProgress(ws).fieldName).toBe('X')
    fields.X = 0
    expect(tutorialProgress(ws).fieldName).toBe('Y')
    fields.Y = 2
    expect(tutorialProgress(ws).fieldName).toBe('Z')
    fields.Z = 0
    expect(tutorialProgress(ws, true).part.key).toBe('left')
    expect(tutorialProgress(ws, true).stage).toBe('sphere')
  })
  it('guides creation and connections for both ears until each one is correct', () => {
    const built = [sphere(TUTORIAL_SPHERES[0])]
    for (const spec of TUTORIAL_SPHERES.slice(1)) {
      expect(tutorialProgress(workspace(built), true).part.key).toBe(spec.key)
      expect(tutorialProgress(workspace(built), true).stage).toBe(spec.key === 'right' ? 'duplicate' : 'sphere')
      const ear = block('geo_sphere')
      built.push(ear)
      expect(tutorialProgress(workspace(built), true).stage).toBe('scalar')
      const radius = block('scalar', { scalar: spec.radius })
      ear.getInputTargetBlock = (name) => name === 'RADIUS_INPUT' ? radius : null
      expect(tutorialProgress(workspace(built), true).stage).toBe('point')
      const centreFields = { X: 0, Y: 0, Z: 0 }
      const centre = block('linalg_point', centreFields)
      ear.getInputTargetBlock = (name) => name === 'RADIUS_INPUT' ? radius : centre
      expect(tutorialProgress(workspace(built), true).fieldName).toBe('X')
      centreFields.X = spec.centre[0]
      expect(tutorialProgress(workspace(built), true).fieldName).toBe('Y')
      centreFields.Y = spec.centre[1]
    }
    expect(tutorialProgress(workspace(built), true).stage).toBe('done')
  })
  it('guides duplicating the left ear, then checks the copied inputs for the right ear', () => {
    const head = sphere(TUTORIAL_SPHERES[0])
    const left = sphere(TUTORIAL_SPHERES[1])
    const ws = workspace([head, left])
    expect(tutorialProgress(ws).stage).toBe('duplicate')
    expect(tutorialProgress(ws).duplicateSource).toBe(left)
    const copy = sphere(TUTORIAL_SPHERES[1])
    const copied = workspace([head, left, copy])
    expect(tutorialProgress(copied).stage).toBe('values')
    expect(tutorialProgress(copied).head).toBe(copy)
    expect(tutorialProgress(copied).fieldName).toBe('X')
    copy.getInputTargetBlock('CENTRE').getFieldValue = (name) => ({ X: 2, Y: 4, Z: 0 })[name]
    expect(tutorialProgress(copied).stage).toBe('done')
  })
})
