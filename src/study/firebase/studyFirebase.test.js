import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const firebase = vi.hoisted(() => ({
  auth: { authStateReady: vi.fn(), currentUser: null },
  initializeApp: vi.fn(() => ({})),
  initializeAuth: vi.fn(),
  signInAnonymously: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  getDoc: vi.fn(async () => ({ exists: () => false })),
  getDocs: vi.fn(async () => ({ docs: [] })),
  doc: vi.fn((_db, ...path) => path),
}))
vi.mock('firebase/app', () => ({ initializeApp: firebase.initializeApp }))
vi.mock('firebase/auth', () => ({
  initializeAuth: firebase.initializeAuth, indexedDBLocalPersistence: 'persistent-identity',
  signInAnonymously: firebase.signInAnonymously,
}))
vi.mock('firebase/firestore/lite', () => ({
  getFirestore: vi.fn(() => ({})), doc: firebase.doc, setDoc: firebase.setDoc, updateDoc: firebase.updateDoc, getDoc: firebase.getDoc,
  getDocs: firebase.getDocs, collection: (_db, ...path) => path,
  collectionGroup: (_db, name) => name, query: (...parts) => parts, where: (...parts) => parts,
  serverTimestamp: () => 'server-time',
}))

afterEach(() => vi.unstubAllEnvs())

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  firebase.auth.currentUser = null
  firebase.initializeAuth.mockReturnValue(firebase.auth)
  firebase.signInAnonymously.mockImplementation(async () => {
    firebase.auth.currentUser = { uid: 'participant-a' }
    return { user: firebase.auth.currentUser }
  })
  for (const key of ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'APP_ID']) {
    vi.stubEnv(`VITE_FIREBASE_${key}`, `example-${key}`)
  }
})

