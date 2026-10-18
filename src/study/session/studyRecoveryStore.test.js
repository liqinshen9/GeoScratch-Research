import 'fake-indexeddb/auto'
import { expect, it } from 'vitest'
import { saveStudyBackup, readStudyBackup, enqueueStudyUpload, pendingStudyUploads, acknowledgeStudyUpload,
  saveQuestionnaireBackup, setActiveStudySession, readActiveStudySession, sealInteractionChunk, finishStudyUpload, deleteConfirmedStudyBackup } from './studyRecoveryStore'
it('persists answers, nested workspaces, and the same session identity across recovery', async () => {
  await Promise.all([
    saveStudyBackup('RECOVERY1', { snapshot: { phase: 'demographics', answers: { age: '25' }, workspace: { nested: [1, 2] } } }),
    saveStudyBackup('RECOVERY1', { firebaseSession: { path: ['owner', 'session'] } }),
    saveStudyBackup('RECOVERY2', { snapshot: { answers: { age: '30' } } }),
  ])
  await setActiveStudySession('RECOVERY1')
  expect(await readActiveStudySession()).toMatchObject({ firebaseSession: { path: ['owner', 'session'] },
    snapshot: { phase: 'demographics', answers: { age: '25' }, workspace: { nested: [1, 2] } } })
  expect((await readStudyBackup('RECOVERY2')).snapshot.answers.age).toBe('30')
  expect(await readStudyBackup('DOESNOTEXIST')).toBeNull()
})
it('keeps newer answers pending when an older upload finishes', async () => {
  await enqueueStudyUpload('RACE', 'record', 'post-study', { answer: 'old' })
  const [old] = await pendingStudyUploads('RACE')
  await enqueueStudyUpload('RACE', 'record', 'post-study', { answer: 'new' })
  await acknowledgeStudyUpload(old)
  expect((await pendingStudyUploads('RACE'))[0].data.answer).toBe('new')
})
it('restores the most recent questionnaire edit even before the page snapshot updates', async () => {
  await saveStudyBackup('DRAFT', { snapshot: { phase: 'post', questionnaires: [] } })
  await saveQuestionnaireBackup('DRAFT', { questionnaireId: 'post-study', rawAnswers: { comment: 'Latest typing' } })
  expect((await readStudyBackup('DRAFT')).snapshot.questionnaires[0].rawAnswers.comment).toBe('Latest typing')
})
it('compresses large local workspaces while returning the exact recovery state', async () => {
  const snapshot = { phase: 'geoscratch', savedXml: { exercise: '<block type="nested" />'.repeat(10000) } }
  await saveStudyBackup('COMPRESSED', { snapshot })
  expect((await readStudyBackup('COMPRESSED')).snapshot).toEqual(snapshot)
  await enqueueStudyUpload('COMPRESSED', 'event', 'large', { eventId: 'large', snapshot })
  const [entry] = await pendingStudyUploads('COMPRESSED')
  expect(entry.data.snapshot).toEqual(snapshot)
  expect(entry.storedBytes).toBeLessThan(10000)
})
it('cannot seal an overlapping second-tab chunk after the first tab claimed those events', async () => {
  await enqueueStudyUpload('TABS', 'event', 'one', { eventId: 'one', sequence: 1 })
  const entries = await pendingStudyUploads('TABS')
  const chunk = { eventId: 'chunk-one', eventCount: 1 }
  expect(await sealInteractionChunk('TABS', entries, chunk)).toBe(true)
  expect(await sealInteractionChunk('TABS', entries, { ...chunk, eventCount: 99 })).toBe(false)
  expect((await pendingStudyUploads('TABS'))[0].data.eventCount).toBe(1)
})
it('invalidates upload completion when new data arrives and only marks an empty queue complete', async () => {
  const id = 'COMPLETION-RACE'
  await saveStudyBackup(id, { fullyUploaded: true })
  await enqueueStudyUpload(id, 'record', 'post-study', { answer: 'pending' })
  expect((await readStudyBackup(id)).fullyUploaded).toBe(false)
  expect(await finishStudyUpload(id)).toBe(false)
  await acknowledgeStudyUpload((await pendingStudyUploads(id))[0])
  const finish = finishStudyUpload(id)
  const newEvent = enqueueStudyUpload(id, 'event', 'later', { eventId: 'later' })
  await Promise.all([finish, newEvent])
  expect((await readStudyBackup(id)).fullyUploaded).toBe(false)
  expect(await pendingStudyUploads(id)).toHaveLength(1)
})
it('removes only a completed confirmed study, retaining failed studies and a different active participant', async () => {
  const id = 'CLEAN-SUCCESS', other = 'KEEP-FAILED'
  const confirmed = { snapshot: { phase: 'complete' }, firebaseSession: { path: ['studyParticipants', 'owner', 'sessions', 'one'] },
    fullyUploaded: true, lastAcknowledgedRecovery: { phase: 'complete', allAcknowledged: true, version: 'receipt' } }
  await saveStudyBackup(id, confirmed)
  await saveStudyBackup(other, { ...confirmed, fullyUploaded: false, uploadError: { code: 'resource-exhausted' } })
  await setActiveStudySession(other)
  expect(await deleteConfirmedStudyBackup(other)).toBe(false)
  expect(await deleteConfirmedStudyBackup(id)).toBe(true)
  expect(await readStudyBackup(id)).toBeNull()
  expect((await readActiveStudySession()).researchId).toBe(other)
  expect((await readStudyBackup(other)).uploadError.code).toBe('resource-exhausted')
})
it('refuses cleanup without final acknowledgment or with a pending upload, then removes the matching active pointer', async () => {
  const id = 'CLEAN-GUARDS'
  await saveStudyBackup(id, { snapshot: { phase: 'complete' }, fullyUploaded: true,
    firebaseSession: { path: ['studyParticipants', 'owner', 'sessions', 'guard'] } })
  expect(await deleteConfirmedStudyBackup(id)).toBe(false)
  await saveStudyBackup(id, { lastAcknowledgedRecovery: { phase: 'complete', allAcknowledged: true } })
  await enqueueStudyUpload(id, 'event', 'late', { eventId: 'late' })
  await saveStudyBackup(id, { fullyUploaded: true })
  expect(await deleteConfirmedStudyBackup(id)).toBe(false)
  await acknowledgeStudyUpload((await pendingStudyUploads(id))[0])
  await setActiveStudySession(id)
  expect(await deleteConfirmedStudyBackup(id)).toBe(true)
  expect(await readActiveStudySession()).toBeNull()
})
