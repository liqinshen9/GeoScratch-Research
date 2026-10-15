// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import UserStudyLiPage from './UserStudyLiPage'
import useSettingsStore from '@/store/useSettingsStore'
import { readStudyBackup, saveStudyBackup, setActiveStudySession, pendingStudyUploads } from '@/study/session/studyRecoveryStore'
import * as firebase from '@/study/firebase/studyFirebase'
vi.mock('@/hooks/useThemeSync', () => ({ default: () => {} }))
vi.mock('@/store/useWorkspaceStore', () => ({ default: { getState: () => ({ savedXml: {}, setUserBlockScope() {}, restoreStudyWorkspace() {} }) } }))
vi.mock('@/pages/ExercisePage', () => ({ default: ({ exerciseId, exerciseTimer }) => <><h1>{exerciseId}</h1>{exerciseTimer}</> }))
vi.mock('@/study/firebase/studyFirebase', () => ({
  createFirebaseStudySession: vi.fn(async ({ sessionId }) => ({ path: ['studyParticipants', 'owner', 'sessions', sessionId] })),
  saveFirebaseStudyRecord: vi.fn(async () => {}), updateFirebaseStudyOrder: vi.fn(async () => {}),
  saveFirebaseStudyRecovery: vi.fn(async () => {}), saveFirebaseStudyInteraction: vi.fn(async () => {}), readFirebaseStudyInteractions: vi.fn(async () => []),
  recoverFirebaseStudy: vi.fn(async () => { throw new Error('Offline; cannot read cloud') }),
  signInResearcher: vi.fn(async () => ({ authorized: true, uid: 'researcher', email: 'researcher@example.com' })),
}))
let root, host, id
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  useSettingsStore.getState().updateSetting('userStudyMode', true)
  id = crypto.randomUUID()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); firebase.saveFirebaseStudyRecord.mockResolvedValue(undefined); vi.restoreAllMocks(); vi.unstubAllGlobals(); delete globalThis.IS_REACT_ACT_ENVIRONMENT })
const wait = async (check) => vi.waitFor(async () => {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) })
  await check()
})
const click = async (text) => act(async () => [...host.querySelectorAll('button')].find((button) => button.textContent === text).click())
it.each(['offline', 'quota'])('recovers an edited questionnaire with the original ID and preserves Submit during %s failure', async (failure) => {
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  await saveStudyBackup(id, { firebaseSessionId: 'same-session', snapshot: { researchId: id, phase: 'post', studyOrder: 'geoscratch-first', questionnaires: [] } })
  await setActiveStudySession(id)
  await act(async () => root.render(<UserStudyLiPage />))
  await wait(() => expect(host.querySelector('h1')?.textContent).toBe('Post-Study Questionnaire'))
  const textarea = host.querySelector('textarea')
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'My half-finished response')
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await wait(async () => expect((await readStudyBackup(id)).snapshot.questionnaires[0].rawAnswers.interfaceEasiestHardest).toBe('My half-finished response'))
  await act(async () => { root.unmount(); root = createRoot(host); root.render(<UserStudyLiPage />) })
  await wait(() => expect(host.querySelector('textarea')?.value).toBe('My half-finished response'))
  expect(host.querySelector('input[readonly]').value).toBe(id)
  expect(firebase.recoverFirebaseStudy).not.toHaveBeenCalled()
  expect(firebase.saveFirebaseStudyRecord).not.toHaveBeenCalled()
  expect(host.textContent).not.toContain('Emergency export')
  expect(host.textContent).not.toContain('Pending uploads')
  if (failure === 'quota') {
    online.mockReturnValue(true)
    firebase.saveFirebaseStudyRecord.mockRejectedValue({ code: 'resource-exhausted', message: 'Quota exceeded.' })
  }
  await click('Submit session')
  await wait(() => expect(host.querySelector('h1')?.textContent).toBe('Study session complete'))
  expect((await readStudyBackup(id)).firebaseSessionId).toBe('same-session')
  const pending = await pendingStudyUploads(id)
  expect(pending.find((entry) => entry.id === 'post-study').data.responses.some((response) => response.answer === 'My half-finished response')).toBe(true)
  expect((await readStudyBackup(id)).snapshot.phase).toBe('complete')
})
it('keeps the existing exercise deadline when restoring progress', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  await saveStudyBackup(id, { firebaseSessionId: 'timed-session', snapshot: { researchId: id, phase: 'geoscratch', exerciseIndex: 1,
    tutorialPhase: 'done', studyOrder: 'lecture-first', questionnaires: [], activeGeoResult: {
      exerciseId: 'cube-point-pivot-rotation', startedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), steps: {},
    } } })
  await setActiveStudySession(id)
  await act(async () => root.render(<UserStudyLiPage />))
  await wait(() => expect(host.querySelector('[role="timer"]')?.textContent).toMatch(/Time remaining: [45]:/))
  expect(host.querySelector('h1').textContent).toBe('cube-point-pivot-rotation')
})
it('shows pending sessions and emergency export only after researcher authorization', async () => {
  await saveStudyBackup(id, { snapshot: { researchId: id, phase: 'post' }, uploadError: { code: 'resource-exhausted', message: 'Quota exceeded.' } })
  await act(async () => root.render(<UserStudyLiPage researcherOnly />))
  expect(host.textContent).not.toContain('Pending uploads on this device')
  await click('Researcher sign-in')
  await wait(() => expect(host.textContent).toContain('Pending uploads on this device'))
  await wait(() => expect(host.textContent).toContain(id))
  await click(`Emergency export ${id}`)
  await wait(() => expect(URL.createObjectURL).toHaveBeenCalled())
  expect(firebase.saveFirebaseStudyRecord).not.toHaveBeenCalled()
})
