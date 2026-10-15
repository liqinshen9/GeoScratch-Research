import { createFirebaseStudySession, updateFirebaseStudyOrder, saveFirebaseStudyRecord,
  saveFirebaseStudyRecovery, saveFirebaseStudyInteraction } from './studyFirebase'
import { acknowledgeStudyUpload, enqueueStudyUpload, pendingStudyUploads, readStudyBackup, saveStudyBackup, sealInteractionChunk } from '../session/studyRecoveryStore'
import { encodeInteractionChunk } from '../session/interactionCodec'

const running = new Map()
const delays = new Map()
export function flushStudyUploads(researchId, { force = false, enabled = () => true } = {}) {
  if (running.has(researchId)) {
    const active = running.get(researchId)
    return force ? active.then(async () => {
      if (!enabled() || delays.has(researchId)) return false
      return (await pendingStudyUploads(researchId)).length
        ? flushStudyUploads(researchId, { enabled }) : true
    }) : active
  }
  if (!force && (delays.get(researchId)?.until ?? 0) > Date.now()) return Promise.resolve(false)
  const operation = upload(researchId, enabled).then((saved) => {
    delays.delete(researchId)
    return saved
  }).catch(async (error) => {
    const failures = (delays.get(researchId)?.failures ?? 0) + 1
    const delay = error.code === 'resource-exhausted' ? 15 * 60 * 1000 : Math.min(5 * 60 * 1000, 15000 * 2 ** Math.min(failures, 5))
    delays.set(researchId, { failures, until: Date.now() + delay })
    await saveStudyBackup(researchId, { uploadError: { code: error.code ?? 'upload-error', message: error.message, at: new Date().toISOString() }, fullyUploaded: false })
    return false
  }).finally(() => running.delete(researchId))
  running.set(researchId, operation)
  return operation
}
async function upload(researchId, enabled) {
  if (!enabled() || navigator.onLine === false) return false
  let local = await readStudyBackup(researchId)
  if (!local) {
    if ((await pendingStudyUploads(researchId)).length) throw new Error('Pending study data has no recoverable session identity. Export its device backup before continuing.')
    return true
  }
  let remote = local.firebaseSession
  if (!remote?.path) {
    if (!enabled()) return false
    remote = await createFirebaseStudySession({ researchId, studyOrder: local.snapshot?.studyOrder ?? null,
      sessionId: local.firebaseSessionId })
    await saveStudyBackup(researchId, { firebaseSession: remote, remoteOrder: local.snapshot?.studyOrder ?? null })
  }
  local = await readStudyBackup(researchId)
  if (local.snapshot?.studyOrder && local.remoteOrder !== local.snapshot.studyOrder) {
    if (!enabled()) return false
    await updateFirebaseStudyOrder(remote, local.snapshot.studyOrder)
    await saveStudyBackup(researchId, { remoteOrder: local.snapshot.studyOrder })
  }
  // Only drain a bounded view of the queue. New actions can continue during an
  // upload; the next flush handles them without changing immutable chunk IDs.
  let entries = await pendingStudyUploads(researchId)
  const records = entries.filter((entry) => entry.kind === 'record')
  for (const entry of records) {
    if (!enabled()) return false
    await saveFirebaseStudyRecord(remote, entry.id, entry.data)
    await acknowledgeStudyUpload(entry)
  }
  const events = entries.filter((entry) => entry.kind === 'event')
  for (let offset = 0; offset < events.length;) {
    const group = [], first = events[offset]
    let size = 0
    while (offset < events.length && group.length < 100) {
      const entry = events[offset], bytes = new TextEncoder().encode(JSON.stringify(entry.data)).length
      if (group.length && (entry.data.exerciseId !== first.data.exerciseId || size + bytes > 180000)) break
      group.push(entry); size += bytes; offset++
    }
    const payload = encodeInteractionChunk(group.map((entry) => entry.data))
    const chunk = { eventId: `chunk-${first.data.eventId}`, researchId, type: 'interaction_chunk', schemaVersion: 3,
      exerciseId: first.data.exerciseId, conditionId: first.data.conditionId, occurredAt: first.data.occurredAt,
      streamId: first.data.streamId, sequence: first.data.sequence, eventCount: group.length, ...payload }
    await sealInteractionChunk(researchId, group, chunk)
  }
  entries = await pendingStudyUploads(researchId)
  for (const entry of entries.filter((item) => item.kind === 'chunk')) {
    if (!enabled()) return false
    await saveFirebaseStudyInteraction(remote, entry.data)
    await acknowledgeStudyUpload(entry)
  }
  // Write the completeness receipt last. It includes exact chunk IDs, so a
  // researcher can distinguish a complete history from a truncated download.
  let recovery = entries.find((entry) => entry.kind === 'recovery')
  if (!recovery && entries.some((entry) => entry.kind === 'chunk')) {
    const latest = await readStudyBackup(researchId)
    if (latest.lastUploadSnapshot) {
      await enqueueStudyUpload(researchId, 'recovery', 'current', latest.lastUploadSnapshot)
      recovery = (await pendingStudyUploads(researchId)).find((entry) => entry.kind === 'recovery')
    }
  }
  if (recovery) {
    const remaining = await pendingStudyUploads(researchId)
    const current = await readStudyBackup(researchId)
    const uploadedChunks = current.uploadedChunks ?? {}
    const uploadStatus = { schemaVersion: 3, uploadedChunks,
      uploadedEventCount: Object.values(uploadedChunks).reduce((sum, count) => sum + count, 0),
      pendingItems: remaining.filter((entry) => entry.key !== recovery.key || entry.version !== recovery.version).length,
      allAcknowledged: remaining.every((entry) => entry.key === recovery.key && entry.version === recovery.version) }
    if (!enabled()) return false
    await saveFirebaseStudyRecovery(remote, { ...recovery.data, uploadStatus }, recovery.version)
    await acknowledgeStudyUpload(recovery)
  }
  const remaining = await pendingStudyUploads(researchId)
  await saveStudyBackup(researchId, { fullyUploaded: remaining.length === 0, uploadError: null })
  return remaining.length === 0
}
