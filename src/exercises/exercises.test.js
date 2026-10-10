import { describe, it, expect } from 'vitest'
import THREE from '@/utils/three'
import { getExerciseModule, EXERCISE_MODULES } from './index'
import {
  EXERCISES,
  UNITS,
  getExercise,
  getAdjacentExercises,
  exercisesInUnit,
  getSectionForExercise,
} from '@/data/exercises'
import { SETTING_KEYS } from '@/store/useSettingsStore'

/**
 * These cover the exercise checkers, which decide whether a student has passed.
 * They had no coverage before being split out of ExercisePage.
 *
 * The fakes below implement only the slice of the Blockly API the predicates
 * actually touch: type, fields, value inputs, and the next-block chain.
 */

let nextId = 0

/**
 * @param {string} type      Blockly block type.
 * @param {object} fields    Field name -> value.
 * @param {object} inputs    Input name -> child block.
 * @param {object} nextBlock Next block in a statement chain.
 */
function fakeBlock(type, fields = {}, inputs = {}, nextBlock = null) {
  return {
    id: `block-${nextId++}`,
    type,
    getFieldValue: (name) => fields[name],
    getInputTargetBlock: (name) => inputs[name] ?? null,
    getNextBlock: () => nextBlock,
    inputList: Object.values(inputs).map((b) => ({ connection: { targetBlock: () => b } })),
  }
}

const vec3 = (x, y, z) => fakeBlock('linalg_vec3', { X: x, Y: y, Z: z })
const point = (x, y, z) => fakeBlock('linalg_point', { X: x, Y: y, Z: z })
const scalar = (v) => fakeBlock('scalar', { scalar: v })

function fakeWorkspace(blocks) {
  const all = []
  const walk = (b) => {
    if (!b || all.includes(b)) return
    all.push(b)
    Object.values(b.inputList).forEach((i) => walk(i.connection.targetBlock()))
    walk(b.getNextBlock())
  }
  blocks.forEach(walk)
  return {
    getAllBlocks: () => all,
    getBlocksByType: (type) => all.filter((b) => b.type === type),
    getBlockById: (id) => all.find((b) => b.id === id) ?? null,
  }
}

function posedCubeWithPoint({ quaternion = null, position = [1, 1, 1] } = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2))
  mesh.userData.geoType = 'geo_cube'
  mesh.userData.centre = new THREE.Vector3(1, 1, 1)
  mesh.userData.sideLength = 2
  mesh.position.set(1, 1, 1)
  const group = new THREE.Group()
  const marker = new THREE.Object3D()
  marker.userData.geoType = 'attached_corner_point'
  marker.position.set(0, 2, 2)
  group.add(mesh, marker)
  group.userData.geoType = 'object_with_point'
  if (quaternion) group.quaternion.copy(quaternion)
  group.position.set(position[0] - 1, position[1] - 1, position[2] + 1)
  return group
}

const quatAbout = (axis, degrees) =>
  new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(degrees))

const specialCubeBlock = () => fakeBlock('geo_special_cube')

function pipelineTo(target, steps) {
  const chain = steps.reduceRight((next, step) => ({ ...step, getNextBlock: () => next }), null)
  return fakeBlock('transform_pipeline', {}, { INPUT: target, STEPS: chain })
}

