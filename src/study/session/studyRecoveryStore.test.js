import 'fake-indexeddb/auto'
import { expect, it } from 'vitest'
import { saveStudyBackup, readStudyBackup } from './studyRecoveryStore'
it('persists only session references, never answers or workspace snapshots', async () => {
  await Promise.all([
    saveStudyBackup('RECOVERY1', { snapshot: { phase: 'demographics', answers: { age: '25' } } }),
    saveStudyBackup('RECOVERY1', { firebaseSession: { path: ['owner', 'session'] } }),
    saveStudyBackup('RECOVERY2', { snapshot: { answers: { age: '30' } } }),
  ])
  expect(await readStudyBackup('RECOVERY1')).toMatchObject({ firebaseSession: { path: ['owner', 'session'] } })
  expect(await readStudyBackup('RECOVERY1')).not.toHaveProperty('snapshot')
  expect(await readStudyBackup('RECOVERY2')).toBeNull()
  expect(await readStudyBackup('DOESNOTEXIST')).toBeNull()
})
