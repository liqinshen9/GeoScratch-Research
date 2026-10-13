// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UserStudyLiPage from './UserStudyLiPage'
import useSettingsStore from '@/store/useSettingsStore'
import { strFromU8, unzipSync } from 'fflate'

vi.mock('@/hooks/useThemeSync', () => ({ default: () => {} }))
vi.mock('@/store/useWorkspaceStore', () => ({ default: { getState: () => ({ setUserBlockScope: () => {} }) } }))
vi.mock('@/pages/ExercisePage', () => ({ default: ({ exerciseId, onNextExercise }) =>
  <button onClick={onNextExercise}>{exerciseId}</button> }))
vi.mock('./userStudyLi/DemographicsQuestionnaire', () => ({ default: ({ onComplete }) =>
  <button onClick={onComplete}>Finish demographics</button> }))
vi.mock('./userStudyLi/TutorialWelcome', () => ({ default: ({ onFollow }) =>
  <button onClick={onFollow}>Follow tutorial</button> }))
vi.mock('./userStudyLi/SessionTutorial', () => ({ default: ({ onDone }) =>
  <button onClick={onDone}>Finish tutorial</button> }))
vi.mock('./userStudyLi/ConditionQuestionnaire', () => ({ default: ({ condition, conditionOrder, onComplete }) =>
  <button onClick={onComplete}>{condition} questionnaire {conditionOrder}</button> }))
vi.mock('./userStudyLi/PostStudyQuestionnaire', () => ({ default: ({ conditionOrder, onComplete }) =>
  <button onClick={onComplete}>Post-study {conditionOrder}</button> }))

let host, root
function click(text) {
  const button = [...host.querySelectorAll('button')].find((node) => node.textContent === text)
  expect(button, `Expected button: ${text}`).toBeTruthy()
  act(() => button.click())
}
function finishGeoScratch() {
  click('Follow tutorial')
  click('Finish tutorial')
  click('create-complex-object')
  click('cube-point-pivot-rotation')
  click('point-plane-distance')
}
function finishLectureSlides() {
  expect(host.querySelector('h1').textContent).toBe('Exercise 1: Rotate a cube and its corner point')
  expect(host.querySelector('#lecture-point-plane-title')).toBeNull()
  expect([...host.querySelectorAll('button')].some((button) => button.textContent === 'Continue to questionnaire')).toBe(false)
  click('Next')
  expect(host.querySelector('h1').textContent).toBe('Exercise 2: Calculate the shortest distance from a point to a plane')
  expect(host.querySelector('#lecture-cube-title')).toBeNull()
  click('Continue to questionnaire')
}

