// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ExerciseCountdown from './ExerciseCountdown'

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
  delete globalThis.IS_REACT_ACT_ENVIRONMENT
})
describe('GeoScratch countdown', () => {
  it('retains the original deadline after refresh instead of granting a new timer', () => {
    const onTimeout = vi.fn()
    const startedAt = new Date(Date.now() - 295000).toISOString()
    act(() => root.render(<ExerciseCountdown enabled limitSeconds={300} startedAt={startedAt} onTimeout={onTimeout} />))
    expect(host.textContent).toContain('0:05')
    expect(host.querySelector('.is-urgent')).toBeTruthy()
    act(() => vi.advanceTimersByTime(5000))
    expect(onTimeout).toHaveBeenCalledOnce()
  })
  it('marks the countdown as urgent below ten seconds, but not at ten seconds', () => {
    act(() => root.render(<ExerciseCountdown enabled limitSeconds={300} onTimeout={() => {}} />))
    act(() => vi.advanceTimersByTime(290000))
    expect(host.querySelector('[role="timer"]').classList.contains('is-urgent')).toBe(false)
    act(() => vi.advanceTimersByTime(1000))
    expect(host.querySelector('[role="timer"]').classList.contains('is-urgent')).toBe(true)
    expect(host.textContent).toContain('0:09')
  })
  it.each([300, 600])('expires exactly once after %s seconds', (limitSeconds) => {
    const onTimeout = vi.fn()
    act(() => root.render(<ExerciseCountdown enabled limitSeconds={limitSeconds} onTimeout={onTimeout} />))
    expect(host.textContent).toContain(`${limitSeconds / 60}:00`)
    act(() => vi.advanceTimersByTime((limitSeconds - 1) * 1000))
    expect(host.textContent).toContain('0:01')
    expect(onTimeout).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1000))
    expect(onTimeout).toHaveBeenCalledOnce()
    act(() => vi.advanceTimersByTime(10000))
    expect(onTimeout).toHaveBeenCalledOnce()
  })
  it('does not start until enabled and cancels when study mode is turned off', () => {
    const onTimeout = vi.fn()
    const render = (enabled) => act(() => root.render(<ExerciseCountdown enabled={enabled} limitSeconds={300} onTimeout={onTimeout} />))
    render(false)
    act(() => vi.advanceTimersByTime(600000))
    expect(host.querySelector('[role="timer"]')).toBeNull()
    expect(onTimeout).not.toHaveBeenCalled()
    render(true)
    act(() => vi.advanceTimersByTime(1000))
    expect(host.textContent).toContain('4:59')
    render(false)
    act(() => vi.advanceTimersByTime(600000))
    expect(onTimeout).not.toHaveBeenCalled()
  })
  it('uses elapsed wall time after returning from a background tab', () => {
    const onTimeout = vi.fn()
    act(() => root.render(<ExerciseCountdown enabled limitSeconds={300} onTimeout={onTimeout} />))
    vi.setSystemTime(Date.now() + 301000)
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(onTimeout).toHaveBeenCalledOnce()
  })
  it('does not restart when the parent supplies a new callback', () => {
    const first = vi.fn(), latest = vi.fn()
    act(() => root.render(<ExerciseCountdown enabled limitSeconds={300} onTimeout={first} />))
    act(() => vi.advanceTimersByTime(200000))
    act(() => root.render(<ExerciseCountdown enabled limitSeconds={300} onTimeout={latest} />))
    act(() => vi.advanceTimersByTime(100000))
    expect(first).not.toHaveBeenCalled()
    expect(latest).toHaveBeenCalledOnce()
  })
})
