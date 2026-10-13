// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UserStudyLiPage from './UserStudyLiPage'

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

  it('saves lecture submissions with the session ID and offers a JSON download after the study', () => {
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
    const createObjectURL = vi.fn(() => 'blob:lecture-answers')
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() })
    const download = vi.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    click('Download lecture answers (JSON)')
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(download).toHaveBeenCalledOnce()
    expect(download.mock.instances[0].download).toContain('lecture-answers')
  })
})
