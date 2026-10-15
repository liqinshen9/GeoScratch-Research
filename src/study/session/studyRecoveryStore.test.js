import 'fake-indexeddb/auto'
import { expect, it } from 'vitest'
import { saveStudyBackup, readStudyBackup, enqueueStudyUpload, pendingStudyUploads, acknowledgeStudyUpload,
  saveQuestionnaireBackup, setActiveStudySession, readActiveStudySession, sealInteractionChunk } from './studyRecoveryStore'
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
