const EXERCISES = ['tutorial', 'create-complex-object', 'cube-point-pivot-rotation', 'point-plane-distance']
export const UNTRACKED_EXERCISES = []

export function exerciseTrackingDisabled(context) {
  return context?.phase === 'geoscratch' && context?.conditionId === 'geoscratch'
    && UNTRACKED_EXERCISES.includes(context?.exerciseId)
}

export function workspaceStudyContext(runtimeId) {
  if (!runtimeId?.startsWith('userstudy-Li-')) return null
  const exerciseId = EXERCISES.find((id) => runtimeId.endsWith(`-${id}`))
  return exerciseId ? { conditionId: 'geoscratch', phase: 'geoscratch', exerciseId } : null
}

export function emitStudyEvent(type, details, context = null) {
  if (exerciseTrackingDisabled(context)) return
  const runtimeId = window.__geoScratchRuntimeMode
  if (!context && runtimeId?.startsWith('userstudy-Li-')
    && UNTRACKED_EXERCISES.some((exerciseId) => runtimeId.endsWith(`-${exerciseId}`))) return
  window.dispatchEvent(new CustomEvent('geoscratch:study-event', { detail: { type, details, context } }))
}
