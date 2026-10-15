// Writes one clearly labelled setup test, containing no participant answers.
import { loadEnv } from 'vite'
import { initializeApp, deleteApp } from 'firebase/app'
import { initializeAuth, inMemoryPersistence, signInAnonymously } from 'firebase/auth'
import { getFirestore, doc, setDoc, getDoc, getDocs, collectionGroup, query, where, serverTimestamp, setLogLevel } from 'firebase/firestore/lite'
import { randomUUID } from 'node:crypto'

const env = loadEnv('development', process.cwd(), 'VITE_FIREBASE_')
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID,
}
if (Object.values(config).some((value) => !value)) throw new Error('Fill in .env.local first.')
const apps = []
// Permission denials below are intentional; keep the output to check results.
setLogLevel('silent')
async function client(name, authenticated) {
  const app = initializeApp(config, `${name}-${randomUUID()}`)
  apps.push(app)
  const auth = initializeAuth(app, { persistence: inMemoryPersistence })
  const uid = authenticated ? (await signInAnonymously(auth)).user.uid : null
  return { db: getFirestore(app), uid }
}
async function mustDeny(operation, label) {
  try { await operation() } catch (error) {
    if (error.code === 'permission-denied') {
      console.log(`${label}: access denied as expected`)
      return
    }
    throw error
  }
  throw new Error(`${label}: access was unexpectedly allowed`)
}
try {
  const first = await client('setup-owner', true)
  const path = ['studyParticipants', first.uid, 'sessions', randomUUID()]
  await setDoc(doc(first.db, ...path), {
    researchId: 'SETUP-TEST', studyOrder: 'lecture-first', schemaVersion: 1,
    createdAt: serverTimestamp(),
  })
  const recordPath = [...path, 'records', 'demographics']
  await setDoc(doc(first.db, ...recordPath), {
    stageId: 'demographics', data: { purpose: 'Firebase setup check; no participant data' },
    savedAt: serverTimestamp(),
  })
  const saved = await getDoc(doc(first.db, ...recordPath))
  if (!saved.exists()) throw new Error('The test record could not be read back.')
  console.log('Authenticated write and read: passed')
  const participantPath = ['studyParticipants', first.uid]
  const summary = { latestResearchId: 'SETUP-TEST', latestSessionId: path[3], lastSavedAt: serverTimestamp() }
  await setDoc(doc(first.db, ...participantPath), summary)
  const participant = await getDoc(doc(first.db, ...participantPath))
  if (participant.data()?.latestResearchId !== 'SETUP-TEST') throw new Error('The research ID label could not be read back.')
  console.log('Participant research ID label: passed')
  const interactionPath = [...path, 'interactions', 'setup-event']
  const interaction = { eventId: 'setup-event', researchId: 'SETUP-TEST', exerciseId: 'create-complex-object',
    sessionId: path[3], type: 'block_delete', occurredAt: new Date().toISOString(), streamId: 'setup', sequence: 1,
    dataJson: JSON.stringify({ purpose: 'SETUP TEST; no participant data', state: { type: 'geo_cube', inputs: {} } }), savedAt: serverTimestamp() }
  await setDoc(doc(first.db, ...interactionPath), interaction)
  if (!(await getDoc(doc(first.db, ...interactionPath))).exists()) throw new Error('Interaction event was not readable.')
  const payloadPath = [...path, 'interactionPayloads', 'setup-event-0']
  await setDoc(doc(first.db, ...payloadPath), { eventId: 'setup-event', index: 0, text: 'SETUP TEST; no participant data' })
  console.log('Direct interaction and snapshot payload writes: passed')
  await mustDeny(() => setDoc(doc(first.db, ...participantPath), { ...summary, latestResearchId: 'WRONG-ID' }), 'Mismatched research ID label')
  const second = await client('setup-other-participant', true)
  await mustDeny(() => getDoc(doc(second.db, ...interactionPath)), 'Other participant interaction read')
  await mustDeny(() => setDoc(doc(second.db, ...interactionPath), interaction), 'Other participant interaction write')
  await mustDeny(() => getDoc(doc(second.db, ...payloadPath)), 'Other participant snapshot payload read')
  await mustDeny(() => getDoc(doc(second.db, ...participantPath)), 'Other participant label read')
  await mustDeny(() => setDoc(doc(second.db, ...participantPath), summary), 'Other participant label write')
  await mustDeny(() => getDoc(doc(second.db, ...recordPath)), 'Other participant read')
  await mustDeny(() => setDoc(doc(second.db, ...recordPath), {
    stageId: 'demographics', data: {}, savedAt: serverTimestamp(),
  }), 'Other participant write')
  const guest = await client('setup-guest', false)
  await mustDeny(() => getDoc(doc(guest.db, ...interactionPath)), 'Unauthenticated interaction read')
  await mustDeny(() => getDoc(doc(guest.db, ...participantPath)), 'Unauthenticated label read')
  await mustDeny(() => getDoc(doc(guest.db, ...recordPath)), 'Unauthenticated read')
  await mustDeny(() => getDocs(query(collectionGroup(second.db, 'sessions'), where('researchId', '==', 'SETUP-TEST'))), 'Participant researcher lookup')
  console.log(`Setup record: ${path.join('/')}`)
} catch (error) {
  console.error(`Firebase setup check failed: ${error.code ?? error.message}`)
  process.exitCode = 1
} finally {
  await Promise.all(apps.map((app) => deleteApp(app)))
}
