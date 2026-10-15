// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import UserStudyLiPage from './UserStudyLiPage'
import useSettingsStore from '@/store/useSettingsStore'
import { createFirebaseStudySession, saveFirebaseStudyRecord } from '@/study/firebase/studyFirebase'

vi.mock('@/study/firebase/studyFirebase', () => ({ createFirebaseStudySession: vi.fn(async () => ({ path: ['test'] })), saveFirebaseStudyRecord: vi.fn(async () => {}), updateFirebaseStudyOrder: vi.fn(async () => {}), saveFirebaseStudyRecovery: vi.fn(async () => {}), saveFirebaseStudyInteraction: vi.fn(async () => {}), readFirebaseStudyInteractions: vi.fn(async () => []) }))

vi.mock('@/hooks/useThemeSync', () => ({ default: () => {} }))
vi.mock('@/store/useWorkspaceStore', () => ({ default: { getState: () => ({ setUserBlockScope: () => {}, savedXml: {} }) } }))
vi.mock('@/pages/ExercisePage', () => ({ default: function Exercise({ exerciseId, onNextExercise, onPassedChange, onStepAction }) {
  useEffect(() => onPassedChange?.(true), [onPassedChange])
  return <><button onClick={() => onStepAction({ action: 'check', stepKey: 'cube' })}>Check test step</button>
    <button onClick={() => onStepAction({ action: 'more-help', stepKey: 'cube' })}>Open test help</button>
    <button onClick={onNextExercise}>{exerciseId}</button></>
} }))
vi.mock('./userStudyLi/TutorialWelcome', () => ({ default: ({ onSkip }) => <button onClick={onSkip}>Skip tutorial</button> }))
vi.mock('./userStudyLi/DemographicsQuestionnaire', () => ({ default: ({ onSave, onComplete }) => <button onClick={() => {
  onSave({ answers: { age: '25' } }, 'demographics', 'userstudyLi.demographicsResponses')
  onComplete()
}}>Finish demographics</button> }))
vi.mock('./userStudyLi/LectureSlides', () => ({ default: function Lecture({ onExerciseChange, onExerciseFinish, onSubmitAnswer, onComplete }) {
  useEffect(() => onExerciseChange('cube-point-pivot-rotation'), [onExerciseChange])
  return <><button onClick={() => onSubmitAnswer({ exerciseId: 'cube-point-pivot-rotation', answer: 'Submitted answer', submittedAt: new Date().toISOString() })}>Submit lecture answer</button><button onClick={async () => {
    await onSubmitAnswer({ exerciseId: 'cube-point-pivot-rotation', answer: 'My lecture answer', submittedAt: new Date().toISOString() })
    await onExerciseFinish('cube-point-pivot-rotation')
    await onComplete()
  }}>Finish lecture</button></>
} }))
vi.mock('./userStudyLi/ConditionQuestionnaire', () => ({ default: ({ condition, onSave, onComplete }) => <button onClick={() => {
  onSave({ answers: { feedback: condition } }, 'condition', 'userstudyLi.conditionResponses')
  onComplete()
}}>{condition} questionnaire</button> }))
vi.mock('./userStudyLi/PostStudyQuestionnaire', () => ({ default: ({ onSave, onComplete }) => <button onClick={() => {
  onSave({ answers: { feedback: 'My post-study answer' } }, 'post-study', 'userstudyLi.postStudyResponses')
  onComplete()
}}>Finish post-study</button> }))

