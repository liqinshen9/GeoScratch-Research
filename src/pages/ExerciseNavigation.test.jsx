// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ExerciseNavigation from './ExerciseNavigation'

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
it('requires a pass for Next and prevents Previous in study mode, while allowing development navigation', () => {
  const onPrevious = vi.fn(), onNext = vi.fn()
  const render = (studyMode, passed) => act(() => root.render(<ExerciseNavigation {...{ studyMode, passed, onPrevious, onNext }} />))
  const previous = () => host.querySelector('[aria-label="Previous exercise"]')
  const next = () => host.querySelector('[aria-label="Next exercise"]')
  render(true, false)
  expect(previous().disabled).toBe(true)
  expect(next().disabled).toBe(true)
  act(() => { previous().click(); next().click() })
  expect(onPrevious).not.toHaveBeenCalled()
  expect(onNext).not.toHaveBeenCalled()
  render(true, true)
  expect(next().disabled).toBe(false)
  act(() => next().click())
  expect(onNext).toHaveBeenCalledOnce()
  expect(previous().disabled).toBe(true)
  render(false, false)
  expect(previous().disabled).toBe(false)
  expect(next().disabled).toBe(false)
  act(() => { previous().click(); next().click() })
  expect(onPrevious).toHaveBeenCalledOnce()
  expect(onNext).toHaveBeenCalledTimes(2)
})
