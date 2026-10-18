import { initializeApp } from 'firebase/app'
import { initializeAuth, indexedDBLocalPersistence, browserPopupRedirectResolver, signInAnonymously, signInWithPopup, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore, doc, setDoc, getDoc, getDocs, collection, collectionGroup, query, where, updateDoc, serverTimestamp } from 'firebase/firestore/lite'
import { decodeInteractionChunk, encodeInteractionChunk, expandInteractionSnapshots } from '../session/interactionCodec'

export const STUDY_STAGES = Object.freeze([
  'demographics', 'lecture-exercise-1', 'lecture-exercise-2', 'condition-1',
  'geoscratch-trial', 'geoscratch-exercise-1', 'geoscratch-exercise-2',
  'condition-2', 'post-study',
])

export function readFirebaseConfig(env = import.meta.env) {
  const config = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  }
  if (Object.values(config).some((value) => typeof value !== 'string' || !value.trim())) {
    throw new Error('Firebase is not configured. Fill in the four Firebase values in .env.local and restart GeoScratch.')
  }
  return config
}

let connection
let signingIn
// Persist the anonymous identity so a refreshed browser still owns its records.
export async function connectStudyFirebase() {
  if (!connection) {
    connection = (async () => {
      const app = initializeApp(readFirebaseConfig(), 'geoscratch-study')
      const auth = initializeAuth(app, { persistence: indexedDBLocalPersistence })
      const db = getFirestore(app)
      return { auth, db }
    })()
    connection.catch(() => { connection = undefined })
  }
  const { auth, db } = await connection
  await auth.authStateReady()
  let user = auth.currentUser
  if (!user) {
    signingIn ??= signInAnonymously(auth)
    try { user = (await signingIn).user } finally { signingIn = undefined }
  }
  return { db, uid: user.uid }
}

export async function createFirebaseStudySession({ researchId, studyOrder = null, sessionId = crypto.randomUUID() }) {
  if (typeof researchId !== 'string' || !researchId.trim() || researchId.length > 100) {
    throw new Error('A research ID of 1–100 characters is required.')
  }
  if (studyOrder !== null && !['lecture-first', 'geoscratch-first'].includes(studyOrder)) throw new Error('Unknown study order.')
  const { db, uid } = await connectStudyFirebase()
  const path = ['studyParticipants', uid, 'sessions', sessionId]
  const reference = doc(db, ...path)
  const existing = await getDoc(reference)
  if (existing.exists() && existing.data().researchId !== researchId) {
    throw new Error('This Firebase session belongs to a different research ID. Keep this browser open and contact the researcher.')
  }
  if (!existing.exists()) {
    await setDoc(reference, { researchId, studyOrder, schemaVersion: 1, createdAt: serverTimestamp() })
  }
  await saveParticipantSummary(db, uid, sessionId, researchId)
  return { path }
}

function saveParticipantSummary(db, uid, sessionId, researchId) {
  return setDoc(doc(db, 'studyParticipants', uid), {
    latestResearchId: researchId, latestSessionId: sessionId, lastSavedAt: serverTimestamp(),
  })
}

export async function updateFirebaseStudyOrder(session, studyOrder) {
  if (!['lecture-first', 'geoscratch-first'].includes(studyOrder)) throw new Error('Unknown study order.')
  if (!session?.path || session.path.length !== 4) throw new Error('Start a Firebase study session before saving.')
  const { db, uid } = await connectStudyFirebase()
  if (session.path[1] !== uid) throw new Error('This study session belongs to a different participant.')
  await updateDoc(doc(db, ...session.path), { studyOrder })
}

export async function saveFirebaseStudyRecord(session, stageId, data) {
  if (!STUDY_STAGES.includes(stageId)) throw new Error('Unknown study stage.')
  if (!session?.path || session.path.length !== 4) throw new Error('Start a Firebase study session before saving.')
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Study data must be an object.')
  const { db, uid } = await connectStudyFirebase()
  if (session.path[1] !== uid) throw new Error('This study session belongs to a different participant.')
  await setDoc(doc(db, ...session.path, 'records', stageId), {
    stageId, data, savedAt: serverTimestamp(),
  })
}

export async function saveFirebaseStudyRecovery(session, snapshot, uploadId = crypto.randomUUID()) {
  const { db, uid } = await connectStudyFirebase()
  if (session.path[1] !== uid) throw new Error('This study session belongs to a different participant.')
  let stored = snapshot
  if (new TextEncoder().encode(JSON.stringify(snapshot)).length > 200000) {
    const packed = JSON.stringify(encodeInteractionChunk([snapshot]))
    stored = { researchId: snapshot.researchId, phase: snapshot.phase, studyOrder: snapshot.studyOrder ?? null,
      ...(snapshot.uploadStatus ? { uploadStatus: snapshot.uploadStatus } : {}) }
    if (packed.length <= 400000) stored.encodedSnapshot = JSON.parse(packed)
    else {
      const chunks = packed.match(/[\s\S]{1,65000}/gu)
      const payloadId = `recovery-${uploadId}`
      await Promise.all(chunks.map((text, index) => setDoc(doc(db, ...session.path, 'interactionPayloads', `${payloadId}-${index}`), {
        eventId: payloadId, index, text,
      })))
      stored.snapshotPayload = { payloadId, count: chunks.length }
    }
  }
  await setDoc(doc(db, ...session.path, 'recovery', 'current'), { snapshot: stored, savedAt: serverTimestamp() })
}

