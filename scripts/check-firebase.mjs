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
  const second = await client('setup-other-participant', true)
  await mustDeny(() => getDoc(doc(second.db, ...recordPath)), 'Other participant read')
  await mustDeny(() => setDoc(doc(second.db, ...recordPath), {
    stageId: 'demographics', data: {}, savedAt: serverTimestamp(),
  }), 'Other participant write')
  const guest = await client('setup-guest', false)
  await mustDeny(() => getDoc(doc(guest.db, ...recordPath)), 'Unauthenticated read')
  await mustDeny(() => getDocs(query(collectionGroup(second.db, 'sessions'), where('researchId', '==', 'SETUP-TEST'))), 'Participant researcher lookup')
  console.log(`Setup record: ${path.join('/')}`)
} catch (error) {
  console.error(`Firebase setup check failed: ${error.code ?? error.message}`)
  process.exitCode = 1
} finally {
  await Promise.all(apps.map((app) => deleteApp(app)))
}
