// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import useFirebaseStudySync from './useFirebaseStudySync'
import * as firebase from './studyFirebase'
import { pendingStudyUploads, readStudyBackup } from '../session/studyRecoveryStore'
vi.mock('./studyFirebase', () => ({ createFirebaseStudySession: vi.fn(async ({ sessionId }) => ({ path: ['studyParticipants', 'owner', 'sessions', sessionId] })),
  saveFirebaseStudyRecord: vi.fn(async () => {}), updateFirebaseStudyOrder: vi.fn(async () => {}), saveFirebaseStudyRecovery: vi.fn(async () => {}),
  saveFirebaseStudyInteraction: vi.fn(async () => {}), readFirebaseStudyInteractions: vi.fn(async () => []) }))
let root, host, sync, id
function Probe(props) { sync = useFirebaseStudySync(props); return <p>{sync.state}</p> }
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  id = crypto.randomUUID()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); delete globalThis.IS_REACT_ACT_ENVIRONMENT })
async function render(props = {}) {
  await act(async () => root.render(<Probe researchId={id} records={[]} {...props} />))
  if (props.researchId !== '') await act(async () => { await vi.waitFor(() => expect(firebase.createFirebaseStudySession).toHaveBeenCalled()) })
}
it('does not upload questionnaire drafts as they are edited', async () => {
  await render({ records: [{ stageId: 'post-study', data: { status: 'draft', answer: 'typing' } }] })
  expect(firebase.saveFirebaseStudyRecord).not.toHaveBeenCalled()
  expect(firebase.saveFirebaseStudyRecovery).not.toHaveBeenCalled()
})
it('does not periodically upload ordinary interaction edits, but uploads them on an explicit flush', async () => {
  const timers = vi.spyOn(window, 'setInterval')
  await render()
  await act(async () => sync.writeInteraction({ eventId: 'ordinary-edit', researchId: id,
    exerciseId: 'point-plane-distance', conditionId: 'geoscratch', type: 'block_field_change',
    streamId: 's', sequence: 1, occurredAt: new Date().toISOString(), oldValue: 1, newValue: 2 }))
  expect(timers.mock.calls.some(([, interval]) => interval === 15000)).toBe(false)
  const retry = timers.mock.calls.find(([, interval]) => interval === 5 * 60 * 1000)[0]
  await act(async () => { retry(); await new Promise((resolve) => setTimeout(resolve, 30)) })
  expect(firebase.saveFirebaseStudyInteraction).not.toHaveBeenCalled()
  expect((await pendingStudyUploads(id)).some((entry) => entry.data.eventId === 'ordinary-edit')).toBe(true)
  await act(async () => sync.flush(true))
  expect(firebase.saveFirebaseStudyInteraction).toHaveBeenCalledOnce()
  expect(await pendingStudyUploads(id)).toEqual([])
})
it('persists submitted answers before uploading and waits for the immediate attempt', async () => {
  await render()
  let finish
  firebase.saveFirebaseStudyRecord.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  let committed = false
  const submitted = [{ stageId: 'post-study', data: { status: 'submitted', answer: 'My answers' } }]
  let operation
  await act(async () => { operation = sync.commit(submitted, { phase: 'complete' }, null).then(() => { committed = true }) })
  await act(async () => { await vi.waitFor(() => expect(finish).toBeTypeOf('function')) })
  expect(committed).toBe(false)
  expect((await pendingStudyUploads(id)).some((item) => item.data.answer === 'My answers')).toBe(true)
  await act(async () => { finish(); await operation })
  expect(await pendingStudyUploads(id)).toEqual([])
  expect((await readStudyBackup(id)).snapshot.phase).toBe('complete')
})
it('allows a locally safe submission when quota is exhausted and retries the same data later', async () => {
  await render()
  firebase.saveFirebaseStudyRecord.mockRejectedValueOnce({ code: 'resource-exhausted', message: 'Quota exceeded.' })
  await act(async () => expect(await sync.commit([{ stageId: 'post-study', data: { answer: 'Must survive' } }], { phase: 'complete' }, null)).toBe(true))
  expect((await pendingStudyUploads(id)).find((entry) => entry.kind === 'record').data.answer).toBe('Must survive')
  expect((await readStudyBackup(id)).fullyUploaded).toBe(false)
  await act(async () => expect(await sync.retry()).toBe(true))
  expect(await pendingStudyUploads(id)).toEqual([])
  expect(firebase.saveFirebaseStudyRecord.mock.calls.map(([, , data]) => data.answer)).toEqual(['Must survive', 'Must survive'])
})
it('keeps the original session ID on refresh and restores pending records offline', async () => {
  await render()
  const sessionId = (await readStudyBackup(id)).firebaseSessionId
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  await act(async () => sync.commit([{ stageId: 'condition-1', data: { answer: 'offline answer' } }], { phase: 'post' }, null))
  await act(async () => { root.unmount(); root = createRoot(host); root.render(<Probe researchId={id} records={[]} />) })
  expect((await readStudyBackup(id)).firebaseSessionId).toBe(sessionId)
  expect((await pendingStudyUploads(id)).some((entry) => entry.data.answer === 'offline answer')).toBe(true)
})
it('does not write when recording is disabled and leaves the existing queue intact', async () => {
  await render()
  await render({ researchId: '' })
  const count = firebase.saveFirebaseStudyRecord.mock.calls.length
  await act(async () => sync.commit([{ stageId: 'post-study', data: { answer: 'preview' } }], {}, null))
  expect(firebase.saveFirebaseStudyRecord).toHaveBeenCalledTimes(count)
  expect(await pendingStudyUploads(id)).toEqual([])
})
