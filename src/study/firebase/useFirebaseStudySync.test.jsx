// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import useFirebaseStudySync from './useFirebaseStudySync'
import { createFirebaseStudySession, saveFirebaseStudyRecord, updateFirebaseStudyOrder } from './studyFirebase'

vi.mock('./studyFirebase', () => ({ createFirebaseStudySession: vi.fn(), saveFirebaseStudyRecord: vi.fn(), updateFirebaseStudyOrder: vi.fn(), saveFirebaseStudyRecovery: vi.fn(async () => {}) }))
vi.mock('../session/studyRecoveryStore', () => ({ saveStudyBackup: vi.fn(async () => {}) }))
let root, host
function Probe(props) {
  const sync = useFirebaseStudySync(props)
  props.onSync?.(sync)
  return <button onClick={() => props.onCommit ? props.onCommit(sync) : sync.retry()}>{sync.state}:{sync.count}</button>
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.resetAllMocks()
  createFirebaseStudySession.mockResolvedValue({ path: ['session-a'] })
  saveFirebaseStudyRecord.mockResolvedValue(undefined)
  updateFirebaseStudyOrder.mockResolvedValue(undefined)
  host = document.createElement('div'); document.body.append(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); delete globalThis.IS_REACT_ACT_ENVIRONMENT })
const render = async (props) => act(async () => { root.render(<Probe {...props} />) })

it('waits for the completed questionnaire and checkpoint to be acknowledged before resolving Next', async () => {
  let finish
  saveFirebaseStudyRecord.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const done = vi.fn()
  const submitted = [{ stageId: 'demographics', data: { status: 'submitted', answer: '25' } }]
  await render({ researchId: 'P1', records: [{ stageId: 'demographics', data: { status: 'draft' } }],
    onCommit: (sync) => void sync.commit(submitted, { phase: 'order' }, null).then(done) })
  await act(async () => host.querySelector('button').click())
  expect(done).not.toHaveBeenCalled()
  await act(async () => finish())
  expect(saveFirebaseStudyRecord).toHaveBeenLastCalledWith(expect.anything(), 'demographics', submitted[0].data)
  expect(done).toHaveBeenCalledWith(true)
})

it('refuses to confirm offline Next and preserves its record for reconnect', async () => {
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  const done = vi.fn()
  const records = [{ stageId: 'demographics', data: { status: 'submitted' } }]
  await render({ researchId: 'P1', records: [], onCommit: (sync) => void sync.commit(records, { phase: 'order' }, null).then(done) })
  await act(async () => host.querySelector('button').click())
  expect(done).toHaveBeenCalledWith(false)
  expect(saveFirebaseStudyRecord).not.toHaveBeenCalled()
  online.mockReturnValue(true)
  await act(async () => window.dispatchEvent(new Event('online')))
  expect(saveFirebaseStudyRecord).toHaveBeenCalledWith(expect.anything(), 'demographics', records[0].data)
})

it('saves demographics before study order and retries a failed upload without dropping data', async () => {
  const props = { researchId: 'P1', records: [{ stageId: 'demographics', data: { answer: '25' } }] }
  saveFirebaseStudyRecord.mockRejectedValueOnce({ code: 'unavailable' })
  await render(props)
  expect(createFirebaseStudySession).toHaveBeenCalledWith(expect.objectContaining({ researchId: 'P1', studyOrder: null }))
  expect(host.textContent).toBe('error:0')
  await act(async () => host.querySelector('button').click())
  expect(host.textContent).toBe('saved:1')
  expect(createFirebaseStudySession).toHaveBeenCalledTimes(1)
  expect(saveFirebaseStudyRecord).toHaveBeenCalledTimes(2)
  expect(saveFirebaseStudyRecord.mock.calls[1][2]).toEqual({ answer: '25' })
  await render({ ...props, studyOrder: 'lecture-first' })
  expect(saveFirebaseStudyRecord).toHaveBeenCalledTimes(2)
  expect(updateFirebaseStudyOrder).toHaveBeenCalledWith({ path: ['session-a'] }, 'lecture-first')
  expect(createFirebaseStudySession).toHaveBeenCalledTimes(1)
})

