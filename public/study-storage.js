const WORKSPACES_KEY = 'geoscratch:workspace-xml'
const isStudyKey = (key) => key?.startsWith('userstudyLi.')
  || key?.startsWith('geoscratch:userBlocks:userstudy-Li-')

export function inspectStudyStorage(storage) {
  const keys = []
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index)
    if (isStudyKey(key)) keys.push(key)
  }
  const workspaces = JSON.parse(storage.getItem(WORKSPACES_KEY) || '{}')
  const workspaceIds = Object.keys(workspaces).filter((id) => id.startsWith('userstudy-Li-'))
  return { keys, workspaceIds, workspaces }
}

// Called only by the explicit Delete button. Does not touch settings or downloaded files.
export function clearSavedStudyStorage(storage) {
  const { keys, workspaceIds, workspaces } = inspectStudyStorage(storage)
  const deletedKeys = []
  for (const key of keys) { storage.removeItem(key); deletedKeys.push(key) }
  if (workspaceIds.length) {
    for (const id of workspaceIds) delete workspaces[id]
    if (Object.keys(workspaces).length) storage.setItem(WORKSPACES_KEY, JSON.stringify(workspaces))
    else storage.removeItem(WORKSPACES_KEY)
  }
  return { deletedKeys, deletedWorkspaceIds: workspaceIds }
}
