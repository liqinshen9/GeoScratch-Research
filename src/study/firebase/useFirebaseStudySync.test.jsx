// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import useFirebaseStudySync from './useFirebaseStudySync'
import * as firebase from './studyFirebase'
import { pendingStudyUploads, readStudyBackup } from '../session/studyRecoveryStore'
import { decodeInteractionChunk } from '../session/interactionCodec'
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
  const retry = timers.mock.calls.find(([, interval]) => interval === 15000)[0]
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
it('keeps the full browser backup when quota prevents uploading and continues the study', async () => {
  await render()
  firebase.saveFirebaseStudyRecord.mockRejectedValueOnce({ code: 'resource-exhausted', message: 'Quota exceeded.' })
  await act(async () => expect(await sync.commit([{ stageId: 'post-study', data: { answer: 'Must survive' } }],
    { phase: 'complete' }, null)).toBe(true))
  expect((await pendingStudyUploads(id)).find((entry) => entry.kind === 'record').data.answer).toBe('Must survive')
  expect((await readStudyBackup(id)).fullyUploaded).toBe(false)
  expect((await readStudyBackup(id)).snapshot.phase).toBe('complete')
  expect(sync.pendingItems).toContain('Post-study questionnaire')
  await act(async () => expect(await sync.retry()).toBe(true))
  expect(await pendingStudyUploads(id)).toEqual([])
  expect(firebase.saveFirebaseStudyRecord.mock.calls.map(([, , data]) => data.answer)).toEqual(['Must survive', 'Must survive'])
})
it('retains the browser backup when confirmation times out, allowing study completion', async () => {
  await render()
  const timers = vi.spyOn(window, 'setTimeout')
  let finish, operation
  firebase.saveFirebaseStudyRecord.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await act(async () => { operation = sync.commit([{ stageId: 'post-study', data: { answer: 'Preserved' } }],
    { phase: 'complete' }, null) })
  await act(async () => { await vi.waitFor(() => expect(finish).toBeTypeOf('function')) })
  await act(async () => {
    for (const [callback, delay] of timers.mock.calls) if (delay === 12000) callback()
    expect(await operation).toBe(true)
  })
  expect((await readStudyBackup(id)).snapshot.phase).toBe('complete')
  expect(sync.pendingItems).toContain('Post-study questionnaire')
  await act(async () => { finish(); await vi.waitFor(async () => expect(await pendingStudyUploads(id)).toEqual([])) })
  expect((await readStudyBackup(id)).snapshot.phase).toBe('complete')
})
it('retains the cloud reference for downloads after a confirmed completed backup is removed', async () => {
  await render()
  await act(async () => sync.commit([{ stageId: 'post-study', data: { answer: 'Confirmed' } }], { researchId: id, phase: 'complete' }, null))
  const remote = (await readStudyBackup(id)).firebaseSession
  await act(async () => expect(await sync.clearCompletedBackup()).toBe(true))
  expect(await readStudyBackup(id)).toBeNull()
  firebase.readFirebaseStudyInteractions.mockResolvedValueOnce([{ eventId: 'remote-event', researchId: id,
    exerciseId: 'point-plane-distance', type: 'click', occurredAt: '2026-10-17T00:00:00Z', streamId: 's', sequence: 1 }])
  expect((await sync.readInteractions())[0].eventId).toBe('remote-event')
  expect(firebase.readFirebaseStudyInteractions).toHaveBeenCalledWith(remote)
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
it('keeps authentication failure visible during retry and clears it only after acknowledgment', async () => {
  await render()
  firebase.saveFirebaseStudyRecord.mockRejectedValueOnce({ code: 'auth/network-request-failed', message: 'Network request failed.' })
  await act(async () => sync.commit([{ stageId: 'post-study', data: { answer: 'Keep my response' } }], { phase: 'complete' }, null))
  expect(sync.warning.code).toBe('auth/network-request-failed')
  let finish
  firebase.saveFirebaseStudyRecord.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  let retry
  await act(async () => { retry = sync.retry(); await vi.waitFor(() => expect(finish).toBeTypeOf('function')) })
  expect(sync.state).toBe('saving')
  expect(sync.warning.code).toBe('auth/network-request-failed')
  await act(async () => { finish(); await retry })
  expect(sync.state).toBe('saved')
  expect(sync.warning).toBeNull()
  expect(await pendingStudyUploads(id)).toEqual([])
})
it('warns when initial Firebase authentication prevents session creation', async () => {
  firebase.createFirebaseStudySession.mockRejectedValueOnce({ code: 'auth/network-request-failed', message: 'Authentication connection failed.' })
  await render()
  await act(async () => { await vi.waitFor(() => expect(sync.warning?.code).toBe('auth/network-request-failed')) })
  expect((await readStudyBackup(id)).uploadError.code).toBe('auth/network-request-failed')
  await act(async () => sync.retry())
  expect(sync.warning).toBeNull()
  expect(sync.state).toBe('saved')
})
it('does not warn when new interactions arrive during a successfully acknowledged batch', async () => {
  await render()
  const event = (number) => ({ eventId: `edit-${number}`, researchId: id,
    exerciseId: 'point-plane-distance', conditionId: 'geoscratch', type: 'block_field_change',
    streamId: 's', sequence: number, occurredAt: new Date().toISOString() })
  await act(async () => sync.writeInteraction(event(1)))
  let finish, operation
  firebase.saveFirebaseStudyInteraction.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  await act(async () => { operation = sync.flush(); await vi.waitFor(() => expect(finish).toBeTypeOf('function')) })
  await act(async () => sync.writeInteraction(event(2)))
  await act(async () => { finish(); expect(await operation).toBe(false) })
  expect(sync.state).toBe('buffered')
  expect(sync.warning).toBeNull()
  expect((await readStudyBackup(id)).uploadError).toBeNull()
  expect((await pendingStudyUploads(id)).map(x => x.id)).toEqual(['edit-2'])
  await act(async () => sync.flush())
  expect(sync.state).toBe('saved')
  expect(sync.warning).toBeNull()
  expect(firebase.saveFirebaseStudyInteraction.mock.calls.flatMap(([, chunk]) => decodeInteractionChunk(chunk)).map(e => e.eventId)).toEqual(['edit-1', 'edit-2'])
})
it('clears a genuine warning after successful retry even if a newer interaction remains buffered', async () => {
  await render()
  firebase.saveFirebaseStudyRecord.mockRejectedValueOnce({ code: 'auth/network-request-failed', message: 'Connection failed.' })
  await act(async () => sync.commit([{ stageId: 'post-study', data: { answer: 'Saved locally' } }], { phase: 'complete' }, null))
  expect(sync.warning.code).toBe('auth/network-request-failed')
  let finish, operation
  firebase.saveFirebaseStudyRecord.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  await act(async () => { operation = sync.retry(); await vi.waitFor(() => expect(finish).toBeTypeOf('function')) })
  expect(sync.warning.code).toBe('auth/network-request-failed')
  await act(async () => sync.writeInteraction({ eventId: 'new-edit', researchId: id,
    exerciseId: 'point-plane-distance', conditionId: 'geoscratch', type: 'click',
    streamId: 's', sequence: 1, occurredAt: new Date().toISOString() }))
  await act(async () => { finish(); expect(await operation).toBe(false) })
  expect(sync.warning).toBeNull()
  expect(sync.state).toBe('buffered')
  expect((await pendingStudyUploads(id)).map(x => x.id)).toEqual(['new-edit'])
  expect(firebase.saveFirebaseStudyRecovery).toHaveBeenCalled()
  await act(async () => sync.flush())
})
it('warns immediately when the browser goes offline', async () => {
  await render()
  await act(async () => window.dispatchEvent(new Event('offline')))
  expect(sync.warning.code).toBe('offline')
  expect(sync.state).toBe('offline')
})
it('warns when an upload stalls and clears after the late acknowledgment', async () => {
  await render()
  const timers = vi.spyOn(window, 'setTimeout')
  let finish
  firebase.saveFirebaseStudyRecord.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  let operation
  await act(async () => { operation = sync.commit([{ stageId: 'post-study', data: { answer: 'Slow connection' } }], { phase: 'complete' }, null) })
  await act(async () => { await vi.waitFor(() => expect(finish).toBeTypeOf('function')) })
  const timeout = timers.mock.calls.filter(([, delay]) => delay === 12000).at(-1)[0]
  await act(async () => timeout())
  expect(sync.warning.code).toBe('upload-unconfirmed')
  expect((await pendingStudyUploads(id)).some(x => x.kind === 'record')).toBe(true)
  await act(async () => { finish(); await operation })
  expect(sync.warning).toBeNull()
})
it('does not write when recording is disabled and leaves the existing queue intact', async () => {
  await render()
  await render({ researchId: '' })
  const count = firebase.saveFirebaseStudyRecord.mock.calls.length
  await act(async () => sync.commit([{ stageId: 'post-study', data: { answer: 'preview' } }], {}, null))
  expect(firebase.saveFirebaseStudyRecord).toHaveBeenCalledTimes(count)
  expect(await pendingStudyUploads(id)).toEqual([])
})
it('automatically retries a transient failure after backoff without a manual Retry click', async () => {
  const timers = vi.spyOn(window, 'setInterval')
  await render()
  firebase.saveFirebaseStudyRecord.mockRejectedValueOnce({ code: 'auth/network-request-failed', message: 'Temporary failure' })
  await act(async () => sync.commit([{ stageId: 'post-study', data: { answer: 'Keep and retry' } }], { phase: 'post' }, null))
  expect(sync.warning.code).toBe('auth/network-request-failed')
  const later = Date.now() + 31000
  vi.spyOn(Date, 'now').mockReturnValue(later)
  const retry = timers.mock.calls.find(([, interval]) => interval === 15000)[0]
  await act(async () => retry())
  await vi.waitFor(async () => {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
    expect(sync.state).toBe('saved')
  })
  expect(sync.warning).toBeNull()
  expect(await pendingStudyUploads(id)).toEqual([])
  expect(firebase.saveFirebaseStudyRecord.mock.calls.filter(([, , data]) => data.answer === 'Keep and retry')).toHaveLength(2)
})
it('automatically drains trailing interaction events after completion', async () => {
  const timers = vi.spyOn(window, 'setInterval')
  await render()
  await act(async () => sync.commit([], { phase: 'complete' }, null))
  await act(async () => sync.writeInteraction({ eventId: 'last-screen-leave', researchId: id,
    exerciseId: 'point-plane-distance', conditionId: 'geoscratch', type: 'screen_leave',
    streamId: 's', sequence: 1, occurredAt: new Date().toISOString() }))
  expect(sync.state).toBe('buffered')
  const retry = timers.mock.calls.find(([, interval]) => interval === 15000)[0]
  await act(async () => retry())
  await vi.waitFor(async () => {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
    expect(sync.state).toBe('saved')
  })
  expect(await pendingStudyUploads(id)).toEqual([])
  expect(firebase.saveFirebaseStudyRecovery.mock.calls.filter(([, snapshot]) => snapshot.researchId === id).at(-1)[1].uploadStatus)
    .toMatchObject({ allAcknowledged: true, uploadedEventCount: 1, pendingItems: 0 })
})
