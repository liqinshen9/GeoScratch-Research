import { useCallback, useEffect, useRef, useState } from 'react'
import { readFirebaseStudyInteractions } from './studyFirebase'
import { flushStudyUploads } from './studyUploadQueue'
import { enqueueStudyUpload, listStudyBackups, pendingStudyUploads, readStudyBackup, saveStudyBackup, waitForStudyWrites, deleteConfirmedStudyBackup } from '../session/studyRecoveryStore'
import { decodeInteractionChunk, expandInteractionSnapshots } from '../session/interactionCodec'
import { pendingUploadDetails } from './pendingUploadDetails'
import { clearSessionLocalStorage } from '../session/studyStorage'

export default function useFirebaseStudySync({ researchId, studyOrder, records, initialSession }) {
  const current = useRef({})
  current.current = { researchId, studyOrder, records }
  const identities = useRef(new Map())
  const recorded = useRef(new Map())
  const uploadedSessions = useRef(new Map())
  const [status, setStatus] = useState({ state: 'idle', count: 0 })
  const ensureLocal = useCallback(async (id) => {
    let identity = identities.current.get(id)
    if (!identity) {
      identity = (async () => {
        const existing = await readStudyBackup(id)
        await saveStudyBackup(id, { firebaseSessionId: existing?.firebaseSessionId
          ?? initialSession?.path?.at(-1) ?? initialSession?.sessionId ?? crypto.randomUUID(),
          ...(existing?.firebaseSession ? {} : initialSession?.path ? { firebaseSession: initialSession } : {}) })
      })()
      identities.current.set(id, identity)
      identity.catch(() => identities.current.delete(id))
    }
    await identity
  }, [initialSession])
  const clearCompletedBackup = useCallback(async (researchId = current.current.researchId) => {
    if (!researchId) return false
    await waitForStudyWrites(researchId)
    const local = await readStudyBackup(researchId)
    if (local?.snapshot?.phase !== 'complete' || !local.fullyUploaded || local.uploadError
      || local.lastAcknowledgedRecovery?.phase !== 'complete' || !local.lastAcknowledgedRecovery.allAcknowledged
      || !local.firebaseSession?.path) return false
    uploadedSessions.current.set(researchId, local.firebaseSession)
    clearSessionLocalStorage(researchId)
    return deleteConfirmedStudyBackup(researchId)
  }, [])
  const upload = useCallback(async (force = false) => {
    const id = current.current.researchId
    if (!id) return false
    await ensureLocal(id)
    const enabled = () => current.current.researchId === id
    if (enabled()) setStatus((previous) => ({ ...previous, state: 'saving' }))
    const timer = window.setTimeout(() => {
      if (enabled()) setStatus((previous) => ({ ...previous, state: 'pending',
        warning: { code: 'upload-unconfirmed', message: 'Firebase has not confirmed the upload after 12 seconds.' } }))
      void Promise.all([pendingStudyUploads(id), readStudyBackup(id)]).then(([entries, local]) => {
        if (enabled()) setStatus(previous => ({ ...previous, pendingItems: pendingUploadDetails(entries, Boolean(local?.firebaseSession?.path)) }))
      }).catch(() => {})
    }, 12000)
    try {
      const saved = await flushStudyUploads(id, { force, enabled })
      const local = await readStudyBackup(id)
      const pending = await pendingStudyUploads(id)
      const complete = saved && local?.fullyUploaded === true && pending.length === 0
      // A flush takes a bounded queue snapshot. New actions can remain buffered
      // after Firebase acknowledges that batch; they are not an upload failure.
      const offline = !complete && navigator.onLine === false
      const warning = complete ? null : local?.uploadError ?? (offline ? { code: 'offline' } : null)
      if (enabled()) setStatus({ state: complete ? 'saved' : offline ? 'offline' : warning ? 'pending' : 'buffered',
        count: (current.current.records ?? []).length, ...local?.uploadError,
        warning, pendingItems: pendingUploadDetails(pending, Boolean(local?.firebaseSession?.path)),
        receiptVersion: local?.lastAcknowledgedRecovery?.version })
      return complete
    } catch (error) {
      if (enabled()) setStatus({ state: 'local-error', errorMessage: error.message })
      throw error
    } finally { window.clearTimeout(timer) }
  }, [ensureLocal])
  useEffect(() => {
    if (!researchId) { setStatus({ state: 'idle', count: 0 }); return }
    const retry = async (failedOnly = false) => {
      try {
        for (const session of await listStudyBackups()) {
          if (!current.current.researchId) break
          const pending = await pendingStudyUploads(session.researchId)
          // Ordinary edits stay local until a deliberate upload boundary.
          // Retry failures and drain every trailing event once a study finishes.
          // Ordinary exercise edits still wait for an upload boundary.
          if (failedOnly && !session.uploadError && !pending.some((entry) => entry.kind !== 'event')
            && !(session.snapshot?.phase === 'complete' && pending.length)) continue
          if (session.researchId === current.current.researchId) await upload()
          else if (pending.length) {
            const saved = await flushStudyUploads(session.researchId, { enabled: () => Boolean(current.current.researchId) })
            if (saved) await clearCompletedBackup(session.researchId)
          }
        }
      } catch (error) { setStatus({ state: 'local-error', errorMessage: error.message }) }
    }
    void ensureLocal(researchId).then(() => retry()).catch((error) => setStatus({ state: 'local-error', errorMessage: error.message }))
    const reconnect = () => { void retry() }
    const disconnected = () => setStatus((previous) => ({ ...previous, state: 'offline', warning: { code: 'offline' } }))
    window.addEventListener('online', reconnect)
    window.addEventListener('offline', disconnected)
    const timer = window.setInterval(() => { void retry(true) }, 15000)
    return () => { window.removeEventListener('online', reconnect); window.removeEventListener('offline', disconnected); window.clearInterval(timer) }
  }, [researchId, ensureLocal, upload, clearCompletedBackup])
  const commit = useCallback(async (nextRecords, snapshot, order) => {
    const id = current.current.researchId
    if (!id) return false
    await ensureLocal(id)
    await waitForStudyWrites(id)
    await saveStudyBackup(id, { snapshot: { ...snapshot, researchId: id, studyOrder: order ?? snapshot.studyOrder },
      lastUploadSnapshot: { ...snapshot, researchId: id, studyOrder: order ?? snapshot.studyOrder } })
    for (const { stageId, data } of nextRecords) {
      const key = `${id}:${stageId}`, json = JSON.stringify(data)
      if (recorded.current.get(key) === json) continue
      await enqueueStudyUpload(id, 'record', stageId, data)
      recorded.current.set(key, json)
    }
    await enqueueStudyUpload(id, 'recovery', 'current', { ...snapshot, researchId: id, studyOrder: order ?? snapshot.studyOrder })
    let timer
    let saved = false
    try {
      saved = await Promise.race([upload(true), new Promise((resolve) => { timer = window.setTimeout(() => resolve(false), 12000) })])
    } finally { window.clearTimeout(timer) }
    if (!saved && current.current.researchId === id) {
      const [entries, local] = await Promise.all([pendingStudyUploads(id), readStudyBackup(id)])
      setStatus(previous => ({ ...previous, pendingItems: pendingUploadDetails(entries, Boolean(local?.firebaseSession?.path)),
        warning: previous.warning ?? { code: 'upload-unconfirmed' } }))
    }
    // Progress is safe after the durable local commit, even if cloud retry fails.
    return true
  }, [ensureLocal, upload])
  const writeInteraction = useCallback(async (event) => {
    const id = current.current.researchId
    if (!id || event.researchId !== id) return
    await ensureLocal(id)
    await enqueueStudyUpload(id, 'event', event.eventId, event)
    if (current.current.researchId === id) setStatus((previous) => previous.state === 'saved'
      ? { ...previous, state: 'buffered' } : previous)
  }, [ensureLocal])
  const readInteractions = useCallback(async () => {
    const id = current.current.researchId
    const local = await readStudyBackup(id)
    const pending = await pendingStudyUploads(id)
    const events = pending.flatMap((entry) => entry.kind === 'event' ? [entry.data]
      : entry.kind === 'chunk' ? decodeInteractionChunk(entry.data) : [])
    let uploaded = []
    const remote = local?.firebaseSession ?? uploadedSessions.current.get(id)
    if (remote?.path) uploaded = await readFirebaseStudyInteractions(remote)
    const merged = [...new Map([...uploaded, ...events].map((event) => [event.eventId, event])).values()]
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.sequence - b.sequence)
    return expandInteractionSnapshots(merged)
  }, [])
  return { ...status, retry: () => upload(true), flush: upload, commit, writeInteraction, readInteractions, clearCompletedBackup }
}
