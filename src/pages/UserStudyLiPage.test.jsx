// @vitest-environment jsdom
vi.mock('@/study/firebase/studyFirebase', () => ({ createFirebaseStudySession: vi.fn(async () => ({ path: ['test'] })), saveFirebaseStudyRecord: vi.fn(async () => {}) }))
vi.mock('@/study/firebase/useFirebaseStudySync', () => ({ default: () => ({ state: 'idle', count: 0 }) }))
vi.mock('@/study/session/useStudyRecoveryBackup', () => ({ default: () => '' }))
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UserStudyLiPage from './UserStudyLiPage'
import useSettingsStore from '@/store/useSettingsStore'
import { strFromU8, unzipSync } from 'fflate'

// Preserve coverage of the future persistent mode; current memory-only mode
// and cleanup are covered separately in studyStorage.test.js.
vi.mock('@/study/session/studyStorage', () => ({ STUDY_PERSISTENCE_ENABLED: true, clearStoredStudyData: () => {} }))

vi.mock('@/hooks/useThemeSync', () => ({ default: () => {} }))
vi.mock('@/store/useWorkspaceStore', () => ({ default: { getState: () => ({ setUserBlockScope: () => {} }) } }))
vi.mock('@/pages/ExercisePage', () => ({ default: ({ exerciseId, onNextExercise, onPreviousExercise, exerciseTimer }) =>
  <>{exerciseTimer}<button onClick={onNextExercise}>{exerciseId}</button>
    {onPreviousExercise && <button onClick={onPreviousExercise}>Previous exercise</button>}</> }))
vi.mock('./userStudyLi/DemographicsQuestionnaire', () => ({ default: ({ onComplete }) =>
  <button onClick={onComplete}>Finish demographics</button> }))
vi.mock('./userStudyLi/TutorialWelcome', () => ({ default: ({ onFollow, onSkip }) =>
  <><button onClick={onFollow}>Follow tutorial</button><button onClick={onSkip}>Skip tutorial</button></> }))
