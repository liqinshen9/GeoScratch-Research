// Legacy localStorage history stays disabled. IndexedDB owns durable recovery
// and the upload queue without growing localStorage's small synchronous quota.
export const STUDY_PERSISTENCE_ENABLED = false

export function clearSessionLocalStorage(researchId, storage = window.localStorage) {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
  for (const key of keys) {
    if (key?.startsWith(`userstudyLi.questionnaireDrafts.${researchId}.`)
      || key?.startsWith(`userstudyLi.interactions.${researchId}.`)
      || key === `userstudyLi.lectureExerciseTiming.${researchId}`
      || key === `userstudyLi.sessionExport.${researchId}`
      || key === `geoscratch:userBlocks:userstudy-Li-${researchId}`) storage.removeItem(key)
  }
  const current = storage.getItem('userstudyLi.currentResearchId')
  if (current === researchId || current === JSON.stringify(researchId)) storage.removeItem('userstudyLi.currentResearchId')
  for (const key of ['userstudyLi.demographicsResponses', 'userstudyLi.conditionResponses', 'userstudyLi.postStudyResponses', 'userstudyLi.lectureExerciseResponses']) {
    const raw = storage.getItem(key)
    if (!raw) continue
    const records = JSON.parse(raw)
    if (!Array.isArray(records)) throw new Error('Unrecognized legacy study backup; retained for safety.')
    const remaining = records.filter(record => record.researchId !== researchId)
    if (remaining.length === records.length) continue
    if (remaining.length) storage.setItem(key, JSON.stringify(remaining))
    else storage.removeItem(key)
  }
  const raw = storage.getItem('geoscratch:workspace-xml')
  if (raw) {
    const workspaces = JSON.parse(raw)
    const remaining = Object.fromEntries(Object.entries(workspaces).filter(([id]) => !id.startsWith(`userstudy-Li-${researchId}-`)))
    if (Object.keys(remaining).length) storage.setItem('geoscratch:workspace-xml', JSON.stringify(remaining))
    else storage.removeItem('geoscratch:workspace-xml')
  }
}

export function clearStoredStudyData(storage = window.localStorage) {
  const keys = []
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index)
    if (key?.startsWith('userstudyLi.') || key?.startsWith('geoscratch:userBlocks:userstudy-Li-')) keys.push(key)
  }
  keys.forEach((key) => storage.removeItem(key))
  const workspaceKey = 'geoscratch:workspace-xml'
  const raw = storage.getItem(workspaceKey)
  if (raw) {
    let saved
    try {
      saved = JSON.parse(raw)
    } catch { return }
    const remaining = Object.fromEntries(Object.entries(saved).filter(([key]) => !key.startsWith('userstudy-Li-')))
    if (Object.keys(remaining).length === Object.keys(saved).length) return
    if (Object.keys(remaining).length) storage.setItem(workspaceKey, JSON.stringify(remaining))
    else storage.removeItem(workspaceKey)
  }
}
