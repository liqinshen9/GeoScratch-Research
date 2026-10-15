import { useCallback, useEffect, useRef, useState } from 'react'
import { createFirebaseStudySession, saveFirebaseStudyRecord, updateFirebaseStudyOrder, saveFirebaseStudyRecovery, saveFirebaseStudyInteraction, readFirebaseStudyInteractions } from './studyFirebase'
import { saveStudyBackup } from '../session/studyRecoveryStore'

// Keep a compact latest record per stage until the server acknowledges it.
// A failure leaves the latest record available for retry while this tab stays open.
export default function useFirebaseStudySync({ researchId, studyOrder, records, recoverySnapshot, initialSession }) {
  const active = useRef(null)
  const recording = useRef(researchId)
  recording.current = researchId
  const [status, setStatus] = useState({ state: 'idle', count: 0 })
  const serialized = JSON.stringify([...records, ...(recoverySnapshot ? [{ stageId: '@recovery', data: recoverySnapshot }] : [])])
  const flush = useCallback((session) => {
    if (!recording.current || recording.current !== session.researchId) return Promise.resolve(false)
    const orderPending = () => session.remote && session.studyOrder && session.remoteOrder !== session.studyOrder
    if (session.running) return session.operation
    if (!session.pending.size && !orderPending()) return Promise.resolve(true)
    if (navigator.onLine === false) { setStatus({ state: 'offline', count: session.saved.size }); return Promise.resolve(false) }
    session.running = true
    session.operation = (async () => {
    const publish = (value) => { if (active.current === session) setStatus(value) }
    let saving = 'study session'
    publish({ state: 'saving', count: session.saved.size })
    try {
      if (!session.remote) {
        const order = session.studyOrder ?? null
        await saveStudyBackup(session.researchId, { firebaseSessionId: session.sessionId }).catch(() => {})
        session.remote = await createFirebaseStudySession({ researchId: session.researchId, studyOrder: order, sessionId: session.sessionId })
        session.remoteOrder = order
        await saveStudyBackup(session.researchId, { firebaseSession: { ...session.remote, studyOrder: order } }).catch(() => {})
      }
      while (session.pending.size || orderPending()) {
        if (recording.current !== session.researchId) return false
        if (orderPending()) {
          saving = 'study order'
          const order = session.studyOrder
          await updateFirebaseStudyOrder(session.remote, order)
          session.remoteOrder = order
          await saveStudyBackup(session.researchId, { firebaseSession: { ...session.remote, studyOrder: order } }).catch(() => {})
          continue
        }
        const [stageId, json] = session.pending.entries().next().value
        saving = stageId === '@recovery' ? 'study checkpoint' : stageId
        if (stageId === '@recovery') await saveFirebaseStudyRecovery(session.remote, JSON.parse(json))
        else { await saveFirebaseStudyRecord(session.remote, stageId, JSON.parse(json)); session.saved.set(stageId, json) }
        if (session.pending.get(stageId) === json) session.pending.delete(stageId)
      }
      publish({ state: 'saved', count: session.saved.size })
      return true
    } catch (error) {
      publish({ state: 'error', count: session.saved.size, code: error.code ?? 'connection-error',
        failedSave: saving, errorMessage: error.message ?? 'Firebase did not confirm the save.' })
      return false
    } finally { session.running = false }
    })()
    return session.operation
  }, [])

  useEffect(() => {
    // Keep the existing server identity while recording is switched off so
    // re-enabling it cannot create a duplicate session for the same research ID.
    if (!researchId) { setStatus({ state: 'idle', count: 0 }); return }
    if (active.current?.researchId !== researchId) {
      active.current = { researchId, studyOrder, pending: new Map(), saved: new Map(),
        remote: initialSession?.path ? initialSession : null, remoteOrder: initialSession?.studyOrder ?? null,
        sessionId: initialSession?.path?.at(-1) ?? initialSession?.sessionId ?? crypto.randomUUID(), running: false }
      setStatus({ state: 'idle', count: 0 })
    }
    const session = active.current
    session.studyOrder = studyOrder
    for (const { stageId, data } of JSON.parse(serialized)) {
      const json = JSON.stringify(data)
      if (session.saved.get(stageId) !== json) session.pending.set(stageId, json)
    }
    void flush(session)
  }, [researchId, studyOrder, serialized, flush, initialSession])

  useEffect(() => {
    const retry = () => { if (active.current) void flush(active.current) }
    const offline = () => setStatus((previous) => ({ ...previous, state: 'offline' }))
    window.addEventListener('online', retry)
    window.addEventListener('offline', offline)
    const timer = window.setInterval(retry, 15000)
    return () => { window.clearInterval(timer); window.removeEventListener('online', retry); window.removeEventListener('offline', offline) }
  }, [flush])

  const retry = useCallback(() => { if (active.current) void flush(active.current) }, [flush])
  const commit = useCallback(async (nextRecords, snapshot, order) => {
    const session = active.current
    if (!session) return false
    if (order != null) session.studyOrder = order
    for (const { stageId, data } of [...nextRecords, { stageId: '@recovery', data: snapshot }]) {
      const json = JSON.stringify(data)
      if (stageId === '@recovery' || session.saved.get(stageId) !== json) session.pending.set(stageId, json)
    }
    let timer
    try {
      return await Promise.race([flush(session), new Promise((resolve) => { timer = window.setTimeout(() => resolve(false), 12000) })])
    } finally { window.clearTimeout(timer) }
  }, [flush])
  const writeInteraction = useCallback(async (event) => {
    const session = active.current
    if (!recording.current || recording.current !== event.researchId) return
    if (!session || session.researchId !== event.researchId) throw new Error('The interaction has no active study session.')
    if (!session.remote) await flush(session)
    if (!session.remote) throw new Error('The study session could not be saved to Firebase.')
    await saveFirebaseStudyInteraction(session.remote, event)
  }, [flush])
  const readInteractions = useCallback(async () => {
    const session = active.current
    if (!session?.remote) return []
    return readFirebaseStudyInteractions(session.remote)
  }, [])
  return { ...status, retry, commit, writeInteraction, readInteractions }
}
