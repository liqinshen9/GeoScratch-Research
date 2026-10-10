export const DIFFICULTIES = Object.freeze({ EASY: 'easy', MEDIUM: 'medium', HARD: 'hard' })
export const DIFFICULTY_LABELS = Object.freeze({ easy: 'Easy', medium: 'Medium', hard: 'Hard' })

export const EXERCISES = Object.freeze([
  { id: 'create-complex-object', title: 'Create a complex object', difficulty: DIFFICULTIES.EASY },
  {
    id: 'cube-point-pivot-rotation',
    title: 'Rotate a cube and its corner point',
    difficulty: DIFFICULTIES.MEDIUM,
  },
  {
    id: 'point-plane-distance',
    title: 'Calculate the shortest distance from a point to a plane',
    difficulty: DIFFICULTIES.MEDIUM,
  },
])

export const UNITS = Object.freeze([
  {
    id: 'geometry',
    title: 'Geometry',
    sections: [
      { id: 'construction', title: 'Construction', exerciseIds: EXERCISES.map(({ id }) => id) },
    ],
  },
])

export function getExercise(id) {
  return EXERCISES.find((exercise) => exercise.id === id)
}

export function getUnit(unitId) {
  return UNITS.find((unit) => unit.id === unitId)
}

/** A unit's exercises, flattened in section -> exerciseIds order. */
export function exercisesInUnit(unit) {
  return unit.sections.flatMap((section) =>
    section.exerciseIds.map((id) => getExercise(id)).filter(Boolean),
  )
}

/** Every exercise, flattened in unit -> section -> exerciseIds order. */
export function orderedExercises() {
  return UNITS.flatMap(exercisesInUnit)
}

/**
 * The exercises immediately before and after `id` within its own unit. Prev/next
 * deliberately does not cross unit boundaries -- a unit is a self-contained
 * track, and the browser is the way to move between units.
 */
export function getAdjacentExercises(id) {
  const unit = getUnitForExercise(id)
  const ordered = unit ? exercisesInUnit(unit) : []
  const index = ordered.findIndex((exercise) => exercise.id === id)
  return {
    previous: index > 0 ? ordered[index - 1] : null,
    next: index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null,
  }
}

/** The unit whose sections contain `id`. */
export function getUnitForExercise(id) {
  return UNITS.find((unit) => unit.sections.some((section) => section.exerciseIds.includes(id)))
}

/** The `{ unit, section }` an exercise sits in, or undefined if unplaced. */
export function getSectionForExercise(id) {
  for (const unit of UNITS) {
    const section = unit.sections.find((s) => s.exerciseIds.includes(id))
    if (section) return { unit, section }
  }
  return undefined
}

/** Number of exercises across all of a unit's sections. */
export function countExercises(unit) {
  return exercisesInUnit(unit).length
}