it('identifies a rejected post-study save and retries the same answers', async () => {
  let sync
  const data = { status: 'submitted', responses: [{ id: 'comments', answer: 'My final answer' }] }
  saveFirebaseStudyRecord.mockRejectedValueOnce({ code: 'resource-exhausted', message: 'Quota exceeded.' })
  await render({ researchId: 'P1', records: [{ stageId: 'post-study', data }], onSync: (value) => { sync = value } })
  expect(sync).toMatchObject({ state: 'error', code: 'resource-exhausted', failedSave: 'post-study', errorMessage: 'Quota exceeded.' })
  await act(async () => host.querySelector('button').click())
  expect(saveFirebaseStudyRecord).toHaveBeenLastCalledWith(expect.anything(), 'post-study', data)
  expect(sync.state).toBe('saved')
})

it('adds the selected order when it changes during the first demographics upload', async () => {
  let finish
  createFirebaseStudySession.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const props = { researchId: 'P1', records: [{ stageId: 'demographics', data: { answer: '25' } }] }
  await render(props)
  await render({ ...props, studyOrder: 'geoscratch-first' })
  await act(async () => finish({ path: ['session-a'] }))
  expect(createFirebaseStudySession).toHaveBeenCalledTimes(1)
  expect(updateFirebaseStudyOrder).toHaveBeenCalledWith({ path: ['session-a'] }, 'geoscratch-first')
  expect(saveFirebaseStudyRecord).toHaveBeenCalledTimes(1)
  expect(host.textContent).toBe('saved:1')
})

it('uploads the latest snapshot after an in-flight save without losing repeated submissions', async () => {
  let finish
  saveFirebaseStudyRecord.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const props = { researchId: 'P1', studyOrder: 'lecture-first' }
  await render({ ...props, records: [{ stageId: 'lecture-exercise-1', data: { submissions: [1] } }] })
  await render({ ...props, records: [{ stageId: 'lecture-exercise-1', data: { submissions: [1, 2] } }] })
  await act(async () => finish())
  expect(saveFirebaseStudyRecord.mock.calls.map(([, , data]) => data.submissions)).toEqual([[1], [1, 2]])
  expect(host.textContent).toBe('saved:1')
})

it('isolates a new research session from an unfinished previous session', async () => {
  let finish
  createFirebaseStudySession.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  createFirebaseStudySession.mockResolvedValue({ path: ['session-b'] })
  const props = { studyOrder: 'geoscratch-first', records: [{ stageId: 'demographics', data: {} }] }
  await render({ ...props, researchId: 'P1' })
  await render({ ...props, researchId: 'P2' })
  await act(async () => finish({ path: ['session-a'] }))
  expect(saveFirebaseStudyRecord.mock.calls.map(([session]) => session.path[0])).toEqual(['session-b'])
  expect(host.textContent).toBe('saved:1')
})

it('stops new writes while recording is off and resumes the same server session', async () => {
  const props = { researchId: 'P1', records: [{ stageId: 'demographics', data: { answer: 'recorded' } }] }
  await render(props)
  expect(createFirebaseStudySession).toHaveBeenCalledOnce()
  const count = saveFirebaseStudyRecord.mock.calls.length
  await render({ ...props, researchId: '', records: [] })
  await act(async () => host.querySelector('button').click())
  await act(async () => window.dispatchEvent(new Event('online')))
  expect(saveFirebaseStudyRecord).toHaveBeenCalledTimes(count)
  await render({ ...props, records: [...props.records, { stageId: 'post-study', data: { answer: 'new recorded answer' } }] })
  expect(createFirebaseStudySession).toHaveBeenCalledOnce()
  expect(saveFirebaseStudyRecord).toHaveBeenLastCalledWith({ path: ['session-a'] }, 'post-study', { answer: 'new recorded answer' })
})
