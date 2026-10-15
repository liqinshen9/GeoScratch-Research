// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import LectureSlides from './LectureSlides'

let root, host
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  host = document.createElement('div'); document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount()); host.remove()
  vi.useRealTimers()
  delete globalThis.IS_REACT_ACT_ENVIRONMENT
})

it('retains the deadline across refresh and expires once at the original ten-minute limit', () => {
  const onExerciseTimeout = vi.fn()
  const timings = [{ exerciseId: 'cube-point-pivot-rotation', startedAt: new Date(Date.now() - 480000).toISOString() }]
  const render = (key) => act(() => root.render(<LectureSlides key={key} timerEnabled requireSubmission timings={timings} onExerciseTimeout={onExerciseTimeout} />))
  render('before-refresh')
  expect(host.querySelector('[role="timer"]').textContent).toContain('2:00')
  act(() => vi.advanceTimersByTime(60000))
  render('after-refresh')
  expect(host.querySelector('[role="timer"]').textContent).toContain('1:00')
  act(() => vi.advanceTimersByTime(60000))
  expect(onExerciseTimeout).toHaveBeenCalledExactlyOnceWith('cube-point-pivot-rotation')
  expect(host.querySelector('h1').textContent).toContain('Exercise 2:')
  act(() => vi.advanceTimersByTime(60000))
  expect(onExerciseTimeout).toHaveBeenCalledTimes(1)
})

it('immediately expires a recovered second exercise whose deadline passed while the page was closed', () => {
  const onExerciseTimeout = vi.fn()
  act(() => root.render(<LectureSlides initialExercise={2} timerEnabled requireSubmission onExerciseTimeout={onExerciseTimeout}
    timings={[{ exerciseId: 'point-plane-distance', startedAt: new Date(Date.now() - 660000).toISOString() }]} />))
  expect(onExerciseTimeout).toHaveBeenCalledExactlyOnceWith('point-plane-distance')
  act(() => vi.advanceTimersByTime(10000))
  expect(onExerciseTimeout).toHaveBeenCalledTimes(1)
})

it('retains the submission requirement on refresh and recognises a previously submitted answer', () => {
  act(() => root.render(<LectureSlides requireSubmission drafts={{ 'cube-point-pivot-rotation': 'B' }} />))
  const next = [...host.querySelectorAll('button')].find((button) => button.textContent === 'Next')
  expect(next.getAttribute('aria-disabled')).toBe('true')
  expect(host.textContent).not.toContain('Submit an answer to continue.')
  act(() => next.click())
  expect(host.textContent).toContain('Submit an answer to continue.')
  expect(host.querySelector('h1').textContent).toContain('Exercise 1:')
  act(() => root.render(<LectureSlides key="recovered" requireSubmission initialExercise={2}
    drafts={{ 'point-plane-distance': 'dot-product' }} submittedExerciseIds={['point-plane-distance']} />))
  expect([...host.querySelectorAll('button')].find((button) => button.textContent === 'Continue to questionnaire').getAttribute('aria-disabled')).toBe('false')
  expect(host.textContent).not.toContain('Submit an answer to continue.')
})

it('does not time out lecture exercises outside study mode', () => {
  const onExerciseTimeout = vi.fn()
  act(() => root.render(<LectureSlides onExerciseTimeout={onExerciseTimeout} />))
  act(() => vi.advanceTimersByTime(1200000))
  expect(host.querySelector('[role="timer"]')).toBeNull()
  expect(onExerciseTimeout).not.toHaveBeenCalled()
})
