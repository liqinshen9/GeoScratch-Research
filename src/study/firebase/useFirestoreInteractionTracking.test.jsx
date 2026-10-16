// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as Blockly from 'blockly/core'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import useFirestoreInteractionTracking from './useFirestoreInteractionTracking'
import { expandInteractionSnapshots } from '../session/interactionCodec'
import { installWorkspaceStudyTracking } from '../session/workspaceTracking'

Blockly.defineBlocksWithJsonArray([
  { type: 'timeout_tracking_number', message0: 'value %1', args0: [{ type: 'field_number', name: 'VALUE', value: 0 }], output: 'Number' },
  { type: 'timeout_tracking_parent', message0: 'input %1', args0: [{ type: 'input_value', name: 'INPUT' }] },
])

let root, host, workspace, tracking
const context = { phase: 'geoscratch', conditionId: 'geoscratch', exerciseId: 'cube-point-pivot-rotation', studyOrder: 'lecture-first' }
function Probe({ writeInteraction, current = context, researchId = 'DIRECT1', flushUploads }) {
  tracking = useFirestoreInteractionTracking({ researchId, context: current, writeInteraction, flushUploads })
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
it.each([false, true])('captures a timeout with the exact nested workspace, unfinished edits and passed=%s', async (passed) => {
  const write = vi.fn(async () => {}), flushUploads = vi.fn(async () => true)
  await act(async () => root.render(<Probe writeInteraction={write} flushUploads={flushUploads} />))
  const observer = installWorkspaceStudyTracking(workspace, { runtimeId: 'userstudy-Li-DIRECT1-cube-point-pivot-rotation' })
  try {
    const parent = workspace.newBlock('timeout_tracking_parent')
    const number = workspace.newBlock('timeout_tracking_number')
    parent.getInput('INPUT').connection.connect(number.outputConnection)
    observer.snapshot('initial')
    await act(async () => {
      window.dispatchEvent(new CustomEvent('geoscratch:exercise-evaluation', { detail: {
        ...context, passed, correct: passed, steps: { rotate: passed }, feedback: { rotate: { message: passed ? 'Correct' : 'Use 90 degrees' } },
      } }))
      number.setFieldValue(90, 'VALUE')
      tracking.capture('step_check', { stepKey: 'rotate' })
      tracking.capture('exercise_timeout', { result: { passed, timedOut: true, completionReason: 'timeout' } })
    })
    await tracking.flush()
    const events = write.mock.calls.map(([event]) => event)
    const timeout = events.find((event) => event.type === 'exercise_timeout')
    expect(timeout).toMatchObject({ outcome: passed ? 'passed' : 'failed', timedOut: true,
      stepContext: { rotate: passed }, evaluation: { passed, correct: passed },
      snapshot: { state: { blocks: { blocks: [expect.objectContaining({ inputs: {
        INPUT: { block: expect.objectContaining({ fields: { VALUE: 90 } }) },
      } })] } } },
    })
    expect(events.find((event) => event.type === 'step_check').outcome).toBe(passed ? 'passed' : 'failed')
    expect(events.find((event) => event.type === 'block_field_change' && event.fieldName === 'VALUE')).toMatchObject({ oldValue: 0, newValue: 90 })
    expect(flushUploads).toHaveBeenCalledWith(true)
  } finally { observer.stop() }
})
it('passes events to the durable writer with step context and boundary snapshots', async () => {
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
  expect(host.textContent).toContain('could not back up an interaction')
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
it('stores exact workspace changes between checkpoints and retains repeated Check attempts and their feedback', async () => {
  const write = vi.fn(async () => {}), flushUploads = vi.fn(async () => true)
  await act(async () => root.render(<Probe writeInteraction={write} flushUploads={flushUploads} />))
  const before = { format: 'blockly-json', state: { blocks: [{ id: 'rotation', fields: { AXIS: 'X', DEGREES: 90 } }] } }
  const after = { format: 'blockly-json', state: { blocks: [{ id: 'rotation', fields: { AXIS: 'Y', DEGREES: 90 } }] } }
  await act(async () => {
    window.dispatchEvent(new CustomEvent('geoscratch:study-event', { detail: { type: 'workspace_snapshot', details: { reason: 'initial', snapshot: before }, context } }))
    window.dispatchEvent(new CustomEvent('geoscratch:study-event', { detail: { type: 'block_field_change', details: { blockId: 'rotation', fieldName: 'AXIS', oldValue: 'X', newValue: 'Y' }, context } }))
    window.dispatchEvent(new CustomEvent('geoscratch:study-event', { detail: { type: 'workspace_snapshot', details: { reason: 'after-change', snapshot: after }, context } }))
    const evaluation = { ...context, steps: { rotate: false }, feedback: { rotate: { message: 'Use Y instead of X' } }, passed: false }
    window.dispatchEvent(new CustomEvent('geoscratch:exercise-evaluation', { detail: evaluation }))
    window.dispatchEvent(new CustomEvent('geoscratch:exercise-evaluation', { detail: evaluation }))
    tracking.capture('step_check', { stepKey: 'rotate' })
    tracking.capture('step_check', { stepKey: 'rotate' })
  })
  const events = write.mock.calls.map(([event]) => event)
  const patch = events.find((event) => event.type === 'workspace_patch')
  expect(patch).not.toHaveProperty('snapshot')
  expect(expandInteractionSnapshots(events).find((event) => event.eventId === patch.eventId).snapshot).toEqual(after)
  expect(events.filter((event) => event.type === 'exercise_evaluation')).toHaveLength(1)
  expect(events.filter((event) => event.type === 'step_check')).toHaveLength(2)
  expect(events.find((event) => event.type === 'block_field_change')).toMatchObject({ fieldName: 'AXIS', oldValue: 'X', newValue: 'Y' })
  expect(events.find((event) => event.type === 'step_check').evaluation.feedback.rotate.message).toBe('Use Y instead of X')
  expect(flushUploads).toHaveBeenCalledWith(true)
})
