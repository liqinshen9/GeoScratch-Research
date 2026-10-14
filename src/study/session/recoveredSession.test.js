import { expect, it } from 'vitest'
import { recoveredSession } from './recoveredSession'
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
