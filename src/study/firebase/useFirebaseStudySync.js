import { useCallback, useEffect, useRef, useState } from 'react'
import { readFirebaseStudyInteractions } from './studyFirebase'
import { flushStudyUploads } from './studyUploadQueue'
import { enqueueStudyUpload, listStudyBackups, pendingStudyUploads, readStudyBackup, saveStudyBackup, waitForStudyWrites } from '../session/studyRecoveryStore'
import { decodeInteractionChunk, expandInteractionSnapshots } from '../session/interactionCodec'

export default function useFirebaseStudySync({ researchId, studyOrder, records, initialSession }) {
  const current = useRef({})
  current.current = { researchId, studyOrder, records }
  const identities = useRef(new Map())
  const recorded = useRef(new Map())
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
  const upload = useCallback(async (force = false) => {
    const id = current.current.researchId
    if (!id) return false
    await ensureLocal(id)
    const enabled = () => current.current.researchId === id
    if (enabled()) setStatus((previous) => ({ ...previous, state: 'saving' }))
    const saved = await flushStudyUploads(id, { force, enabled })
    const local = await readStudyBackup(id)
    if (enabled()) setStatus({ state: saved ? 'saved' : navigator.onLine === false ? 'offline' : 'pending',
      count: (current.current.records ?? []).length, ...local?.uploadError })
    return saved
  }, [ensureLocal])
  useEffect(() => {
    if (!researchId) { setStatus({ state: 'idle', count: 0 }); return }
    const retry = async (failedOnly = false) => {
      try {
        for (const session of await listStudyBackups()) {
          if (!current.current.researchId) break
          const pending = await pendingStudyUploads(session.researchId)
          // Ordinary edits stay local until a deliberate upload boundary.
          // The slow timer only revisits failed/incomplete upload attempts.
          if (failedOnly && !session.uploadError && !pending.some((entry) => entry.kind !== 'event')) continue
          if (session.researchId === current.current.researchId) await upload()
          else if (pending.length) await flushStudyUploads(session.researchId, { enabled: () => Boolean(current.current.researchId) })
        }
      } catch (error) { setStatus({ state: 'local-error', errorMessage: error.message }) }
    }
    void ensureLocal(researchId).then(() => retry()).catch((error) => setStatus({ state: 'local-error', errorMessage: error.message }))
    const reconnect = () => { void retry() }
    window.addEventListener('online', reconnect)
    const timer = window.setInterval(() => { void retry(true) }, 5 * 60 * 1000)
    return () => { window.removeEventListener('online', reconnect); window.clearInterval(timer) }
  }, [researchId, ensureLocal, upload])
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
    try {
      await Promise.race([upload(true), new Promise((resolve) => { timer = window.setTimeout(resolve, 12000) })])
    } finally { window.clearTimeout(timer) }
    // A durable local commit permits progress even if the cloud is unavailable.
    return true
  }, [ensureLocal, upload])
  const writeInteraction = useCallback(async (event) => {
    const id = current.current.researchId
    if (!id || event.researchId !== id) return
    await ensureLocal(id)
    await enqueueStudyUpload(id, 'event', event.eventId, event)
  }, [ensureLocal])
  const readInteractions = useCallback(async () => {
    const id = current.current.researchId
    const local = await readStudyBackup(id)
    const pending = await pendingStudyUploads(id)
    const events = pending.flatMap((entry) => entry.kind === 'event' ? [entry.data]
      : entry.kind === 'chunk' ? decodeInteractionChunk(entry.data) : [])
    let uploaded = []
    if (local?.firebaseSession?.path) uploaded = await readFirebaseStudyInteractions(local.firebaseSession)
    const merged = [...new Map([...uploaded, ...events].map((event) => [event.eventId, event])).values()]
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.sequence - b.sequence)
    return expandInteractionSnapshots(merged)
  }, [])
  return { ...status, retry: () => upload(true), flush: upload, commit, writeInteraction, readInteractions }
}
