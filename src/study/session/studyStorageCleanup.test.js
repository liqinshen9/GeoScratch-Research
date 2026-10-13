import { describe, expect, it } from 'vitest'
import { clearSavedStudyStorage, inspectStudyStorage } from '../../../public/study-storage.js'

function makeStorage(values) {
  const items = new Map(Object.entries(values))
  return { get length() { return items.size }, key: (index) => [...items.keys()][index],
    getItem: (key) => items.get(key) ?? null, setItem: (key, value) => items.set(key, value),
    removeItem: (key) => items.delete(key) }
}
describe('explicit saved study cleanup', () => {
  it('clears all prior sessions while retaining settings and unrelated workspaces', () => {
    const storage = makeStorage({
      'userstudyLi.interactions.3CGHXK.stream.0': '[1]',
      'userstudyLi.questionnaireDrafts.XRP43T.condition-lecture': '{}',
      'userstudyLi.lectureExerciseResponses': '[]',
      'userstudyLi.currentResearchId': '3CGHXK',
      'geoscratch:userBlocks:userstudy-Li-3CGHXK': '[]',
      'geoscratch:user-settings': '{"userStudyMode":true}',
      'geoscratch:userBlocks': '["sandbox block"]',
      'geoscratch:workspace-xml': JSON.stringify({
        'userstudy-Li-3CGHXK-create-complex-object': '<xml/>', sandbox: '<xml>keep</xml>',
      }),
      unrelated: 'keep',
    })
    expect(inspectStudyStorage(storage).keys).toHaveLength(5)
    const cleared = clearSavedStudyStorage(storage)
    expect(cleared.deletedKeys).toHaveLength(5)
    expect(inspectStudyStorage(storage)).toMatchObject({ keys: [], workspaceIds: [] })
    expect(storage.getItem('geoscratch:user-settings')).toBe('{"userStudyMode":true}')
    expect(storage.getItem('geoscratch:userBlocks')).toBe('["sandbox block"]')
    expect(JSON.parse(storage.getItem('geoscratch:workspace-xml'))).toEqual({ sandbox: '<xml>keep</xml>' })
    expect(storage.getItem('unrelated')).toBe('keep')
  })
  it('removes an empty study-only workspace entry and can be safely run again', () => {
    const storage = makeStorage({ 'geoscratch:workspace-xml': '{"userstudy-Li-XRP43T-tutorial":"<xml/>"}' })
    clearSavedStudyStorage(storage)
    expect(storage.length).toBe(0)
    expect(clearSavedStudyStorage(storage)).toEqual({ deletedKeys: [], deletedWorkspaceIds: [] })
  })
})
