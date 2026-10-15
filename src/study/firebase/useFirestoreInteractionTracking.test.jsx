// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as Blockly from 'blockly/core'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import useFirestoreInteractionTracking from './useFirestoreInteractionTracking'

let root, host, workspace, tracking
const context = { phase: 'geoscratch', conditionId: 'geoscratch', exerciseId: 'cube-point-pivot-rotation', studyOrder: 'lecture-first' }
function Probe({ writeInteraction, current = context, researchId = 'DIRECT1' }) {
  tracking = useFirestoreInteractionTracking({ researchId, context: current, writeInteraction })
  return <p>{tracking.error}</p>
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  workspace = new Blockly.Workspace()
  useWorkspaceStore.getState().setWorkspace(workspace)
  host = document.createElement('div'); document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount()); host.remove(); workspace.dispose()
  useWorkspaceStore.getState().setWorkspace(null)
  vi.restoreAllMocks()
  delete globalThis.IS_REACT_ACT_ENVIRONMENT
})
it('sends each interaction immediately with step context and nested snapshots without storing browser history', async () => {
  const store = vi.spyOn(Storage.prototype, 'setItem')
  const write = vi.fn(async () => {})
  await act(async () => root.render(<Probe writeInteraction={write} />))
  await act(async () => window.dispatchEvent(new CustomEvent('geoscratch:exercise-evaluation', { detail: {
    ...context, passed: false, correct: false, steps: { pipeline: true, rotate: false }, feedback: {},
  } })))
  await act(async () => tracking.capture('exercise_timeout', { result: { timedOut: true } }))
  const events = write.mock.calls.map(([event]) => event)
  expect(events.find((event) => event.type === 'step_completed')).toMatchObject({ stepKey: 'pipeline', snapshot: { format: 'blockly-json' } })
  expect(events.find((event) => event.type === 'exercise_timeout')).toMatchObject({ researchId: 'DIRECT1', exerciseId: context.exerciseId,
    stepContext: { pipeline: true, rotate: false }, result: { timedOut: true }, snapshot: { format: 'blockly-json' } })
  expect(await tracking.flush()).toBe(true)
  expect(store).not.toHaveBeenCalled()
})
it('reports rejected database writes and does not report unsaved history as acknowledged', async () => {
  await act(async () => root.render(<Probe writeInteraction={vi.fn(async () => { throw new Error('offline') })} />))
  expect(host.textContent).toContain('could not be saved to Firebase')
  expect(await tracking.flush()).toBe(false)
})

it('does not send cleanup, clicks, checks, or evaluations after recording is disabled', async () => {
  const write = vi.fn(async () => {})
  await act(async () => root.render(<Probe writeInteraction={write} />))
  const count = write.mock.calls.length
  await act(async () => root.render(<Probe researchId="" writeInteraction={write} />))
  await act(async () => {
    tracking.capture('step_check', { stepKey: 'rotate' })
    document.body.click()
    window.dispatchEvent(new CustomEvent('geoscratch:exercise-evaluation', { detail: { ...context, steps: { rotate: true } } }))
  })
  expect(write).toHaveBeenCalledTimes(count)
})
it('waits for outstanding database acknowledgments and excludes tutorial and lecture activity', async () => {
  const write = vi.fn(async () => {})
  await act(async () => root.render(<Probe writeInteraction={write} current={{ phase: 'lecture', conditionId: 'lecture' }} />))
  expect(write).not.toHaveBeenCalled()
  await act(async () => root.render(<Probe writeInteraction={write} />))
  let acknowledge
  write.mockImplementationOnce(() => new Promise((resolve) => { acknowledge = resolve }))
  await act(async () => tracking.capture('step_check', { stepKey: 'rotate' }))
  const done = vi.fn()
  const waiting = tracking.flush().then(done)
  await Promise.resolve()
  expect(done).not.toHaveBeenCalled()
  await act(async () => acknowledge())
  await waiting
  expect(done).toHaveBeenCalledWith(true)
})