describe('Li study routes', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    useSettingsStore.getState().resetSettings()
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:study-data'), revokeObjectURL: vi.fn() })
    vi.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(<UserStudyLiPage />))
    click('Start new session')
    click('Finish demographics')
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    window.localStorage.clear()
    delete globalThis.IS_REACT_ACT_ENVIRONMENT
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('completes GeoScratch then lecture slides with a questionnaire after each', () => {
    click('Condition 1: GeoScratchGeoScratch → Lecture slides')
    finishGeoScratch()
    click('GeoScratch Exercise questionnaire First')
    finishLectureSlides()
    click('Lecture slides questionnaire Second')
    click('Post-study GeoScratch Exercise first')
    expect(host.querySelector('h1').textContent).toBe('Study session complete')
    click('Start new session')
    expect(host.querySelector('h1').textContent).toBe('New study session')
  })

  it('completes lecture slides then GeoScratch with a questionnaire after each', () => {
    click('Condition 2: Lecture slidesLecture slides → GeoScratch')
    finishLectureSlides()
    click('Lecture slides questionnaire First')
    finishGeoScratch()
    click('GeoScratch Exercise questionnaire Second')
    click('Post-study Lecture slides first')
    expect(host.querySelector('h1').textContent).toBe('Study session complete')
  })

  it('checks only the submitted lecture answer and clears feedback when the choice changes', () => {
    click('Condition 2: Lecture slidesLecture slides → GeoScratch')
    click('Next')
    const submit = [...host.querySelectorAll('button')].find((button) => button.textContent === 'Submit')
    expect(submit.disabled).toBe(true)
    for (const answer of ['dot-product', 'none', 'on-plane', 'divide-squared-normal', 'distance']) {
      act(() => host.querySelector(`input[value="${answer}"]`).click())
      expect(host.querySelector('[role="status"]')).toBeNull()
      click('Submit')
      const result = host.querySelector('[role="status"]')
      expect(result.textContent).toBe(answer === 'distance' ? '✓' : '✗')
      expect(result.closest('label').querySelector('input').value).toBe(answer)
      expect(host.querySelectorAll('[role="status"]').length).toBe(1)
    }
  })

  it('provides only a description field for the cube exercise before Next', () => {
    click('Condition 2: Lecture slidesLecture slides → GeoScratch')
    expect(host.querySelector('textarea')).toBeTruthy()
    expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(0)
    expect(host.querySelector('[role="status"]')).toBeNull()
    click('Next')
    expect(host.querySelector('h1').textContent).toBe('Exercise 2: Calculate the shortest distance from a point to a plane')
  })

  it('saves lecture submissions with the session ID and exports answers with their interaction timeline', async () => {
    click('Condition 2: Lecture slidesLecture slides → GeoScratch')
    const textarea = host.querySelector('textarea')
    const answer = 'Translate (1, 1, 1), rotate Y 90°, translate (-1, -1, -1).'
    act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(textarea, answer)
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    click('Submit')
    expect(host.querySelector('[role="status"]').textContent).toBe('Answer saved.')
    let records = JSON.parse(window.localStorage.getItem('userstudyLi.lectureExerciseResponses'))
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      exerciseId: 'cube-point-pivot-rotation', answer,
      researchId: window.localStorage.getItem('userstudyLi.currentResearchId'),
      conditionId: 'lecture',
    })
    expect(Number.isNaN(Date.parse(records[0].submittedAt))).toBe(false)
    click('Submit')
    act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'Revised answer: rotate about the origin.')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    click('Submit')
    records = JSON.parse(window.localStorage.getItem('userstudyLi.lectureExerciseResponses'))
    expect(records.map((record) => record.answer)).toEqual([answer, answer, 'Revised answer: rotate about the origin.'])
    click('Next')
    act(() => host.querySelector('input[value="distance"]').click())
    click('Submit')
    records = JSON.parse(window.localStorage.getItem('userstudyLi.lectureExerciseResponses'))
    expect(records).toHaveLength(4)
    expect(records[3]).toMatchObject({ exerciseId: 'point-plane-distance', answer: 'distance', correct: true })
    click('Continue to questionnaire')
    click('Lecture slides questionnaire First')
    finishGeoScratch()
    click('GeoScratch Exercise questionnaire Second')
    click('Post-study Lecture slides first')
    const createObjectURL = vi.fn(() => 'blob:study-archive')
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() })
    const download = vi.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(() => {}).mockClear()
    click('Download study data (ZIP)')
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(download).toHaveBeenCalledOnce()
    expect(download.mock.instances[0].download).toBe(`${window.localStorage.getItem('userstudyLi.currentResearchId')}.zip`)
    const zipBytes = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(new Uint8Array(reader.result))
      reader.onerror = reject
      reader.readAsArrayBuffer(createObjectURL.mock.calls[0][0])
    })
    const extracted = unzipSync(zipBytes)
    expect(Object.keys(extracted)).toHaveLength(9)
    const files = Object.values(extracted).map((bytes) => JSON.parse(strFromU8(bytes)))
    expect(files).toHaveLength(9)
    const lecture = files.filter((file) => file.type === 'exercise-answers')
    expect(lecture.map((file) => file.submissions.length)).toEqual([3, 1])
    expect(lecture[0].submissions.map((item) => item.answer)).toEqual([answer, answer, 'Revised answer: rotate about the origin.'])
    expect(files.filter((file) => file.type === 'exercise-tracking').flatMap((file) => file.events).some((event) => event.type === 'click')).toBe(true)
  })

  it('records lecture start, submission latency, and completion duration independently for both exercises', () => {
    let now = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    click('Condition 2: Lecture slidesLecture slides → GeoScratch')
    const researchId = window.localStorage.getItem('userstudyLi.currentResearchId')
    const readTiming = () => JSON.parse(window.localStorage.getItem(`userstudyLi.lectureExerciseTiming.${researchId}`))
    expect(readTiming()[0]).toMatchObject({ exerciseId: 'cube-point-pivot-rotation', completedAt: null, durationMs: null })
    expect(Number.isNaN(Date.parse(readTiming()[0].startedAt))).toBe(false)
    const textarea = host.querySelector('textarea')
    act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'My answer')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    now += 5000
    click('Submit')
    now += 4000
    click('Submit')
    now += 1000
    click('Next')
    expect(readTiming()[0].durationMs).toBe(10000)
    expect(readTiming()[0].completedAt).toBeTruthy()
    expect(readTiming()[1]).toMatchObject({ exerciseId: 'point-plane-distance', durationMs: null })
    now += 2000
    act(() => host.querySelector('input[value="distance"]').click())
    click('Submit')
    now += 3000
    click('Continue to questionnaire')
    expect(readTiming()[1].durationMs).toBe(5000)
    expect(JSON.parse(window.localStorage.getItem('userstudyLi.lectureExerciseResponses')).map((item) => item.elapsedMs)).toEqual([5000, 9000, 2000])
    click('Lecture slides questionnaire First')
    finishGeoScratch()
    click('GeoScratch Exercise questionnaire Second')
    click('Post-study Lecture slides first')
    const archive = JSON.parse(window.localStorage.getItem(`userstudyLi.sessionExport.${researchId}`))
    const exercises = archive.files.filter((file) => file.data.type === 'exercise-answers')
    expect(exercises.map((file) => file.data.durationMs)).toEqual([10000, 5000])
    expect(exercises[0].data.submissions.map((item) => item.elapsedMs)).toEqual([5000, 9000])
  })

  it('automatically exports the completed session once, including unsubmitted questionnaire drafts', () => {
    act(() => useSettingsStore.getState().updateSetting('userStudyMode', true))
    const researchId = window.localStorage.getItem('userstudyLi.currentResearchId')
    window.localStorage.setItem(`userstudyLi.questionnaireDrafts.${researchId}.demographics`, JSON.stringify({
      researchId, questionnaireId: 'demographics', status: 'not-submitted', answers: { gender: 'Prefer not to say' }, submittedAt: null,
    }))
    click('Condition 2: Lecture slidesLecture slides → GeoScratch')
    finishLectureSlides()
    click('Lecture slides questionnaire First')
    finishGeoScratch()
    click('GeoScratch Exercise questionnaire Second')
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    click('Post-study Lecture slides first')
    expect(URL.createObjectURL).toHaveBeenCalledOnce()
    const saved = JSON.parse(window.localStorage.getItem(`userstudyLi.sessionExport.${researchId}`))
    expect(saved.files[0].data).toMatchObject({ status: 'not-submitted', responses: [{ id: 'gender', answer: 'Prefer not to say' }] })
    expect(saved.files).toHaveLength(9)
    act(() => root.render(<UserStudyLiPage />))
    expect(URL.createObjectURL).toHaveBeenCalledOnce()
  })

  it('does not automatically download JSON with user study mode off but keeps manual export', () => {
    expect(useSettingsStore.getState().settings.userStudyMode).toBe(false)
    click('Condition 2: Lecture slidesLecture slides → GeoScratch')
    finishLectureSlides()
    click('Lecture slides questionnaire First')
    finishGeoScratch()
    click('GeoScratch Exercise questionnaire Second')
    click('Post-study Lecture slides first')
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(`userstudyLi.sessionExport.${window.localStorage.getItem('userstudyLi.currentResearchId')}`)).toBeTruthy()
    click('Download study data (ZIP)')
    expect(URL.createObjectURL).toHaveBeenCalledOnce()
  })
})
