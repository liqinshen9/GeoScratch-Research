// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import useStudyInteractionTracking from './useStudyInteractionTracking'

let host, root, latest
function TrackingView({ context }) {
  latest = useStudyInteractionTracking('warning-scope', context)
  return <p>{latest.storageError || 'No tracking warning'}</p>
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  const original = Storage.prototype.setItem
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
    if (key.startsWith('userstudyLi.interactions.')) throw new Error('quota')
    return original.call(this, key, value)
  })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.restoreAllMocks()
  localStorage.clear()
  delete globalThis.IS_REACT_ACT_ENVIRONMENT
})
it('keeps tutorial logging errors off lecture and exercise pages while preserving pending records', () => {
  const render = (context) => act(() => root.render(<TrackingView context={context} />))
  render({ phase: 'geoscratch', conditionId: 'geoscratch', exerciseId: 'tutorial' })
  expect(host.textContent).toContain('Interaction records could not be saved locally')
  for (const exerciseId of ['create-complex-object', 'cube-point-pivot-rotation', 'point-plane-distance']) {
    render({ phase: 'geoscratch', conditionId: 'geoscratch', exerciseId })
    expect(host.textContent).toBe('No tracking warning')
  }
  render({ phase: 'lecture', conditionId: 'lecture', exerciseId: 'cube-point-pivot-rotation' })
  expect(host.textContent).toBe('No tracking warning')
  let records
  act(() => { records = latest.read() })
  expect(records.some((entry) => entry.exerciseId === 'tutorial')).toBe(true)
  render({ phase: 'complete', conditionId: null, exerciseId: null })
  expect(host.textContent).toBe('No tracking warning')
})
