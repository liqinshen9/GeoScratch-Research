import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const firebase = vi.hoisted(() => ({
  auth: { authStateReady: vi.fn(), currentUser: null },
  initializeApp: vi.fn(() => ({})),
  initializeAuth: vi.fn(),
  signInAnonymously: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  getDoc: vi.fn(async () => ({ exists: () => false })),
  doc: vi.fn((_db, ...path) => path),
}))
vi.mock('firebase/app', () => ({ initializeApp: firebase.initializeApp }))
vi.mock('firebase/auth', () => ({
  initializeAuth: firebase.initializeAuth, indexedDBLocalPersistence: 'persistent-identity',
  signInAnonymously: firebase.signInAnonymously,
}))
vi.mock('firebase/firestore/lite', () => ({
  getFirestore: vi.fn(() => ({})), doc: firebase.doc, setDoc: firebase.setDoc, updateDoc: firebase.updateDoc, getDoc: firebase.getDoc,
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
  it('creates a session before order selection and later updates the same document', async () => {
    const { createFirebaseStudySession, updateFirebaseStudyOrder } = await import('./studyFirebase')
    const session = await createFirebaseStudySession({ researchId: 'P01' })
    expect(firebase.setDoc).toHaveBeenLastCalledWith(session.path, expect.objectContaining({ studyOrder: null }))
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
})
