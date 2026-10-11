import { TUTORIAL_SPHERES } from './tutorialProgress'

export const TUTORIAL_INSTRUCTIONS = [
  { stage: 'open' },
  ...TUTORIAL_SPHERES.flatMap((part) => [
    ...(part.key === 'right'
      ? ['duplicate', 'scalar', 'radius', 'point', 'centre'].map((stage) => ({ stage, part }))
      : ['sphere', 'scalar', 'radius', 'point', 'centre'].map((stage) => ({ stage, part }))),
    ...['scalar', 'X', 'Y', 'Z'].map((fieldName) => ({ stage: 'values', part, fieldName })),
  ]),
  { stage: 'replay' },
  { stage: 'labels' },
  { stage: 'done' },
]

export function instructionIndex(progress, stage) {
  return Math.max(0, TUTORIAL_INSTRUCTIONS.findIndex((instruction) =>
    instruction.stage === stage
    && (!instruction.part || instruction.part.key === progress.part?.key)
    && (!instruction.fieldName || instruction.fieldName === (progress.fieldName ?? 'scalar')),
  ))
}