async function decodeRecoverySnapshot(db, path, snapshot) {
  if (snapshot?.encodedSnapshot) return decodeInteractionChunk(snapshot.encodedSnapshot)[0]
  if (!snapshot?.snapshotPayload) return snapshot
  const { payloadId, count } = snapshot.snapshotPayload
  const parts = await Promise.all(Array.from({ length: count }, (_, index) => getDoc(doc(db, ...path, 'interactionPayloads', `${payloadId}-${index}`))))
  if (parts.some((part) => !part.exists())) throw new Error('The recovery checkpoint is incomplete.')
  return decodeInteractionChunk(JSON.parse(parts.map((part) => part.data().text).join('')))[0]
}

export async function saveFirebaseStudyInteraction(session, event) {
  if (!session?.path || session.path.length !== 4) throw new Error('Start a Firebase study session before recording interactions.')
  if (!event?.eventId || !['create-complex-object', 'cube-point-pivot-rotation', 'point-plane-distance'].includes(event.exerciseId)) throw new Error('Unknown interaction exercise.')
  const { db, uid } = await connectStudyFirebase()
  if (session.path[1] !== uid) throw new Error('This study session belongs to a different participant.')
  const json = JSON.stringify(event)
  const payload = {}
  // A complete workspace can exceed a Firestore document. Publish its manifest
  // only after all bounded JSON chunks have been acknowledged.
  if (new TextEncoder().encode(json).length > 400000) {
    const chunks = json.match(/[\s\S]{1,65000}/gu)
    await Promise.all(chunks.map((text, index) => setDoc(doc(db, ...session.path, 'interactionPayloads', `${event.eventId}-${index}`), {
      eventId: event.eventId, index, text,
    })))
    payload.payloadChunks = chunks.length
  } else payload.dataJson = json
  await setDoc(doc(db, ...session.path, 'interactions', event.eventId), {
    eventId: event.eventId, researchId: event.researchId, exerciseId: event.exerciseId,
    type: event.type, occurredAt: event.occurredAt, streamId: event.streamId, sequence: event.sequence,
    sessionId: session.path[3], ...payload, savedAt: serverTimestamp(),
  })
}

async function readInteractionHistory(db, path) {
  const documents = await getDocs(collection(db, ...path, 'interactions'))
  const manifests = documents.docs.map((item) => item.data())
  const recovery = await getDoc(doc(db, ...path, 'recovery', 'current'))
  const expectedChunks = recovery?.exists() ? recovery.data().snapshot?.uploadStatus?.uploadedChunks : null
  if (expectedChunks && Object.keys(expectedChunks).some((id) => !manifests.some((item) => item.eventId === id))) {
    throw new Error('Some acknowledged interaction chunks are missing. The history is incomplete.')
  }
  const chunked = manifests.some((item) => item.payloadChunks)
  const parts = chunked ? await getDocs(collection(db, ...path, 'interactionPayloads')) : null
  const chunks = new Map(parts?.docs.map((item) => [item.id, item.data().text]) ?? [])
  const events = manifests.flatMap((item) => {
    const json = item.dataJson ?? Array.from({ length: item.payloadChunks }, (_, index) => {
      const part = chunks.get(`${item.eventId}-${index}`)
      if (part === undefined) throw new Error('An interaction snapshot is incomplete. Retry the download.')
      return part
    }).join('')
    const payload = JSON.parse(json)
    return payload.type === 'interaction_chunk' ? decodeInteractionChunk(payload) : [payload]
  }).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.streamId.localeCompare(b.streamId) || a.sequence - b.sequence)
  return expandInteractionSnapshots(events)
}

export async function readFirebaseStudyInteractions(session, asResearcher = false) {
  const { db } = asResearcher ? researcherClient() : await connectStudyFirebase()
  return readInteractionHistory(db, session.path)
}

let researcher
function researcherClient() {
  if (!researcher) {
    const app = initializeApp(readFirebaseConfig(), 'geoscratch-researcher')
    researcher = { auth: initializeAuth(app, { persistence: indexedDBLocalPersistence, popupRedirectResolver: browserPopupRedirectResolver }), db: getFirestore(app) }
  }
  return researcher
}

export async function signInResearcher() {
  const { auth, db } = researcherClient()
  const { user } = await signInWithPopup(auth, new GoogleAuthProvider())
  const access = await getDoc(doc(db, 'studyResearchers', user.uid))
  const emailAccess = user.email ? await getDoc(doc(db, 'studyResearcherEmails', user.email)) : null
  return { uid: user.uid, email: user.email, authorized: (access.exists() && access.data().enabled === true)
    || (emailAccess?.exists() && emailAccess.data().enabled === true) }
}

export async function recoverFirebaseStudy(researchId, asResearcher = false) {
  let db, matches
  if (asResearcher) {
    const client = researcherClient()
    await client.auth.authStateReady()
    if (!client.auth.currentUser) throw new Error('Sign in as a researcher first.')
    db = client.db
    matches = await getDocs(query(collectionGroup(db, 'sessions'), where('researchId', '==', researchId)))
  } else {
    const client = await connectStudyFirebase()
    db = client.db
    matches = await getDocs(query(collection(db, 'studyParticipants', client.uid, 'sessions'), where('researchId', '==', researchId)))
  }
  if (matches.empty) return null
  if (matches.size !== 1) throw new Error('Multiple sessions have this research ID. Contact the study administrator.')
  const session = matches.docs[0]
  const current = await getDoc(doc(db, session.ref.path, 'recovery', 'current'))
  const records = await getDocs(collection(db, session.ref.path, 'records'))
  return { snapshot: current.exists() ? await decodeRecoverySnapshot(db, session.ref.path.split('/'), current.data().snapshot) : null,
    records: records.docs.map((item) => item.data()),
    firebaseSession: { path: session.ref.path.split('/') }, studyOrder: session.data().studyOrder }
}
