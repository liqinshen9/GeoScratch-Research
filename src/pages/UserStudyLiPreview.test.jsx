// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import UserStudyLiPage from './UserStudyLiPage'
import useSettingsStore from '@/store/useSettingsStore'
import * as firebase from '@/study/firebase/studyFirebase'
import * as recovery from '@/study/session/studyRecoveryStore'
import { readSessionQuestionnaires } from '@/study/session/questionnaireDrafts'

vi.mock('@/hooks/useThemeSync', () => ({ default: () => {} }))
vi.mock('@/store/useWorkspaceStore', () => ({ default: { getState: () => ({ setUserBlockScope() {}, savedXml: {} }) } }))
vi.mock('@/study/firebase/studyFirebase', () => ({
  createFirebaseStudySession: vi.fn(async () => ({ path: ['test'] })), saveFirebaseStudyRecord: vi.fn(async () => {}),
  updateFirebaseStudyOrder: vi.fn(async () => {}), saveFirebaseStudyRecovery: vi.fn(async () => {}),
  saveFirebaseStudyInteraction: vi.fn(async () => {}), readFirebaseStudyInteractions: vi.fn(async () => []),
  recoverFirebaseStudy: vi.fn(async () => null), signInResearcher: vi.fn(),
}))
vi.mock('@/study/session/studyRecoveryStore', () => ({ readActiveStudySession: vi.fn(async () => null),
  saveStudyBackup: vi.fn(async () => {}), setActiveStudySession: vi.fn(async () => {}) }))
vi.mock('@/pages/ExercisePage', () => ({ default: ({ exerciseId, exerciseTimer, onPreviousExercise, onNextExercise, onStepAction }) => <>
  <h1>{exerciseId}</h1>{exerciseTimer}
  <button onClick={() => onStepAction({ action: 'check', stepKey: 'pointQ' })}>Check preview block</button>
  <button onClick={onPreviousExercise}>Previous exercise</button><button onClick={onNextExercise}>Next exercise</button>
</> }))
vi.mock('./userStudyLi/TutorialWelcome', () => ({ default: ({ onSkip }) => <button onClick={onSkip}>Skip tutorial</button> }))

let host, root
const click = async (name) => act(async () => {
  const button = [...host.querySelectorAll('button')].find((item) => item.textContent === name)
  expect(button, name).toBeTruthy()
  expect(button.disabled, name).toBe(false)
  button.click()
})
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  useSettingsStore.getState().resetSettings()
  vi.stubGlobal('URL', { createObjectURL: vi.fn(), revokeObjectURL: vi.fn() })
  host = document.createElement('div'); document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount()); host.remove()
  vi.unstubAllGlobals()
  delete globalThis.IS_REACT_ACT_ENVIRONMENT
})

it('previews the entire study in either direction without recording, Firebase, timers, or downloads', async () => {
  await act(async () => root.render(<UserStudyLiPage />))
  expect(recovery.readActiveStudySession).not.toHaveBeenCalled()
  await click('Start new session')
  const researchId = host.querySelector('input[readonly]').value
  await act(async () => host.querySelector('input[name="gender"]').click())
  await click('Next')
  await click('Condition 2: Lecture slidesLecture slides → GeoScratch')
  expect(host.querySelector('[role="timer"]')).toBeNull()
  // Submit for visual feedback, without collecting the answer.
  await act(async () => host.querySelector('input[value="B"]').click())
  await click('Submit')
  await click('Next')
  await click('Previous')
  expect(host.querySelector('h1').textContent).toContain('Exercise 1:')
  await click('Next')
  await click('Continue to questionnaire')
  await click('Next')
  await click('Skip tutorial')
  await click('Check preview block')
  await click('Next exercise')
  await click('Previous exercise')
  expect(host.querySelector('h1').textContent).toBe('create-complex-object')
  await click('Next exercise')
  await click('Next exercise')
  await click('Next exercise')
  await click('Next')
  await act(async () => host.querySelector('textarea').value = 'Developer preview only')
  await click('Submit session')
  expect(host.querySelector('h1').textContent).toBe('Study session complete')
  expect(host.textContent).not.toContain('Download study data')
  expect(host.querySelector('[role="timer"]')).toBeNull()
  await click('Previous preview step')
  expect(host.querySelector('h1').textContent).toBe('Post-Study Questionnaire')
  await click('Next preview step')
  expect(readSessionQuestionnaires(researchId)).toEqual([])
  for (const method of Object.values(firebase)) expect(method).not.toHaveBeenCalled()
  for (const method of Object.values(recovery)) expect(method).not.toHaveBeenCalled()
  expect(URL.createObjectURL).not.toHaveBeenCalled()
})

it('stops questionnaire collection and server writes when the setting is switched off mid-session', async () => {
  useSettingsStore.getState().updateSetting('userStudyMode', true)
  await act(async () => root.render(<UserStudyLiPage autoResume={false} />))
  await click('Start new session')
  expect(firebase.createFirebaseStudySession).toHaveBeenCalledOnce()
  const researchId = host.querySelector('input[readonly]').value
  await act(async () => useSettingsStore.getState().updateSetting('userStudyMode', false))
  const savedBefore = JSON.stringify(readSessionQuestionnaires(researchId))
  vi.clearAllMocks()
  await act(async () => host.querySelector('input[name="gender"]').click())
  await click('Next')
  await click('Condition 1: GeoScratchGeoScratch → Lecture slides')
  await click('Skip tutorial')
  await click('Check preview block')
  await click('Next exercise')
  await click('Previous exercise')
  expect(JSON.stringify(readSessionQuestionnaires(researchId))).toBe(savedBefore)
  expect(host.querySelector('[role="timer"]')).toBeNull()
  for (const method of Object.values(firebase)) expect(method).not.toHaveBeenCalled()
  for (const method of Object.values(recovery)) expect(method).not.toHaveBeenCalled()
  expect(URL.createObjectURL).not.toHaveBeenCalled()
})
