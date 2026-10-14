export function beginExerciseResult(exerciseId, stepKeys, studyMode) {
  return { exerciseId, studyMode, startedAt: new Date().toISOString(), startedMonotonic: performance.now(),
    passed: false, steps: Object.fromEntries(stepKeys.map((key) => [key, { checkCount: 0, moreHelpCount: 0 }])) }
}

export function countExerciseAction(result, { action, stepKey }) {
  if (!result || !['check', 'more-help'].includes(action)) return
  const step = result.steps[stepKey] ??= { checkCount: 0, moreHelpCount: 0 }
  step[action === 'check' ? 'checkCount' : 'moreHelpCount']++
}

export function finishExerciseResult(result, reason) {
  const { startedMonotonic, ...data } = result
  return { ...data, completedAt: new Date().toISOString(),
    durationMs: Math.max(0, Math.round(performance.now() - startedMonotonic)),
    completionReason: reason, timedOut: reason === 'timeout',
    checkCount: Object.values(data.steps).reduce((sum, step) => sum + step.checkCount, 0),
    moreHelpCount: Object.values(data.steps).reduce((sum, step) => sum + step.moreHelpCount, 0),
  }
}
