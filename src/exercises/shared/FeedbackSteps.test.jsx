// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FeedbackSteps from './FeedbackSteps'

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  delete globalThis.IS_REACT_ACT_ENVIRONMENT
})
const click = (label) => act(() => [...host.querySelectorAll('button')].find((b) => b.textContent === label).click())

describe('feedback step interface', () => {
  it('counts each Check press and help opening, excluding help closing', () => {
    const onStepAction = vi.fn()
    act(() => root.render(<FeedbackSteps tasks={[["cube", "Cube"]]} feedback={{ cube: { message: 'Check centre.', detail: 'Use (1, 1, 1).' } }} onStepAction={onStepAction} />))
    click('Check'); click('Check'); click('More help'); click('More help'); click('More help')
    expect(onStepAction.mock.calls.map(([action]) => action)).toEqual([
      { action: 'check', stepKey: 'cube' }, { action: 'check', stepKey: 'cube' },
      { action: 'more-help', stepKey: 'cube' }, { action: 'more-help', stepKey: 'cube' },
    ])
  })
  it('reveals help on request and clears feedback after edits', () => {
    const props = { tasks: [['cube', 'Create cube']], steps: { cube: false },
      feedback: { cube: { message: 'Check Y.', detail: 'Use Y = 1.', blockId: 'cube-1' } } }
    act(() => root.render(<FeedbackSteps {...props} feedbackRevision={0} />))
    expect(host.textContent).not.toContain('Check Y.')
    click('Check')
    expect(host.textContent).toContain('Check Y.')
    expect(host.textContent).not.toContain('Use Y = 1.')
    click('More help')
    expect(host.textContent).toContain('Use Y = 1.')
    act(() => root.render(<FeedbackSteps {...props} feedbackRevision={1} />))
    expect(host.querySelector('[role="status"]')).toBeNull()
  })
  it('explains completed steps and preserves tutorial fallback hints', () => {
    act(() => root.render(<FeedbackSteps tasks={[['cube', 'Cube']]} steps={{ cube: true }} feedback={{ cube: { message: 'Centre and side length are correct.' } }} />))
    click('Complete')
    expect(host.textContent).toContain('Centre and side length are correct.')
    act(() => root.render(<FeedbackSteps tasks={[['head', 'Head']]} steps={{ head: false }} partialMessages={{ head: 'Check the radius.' }} feedbackRevision={1} />))
    click('Check')
    expect(host.textContent).toContain('Check the radius.')
  })
})
