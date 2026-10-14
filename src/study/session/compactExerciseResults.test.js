import { afterEach, expect, it, vi } from 'vitest'
import { beginExerciseResult, countExerciseAction, finishExerciseResult } from './compactExerciseResults'
afterEach(() => vi.restoreAllMocks())
it('records elapsed time, failed timeout, and zero counts without storing a click stream', () => {
  const now = vi.spyOn(performance, 'now').mockReturnValue(100)
  const active = beginExerciseResult('trial', ['cube', 'point'], true)
  countExerciseAction(active, { action: 'check', stepKey: 'cube' })
  countExerciseAction(active, { action: 'check', stepKey: 'cube' })
  countExerciseAction(active, { action: 'more-help', stepKey: 'cube' })
  now.mockReturnValue(300100)
  const saved = finishExerciseResult(active, 'timeout')
  expect(saved).toMatchObject({ durationMs: 300000, passed: false, timedOut: true, checkCount: 2,
    moreHelpCount: 1, steps: { cube: { checkCount: 2, moreHelpCount: 1 }, point: { checkCount: 0, moreHelpCount: 0 } } })
  expect(saved).not.toHaveProperty('startedMonotonic')
  expect(saved).not.toHaveProperty('events')
})