describe('exercise registry', () => {
  it('offers only the three LI exercises, in the same order', () => {
    const ids = ['create-complex-object', 'cube-point-pivot-rotation', 'point-plane-distance']
    expect(EXERCISES.map(({ id }) => id)).toEqual(ids)
    expect(Object.keys(EXERCISE_MODULES)).toEqual(ids)
  })
  it('has a module for every exercise listed in data/exercises.js', () => {
    EXERCISES.forEach(({ id }) => {
      expect(EXERCISE_MODULES[id], `exercise ${id}`).toBeDefined()
    })
  })

  it('places every exercise in exactly one UNITS section', () => {
    const placements = UNITS.flatMap((unit) =>
      unit.sections.flatMap((section) => section.exerciseIds),
    )
    // No unknown or duplicated ids.
    placements.forEach((id) => expect(getExercise(id), `section id ${id}`).toBeDefined())
    expect(new Set(placements).size).toBe(placements.length)
    // Every exercise is placed.
    expect(new Set(placements)).toEqual(new Set(EXERCISES.map((e) => e.id)))
  })

  it('resolves each exercise to its containing unit and section', () => {
    EXERCISES.forEach(({ id }) => {
      const placement = getSectionForExercise(id)
      expect(placement, `placement for ${id}`).toBeDefined()
      expect(placement.unit.sections).toContain(placement.section)
      expect(placement.section.exerciseIds).toContain(id)
    })
    expect(getSectionForExercise('does-not-exist')).toBeUndefined()
  })

  it('keeps prev/next inside the current unit', () => {
    UNITS.forEach((unit) => {
      const ordered = exercisesInUnit(unit)
      const first = ordered[0]
      const last = ordered[ordered.length - 1]
      // The unit boundaries are dead ends.
      expect(getAdjacentExercises(first.id).previous, `before ${first.id}`).toBeNull()
      expect(getAdjacentExercises(last.id).next, `after ${last.id}`).toBeNull()
      // Interior steps stay within the same unit's ordering.
      ordered.forEach((exercise, i) => {
        const { previous, next } = getAdjacentExercises(exercise.id)
        expect(previous?.id ?? null).toBe(i > 0 ? ordered[i - 1].id : null)
        expect(next?.id ?? null).toBe(i < ordered.length - 1 ? ordered[i + 1].id : null)
      })
    })
  })

  it('gives every module the shape ExercisePage relies on', () => {
    Object.entries(EXERCISE_MODULES).forEach(([key, mod]) => {
      expect(mod.id, `exercise ${key} id`).toBe(key)
      expect(mod.Givens).toBeTypeOf('function')
      expect(mod.Steps).toBeTypeOf('function')
      expect(mod.evaluate).toBeTypeOf('function')
    })
  })

  it('only lets settingsOverrides carry real setting keys with defined values', () => {
    Object.values(EXERCISE_MODULES).forEach((mod) => {
      if (mod.settingsOverrides === undefined) return
      const overrides = mod.settingsOverrides
      expect(overrides, `exercise ${mod.id}`).toBeTypeOf('object')
      expect(Array.isArray(overrides)).toBe(false)
      Object.entries(overrides).forEach(([k, v]) => {
        expect(SETTING_KEYS, `exercise ${mod.id} override "${k}"`).toContain(k)
        expect(v, `exercise ${mod.id} override "${k}"`).not.toBeUndefined()
      })
    })
  })

  it('gives every perceptual exercise a well-formed mcq descriptor', () => {
    Object.values(EXERCISE_MODULES)
      .filter((mod) => mod.kind === 'perceptual')
      .forEach((mod) => {
        expect(mod.mcq, `exercise ${mod.id} mcq`).toBeTypeOf('object')
        expect(typeof mod.mcq.prompt).toBe('string')
        expect(Array.isArray(mod.mcq.choices)).toBe(true)
        expect(mod.mcq.choices.length).toBeGreaterThanOrEqual(2)
        mod.mcq.choices.forEach((choice) => {
          expect(typeof choice.id).toBe('string')
          expect(typeof choice.label).toBe('string')
        })
        const ids = mod.mcq.choices.map((c) => c.id)
        expect(ids, `exercise ${mod.id} correctId`).toContain(mod.mcq.correctId)
      })
  })

  it('falls back to the first exercise for an unknown id', () => {
    expect(getExerciseModule('does-not-exist').id).toBe('create-complex-object')
    expect(getExerciseModule(undefined).id).toBe('create-complex-object')
  })

  it('returns a non-passing result for an empty workspace', () => {
    // The page calls evaluate on every render, including the very first one
    // before any workspace exists.
    Object.values(EXERCISE_MODULES).forEach((mod) => {
      const result = mod.evaluate({ objects: [], workspace: null })
      expect(result.passed, `exercise ${mod.id}`).toBe(false)
      expect(result.steps).toBeTypeOf('object')
      expect(result.answer).toBeTypeOf('object')
    })
  })
})

describe('Create a complex object exercise', () => {
  const mod = EXERCISE_MODULES['create-complex-object']
  const cube = () =>
    fakeBlock(
      'geo_cube',
      {},
      {
        SIDE_LENGTH_INPUT: scalar(2),
        CENTRE: vec3(1, 1, 1),
      },
    )
  const savedPair = {
    name: 'My named object',
    xmlText:
      '<xml><block type="geo_special_cube"><field name="BLOCK_NAME">My named object</field></block></xml>',
  }

  it('passes on saving without inserting or selecting the saved block', () => {
    const workspace = fakeWorkspace([cube(), point(0, 2, 2)])
    const result = mod.evaluate({ workspace, userBlocks: [savedPair] })
    expect(result.passed).toBe(true)
    expect(result.steps).toEqual({ cube: true, point: true, pair: true })
    expect(workspace.getBlocksByType('geo_special_cube')).toHaveLength(0)
  })

  it('requires a saved composite, rather than just an inserted composite', () => {
    const workspace = fakeWorkspace([cube(), point(0, 2, 2), specialCubeBlock()])
    expect(mod.evaluate({ workspace }).steps.pair).toBe(false)
    expect(
      mod.evaluate({
        workspace,
        userBlocks: [{ name: 'Cube', xmlText: '<xml><block type="geo_cube" /></xml>' }],
      }).passed,
    ).toBe(false)
  })

  it('only offers the composite template when both components are correct', () => {
    expect(mod.getReusableBlockTemplate({ workspace: fakeWorkspace([cube()]) })).toBeNull()
    expect(
      mod.getReusableBlockTemplate({ workspace: fakeWorkspace([cube(), point(0, 2, 2)]) }).xmlText,
    ).toContain('geo_special_cube')
    expect(
      mod.evaluate({ workspace: fakeWorkspace([cube(), point(1, 2, 2)]), userBlocks: [savedPair] })
        .passed,
    ).toBe(false)
  })

  it('comes directly before the rotation exercise in navigation', () => {
    expect(getAdjacentExercises(mod.id).next.id).toBe('cube-point-pivot-rotation')
    expect(getAdjacentExercises('cube-point-pivot-rotation').previous.id).toBe(mod.id)
  })
})

