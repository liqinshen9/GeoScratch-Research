// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import UserStudyLiPage from './UserStudyLiPage'
import useSettingsStore from '@/store/useSettingsStore'
import { saveStudyBackup, setActiveStudySession } from '@/study/session/studyRecoveryStore'
import { readQuestionnaireDraft } from '@/study/session/questionnaireDrafts'
import { recoverFirebaseStudy, signInResearcher } from '@/study/firebase/studyFirebase'
import { downloadSessionZip } from '@/study/session/sessionExport'

vi.mock('@/hooks/useThemeSync', () => ({ default: () => {} }))
vi.mock('@/study/session/useStudyRecoveryBackup', () => ({ default: () => '' }))
vi.mock('@/study/firebase/useFirebaseStudySync', () => ({ default: () => ({ state: 'saved', count: 2 }) }))
vi.mock('@/study/firebase/studyFirebase', () => ({ recoverFirebaseStudy: vi.fn(), signInResearcher: vi.fn(), readFirebaseStudyInteractions: vi.fn(async () => []) }))
vi.mock('@/store/useWorkspaceStore', () => ({ default: { getState: () => ({ savedXml: {}, setUserBlockScope: () => {}, restoreStudyWorkspace: () => {} }) } }))
vi.mock('@/study/session/sessionExport', async (original) => ({ ...await original(), downloadSessionZip: vi.fn() }))
vi.mock('./userStudyLi/DemographicsQuestionnaire', () => ({ default: ({ researchId }) =>
  <p>Recovered age: {readQuestionnaireDraft(researchId, 'demographics')?.rawAnswers.age}</p> }))

let root, host
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  useSettingsStore.getState().updateSetting('userStudyMode', true)
  host = document.createElement('div'); document.body.append(host)
  root = createRoot(host)
  act(() => root.render(<UserStudyLiPage researcherOnly />))
})
afterEach(() => { act(() => root.unmount()); host.remove(); delete globalThis.IS_REACT_ACT_ENVIRONMENT })
async function click(name) { await act(async () => [...host.querySelectorAll('button')].find((button) => button.textContent === name).click()) }
function enterId(id) {
  act(() => {
    const input = host.querySelector('input')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, id)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

it('uses the local reference to recover answers from Firebase after refresh', async () => {
  await saveStudyBackup('LOCAL1', { firebaseSessionId: 'session-1' })
  recoverFirebaseStudy.mockResolvedValue({ snapshot: { phase: 'demographics', studyOrder: null,
    questionnaires: [{ questionnaireId: 'demographics', status: 'draft', rawAnswers: { age: '25' } }] } })
  await setActiveStudySession('LOCAL1')
  act(() => root.render(<UserStudyLiPage />))
  await vi.waitFor(async () => {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) })
    expect(host.textContent).toContain('Recovered age: 25')
  })
  expect(recoverFirebaseStudy).toHaveBeenCalledWith('LOCAL1', false)
  expect(host.textContent).not.toContain('Recover study')
  expect(host.textContent).not.toContain('Researcher sign-in')
  expect(host.querySelector('.user-study-li-cloud-status')).toBeNull()
})

it('lets an authorized researcher retrieve cloud results and download them without changing participant progress', async () => {
  signInResearcher.mockResolvedValue({ authorized: true, uid: 'researcher', email: 'researcher@example.com' })
  recoverFirebaseStudy.mockResolvedValue({ studyOrder: 'lecture-first', firebaseSession: { path: ['owner', 'session'] },
    records: [{ data: { researchId: 'CLOUD1', type: 'questionnaire', questionnaireId: 'demographics', status: 'submitted', responses: [{ id: 'age', answer: '30' }] } }] })
  await click('Researcher sign-in')
  enterId('cloud1')
  await click('Recover study')
  await vi.waitFor(async () => {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) })
    expect(host.textContent).toContain('Recovered study results')
  })
  expect(recoverFirebaseStudy).toHaveBeenCalledWith('CLOUD1', true)
  await click('Download study data (ZIP)')
  expect(downloadSessionZip).toHaveBeenCalledWith(expect.objectContaining({ researchId: 'CLOUD1',
    questionnaires: [expect.objectContaining({ answers: { age: '30' } })] }))
  expect(host.querySelector('.user-study-li-cloud-status')).toBeNull()
})
