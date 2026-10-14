// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DemographicsQuestionnaire from './DemographicsQuestionnaire'
import ConditionQuestionnaire from './ConditionQuestionnaire'
import PostStudyQuestionnaire from './PostStudyQuestionnaire'
import { markQuestionnaireSubmitted, readQuestionnaireDraft, readSessionQuestionnaires } from '@/study/session/questionnaireDrafts'
vi.mock('@/study/session/studyStorage', () => ({ STUDY_PERSISTENCE_ENABLED: true }))

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  window.localStorage.clear()
  for (const key of ['userstudyLi.acceptResponses', 'userstudyLi.acceptConditionResponses', 'userstudyLi.acceptPostStudyResponses']) window.localStorage.setItem(key, 'true')
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  window.localStorage.clear()
  delete globalThis.IS_REACT_ACT_ENVIRONMENT
})

describe('questionnaire autosaving', () => {
  it('saves demographic choices without submission and restores them when revisited', () => {
    const onComplete = vi.fn(), onSave = vi.fn()
    const render = () => act(() => root.render(<DemographicsQuestionnaire researchId="session-1" onComplete={onComplete} onSave={onSave} />))
    render()
    const choice = host.querySelector('input[name="gender"]')
    act(() => choice.click())
    const answer = choice.value
    expect(readQuestionnaireDraft('session-1', 'demographics').answers.gender).toBe(answer)
    expect(onSave).not.toHaveBeenCalled()
    expect([...host.querySelectorAll('button')].some((button) => button.textContent === 'Skip questionnaire')).toBe(false)
    act(() => root.render(null))
    expect(readQuestionnaireDraft('session-1', 'demographics')).toMatchObject({ status: 'not-submitted', submittedAt: null })
    render()
    expect(host.querySelector(`input[name="gender"][value="${answer}"]`).checked).toBe(true)
  })

  it('saves the demographics questionnaire when Next is clicked, without offering Skip', () => {
    const onSave = vi.fn(), onComplete = vi.fn()
    act(() => root.render(<DemographicsQuestionnaire researchId="session-1" onComplete={onComplete} onSave={onSave} />))
    act(() => [...host.querySelectorAll('button')].find((button) => button.textContent === 'Next').click())
    expect(onSave).toHaveBeenCalledOnce()
    expect(onComplete).toHaveBeenCalledOnce()
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('route')
  })

  it('keeps partial condition answers separate for GeoScratch and lecture', () => {
    const render = (condition) => act(() => root.render(<ConditionQuestionnaire key={condition} researchId="session-1" condition={condition} conditionOrder="First" onComplete={() => {}} onSave={() => {}} />))
    render('GeoScratch Exercise')
    const textarea = host.querySelector('textarea')
    act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'Partial GeoScratch answer')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    render('Lecture slides')
    const previous = readQuestionnaireDraft('session-1', 'condition-geoscratch')
    expect(previous.status).toBe('not-submitted')
    expect(Object.values(previous.answers)).toContain('Partial GeoScratch answer')
    expect(Object.values(readQuestionnaireDraft('session-1', 'condition-lecture').answers)).not.toContain('Partial GeoScratch answer')
    expect(readSessionQuestionnaires('session-1')).toHaveLength(2)
  })

  it('marks the final questionnaire submitted without overwriting it during unmount', () => {
    const onComplete = vi.fn()
    const onSave = (payload) => markQuestionnaireSubmitted('session-1', 'post-study', payload)
    act(() => root.render(<PostStudyQuestionnaire researchId="session-1" conditionOrder="Lecture slides first" onComplete={onComplete} onSave={onSave} />))
    act(() => [...host.querySelectorAll('button')].find((button) => button.textContent === 'Submit session').click())
    expect(onComplete).toHaveBeenCalledOnce()
    act(() => root.render(null))
    const saved = readQuestionnaireDraft('session-1', 'post-study')
    expect(saved.status).toBe('submitted')
    expect(saved.submittedAt).toBeTruthy()
    expect(readSessionQuestionnaires('other-session')).toEqual([])
  })

  it('places tutorial effectiveness in usability Section A with a Not applicable response', () => {
    const onSave = vi.fn()
    act(() => root.render(<PostStudyQuestionnaire researchId="session-1" onComplete={() => {}} onSave={onSave} />))
    const options = [...host.querySelectorAll('input[name="tutorialEffectiveness"]')]
    expect(options).toHaveLength(6)
    expect(options[0].closest('section').querySelector('h2').textContent).toBe('Section A')
    act(() => options[5].click())
    act(() => [...host.querySelectorAll('button')].find((button) => button.textContent === 'Submit session').click())
    expect(onSave.mock.calls[0][0].answers.tutorialEffectiveness).toBe('Not applicable — I did not use the tutorial')
  })
})
