import { buildSessionFiles, questionnaireData } from '../session/sessionExport'

export function firebaseSessionRecords(session) {
  if (!session.researchId) return []
  if (!session.studyOrder) {
    const demographics = session.questionnaires?.find((item) => item.questionnaireId === 'demographics')
    return demographics ? [{ stageId: 'demographics', data: {
      researchId: session.researchId, type: 'questionnaire', questionnaireId: 'demographics',
      ...questionnaireData(demographics),
    } }] : []
  }
  return buildSessionFiles(session).files.flatMap(({ data }) => {
    let stageId
    if (data.type === 'questionnaire') {
      if (data.status === 'missing') return []
      stageId = data.questionnaireId.startsWith('condition-')
        ? `condition-${data.conditionNumber}` : data.questionnaireId
    } else if (data.conditionId === 'lecture') {
      if (!data.startedAt && !data.submissions.length) return []
      stageId = data.exerciseId === 'cube-point-pivot-rotation' ? 'lecture-exercise-1' : 'lecture-exercise-2'
    } else {
      if (!data.result) return []
      stageId = data.exerciseId === 'create-complex-object' ? 'geoscratch-trial'
        : data.exerciseId === 'cube-point-pivot-rotation' ? 'geoscratch-exercise-1' : 'geoscratch-exercise-2'
    }
    return [{ stageId, data }]
  })
}
