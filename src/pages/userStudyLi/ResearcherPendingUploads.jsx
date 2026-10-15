import { useEffect, useState } from 'react'
import { listStudyBackups, pendingStudyUploads, readStudyBackup } from '@/study/session/studyRecoveryStore'
import { flushStudyUploads } from '@/study/firebase/studyUploadQueue'
import { decodeInteractionChunk } from '@/study/session/interactionCodec'

export default function ResearcherPendingUploads() {
  const [sessions, setSessions] = useState([])
  const [message, setMessage] = useState('')
  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      const rows = await listStudyBackups()
      const data = await Promise.all(rows.map(async (session) => {
        const pending = await pendingStudyUploads(session.researchId)
        return { ...session, pendingCount: pending.length,
          pendingBytes: pending.reduce((sum, entry) => sum + entry.storedBytes, 0) }
      }))
      if (!cancelled) setSessions(data)
    }
    const changed = () => { void refresh().catch(() => { if (!cancelled) setMessage('Local recovery storage is unavailable.') }) }
    changed()
    window.addEventListener('geoscratch:study-backup-changed', changed)
    return () => { cancelled = true; window.removeEventListener('geoscratch:study-backup-changed', changed) }
  }, [])
  async function retry(id) {
    setMessage(`Retrying ${id}…`)
    try { setMessage(await flushStudyUploads(id, { force: true }) ? `${id}: pending uploads acknowledged.` : `${id}: upload remains pending.`) }
    catch (error) { setMessage(error.message) }
  }
  async function emergencyExport(id) {
    try {
      const session = await readStudyBackup(id), pendingUploads = await pendingStudyUploads(id)
      const data = { format: 'geoscratch-device-recovery-v1', exportedAt: new Date().toISOString(), session, pendingUploads,
        pendingInteractions: pendingUploads.flatMap((entry) => entry.kind === 'event' ? [entry.data]
          : entry.kind === 'chunk' ? decodeInteractionChunk(entry.data) : []),
        note: 'Contains the latest local progress and every pending upload. Previously acknowledged chunks remain in Firestore; combine by event ID when restoring.' }
      const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }))
      const anchor = document.createElement('a')
      anchor.href = url; anchor.download = `${id}-device-recovery.json`; document.body.append(anchor)
      try { anchor.click() } finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
    } catch (error) { setMessage(error.message) }
  }
  return <section aria-label="Researcher device recovery">
    <h2>Pending uploads on this device</h2>
    <p>These backups exist only in this browser. Uploaded interaction history remains in Firestore.</p>
    {sessions.length === 0 && <p>No local sessions found.</p>}
    {sessions.map((session) => <div key={session.researchId}>
      <p><strong>{session.researchId}</strong> · {session.pendingCount} pending items · {Math.ceil(session.pendingBytes / 1024)} KiB pending
        {session.fullyUploaded && session.pendingCount === 0 ? ' · All queued records acknowledged' : ' · Upload incomplete'}
        {session.snapshot?.phase === 'complete' ? ' · Study completed' : ' · Study in progress'}</p>
      {session.uploadError && <p>{session.uploadError.code}: {session.uploadError.message}</p>}
      <button type="button" onClick={() => retry(session.researchId)}>Retry {session.researchId}</button>
      <button type="button" onClick={() => emergencyExport(session.researchId)}>Emergency export {session.researchId}</button>
    </div>)}
    {message && <p role="status">{message}</p>}
  </section>
}