describe('Firebase study setup', () => {
  it('reads packed interaction documents as the original events and detects missing acknowledged chunks', async () => {
    const { encodeInteractionChunk } = await import('../session/interactionCodec')
    const { createFirebaseStudySession, saveFirebaseStudyInteraction, readFirebaseStudyInteractions } = await import('./studyFirebase')
    const session = await createFirebaseStudySession({ researchId: 'PACKED' })
    const event = { eventId: 'original-1', researchId: 'PACKED', exerciseId: 'point-plane-distance', type: 'block_create',
      occurredAt: '2026-10-16T00:00:00Z', streamId: 's', sequence: 1, state: { type: 'linalg_point', fields: { X: 7 } } }
    const chunk = { eventId: 'chunk-1', researchId: 'PACKED', exerciseId: event.exerciseId, type: 'interaction_chunk',
      occurredAt: event.occurredAt, streamId: 's', sequence: 1, ...encodeInteractionChunk([event]) }
    await saveFirebaseStudyInteraction(session, chunk)
    const manifest = firebase.setDoc.mock.calls.at(-1)[1]
    firebase.getDocs.mockResolvedValueOnce({ docs: [{ data: () => manifest }] })
    firebase.getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ snapshot: { uploadStatus: { uploadedChunks: { 'chunk-1': 1 } } } }) })
    expect(await readFirebaseStudyInteractions(session)).toEqual([event])
    firebase.getDocs.mockResolvedValueOnce({ docs: [] })
    firebase.getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ snapshot: { uploadStatus: { uploadedChunks: { 'chunk-1': 1 } } } }) })
    await expect(readFirebaseStudyInteractions(session)).rejects.toThrow('missing')
  })
  it('compresses a large recovery workspace and restores it without changing questionnaire or condition fields', async () => {
    const { createFirebaseStudySession, saveFirebaseStudyRecovery, recoverFirebaseStudy } = await import('./studyFirebase')
    const session = await createFirebaseStudySession({ researchId: 'LARGE' })
    const snapshot = { researchId: 'LARGE', phase: 'post', studyOrder: 'lecture-first',
      questionnaires: [{ questionnaireId: 'condition-1', answer: 'preserved' }], savedXml: { exercise: '<xml>'.repeat(80000) } }
    await saveFirebaseStudyRecovery(session, snapshot, 'stable-version')
    const stored = firebase.setDoc.mock.calls.at(-1)[1].snapshot
    expect(stored.encodedSnapshot.encoding).toBe('gzip-base64-v1')
    expect(JSON.stringify(stored).length).toBeLessThan(10000)
    firebase.getDocs.mockResolvedValueOnce({ empty: false, size: 1, docs: [{ ref: { path: session.path.join('/') }, data: () => ({ studyOrder: 'lecture-first' }) }] })
    firebase.getDocs.mockResolvedValueOnce({ docs: [] })
    firebase.getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ snapshot: stored }) })
    expect((await recoverFirebaseStudy('LARGE')).snapshot).toEqual(snapshot)
  })
  it('writes complete interaction JSON directly under the original session and prevents another participant writing it', async () => {
    const { createFirebaseStudySession, saveFirebaseStudyInteraction } = await import('./studyFirebase')
    const session = await createFirebaseStudySession({ researchId: 'DIRECT1' })
    const event = { eventId: 'event-1', researchId: 'DIRECT1', exerciseId: 'cube-point-pivot-rotation',
      type: 'block_delete', occurredAt: '2026-10-15T01:00:00Z', streamId: 'stream', sequence: 1,
      state: { type: 'rot_matrix', fields: { AXIS: 'Y', DEGREES: 90 } } }
    await saveFirebaseStudyInteraction(session, event)
    expect(firebase.setDoc).toHaveBeenLastCalledWith([...session.path, 'interactions', event.eventId], expect.objectContaining({ dataJson: JSON.stringify(event), sessionId: session.path[3] }))
    firebase.auth.currentUser = { uid: 'other' }
    await expect(saveFirebaseStudyInteraction(session, event)).rejects.toThrow('different participant')
  })
  it('round-trips a large Unicode workspace through bounded Firestore chunks', async () => {
    const { createFirebaseStudySession, saveFirebaseStudyInteraction, readFirebaseStudyInteractions } = await import('./studyFirebase')
    const session = await createFirebaseStudySession({ researchId: 'DIRECT1' })
    firebase.setDoc.mockClear()
    const event = { eventId: 'large-1', researchId: 'DIRECT1', exerciseId: 'point-plane-distance',
      type: 'exercise_timeout', occurredAt: '2026-10-15T01:00:00Z', streamId: 'stream', sequence: 1,
      snapshot: { customBlocks: [{ name: '😀'.repeat(180000) }] } }
    await saveFirebaseStudyInteraction(session, event)
    const calls = firebase.setDoc.mock.calls
    const manifest = calls.at(-1)[1]
    expect(manifest.payloadChunks).toBeGreaterThan(1)
    const parts = calls.slice(0, -1)
    expect(parts.every(([, part]) => new TextEncoder().encode(part.text).length <= 260000)).toBe(true)
    firebase.getDocs.mockResolvedValueOnce({ docs: [{ data: () => manifest }] })
    firebase.getDocs.mockResolvedValueOnce({ docs: parts.map(([path, data]) => ({ id: path.at(-1), data: () => data })) })
    expect(await readFirebaseStudyInteractions(session)).toEqual([event])
  })
  it('creates a session before order selection and later updates the same document', async () => {
    const { createFirebaseStudySession, updateFirebaseStudyOrder } = await import('./studyFirebase')
    const session = await createFirebaseStudySession({ researchId: 'P01' })
    expect(firebase.setDoc).toHaveBeenCalledWith(session.path, expect.objectContaining({ studyOrder: null }))
    expect(firebase.setDoc).toHaveBeenLastCalledWith(['studyParticipants', 'participant-a'], {
      latestResearchId: 'P01', latestSessionId: session.path[3], lastSavedAt: 'server-time',
    })
    await updateFirebaseStudyOrder(session, 'geoscratch-first')
    expect(firebase.updateDoc).toHaveBeenCalledWith(session.path, { studyOrder: 'geoscratch-first' })
  })
  it('does not initialize Firebase just by importing, and rejects missing configuration', async () => {
    const { readFirebaseConfig } = await import('./studyFirebase')
    expect(firebase.initializeApp).not.toHaveBeenCalled()
    expect(() => readFirebaseConfig({})).toThrow('Firebase is not configured')
  })
  it('persists identity for refresh recovery and separates repeated study sessions', async () => {
    const { createFirebaseStudySession, saveFirebaseStudyRecord } = await import('./studyFirebase')
    const details = { researchId: 'P01', studyOrder: 'lecture-first' }
    const first = await createFirebaseStudySession(details)
    const second = await createFirebaseStudySession(details)
    expect(first.path).not.toEqual(second.path)
    expect(first.path.slice(0, 3)).toEqual(['studyParticipants', 'participant-a', 'sessions'])
    expect(firebase.initializeAuth).toHaveBeenCalledWith(expect.anything(), { persistence: 'persistent-identity' })
    expect(firebase.signInAnonymously).toHaveBeenCalledTimes(1)
    await saveFirebaseStudyRecord(first, 'demographics', { answers: { age: '25' } })
    expect(firebase.setDoc).toHaveBeenLastCalledWith([...first.path, 'records', 'demographics'], {
      stageId: 'demographics', data: { answers: { age: '25' } }, savedAt: 'server-time',
    })
    await expect(saveFirebaseStudyRecord(first, 'raw-click-log', {})).rejects.toThrow('Unknown study stage')
    firebase.auth.currentUser = { uid: 'participant-b' }
    await expect(saveFirebaseStudyRecord(first, 'post-study', {})).rejects.toThrow('different participant')
  })
  it('propagates a failed server write instead of reporting a saved session', async () => {
    const { createFirebaseStudySession } = await import('./studyFirebase')
    firebase.setDoc.mockRejectedValueOnce(new Error('permission-denied'))
    await expect(createFirebaseStudySession({ researchId: 'P01', studyOrder: 'geoscratch-first' }))
      .rejects.toThrow('permission-denied')
  })
  it('preserves the participant label without rewriting it for each recovery save', async () => {
    const { createFirebaseStudySession, saveFirebaseStudyRecovery } = await import('./studyFirebase')
    firebase.getDoc.mockResolvedValueOnce({ exists: () => true })
    const session = await createFirebaseStudySession({ researchId: 'RECENT', sessionId: 'existing-session' })
    expect(firebase.setDoc).toHaveBeenCalledTimes(1)
    await saveFirebaseStudyRecovery(session, { researchId: 'RECENT', phase: 'complete' })
    expect(firebase.setDoc).toHaveBeenCalledTimes(2)
    expect(firebase.setDoc).toHaveBeenLastCalledWith([...session.path, 'recovery', 'current'], {
      snapshot: { researchId: 'RECENT', phase: 'complete' }, savedAt: 'server-time',
    })
    firebase.auth.currentUser = { uid: 'participant-b' }
    await expect(saveFirebaseStudyRecovery(session, { researchId: 'RECENT' })).rejects.toThrow('different participant')
  })
})