vi.mock('./userStudyLi/SessionTutorial', () => ({ default: ({ onDone, onSkip }) =>
  <><button onClick={onDone}>Finish tutorial</button><button onClick={onSkip}>Skip remaining tutorial</button></> }))
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
    act(() => root.render(<UserStudyLiPage autoResume={false} />))
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
    vi.useRealTimers()
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

  it('times the three GeoScratch tasks at 5, 10, and 10 minutes and automatically advances to the questionnaire', () => {
    vi.useFakeTimers()
    act(() => useSettingsStore.getState().updateSetting('userStudyMode', true))
    click('Condition 1: GeoScratchGeoScratch → Lecture slides')
    expect(host.querySelector('[role="timer"]')).toBeNull()
    act(() => vi.advanceTimersByTime(600000))
    expect(host.textContent).toContain('create-complex-object')
    click('Skip tutorial')
    expect(host.querySelector('[role="timer"]').textContent).toContain('5:00')
    act(() => vi.advanceTimersByTime(300000))
    expect(host.textContent).toContain('cube-point-pivot-rotation')
    expect(host.querySelector('[role="alert"]').textContent).toContain('Time is up for Trial Exercise')
    expect(host.querySelector('[role="timer"]').textContent).toContain('10:00')
    act(() => vi.advanceTimersByTime(4999))
    expect(host.querySelector('.user-study-li-time-up')).toBeTruthy()
    act(() => vi.advanceTimersByTime(1))
    expect(host.querySelector('.user-study-li-time-up')).toBeNull()
    // The parent also guards Previous, even if called outside the disabled UI.
    click('Previous exercise')
    expect(host.textContent).toContain('cube-point-pivot-rotation')
    act(() => vi.advanceTimersByTime(594000))
    expect(host.textContent).toContain('cube-point-pivot-rotation')
    act(() => vi.advanceTimersByTime(1000))
    expect(host.textContent).toContain('point-plane-distance')
    expect(host.querySelector('[role="timer"]').textContent).toContain('10:00')
    act(() => vi.advanceTimersByTime(600000))
    expect(host.textContent).toContain('GeoScratch Exercise questionnaire First')
    expect(host.querySelector('[role="alert"]').textContent).toContain('Time is up for the point-to-plane distance exercise')
    expect(host.querySelector('[role="timer"]')).toBeNull()
    act(() => vi.advanceTimersByTime(5000))
    expect(host.querySelector('.user-study-li-time-up')).toBeNull()
  })

  it('has no countdown and allows moving back when study mode is off', () => {
    vi.useFakeTimers()
    click('Condition 1: GeoScratchGeoScratch → Lecture slides')
    click('Skip tutorial')
    act(() => vi.advanceTimersByTime(1800000))
    expect(host.textContent).toContain('create-complex-object')
    expect(host.querySelector('[role="timer"]')).toBeNull()
    click('create-complex-object')
    click('Previous exercise')
    expect(host.textContent).toContain('create-complex-object')
  })

  it('cancels the active countdown when study mode is switched off', () => {
    vi.useFakeTimers()
    act(() => useSettingsStore.getState().updateSetting('userStudyMode', true))
    click('Condition 1: GeoScratchGeoScratch → Lecture slides')
    click('Skip tutorial')
    act(() => vi.advanceTimersByTime(60000))
    expect(host.querySelector('[role="timer"]').textContent).toContain('4:00')
    act(() => useSettingsStore.getState().updateSetting('userStudyMode', false))
    act(() => vi.advanceTimersByTime(600000))
    expect(host.querySelector('[role="timer"]')).toBeNull()
    expect(host.textContent).toContain('create-complex-object')
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
      expect(host.querySelector('.user-study-li-lecture-content [role="status"]')).toBeNull()
      click('Submit')
      const result = host.querySelector('.user-study-li-lecture-content [role="status"]')
      expect(result.textContent).toBe(answer === 'distance' ? '✓' : '✗')
      expect(result.closest('label').querySelector('input').value).toBe(answer)
      expect(host.querySelectorAll('.user-study-li-lecture-content [role="status"]').length).toBe(1)
    }
  })

  it('provides only a description field for the cube exercise before Next', () => {
    click('Condition 2: Lecture slidesLecture slides → GeoScratch')
    expect(host.querySelector('textarea')).toBeTruthy()
    expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(0)
    expect(host.querySelector('.user-study-li-lecture-content [role="status"]')).toBeNull()
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
    expect(host.querySelector('.user-study-li-lecture-content [role="status"]').textContent).toBe('Answer saved.')
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
    expect(files.filter((file) => file.type === 'exercise-tracking').every((file) => !file.events && !file.tutorialEvents && !file.finalWorkspace)).toBe(true)
    expect(Object.keys(localStorage).some((key) => key.startsWith('userstudyLi.interactions.'))).toBe(false)
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

  it('still reaches post-study and exports lecture answers and timings when browser storage is full', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Storage full', 'QuotaExceededError') })
    let now = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    click('Condition 2: Lecture slidesLecture slides → GeoScratch')
    const textarea = host.querySelector('textarea')
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'My saved-in-tab answer')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    click('Submit')
    now += 5000
    click('Next')
    act(() => host.querySelector('input[value="distance"]').click())
    click('Submit')
    now += 3000
    click('Continue to questionnaire')
    click('Lecture slides questionnaire First')
    finishGeoScratch()
    click('GeoScratch Exercise questionnaire Second')
    expect(host.textContent).toContain('Post-study Lecture slides first')
    click('Post-study Lecture slides first')
    expect(host.querySelector('h1').textContent).toBe('Study session complete')
    click('Download study data (ZIP)')
    const blob = URL.createObjectURL.mock.calls.at(-1)[0]
    const bytes = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(new Uint8Array(reader.result))
      reader.onerror = reject
      reader.readAsArrayBuffer(blob)
    })
    const files = Object.values(unzipSync(bytes)).map((value) => JSON.parse(strFromU8(value)))
    const lecture = files.filter((file) => file.type === 'exercise-answers')
    expect(lecture[0].submissions[0].answer).toBe('My saved-in-tab answer')
    expect(lecture[1].submissions[0].answer).toBe('distance')
    expect(lecture.map((file) => file.durationMs)).toEqual([5000, 3000])
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
    act(() => root.render(<UserStudyLiPage autoResume={false} />))
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

  it('still downloads the archive if the final local backup exceeds browser storage', () => {
    act(() => useSettingsStore.getState().updateSetting('userStudyMode', true))
    click('Condition 2: Lecture slidesLecture slides → GeoScratch')
    finishLectureSlides()
    click('Lecture slides questionnaire First')
    finishGeoScratch()
    click('GeoScratch Exercise questionnaire Second')
    const originalSetItem = window.Storage.prototype.setItem
    vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key.startsWith('userstudyLi.sessionExport.')) throw new Error('quota exceeded')
      return originalSetItem.call(this, key, value)
    })
    click('Post-study Lecture slides first')
    expect(URL.createObjectURL).toHaveBeenCalledOnce()
    expect(host.querySelector('[role="alert"]').textContent).toContain('local session backup')
  })

  it.each([
    ['skip before starting', ['Skip tutorial'], 'skipped', 'welcome'],
    ['skip after starting', ['Follow tutorial', 'Skip remaining tutorial'], 'skipped-after-start', 'in-tutorial'],
    ['complete the tutorial', ['Follow tutorial', 'Finish tutorial'], 'completed', null],
  ])('records whether participants %s in the trial export', (_description, buttons, status, skipSource) => {
    click('Condition 1: GeoScratchGeoScratch → Lecture slides')
    buttons.forEach(click)
    click('create-complex-object')
    click('cube-point-pivot-rotation')
    click('point-plane-distance')
    click('GeoScratch Exercise questionnaire First')
    finishLectureSlides()
    click('Lecture slides questionnaire Second')
    click('Post-study GeoScratch Exercise first')
    const researchId = window.localStorage.getItem('userstudyLi.currentResearchId')
    const archive = JSON.parse(window.localStorage.getItem(`userstudyLi.sessionExport.${researchId}`))
    const trial = archive.files.find((file) => file.data.exerciseId === 'create-complex-object').data
    expect(trial.tutorial).toMatchObject({ status, skipSource })
    expect(trial).not.toHaveProperty('tutorialEvents')
    expect(Object.keys(localStorage).some((key) => key.startsWith('userstudyLi.interactions.'))).toBe(false)
  })
})
