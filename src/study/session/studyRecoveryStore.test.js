import 'fake-indexeddb/auto'
import { expect, it } from 'vitest'
import { saveStudyBackup, readStudyBackup } from './studyRecoveryStore'
it('durably merges answer snapshots and Firebase identity without overwriting other sessions', async () => {
  await Promise.all([
    saveStudyBackup('RECOVERY1', { snapshot: { phase: 'demographics', answers: { age: '25' } } }),
    saveStudyBackup('RECOVERY1', { firebaseSession: { path: ['owner', 'session'] } }),
    saveStudyBackup('RECOVERY2', { snapshot: { answers: { age: '30' } } }),
  ])
  expect(await readStudyBackup('RECOVERY1')).toMatchObject({ snapshot: { answers: { age: '25' } }, firebaseSession: { path: ['owner', 'session'] } })
  expect(await readStudyBackup('RECOVERY2')).toMatchObject({ snapshot: { answers: { age: '30' } } })
  expect(await readStudyBackup('DOESNOTEXIST')).toBeNull()
})
