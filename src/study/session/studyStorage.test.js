// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearStoredStudyData, STUDY_PERSISTENCE_ENABLED } from './studyStorage'
import { markQuestionnaireSubmitted, readSessionQuestionnaires } from './questionnaireDrafts'
import useWorkspaceStore from '@/store/useWorkspaceStore'

beforeEach(() => localStorage.clear())
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); useWorkspaceStore.getState().setUserBlockScope(null) })

describe('memory-only study storage', () => {
  it('deletes old study records and study workspaces, preserving unrelated saved work', () => {
    localStorage.setItem('userstudyLi.interactions.old', 'large log')
    localStorage.setItem('userstudyLi.lectureExerciseTiming.old', '[]')
    localStorage.setItem('userstudyLi.questionnaireDrafts.old.post', '{}')
    localStorage.setItem('geoscratch:userBlocks:userstudy-Li-old', '[]')
    localStorage.setItem('geoscratch:userBlocks', '["personal block"]')
    localStorage.setItem('theme', 'dark')
    localStorage.setItem('geoscratch:workspace-xml', JSON.stringify({ 'userstudy-Li-old-tutorial': 'study work', sandbox: 'personal work' }))
    clearStoredStudyData()
    expect(Object.keys(localStorage).some((key) => key.startsWith('userstudyLi.'))).toBe(false)
    expect(localStorage.getItem('geoscratch:userBlocks:userstudy-Li-old')).toBeNull()
    expect(localStorage.getItem('geoscratch:userBlocks')).toBe('["personal block"]')
    expect(localStorage.getItem('theme')).toBe('dark')
    expect(JSON.parse(localStorage.getItem('geoscratch:workspace-xml'))).toEqual({ sandbox: 'personal work' })
  })
  it('keeps questionnaire answers available for export without writing browser storage', () => {
    expect(STUDY_PERSISTENCE_ENABLED).toBe(false)
    const writes = vi.spyOn(Storage.prototype, 'setItem')
    markQuestionnaireSubmitted('memory-only-session', 'post-study', { answers: { comment: 'My response' } })
    expect(readSessionQuestionnaires('memory-only-session')[0].answers.comment).toBe('My response')
    expect(writes).not.toHaveBeenCalled()
  })
  it('keeps study workspaces and My Blocks reusable in memory without browser writes', () => {
    const writes = vi.spyOn(Storage.prototype, 'setItem')
    const store = useWorkspaceStore.getState()
    store.setUserBlockScope('userstudy-Li-memory-only')
    const saved = store.addUserBlock({ name: 'micki', xmlText: '<xml />' })
    store.saveWorkspaceXml('userstudy-Li-memory-only-tutorial', '<xml>current work</xml>')
    expect(useWorkspaceStore.getState().savedXml['userstudy-Li-memory-only-tutorial']).toContain('current work')
    store.setUserBlockScope('userstudy-Li-another-memory-session')
    store.setUserBlockScope('userstudy-Li-memory-only')
    expect(useWorkspaceStore.getState().userBlocks.some((block) => block.id === saved.id)).toBe(true)
    expect(writes).not.toHaveBeenCalled()
  })
})
