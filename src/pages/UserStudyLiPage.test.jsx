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
  expect(host.querySelector('h1').textContent).toBe('Lecture slides')
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
})
