// @vitest-environment jsdom
vi.mock('@/study/firebase/studyFirebase', () => ({ createFirebaseStudySession: vi.fn(async () => ({ path: ['test'] })), saveFirebaseStudyRecord: vi.fn(async () => {}) }))
vi.mock('@/study/firebase/useFirebaseStudySync', () => ({ default: () => ({ state: 'idle', count: 0 }) }))
vi.mock('@/study/session/useStudyRecoveryBackup', () => ({ default: () => '' }))
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UserStudyLiPage from './UserStudyLiPage'
import { readSessionQuestionnaires } from '@/study/session/questionnaireDrafts'
import useSettingsStore from '@/store/useSettingsStore'
vi.mock('@/study/session/studyStorage', () => ({ STUDY_PERSISTENCE_ENABLED: true, clearStoredStudyData: () => {} }))

vi.mock('@/hooks/useThemeSync', () => ({ default: () => {} }))
vi.mock('@/store/useWorkspaceStore', () => ({ default: { getState: () => ({ setUserBlockScope: () => {} }) } }))
vi.mock('@/pages/ExercisePage', () => ({ default: ({ onNextExercise }) => <button onClick={onNextExercise}>Finish GeoScratch exercise</button> }))
vi.mock('./userStudyLi/TutorialWelcome', () => ({ default: ({ onSkip }) => <button onClick={onSkip}>Skip tutorial</button> }))
vi.mock('./userStudyLi/LectureSlides', () => ({ default: ({ onComplete }) => <button onClick={onComplete}>Finish lecture</button> }))

let root, host
function click(text) {
  const button = [...host.querySelectorAll('button')].find((item) => item.textContent === text)
  expect(button, text).toBeTruthy()
  act(() => button.click())
}
function answer(text) {
  const textarea = host.querySelector('textarea')
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, text)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  useSettingsStore.getState().resetSettings()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root.render(<UserStudyLiPage autoResume={false} />))
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.restoreAllMocks()
  localStorage.clear()
  delete globalThis.IS_REACT_ACT_ENVIRONMENT
})

describe('real study questionnaire navigation', () => {
  it('opens and submits the real post-study questionnaire even when all browser backups fail', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Storage full', 'QuotaExceededError') })
    click('Start new session')
    click('Next')
    click('Condition 2: Lecture slidesLecture slides → GeoScratch')
    click('Finish lecture')
    answer('Lecture feedback kept in memory')
    click('Next')
    click('Skip tutorial')
    click('Finish GeoScratch exercise')
    click('Finish GeoScratch exercise')
    click('Finish GeoScratch exercise')
    answer('GeoScratch feedback kept in memory')
    click('Next')
    expect(host.querySelector('h1').textContent).toBe('Post-Study Questionnaire')
    answer('Post-study answer kept in memory')
    click('Submit session')
    expect(host.querySelector('h1').textContent).toBe('Study session complete')
    const researchId = [...host.querySelectorAll('p')].find((node) => node.textContent.startsWith('Research ID: ')).textContent.slice('Research ID: '.length)
    const records = readSessionQuestionnaires(researchId)
    expect(Object.values(records.find((item) => item.questionnaireId === 'post-study').answers)).toContain('Post-study answer kept in memory')
  })
  it.each(['normal', 'backup quota', 'draft quota'])('reaches post-study after lecture then GeoScratch with %s', (mode) => {
    click('Start new session')
    const researchId = localStorage.getItem('userstudyLi.currentResearchId')
    click('Next')
    click('Condition 2: Lecture slidesLecture slides → GeoScratch')
    click('Finish lecture')
    answer('Lecture feedback')
    click('Next')
    click('Skip tutorial')
    click('Finish GeoScratch exercise')
    click('Finish GeoScratch exercise')
    click('Finish GeoScratch exercise')
    if (mode !== 'normal') {
      const original = Storage.prototype.setItem
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
        if (key === 'userstudyLi.conditionResponses' || (mode === 'draft quota' && key.startsWith('userstudyLi.questionnaireDrafts.'))) {
          throw new DOMException('Storage full', 'QuotaExceededError')
        }
        return original.call(this, key, value)
      })
    }
    answer('Important GeoScratch feedback')
    click('Next')
    expect(host.querySelector('h1').textContent).toBe('Post-Study Questionnaire')
    if (mode !== 'normal') expect(host.querySelector('[role="alert"]')).toBeTruthy()
    answer('Important post-study feedback')
    click('Submit session')
    expect(host.querySelector('h1').textContent).toBe('Study session complete')
    const records = readSessionQuestionnaires(researchId)
    expect(records.find((item) => item.questionnaireId === 'condition-geoscratch')).toMatchObject({ status: 'submitted' })
    expect(Object.values(records.find((item) => item.questionnaireId === 'condition-geoscratch').answers)).toContain('Important GeoScratch feedback')
    expect(Object.values(records.find((item) => item.questionnaireId === 'post-study').answers)).toContain('Important post-study feedback')
    const archive = JSON.parse(localStorage.getItem(`userstudyLi.sessionExport.${researchId}`))
    expect(archive.files.at(-1).data.responses.some((item) => item.answer === 'Important post-study feedback')).toBe(true)
    const copies = JSON.parse(localStorage.getItem('userstudyLi.conditionResponses'))
    expect(copies.every((item) => !('interactionLog' in item) && !('lectureExerciseResponses' in item))).toBe(true)
  })
})
