// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, expect, it, vi } from 'vitest'
import { flushStudyUploads } from './studyUploadQueue'
import * as firebase from './studyFirebase'
import { saveStudyBackup, readStudyBackup, enqueueStudyUpload, pendingStudyUploads } from '../session/studyRecoveryStore'
import { decodeInteractionChunk } from '../session/interactionCodec'
vi.mock('./studyFirebase', () => ({ createFirebaseStudySession: vi.fn(async ({ sessionId }) => ({ path: ['studyParticipants', 'owner', 'sessions', sessionId] })),
  updateFirebaseStudyOrder: vi.fn(async () => {}), saveFirebaseStudyRecord: vi.fn(async () => {}),
  saveFirebaseStudyRecovery: vi.fn(async () => {}), saveFirebaseStudyInteraction: vi.fn(async () => {}) }))
let id
beforeEach(async () => {
  vi.clearAllMocks(); id = crypto.randomUUID()
  await saveStudyBackup(id, { firebaseSessionId: `session-${id}`, snapshot: { researchId: id, phase: 'post', studyOrder: 'geoscratch-first' } })
})
async function event(number, researchId = id, exerciseId = 'point-plane-distance') {
  await enqueueStudyUpload(researchId, 'event', `e-${number}`, { eventId: `e-${number}`, researchId, exerciseId,
    conditionId: 'geoscratch', type: 'block_field_change', fieldName: 'X', oldValue: number, newValue: number + 1,
    occurredAt: '2026-10-16T00:00:00Z', streamId: 's', sequence: number })
}
it('packs 250 events into three writes, preserves per-participant separation, and records completeness last', async () => {
  for (let number = 0; number < 250; number++) await event(number)
  await event(999, 'another-participant')
  await enqueueStudyUpload(id, 'record', 'post-study', { answers: { comment: 'final' } })
  await enqueueStudyUpload(id, 'recovery', 'current', { researchId: id, phase: 'complete' })
  expect(await flushStudyUploads(id, { force: true })).toBe(true)
  expect(firebase.saveFirebaseStudyInteraction).toHaveBeenCalledTimes(3)
  const events = firebase.saveFirebaseStudyInteraction.mock.calls.flatMap(([, chunk]) => decodeInteractionChunk(chunk))
  expect(events).toHaveLength(250)
  expect(events.every((entry) => entry.researchId === id)).toBe(true)
  const receipt = firebase.saveFirebaseStudyRecovery.mock.calls.at(-1)[1].uploadStatus
  expect(receipt).toMatchObject({ allAcknowledged: true, uploadedEventCount: 250, pendingItems: 0 })
  expect(Object.keys(receipt.uploadedChunks)).toHaveLength(3)
  expect(await pendingStudyUploads(id)).toEqual([])
  expect(await pendingStudyUploads('another-participant')).toHaveLength(1)
})
it('retains a failed immutable chunk through a new event and retries the original ID without duplication', async () => {
  await event(1); await event(2)
  firebase.saveFirebaseStudyInteraction.mockRejectedValueOnce({ code: 'resource-exhausted', message: 'Quota exceeded.' })
  expect(await flushStudyUploads(id, { force: true })).toBe(false)
  const firstAttempt = firebase.saveFirebaseStudyInteraction.mock.calls[0][1]
  expect((await pendingStudyUploads(id))[0].kind).toBe('chunk')
  expect((await readStudyBackup(id)).fullyUploaded).toBe(false)
  await event(3)
  expect(await flushStudyUploads(id, { force: true })).toBe(true)
  expect(firebase.saveFirebaseStudyInteraction.mock.calls[1][1]).toEqual(firstAttempt)
  const unique = new Map(firebase.saveFirebaseStudyInteraction.mock.calls.map(([, chunk]) => [chunk.eventId, chunk]))
  expect([...unique.values()].flatMap(decodeInteractionChunk).map((item) => item.eventId)).toEqual(['e-1', 'e-2', 'e-3'])
  expect(await pendingStudyUploads(id)).toEqual([])
})
it('retains questionnaire and checkpoint when offline and retries the original session when online', async () => {
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  await enqueueStudyUpload(id, 'record', 'condition-1', { answer: 'survives' })
  expect(await flushStudyUploads(id, { force: true })).toBe(false)
  expect(firebase.saveFirebaseStudyRecord).not.toHaveBeenCalled()
  expect(await pendingStudyUploads(id)).toHaveLength(1)
  online.mockReturnValue(true)
  expect(await flushStudyUploads(id, { force: true })).toBe(true)
  expect(firebase.createFirebaseStudySession).toHaveBeenCalledWith(expect.objectContaining({ sessionId: `session-${id}` }))
  online.mockRestore()
})
it('does not mark recovery complete when a questionnaire upload fails', async () => {
  await enqueueStudyUpload(id, 'record', 'post-study', { answer: 'safe' })
  await enqueueStudyUpload(id, 'recovery', 'current', { researchId: id, phase: 'complete' })
  firebase.saveFirebaseStudyRecord.mockRejectedValueOnce({ code: 'resource-exhausted' })
  expect(await flushStudyUploads(id, { force: true })).toBe(false)
  expect(firebase.saveFirebaseStudyRecovery).not.toHaveBeenCalled()
  expect((await pendingStudyUploads(id)).map((entry) => entry.kind)).toEqual(['record', 'recovery'])
})
it('updates the completeness receipt when trailing events arrive after a boundary upload', async () => {
  await saveStudyBackup(id, { lastUploadSnapshot: { researchId: id, phase: 'complete' } })
  await event(1)
  expect(await flushStudyUploads(id, { force: true })).toBe(true)
  expect(firebase.saveFirebaseStudyRecovery.mock.calls.at(-1)[1].uploadStatus.uploadedEventCount).toBe(1)
  await event(2)
  expect(await flushStudyUploads(id, { force: true })).toBe(true)
  expect(firebase.saveFirebaseStudyRecovery.mock.calls.at(-1)[1].uploadStatus.uploadedEventCount).toBe(2)
})
