// @vitest-environment jsdom
vi.mock('@/study/firebase/studyFirebase', () => ({ createFirebaseStudySession: vi.fn(async () => ({ path: ['test'] })), saveFirebaseStudyRecord: vi.fn(async () => {}) }))
vi.mock('@/study/firebase/useFirebaseStudySync', () => ({ default: vi.fn(() => ({ state: 'idle', count: 0 })) }))
vi.mock('@/study/session/useStudyRecoveryBackup', () => ({ default: () => '' }))
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UserStudyLiPage from './UserStudyLiPage'
import useSettingsStore from '@/store/useSettingsStore'
import useFirebaseStudySync from '@/study/firebase/useFirebaseStudySync'
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
  act(() => host.querySelector('input[value="A"]').click())
  click('Submit')
  click('Next')
  expect(host.querySelector('h1').textContent).toBe('Exercise 2: Calculate the shortest distance from a point to a plane')
  expect(host.querySelector('#lecture-cube-title')).toBeNull()
  act(() => host.querySelector('input[value="distance"]').click())
  click('Submit')
  click('Continue to questionnaire')
}

describe('Li study routes', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    useSettingsStore.getState().resetSettings()
    useSettingsStore.getState().updateSetting('userStudyMode', true)
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
    useFirebaseStudySync.mockReturnValue({ state: 'idle', count: 0 })
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('completes GeoScratch then lecture slides with a questionnaire after each', () => {
    useFirebaseStudySync.mockReturnValue({ state: 'saved', count: 9 })
    click('Condition 1: GeoScratchGeoScratch → Lecture slides')
    finishGeoScratch()
    click('GeoScratch Exercise questionnaire First')
    finishLectureSlides()
    click('Lecture slides questionnaire Second')
    click('Post-study GeoScratch Exercise first')
    expect(host.querySelector('h1').textContent).toBe('Study session complete')
    expect(host.textContent).toContain('All study data uploaded to Firebase.')
    click('Start new session')
    expect(host.textContent).toContain('Finish demographics')
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

  it('gives each lecture exercise ten minutes, preserves drafts, and records automatic timeout navigation', () => {
    vi.useFakeTimers()
    act(() => useSettingsStore.getState().updateSetting('userStudyMode', true))
    click('Condition 2: Lecture slidesLecture slides → GeoScratch')
    const researchId = localStorage.getItem('userstudyLi.currentResearchId')
    const timings = () => JSON.parse(localStorage.getItem(`userstudyLi.lectureExerciseTiming.${researchId}`))
    expect(host.querySelector('[role="timer"]').textContent).toContain('10:00')
    act(() => host.querySelector('input[value="B"]').click())
    act(() => vi.advanceTimersByTime(599000))
    expect(host.querySelector('h1').textContent).toContain('Exercise 1:')
    expect(host.querySelector('[role="timer"]').textContent).toContain('0:01')
    act(() => vi.advanceTimersByTime(1000))
    expect(host.querySelector('h1').textContent).toContain('Exercise 2:')
    expect(host.querySelector('[role="timer"]').textContent).toContain('10:00')
    expect(timings()[0]).toMatchObject({ timedOut: true, completionReason: 'timeout', timeLimitSeconds: 600, durationMs: 600000 })
    act(() => vi.advanceTimersByTime(600000))
    expect(host.textContent).toContain('Lecture slides questionnaire First')
    expect(host.querySelector('[role="timer"]')).toBeNull()
    expect(timings()[1]).toMatchObject({ timedOut: true, completionReason: 'timeout', timeLimitSeconds: 600, durationMs: 600000 })
    click('Lecture slides questionnaire First')
    finishGeoScratch()
    click('GeoScratch Exercise questionnaire Second')
    click('Post-study Lecture slides first')
    const archive = JSON.parse(localStorage.getItem(`userstudyLi.sessionExport.${researchId}`))
    const exercises = archive.files.filter((file) => file.data.type === 'exercise-answers')
    expect(exercises.map((file) => file.data.timedOut)).toEqual([true, true])
    expect(exercises[0].data.draftAnswer).toBe('B')
    expect(exercises[0].data.submissions).toHaveLength(0)
  })

  it('requires a submitted answer for each lecture exercise, accepting incorrect submissions without marking a timeout', async () => {
    vi.useFakeTimers()
    act(() => useSettingsStore.getState().updateSetting('userStudyMode', true))
    click('Condition 2: Lecture slidesLecture slides → GeoScratch')
    const next = () => [...host.querySelectorAll('button')].find((button) => button.textContent === 'Next')
    expect(next().getAttribute('aria-disabled')).toBe('true')
    expect(host.textContent).not.toContain('Submit an answer to continue.')
    click('Next')
    expect(host.textContent).toContain('Submit an answer to continue.')
    act(() => host.querySelector('input[value="B"]').click())
    expect(next().getAttribute('aria-disabled')).toBe('true')
    await act(async () => click('Submit'))
    expect(next().getAttribute('aria-disabled')).toBe('false')
    expect(host.textContent).not.toContain('Submit an answer to continue.')
    act(() => vi.advanceTimersByTime(120000))
    click('Next')
    const researchId = localStorage.getItem('userstudyLi.currentResearchId')
    const timings = JSON.parse(localStorage.getItem(`userstudyLi.lectureExerciseTiming.${researchId}`))
    expect(timings[0]).toMatchObject({ timedOut: false, completionReason: 'next', timeLimitSeconds: 600, durationMs: 120000 })
    expect(host.querySelector('[role="timer"]').textContent).toContain('10:00')
    const proceed = () => [...host.querySelectorAll('button')].find((button) => button.textContent === 'Continue to questionnaire')
    expect(proceed().getAttribute('aria-disabled')).toBe('true')
    expect(host.textContent).not.toContain('Submit an answer to continue.')
    click('Continue to questionnaire')
    expect(host.textContent).toContain('Submit an answer to continue.')
    act(() => host.querySelector('input[value="dot-product"]').click())
    expect(proceed().getAttribute('aria-disabled')).toBe('true')
    await act(async () => click('Submit'))
    expect(proceed().getAttribute('aria-disabled')).toBe('false')
    click('Continue to questionnaire')
    expect(host.textContent).toContain('Lecture slides questionnaire First')
  })

  it('has no countdown and allows moving back when study mode is off', () => {
    act(() => useSettingsStore.getState().updateSetting('userStudyMode', false))
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
    act(() => useSettingsStore.getState().updateSetting('userStudyMode', false))
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
      expect(host.querySelectorAll('.user-study-li-lecture-content [role="status"]').length).toBe(2)
      expect(host.querySelector('.user-study-li-cube-answer-submit [role="status"]').textContent)
        .toBe(answer === 'distance' ? 'Correct' : 'Incorrect')
    }
  })

  it('provides four matrix-product choices for the cube exercise before Next', () => {
    act(() => useSettingsStore.getState().updateSetting('userStudyMode', false))
    click('Condition 2: Lecture slidesLecture slides → GeoScratch')
    expect(host.querySelector('textarea')).toBeNull()
    expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(4)
    expect(host.querySelector('.user-study-li-lecture-content [role="status"]')).toBeNull()
    click('Next')
    expect(host.querySelector('h1').textContent).toBe('Exercise 2: Calculate the shortest distance from a point to a plane')
  })

  it('saves lecture submissions with the session ID and exports answers with their interaction timeline', async () => {
    click('Condition 2: Lecture slidesLecture slides → GeoScratch')
    const answer = 'A'
    act(() => host.querySelector('input[value="A"]').click())
    await act(async () => click('Submit'))
    expect(host.querySelector('.user-study-li-cube-answer-submit [role="status"]').textContent).toBe('Correct')
    let records = JSON.parse(window.localStorage.getItem('userstudyLi.lectureExerciseResponses'))
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      exerciseId: 'cube-point-pivot-rotation', answer, correct: true, answerFormat: 'multiple-choice',
      researchId: window.localStorage.getItem('userstudyLi.currentResearchId'),
      conditionId: 'lecture',
    })
    expect(Number.isNaN(Date.parse(records[0].submittedAt))).toBe(false)
    await act(async () => click('Submit'))
    act(() => host.querySelector('input[value="D"]').click())
    await act(async () => click('Submit'))
    records = JSON.parse(window.localStorage.getItem('userstudyLi.lectureExerciseResponses'))
    expect(records.map((record) => record.answer)).toEqual([answer, answer, 'D'])
    expect(records[2]).toMatchObject({ correct: false, answerLabel: 'Rotate (Y, 90°) only' })
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
    await act(async () => click('Post-study Lecture slides first'))
    const createObjectURL = vi.fn(() => 'blob:study-archive')
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() })
    const download = vi.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(() => {}).mockClear()
    await act(async () => click('Download study data (ZIP)'))
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
    expect(lecture[0].submissions.map((item) => item.answer)).toEqual([answer, answer, 'D'])
    expect(files.filter((file) => file.type === 'exercise-tracking').every((file) => !file.events && !file.tutorialEvents && !file.finalWorkspace)).toBe(true)
    expect(Object.keys(localStorage).some((key) => key.startsWith('userstudyLi.interactions.'))).toBe(false)
  })

  it('records lecture start, submission latency, and completion duration independently for both exercises', async () => {
    let now = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    click('Condition 2: Lecture slidesLecture slides → GeoScratch')
    const researchId = window.localStorage.getItem('userstudyLi.currentResearchId')
    const readTiming = () => JSON.parse(window.localStorage.getItem(`userstudyLi.lectureExerciseTiming.${researchId}`))
    expect(readTiming()[0]).toMatchObject({ exerciseId: 'cube-point-pivot-rotation', completedAt: null, durationMs: null })
    expect(Number.isNaN(Date.parse(readTiming()[0].startedAt))).toBe(false)
    act(() => host.querySelector('input[value="A"]').click())
    now += 5000
    await act(async () => click('Submit'))
    now += 4000
    await act(async () => click('Submit'))
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
    act(() => host.querySelector('input[value="A"]').click())
    await act(async () => click('Submit'))
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
    await act(async () => click('Download study data (ZIP)'))
    const blob = URL.createObjectURL.mock.calls.at(-1)[0]
    const bytes = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(new Uint8Array(reader.result))
      reader.onerror = reject
      reader.readAsArrayBuffer(blob)
    })
    const files = Object.values(unzipSync(bytes)).map((value) => JSON.parse(strFromU8(value)))
    const lecture = files.filter((file) => file.type === 'exercise-answers')
    expect(lecture[0].submissions[0]).toMatchObject({ answer: 'A', correct: true, answerFormat: 'multiple-choice' })
    expect(lecture[1].submissions[0].answer).toBe('distance')
    expect(lecture.map((file) => file.durationMs)).toEqual([5000, 3000])
  })

  it('automatically exports the completed session once, including unsubmitted questionnaire drafts', async () => {
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
    await act(async () => click('Post-study Lecture slides first'))
    expect(URL.createObjectURL).toHaveBeenCalledOnce()
    const saved = JSON.parse(window.localStorage.getItem(`userstudyLi.sessionExport.${researchId}`))
    expect(saved.files[0].data).toMatchObject({ status: 'not-submitted', responses: [{ id: 'gender', answer: 'Prefer not to say' }] })
    expect(saved.files).toHaveLength(9)
    act(() => root.render(<UserStudyLiPage autoResume={false} />))
    expect(URL.createObjectURL).toHaveBeenCalledOnce()
  })

  it('starts fresh on one completion-page click without another download', async () => {
    useFirebaseStudySync.mockReturnValue({ state: 'saved', count: 9 })
    act(() => useSettingsStore.getState().updateSetting('userStudyMode', true))
    const oldId = window.localStorage.getItem('userstudyLi.currentResearchId')
    click('Condition 2: Lecture slidesLecture slides → GeoScratch')
    finishLectureSlides()
    click('Lecture slides questionnaire First')
    finishGeoScratch()
    click('GeoScratch Exercise questionnaire Second')
    await act(async () => click('Post-study Lecture slides first'))
    expect(URL.createObjectURL).toHaveBeenCalledOnce()

    await act(async () => click('Start new session'))
    expect(host.textContent).toContain('Finish demographics')
    expect(host.textContent).not.toContain('Study session complete')
    const newId = window.localStorage.getItem('userstudyLi.currentResearchId')
    expect(newId).toBeTruthy()
    expect(newId).not.toBe(oldId)
    expect(URL.createObjectURL).toHaveBeenCalledOnce()
    click('Finish demographics')
    expect(host.textContent).toContain('Choose the study order')
  })

  it('cancels an old automatic download still loading when the new session starts', async () => {
    let finishRead
    const readInteractions = vi.fn(() => new Promise((resolve) => { finishRead = resolve }))
    useFirebaseStudySync.mockReturnValue({ state: 'saved', count: 9, readInteractions })
    act(() => useSettingsStore.getState().updateSetting('userStudyMode', true))
    click('Condition 2: Lecture slidesLecture slides → GeoScratch')
    finishLectureSlides()
    click('Lecture slides questionnaire First')
    finishGeoScratch()
    click('GeoScratch Exercise questionnaire Second')
    await act(async () => click('Post-study Lecture slides first'))
    expect(readInteractions).toHaveBeenCalledOnce()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    await act(async () => click('Start new session'))
    expect(host.textContent).toContain('Finish demographics')
    await act(async () => finishRead([]))
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Finish demographics')
  })

  it('does not record or offer any ZIP downloads with user study mode off', async () => {
    act(() => useSettingsStore.getState().updateSetting('userStudyMode', false))
    expect(useSettingsStore.getState().settings.userStudyMode).toBe(false)
    click('Condition 2: Lecture slidesLecture slides → GeoScratch')
    finishLectureSlides()
    click('Lecture slides questionnaire First')
    finishGeoScratch()
    click('GeoScratch Exercise questionnaire Second')
    click('Post-study Lecture slides first')
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(`userstudyLi.sessionExport.${window.localStorage.getItem('userstudyLi.currentResearchId')}`)).toBeNull()
    expect(host.textContent).not.toContain('Download study data (ZIP)')
    expect(window.localStorage.getItem('userstudyLi.lectureExerciseResponses')).toBeNull()
  })

  it('still downloads the archive if the final local backup exceeds browser storage', async () => {
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
    await act(async () => click('Post-study Lecture slides first'))
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
