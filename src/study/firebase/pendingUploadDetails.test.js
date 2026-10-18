import { expect, it } from 'vitest'
import { pendingUploadDetails } from './pendingUploadDetails'
it('lists only queued stage data and groups raw and packed interactions by exercise', () => {
  expect(pendingUploadDetails([
    { kind: 'record', id: 'post-study' },
    { kind: 'event', data: { exerciseId: 'create-complex-object' } },
    { kind: 'chunk', data: { exerciseId: 'create-complex-object', eventCount: 12 } },
    { kind: 'chunk', data: { exerciseId: 'point-plane-distance', eventCount: 20 } },
    { kind: 'recovery' },
  ], false)).toEqual(['Study session registration', 'Post-study questionnaire', 'Study progress checkpoint',
    'Trial exercise interaction log (13 events)', 'Point-to-plane exercise interaction log (20 events)'])
  expect(pendingUploadDetails([])).toEqual([])
})
