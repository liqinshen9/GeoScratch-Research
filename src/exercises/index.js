import pointPlane from './exercise05-pointPlane'
import cubePointPivot from './exercise10-cubePointPivot'
import createComplexObject from './exercise11-createComplexObject'

export const EXERCISE_MODULES = {
  'create-complex-object': createComplexObject,
  'cube-point-pivot-rotation': cubePointPivot,
  'point-plane-distance': pointPlane,
}

export const FALLBACK_EXERCISE_ID = 'create-complex-object'

export function getExerciseModule(id) {
  return EXERCISE_MODULES[id] || EXERCISE_MODULES[FALLBACK_EXERCISE_ID]
}

export function hasExerciseModule(id) {
  return Boolean(EXERCISE_MODULES[id])
}