describe('Cube and corner point pivot rotation exercise', () => {
  const mod = EXERCISE_MODULES['cube-point-pivot-rotation']
  it('replaces standalone and grouped cube labels while preserving the corner point label', () => {
    const cube = new THREE.Object3D()
    cube.userData = { geoType: 'geo_cube', labels: [{ name: 'c1', value: 'side 2' }] }
    const group = new THREE.Group()
    const nestedCube = cube.clone()
    const point = new THREE.Object3D()
    point.userData.labels = [{ name: 'P', value: '(0, 2, 2)' }]
    group.add(nestedCube, point)

    mod.decorateObjects([cube, group], fakeWorkspace([]))

    expect(cube.userData.labels).toEqual([])
    expect(nestedCube.userData.labels).toEqual([])
    expect(point.userData.labels).toEqual([{ name: 'P', value: '(0, 2, 2)' }])
    expect(mod.settingsOverrides.showObjectAxisCoordinates).toBe(true)
    expect(mod.settingsOverrides.showAxes).toBe(true)
    expect(mod.settingsOverrides.showAxisScaleLabels).toBe(true)
  })
  const posed = () =>
    posedCubeWithPoint({
      quaternion: quatAbout(new THREE.Vector3(0, 1, 0), 90),
      position: [1, 1, 1],
    })

  it('passes when the cube is moved to the origin, rotated, then moved back', () => {
    const workspace = fakeWorkspace([
      pipelineTo(specialCubeBlock(), [
        fakeBlock('trans_matrix', { TX: -1, TY: -1, TZ: -1 }),
        fakeBlock('rot_matrix', { AXIS: 'Y', DEGREES: 90 }),
        fakeBlock('trans_matrix', { TX: 1, TY: 1, TZ: 1 }),
      ]),
    ])

    const object = posed()
    object.userData.srcBlockId = workspace.getBlocksByType('geo_special_cube')[0].id
    const result = mod.evaluate({ objects: [object], workspace })

    expect(result.passed).toBe(true)
    expect(result.steps).toEqual({
      pipeline: true,
      toOrigin: true,
      rotate: true,
      back: true,
    })
  })

  it('does not pass when the cube is only rotated in place without the translation scaffold', () => {
    const workspace = fakeWorkspace([
      pipelineTo(specialCubeBlock(), [fakeBlock('rot_matrix', { AXIS: 'Y', DEGREES: 90 })]),
    ])

    const object = posed()
    object.userData.srcBlockId = workspace.getBlocksByType('geo_special_cube')[0].id
    const result = mod.evaluate({ objects: [object], workspace })

    expect(result.passed).toBe(false)
    expect(result.correct).toBe(true)
    expect(result.steps.toOrigin).toBe(false)
    expect(result.steps.rotate).toBe(false)
    expect(result.steps.back).toBe(false)
  })
})

