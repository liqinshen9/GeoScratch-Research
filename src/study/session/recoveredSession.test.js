import { expect, it } from 'vitest'
import { recoveredSession } from './recoveredSession'
import { firebaseSessionRecords } from '../firebase/sessionRecords'
it('recovers existing cloud results even if an old session has no recovery snapshot', () => {
  const recovered = recoveredSession({ studyOrder: 'lecture-first', records: [
    { data: { type: 'questionnaire', questionnaireId: 'demographics', status: 'submitted', responses: [{ id: 'age', answer: '25', detail: 'test' }] } },
    { data: { type: 'exercise-answers', exerciseId: 'cube-point-pivot-rotation', submissions: [{ answer: 'Translation' }], durationMs: 2000 } },
    { data: { type: 'exercise-tracking', exerciseId: 'create-complex-object', result: { exerciseId: 'create-complex-object', passed: true, checkCount: 4 } } },
  ] }, 'P1')
  expect(recovered.questionnaires[0].rawAnswers).toMatchObject({ age: '25', ageDetail: 'test' })
  expect(recovered.lectureExerciseResponses[0].answer).toBe('Translation')
  expect(recovered.geoscratchResults[0].checkCount).toBe(4)
})

it('uploads and recovers lecture timeout metadata even when no answer was submitted', () => {
  const timing = { exerciseId: 'point-plane-distance', startedAt: '2026-10-15T00:00:00.000Z',
    completedAt: '2026-10-15T00:10:00.000Z', durationMs: 600000,
    timedOut: true, completionReason: 'timeout', timeLimitSeconds: 600 }
  const records = firebaseSessionRecords({ researchId: 'P1', studyOrder: 'lecture-first', lectureExerciseTimings: [timing] })
  expect(records).toHaveLength(1)
  expect(records[0]).toMatchObject({ stageId: 'lecture-exercise-2', data: { ...timing, submissions: [] } })
  const recovered = recoveredSession({ studyOrder: 'lecture-first', records }, 'P1')
  expect(recovered.lectureExerciseTimings).toEqual([timing])
})
