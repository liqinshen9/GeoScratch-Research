// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import ExerciseCountdown from './ExerciseCountdown'

it('expires a restored deadline once under StrictMode instead of skipping two exercises', () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  const host = document.createElement('div')
  const root = createRoot(host)
  const expired = vi.fn()
  try {
    const startedAt = new Date(Date.now() - 601000).toISOString()
    act(() => root.render(<StrictMode><ExerciseCountdown enabled limitSeconds={600} startedAt={startedAt} onTimeout={expired} /></StrictMode>))
    expect(expired).toHaveBeenCalledOnce()
    act(() => vi.advanceTimersByTime(10000))
    expect(expired).toHaveBeenCalledOnce()
  } finally {
    act(() => root.unmount())
    vi.useRealTimers()
    delete globalThis.IS_REACT_ACT_ENVIRONMENT
  }
})