describe('exercise 5 (point to plane)', () => {
  const mod = EXERCISE_MODULES['point-plane-distance']

  function pointOnExercisePlane() {
    const plane = fakeBlock(
      'parametric_plane',
      {},
      {
        point: point(-5, 0, 2),
        norm: vec3(0.5, 1, 0.5),
      },
    )
    return fakeBlock('geo_show_point_on_object', {}, { OBJECT: plane })
  }

  function normalFrom(origin) {
    return fakeBlock('linalg_vec3', { X: 0.5, Y: 1, Z: 0.5 }, { ORIGIN: origin })
  }

  function stepFive({
    enteredQ,
    actualQ = [2.25, -1.5, 3.75],
    withMagnitude = false,
    withoutDifference = false,
  }) {
    const q = pointOnExercisePlane()
    const difference = fakeBlock(
      'vector_arithmetic',
      { OP: 'subtract' },
      { U: point(-9, 8, 7), V: q },
    )
    const normal = normalFrom(point(...enteredQ))
    const projection = fakeBlock('vector_project', {}, { U: difference, V: normal })
    const magnitude = fakeBlock('vector_magnitude', {}, { V: projection })
    const workspace = fakeWorkspace(
      withoutDifference ? [q, normal] : withMagnitude ? [magnitude] : [difference, normal],
    )
    const objects = [
      {
        userData: {
          geoType: 'annotated_object',
          srcBlockId: q.id,
          point: new THREE.Vector3(...actualQ),
        },
      },
    ]
    if (withMagnitude)
      objects.push({
        userData: { geoType: 'point_plane_distance_projection_magnitude', distance: 6.94 },
      })
    return mod.evaluate({ objects, workspace })
  }

  it('recognises the point P vector in the workspace', () => {
    const workspace = fakeWorkspace([vec3(-9, 8, 7)])
    expect(mod.evaluate({ objects: [], workspace }).steps.pointP).toBe(true)
  })

  it('does not recognise a different point as P', () => {
    const workspace = fakeWorkspace([vec3(1, 1, 1)])
    expect(mod.evaluate({ objects: [], workspace }).steps.pointP).toBe(false)
  })

  it('completes step 5 when the normal starts at the recorded Q1 coordinates', () => {
    expect(stepFive({ enteredQ: [2.25, -1.5, 3.7504] }).steps.normalFromQ).toBe(true)
  })

  it('completes step 5 before step 4 is constructed', () => {
    const result = stepFive({
      enteredQ: [-2.81, -3.82, 7.46],
      actualQ: [-2.814, -3.824, 7.464],
      withoutDifference: true,
    })
    expect(result.steps.normalFromQ).toBe(true)
    expect(result.steps.difference).toBe(false)
    expect(result.steps.projection).toBe(false)
    expect(result.steps.distance).toBe(false)
  })

  it('still rejects an incorrect normal origin when step 4 is absent', () => {
    expect(stepFive({ enteredQ: [2.25, -1.5, 4], withoutDifference: true }).steps.normalFromQ).toBe(
      false,
    )
  })

  it('accepts Q1 coordinates copied from the two-decimal scene label', () => {
    const result = stepFive({
      enteredQ: [-7.47, 3.78, -3.09],
      actualQ: [-7.474, 3.784, -3.094],
      withMagnitude: true,
    })
    expect(result.steps.normalFromQ).toBe(true)
    expect(result.steps.distance).toBe(true)
    expect(result.passed).toBe(true)
  })

  it('completes the magnitude step independently of the normal origin step', () => {
    const result = stepFive({ enteredQ: [2.25, -1.5, 4], withMagnitude: true })
    expect(result.steps.normalFromQ).toBe(false)
    expect(result.steps.distance).toBe(true)
    expect(result.passed).toBe(false)
  })

  it('does not complete step 5 when the normal starts at a different point', () => {
    expect(stepFive({ enteredQ: [2.25, -1.5, 4] }).steps.normalFromQ).toBe(false)
  })

  it('adds a perpendicular marker to the long study normal glyph', () => {
    const hadWindow = Object.hasOwn(globalThis, 'window')
    if (!hadWindow) globalThis.window = {}
    const previousRuntimeMode = window.__geoScratchRuntimeMode
    const previousColors = window.GeoScratchColors
    const previousStore = window.threeObjStore
    window.__geoScratchRuntimeMode = 'userstudy-Li-ABC123-point-plane-distance'
    window.GeoScratchColors = { forRole: () => '#ef4444' }
    window.threeObjStore = {}

    const normal = normalFrom(point(2.25, -1.5, 3.7504))
    const workspace = fakeWorkspace([normal])
    const normalObject = new THREE.Group()
    normalObject.userData = { srcBlockId: normal.id }
    const decorated = mod.decorateObjects([normalObject], workspace)
    let hasRightAngle = false
    decorated[0].traverse((child) => {
      if (child.userData?.geoType === 'normal_plane_right_angle') hasRightAngle = true
    })

    expect(decorated[0]).not.toBe(normalObject)
    expect(decorated[0].userData.geoType).toBe('distance_normal_arrow')
    expect(hasRightAngle).toBe(true)

    window.__geoScratchRuntimeMode = previousRuntimeMode
    window.GeoScratchColors = previousColors
    window.threeObjStore = previousStore
    if (!hadWindow) delete globalThis.window
  })

  it('offers a reusable block template', () => {
    expect(mod.reusableBlockTemplate.xmlText).toContain('point_plane_distance')
  })
})
