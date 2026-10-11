import { describe, expect, it } from 'vitest'
import { instructionIndex, TUTORIAL_INSTRUCTIONS } from './tutorialInstructions'
import { TUTORIAL_SPHERES } from './tutorialProgress'

describe('tutorial instruction navigation', () => {
  it('covers each automatically guided field and interaction for all three spheres', () => {
    for (const part of TUTORIAL_SPHERES) {
      const stages = part.key === 'right'
        ? ['duplicate', 'scalar', 'radius', 'point', 'centre']
        : ['sphere', 'scalar', 'radius', 'point', 'centre']
      for (const stage of stages) {
        expect(TUTORIAL_INSTRUCTIONS[instructionIndex({ part }, stage)]).toMatchObject({ stage, part })
      }
      for (const fieldName of ['scalar', 'X', 'Y', 'Z']) {
        expect(TUTORIAL_INSTRUCTIONS[instructionIndex({ part, fieldName }, 'values')])
          .toMatchObject({ stage: 'values', part, fieldName })
      }
    }
  })

  it('starts at opening the toolbox and finishes after replay and labels', () => {
    expect(instructionIndex({}, 'open')).toBe(0)
    expect(TUTORIAL_INSTRUCTIONS.slice(-3).map(({ stage }) => stage)).toEqual(['replay', 'labels', 'done'])
    expect(instructionIndex({}, 'done')).toBe(TUTORIAL_INSTRUCTIONS.length - 1)
  })
})