let root, host
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
  delete globalThis.IS_REACT_ACT_ENVIRONMENT
})
it('keeps autosaves quiet and shows saving only while Next or a submitted answer is uploading', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  useSettingsStore.getState().resetSettings()
  useSettingsStore.getState().updateSetting('userStudyMode', true)
  host = document.createElement('div'); document.body.append(host)
  root = createRoot(host)
  act(() => root.render(<UserStudyLiPage autoResume={false} />))
  let finishSave
  createFirebaseStudySession.mockImplementationOnce(() => new Promise((resolve) => { finishSave = resolve }))
  await act(async () => [...host.querySelectorAll('button')].find((button) => button.textContent === 'Start new session').click())
  await vi.waitFor(async () => {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) })
    expect(finishSave).toBeTypeOf('function')
  })
  expect(host.querySelector('.user-study-li-cloud-status')).toBeNull()
  expect(host.querySelector('[data-saving-transition]')).toBeNull()
  await act(async () => finishSave({ path: ['test'] }))

  const submitAndFinishSave = async (label) => {
    finishSave = undefined
    saveFirebaseStudyRecord.mockImplementationOnce(() => new Promise((resolve) => { finishSave = resolve }))
    await act(async () => [...host.querySelectorAll('button')].find((button) => button.textContent === label).click())
    await vi.waitFor(async () => {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) })
      expect(finishSave).toBeTypeOf('function')
    })
    expect(host.querySelector('[data-saving-transition]').textContent).toContain('Saving your results')
    await act(async () => finishSave())
    await vi.waitFor(async () => {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) })
      expect(host.querySelector('[data-saving-transition]')).toBeNull()
    })
    expect(host.querySelector('.user-study-li-cloud-status')).toBeNull()
  }
  await submitAndFinishSave('Finish demographics')
  await act(async () => [...host.querySelectorAll('button')].find((button) => button.textContent === 'Condition 2: Lecture slidesLecture slides → GeoScratch').click())
  await vi.waitFor(async () => {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) })
    expect(host.querySelector('[data-saving-transition]')).toBeNull()
  })
  await submitAndFinishSave('Submit lecture answer')
})
it('clears old study storage and completes/export the active session entirely in memory', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  useSettingsStore.getState().resetSettings()
  useSettingsStore.getState().updateSetting('userStudyMode', true)
  localStorage.setItem('userstudyLi.interactions.old', 'old large records')
  const writes = vi.spyOn(Storage.prototype, 'setItem')
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:memory-study'), revokeObjectURL: vi.fn() })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  let now = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root.render(<UserStudyLiPage autoResume={false} />))
  expect(localStorage.getItem('userstudyLi.interactions.old')).toBeNull()
  const click = async (text) => {
    await act(async () => [...host.querySelectorAll('button')].find((node) => node.textContent === text).click())
    await vi.waitFor(async () => {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) })
      expect(host.querySelector('[data-saving-transition]')).toBeNull()
    })
  }
  await click('Start new session')
  await click('Finish demographics')
  await vi.waitFor(async () => {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) })
    expect(saveFirebaseStudyRecord).toHaveBeenCalledWith(expect.anything(), 'demographics', expect.anything())
  })
  expect(host.querySelector('.user-study-li-cloud-status')).toBeNull()
  expect(createFirebaseStudySession).toHaveBeenCalledWith(expect.objectContaining({ studyOrder: null }))
  expect(saveFirebaseStudyRecord).toHaveBeenCalledWith(expect.anything(), 'demographics', expect.objectContaining({
    responses: [{ id: 'age', answer: '25' }],
  }))
  await click('Condition 2: Lecture slidesLecture slides → GeoScratch')
  now += 5000
  await click('Finish lecture')
  await click('Lecture slides questionnaire')
  await click('Skip tutorial')
  now += 3000
  await click('Check test step')
  await click('Check test step')
  await click('Open test help')
  await click('create-complex-object')
  await click('cube-point-pivot-rotation')
  await click('point-plane-distance')
  await click('GeoScratch Exercise questionnaire')
  await click('Finish post-study')
  expect(host.querySelector('h1').textContent).toBe('Study session complete')
  await click('Download study data (ZIP)')
  expect(writes).not.toHaveBeenCalled()
  expect(Object.keys(localStorage).some((key) => key.startsWith('userstudyLi.'))).toBe(false)
  const blob = URL.createObjectURL.mock.calls.at(-1)[0]
  const bytes = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result))
    reader.onerror = reject
    reader.readAsArrayBuffer(blob)
  })
  const files = Object.values(unzipSync(bytes)).map((value) => JSON.parse(strFromU8(value)))
  expect(files.find((file) => file.type === 'exercise-answers').submissions[0].answer).toBe('My lecture answer')
  expect(files.find((file) => file.type === 'exercise-answers').durationMs).toBe(5000)
  expect(files.at(-1).responses.some((response) => response.answer === 'My post-study answer')).toBe(true)
  const trial = files.find((file) => file.exerciseId === 'create-complex-object').result
  expect(trial).toMatchObject({ passed: true, durationMs: 3000, checkCount: 2, moreHelpCount: 1,
    steps: { cube: { checkCount: 2, moreHelpCount: 1 }, point: { checkCount: 0, moreHelpCount: 0 } } })
  await vi.waitFor(async () => {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) })
    expect(saveFirebaseStudyRecord).toHaveBeenCalledWith(expect.anything(), 'post-study', expect.anything())
  })
  expect(createFirebaseStudySession).toHaveBeenCalled()
  const saved = new Map(saveFirebaseStudyRecord.mock.calls.map(([, stage, data]) => [stage, data]))
  expect([...saved.keys()].sort()).toEqual(['demographics', 'lecture-exercise-1', 'condition-1',
    'geoscratch-trial', 'geoscratch-exercise-1', 'geoscratch-exercise-2', 'condition-2', 'post-study'].sort())
  expect(saved.get('geoscratch-trial').result).toEqual(trial)
  expect(saved.get('post-study').responses[0].answer).toBe('My post-study answer')
  expect(host.querySelector('.user-study-li-cloud-status')).toBeNull()
})
