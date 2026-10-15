export function recoveredSession(remote, researchId) {
  const snapshot = { phase: 'complete', researchId, studyOrder: remote.studyOrder,
    questionnaires: [], lectureExerciseResponses: [], lectureExerciseTimings: [], geoscratchResults: [],
    ...remote.snapshot }
  for (const { data } of remote.records ?? []) {
    if (data.type === 'questionnaire') {
      const previous = snapshot.questionnaires.find((item) => item.questionnaireId === data.questionnaireId)
      if (previous && previous.updatedAt > data.updatedAt) continue
      const answers = Object.fromEntries((data.responses ?? []).map((field) => [field.id, field.answer]))
      const details = Object.fromEntries((data.responses ?? []).filter((field) => field.detail != null).map((field) => [`${field.id}Detail`, field.detail]))
      const record = { ...data, fields: data.responses, answers, rawAnswers: { ...answers, ...details, date: data.date }, researchId }
      snapshot.questionnaires = [...snapshot.questionnaires.filter((item) => item.questionnaireId !== data.questionnaireId), record]
    } else if (data.type === 'exercise-answers') {
      snapshot.lectureExerciseResponses = [...snapshot.lectureExerciseResponses.filter((item) => item.exerciseId !== data.exerciseId),
        ...data.submissions.map((item) => ({ ...item, exerciseId: data.exerciseId }))]
      snapshot.lectureExerciseTimings = [...snapshot.lectureExerciseTimings.filter((item) => item.exerciseId !== data.exerciseId),
        { exerciseId: data.exerciseId, startedAt: data.startedAt, completedAt: data.completedAt, durationMs: data.durationMs,
          timedOut: data.timedOut ?? null, completionReason: data.completionReason ?? null, timeLimitSeconds: data.timeLimitSeconds ?? null }]
    } else if (data.result) {
      snapshot.geoscratchResults = [...snapshot.geoscratchResults.filter((item) => item.exerciseId !== data.exerciseId), data.result]
    }
  }
  return snapshot
}
