// Study persistence is paused until the replacement storage design is ready.
export const STUDY_PERSISTENCE_ENABLED = false

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
