import { expect, it } from 'vitest'
import { firebaseSessionRecords } from './sessionRecords'

it('includes every submitted demographics answer before study order is selected', () => {
  const session = { researchId: 'P1', questionnaires: [{ questionnaireId: 'demographics', status: 'submitted',
    submittedAt: '2026-10-15', fields: [{ id: 'gender', question: 'Gender?', answer: 'Prefer not to say' },
      { id: 'age', question: 'Age?', answer: '25-34', detail: 'test detail' }],
  }] }
  const records = firebaseSessionRecords(session)
  expect(records).toHaveLength(1)
  expect(records[0].data.responses).toEqual(session.questionnaires[0].fields)
  expect(records[0]).toEqual(firebaseSessionRecords({ ...session, studyOrder: 'lecture-first' })[0])
})

it.each(['lecture-first', 'geoscratch-first'])('maps all nine records in %s order, excluding raw logs', (studyOrder) => {
  const records = firebaseSessionRecords({ researchId: 'P1', studyOrder,
    questionnaires: ['demographics', 'condition-lecture', 'condition-geoscratch', 'post-study'].map((questionnaireId) => ({
      questionnaireId, status: 'submitted', answers: { answer: 'test' },
    })),
    lectureExerciseResponses: ['cube-point-pivot-rotation', 'point-plane-distance'].map((exerciseId) => ({ exerciseId, submittedAt: '2026-10-15', answer: 'test' })),
    geoscratchResults: ['create-complex-object', 'cube-point-pivot-rotation', 'point-plane-distance'].map((exerciseId) => ({ exerciseId, passed: true, durationMs: 1000, steps: {} })),
    interactionLog: { events: ['must not upload'] },
  })
  expect(records).toHaveLength(9)
  expect(new Set(records.map(({ stageId }) => stageId)).size).toBe(9)
  expect(records.find(({ stageId }) => stageId === 'condition-1').data.conditionId).toBe(studyOrder === 'lecture-first' ? 'lecture' : 'geoscratch')
  expect(JSON.stringify(records)).not.toContain('must not upload')
})

it('includes draft questionnaires with their status, excluding unrecorded exercises', () => {
  const records = firebaseSessionRecords({ researchId: 'P1', studyOrder: 'lecture-first',
    questionnaires: [{ questionnaireId: 'demographics', status: 'draft', answers: { secretDraft: 'value' } }],
  })
  expect(records).toHaveLength(1)
  expect(records[0].data).toMatchObject({ status: 'draft', responses: [{ id: 'secretDraft', answer: 'value' }] })
})
