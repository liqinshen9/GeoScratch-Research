const DATABASE = 'geoscratch-study-recovery'
let database
function openDatabase() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('sessions', { keyPath: 'researchId' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }).catch((error) => { database = undefined; throw error })
  return database
}

export async function saveStudyBackup(researchId, patch) {
  if (!researchId) return
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('sessions', 'readwrite')
    const store = transaction.objectStore('sessions')
    const request = store.get(researchId)
    request.onsuccess = () => store.put({ ...request.result, ...patch, researchId, updatedAt: new Date().toISOString() })
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

export async function readStudyBackup(researchId) {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = db.transaction('sessions').objectStore('sessions').get(researchId)
    request.onsuccess = () => resolve(request.result ?? null)
    request.onerror = () => reject(request.error)
  })
}

export const setActiveStudySession = (researchId) => saveStudyBackup('__active__', { activeResearchId: researchId })
export async function readActiveStudySession() {
  const pointer = await readStudyBackup('__active__')
  return pointer?.activeResearchId ? readStudyBackup(pointer.activeResearchId) : null
}
