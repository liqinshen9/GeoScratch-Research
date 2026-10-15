import { encodeInteractionChunk, decodeInteractionChunk } from './interactionCodec'

const DATABASE = 'geoscratch-study-recovery'
let database
function packSession(session) {
  for (const field of ['snapshot', 'lastUploadSnapshot']) {
    if (!(field in session)) continue
    delete session[`${field}Compressed`]
    if (JSON.stringify(session[field]).length > 50000) {
      session[`${field}Compressed`] = encodeInteractionChunk([session[field]])
      if (field === 'snapshot') session.snapshotSummary = { phase: session[field].phase, studyOrder: session[field].studyOrder }
      delete session[field]
    }
  }
  return session
}
function unpackSession(session) {
  for (const field of ['snapshot', 'lastUploadSnapshot']) {
    if (!session?.[`${field}Compressed`]) continue
    session[field] = decodeInteractionChunk(session[`${field}Compressed`])[0]
    delete session[`${field}Compressed`]
  }
  return session
}
const localWrites = new Map()
export function trackStudyWrite(researchId, promise) {
  const writes = localWrites.get(researchId) ?? new Set()
  localWrites.set(researchId, writes)
  writes.add(promise)
  promise.finally(() => writes.delete(promise)).catch(() => {})
  return promise
}
export async function waitForStudyWrites(researchId) {
  while (localWrites.get(researchId)?.size) await Promise.all([...localWrites.get(researchId)])
}
function openDatabase() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 3)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('sessions')) request.result.createObjectStore('sessions', { keyPath: 'researchId' })
      if (!request.result.objectStoreNames.contains('uploads')) request.result.createObjectStore('uploads', { keyPath: 'key' })
      const uploads = request.transaction.objectStore('uploads')
      if (!uploads.indexNames.contains('researchId')) uploads.createIndex('researchId', 'researchId')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }).catch((error) => { database = undefined; throw error })
  return database
}
async function transaction(stores, action, mode = 'readwrite') {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode)
    let result
    action(tx, (value) => { result = value })
    tx.oncomplete = () => { resolve(result); if (mode === 'readwrite') globalThis.window?.dispatchEvent(new Event('geoscratch:study-backup-changed')) }
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}
export function saveStudyBackup(researchId, patch) {
  if (!researchId) return Promise.resolve()
  return trackStudyWrite(researchId, transaction(['sessions'], (tx) => {
    const store = tx.objectStore('sessions')
    const request = store.get(researchId)
    request.onsuccess = () => store.put(packSession({ ...request.result, ...patch, researchId, updatedAt: new Date().toISOString() }))
  }))
}
export async function readStudyBackup(researchId) {
  return transaction(['sessions'], (tx, result) => {
    const request = tx.objectStore('sessions').get(researchId)
    request.onsuccess = () => {
      const session = unpackSession(request.result ?? null)
      if (session?.snapshot && session.questionnaireDrafts) {
        session.snapshot.questionnaires = Object.values({
          ...Object.fromEntries((session.snapshot.questionnaires ?? []).map((q) => [q.questionnaireId, q])),
          ...session.questionnaireDrafts,
        })
      }
      result(session)
    }
  }, 'readonly')
}
export function saveQuestionnaireBackup(researchId, record) {
  return trackStudyWrite(researchId, transaction(['sessions'], (tx) => {
    const store = tx.objectStore('sessions'), request = store.get(researchId)
    request.onsuccess = () => store.put({ ...request.result, researchId,
      questionnaireDrafts: { ...request.result?.questionnaireDrafts, [record.questionnaireId]: record }, updatedAt: new Date().toISOString() })
  }))
}
export async function listStudyBackups() {
  return transaction(['sessions'], (tx, result) => {
    const request = tx.objectStore('sessions').getAll()
    request.onsuccess = () => result(request.result.filter((session) => session.researchId !== '__active__')
      .map((session) => ({ ...session, snapshot: session.snapshot ?? session.snapshotSummary })))
  }, 'readonly')
}
export const setActiveStudySession = (researchId) => saveStudyBackup('__active__', { activeResearchId: researchId })
export async function readActiveStudySession() {
  const pointer = await readStudyBackup('__active__')
  return pointer?.activeResearchId ? readStudyBackup(pointer.activeResearchId) : null
}
export function enqueueStudyUpload(researchId, kind, id, data) {
  const entry = { key: `${researchId}:${kind}:${id}`, researchId, kind, id, data: JSON.parse(JSON.stringify(data)),
    version: crypto.randomUUID(), queuedAt: Date.now() }
  if (kind === 'event' && JSON.stringify(entry.data).length > 20000) {
    entry.compressedData = encodeInteractionChunk([entry.data])
    delete entry.data
  }
  return trackStudyWrite(researchId, transaction(['uploads'], (tx) => tx.objectStore('uploads').put(entry)))
}
export async function pendingStudyUploads(researchId) {
  return transaction(['uploads'], (tx, result) => {
    const request = tx.objectStore('uploads').index('researchId').getAll(researchId)
    request.onsuccess = () => result(request.result.map((entry) => {
      const storedBytes = new TextEncoder().encode(JSON.stringify(entry)).length
      if (!entry.compressedData) return { ...entry, storedBytes }
      const { compressedData, ...metadata } = entry
      return { ...metadata, storedBytes, data: decodeInteractionChunk(compressedData)[0] }
    })
      .sort((a, b) => a.queuedAt - b.queuedAt || (a.data.sequence ?? 0) - (b.data.sequence ?? 0)))
  }, 'readonly')
}
// Move raw pending events into a durable immutable chunk before its first
// network attempt. A retry always uses this same document ID and payload.
export async function sealInteractionChunk(researchId, entries, chunk) {
  return transaction(['uploads'], (tx, result) => {
    const store = tx.objectStore('uploads')
    let remaining = entries.length, valid = true
    for (const entry of entries) {
      const request = store.get(entry.key)
      request.onsuccess = () => {
        valid &&= request.result?.version === entry.version
        if (--remaining) return
        // A second tab may have sealed these events first. Never overwrite its
        // immutable chunk with a differently sized group sharing the first ID.
        if (!valid) { result(false); return }
        store.put({ key: `${researchId}:chunk:${chunk.eventId}`, researchId, kind: 'chunk', id: chunk.eventId,
          version: chunk.eventId, data: chunk, queuedAt: entries[0].queuedAt })
        for (const item of entries) store.delete(item.key)
        result(true)
      }
    }
  })
}
export function acknowledgeStudyUpload(entry) {
  return transaction(['uploads', 'sessions'], (tx) => {
    const store = tx.objectStore('uploads'), request = store.get(entry.key)
    request.onsuccess = () => {
      if (request.result?.version !== entry.version) return // a newer answer replaced this one in flight
      store.delete(entry.key)
      if (entry.kind === 'chunk') {
        const sessions = tx.objectStore('sessions'), session = sessions.get(entry.researchId)
        session.onsuccess = () => sessions.put({ ...session.result, researchId: entry.researchId,
          uploadedChunks: { ...session.result?.uploadedChunks, [entry.id]: entry.data.eventCount } })
      }
    }
  })
}
