const EXERCISES = ['tutorial', 'create-complex-object', 'cube-point-pivot-rotation', 'point-plane-distance']

export function workspaceStudyContext(runtimeId) {
  if (!runtimeId?.startsWith('userstudy-Li-')) return null
  const exerciseId = EXERCISES.find((id) => runtimeId.endsWith(`-${id}`))
  return exerciseId ? { conditionId: 'geoscratch', phase: 'geoscratch', exerciseId } : null
}

export function emitStudyEvent(type, details, context = null) {
  window.dispatchEvent(new CustomEvent('geoscratch:study-event', { detail: { type, details, context } }))
}
