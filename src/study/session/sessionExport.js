import { strToU8, zipSync } from 'fflate'

const ROTATION = 'cube-point-pivot-rotation'
const DISTANCE = 'point-plane-distance'
const TRIAL = 'create-complex-object'

function chronological(records, timestamp) {
  return [...records].sort((a, b) => (a[timestamp] ?? '').localeCompare(b[timestamp] ?? '')
    || (a.sequence ?? 0) - (b.sequence ?? 0))
}

export function questionnaireData(questionnaire) {
  if (!questionnaire) return { status: 'missing', responses: [] }
  const fields = questionnaire.fields ?? questionnaire.sections?.flatMap((section) => section.fields) ?? []
  const responses = fields.length ? fields.map((field) => ({
    id: field.id, question: field.question, answer: field.answer,
    ...(field.detail != null ? { detail: field.detail } : {}),
  })) : Object.entries(questionnaire.answers ?? {}).map(([id, answer]) => ({ id, answer }))
  return {
    status: questionnaire.status,
    submittedAt: questionnaire.submittedAt ?? null,
    ...(questionnaire.date != null ? { date: questionnaire.date } : {}),
    ...(questionnaire.updatedAt ? { updatedAt: questionnaire.updatedAt } : {}),
    responses,
  }
}

export function buildSessionFiles({ researchId, studyOrder, questionnaires = [], lectureExerciseResponses = [], lectureExerciseTimings = [], tutorialSummary = null, geoscratchResults = [], lectureDrafts = {}, interactionLog }) {
  if (!researchId) throw new Error('A research ID is required for session export.')
  if (studyOrder != null && !['lecture-first', 'geoscratch-first'].includes(studyOrder)) throw new Error('Unknown study order.')
  const folder = researchId.replace(/[^a-zA-Z0-9_-]/g, '-')
  const files = []
  function add(name, type, data, metadata = {}) {
    const sequence = files.length + 1
    files.push({ path: `${folder}/${String(sequence).padStart(2, '0')}_${name}.json`,
      data: { researchId, type, ...metadata, ...data } })
  }
  function addQuestionnaire(name, questionnaireId, metadata = {}) {
    add(name, 'questionnaire', questionnaireData(questionnaires.find((item) => item.questionnaireId === questionnaireId)),
      { questionnaireId, ...metadata })
  }
  function addLecture(exerciseId, number, conditionNumber) {
    const timing = lectureExerciseTimings.find((item) => item.exerciseId === exerciseId)
    const submissions = chronological(lectureExerciseResponses.filter((item) => item.exerciseId === exerciseId), 'submittedAt')
      .map((item, index) => ({ attempt: index + 1, submittedAt: item.submittedAt, answer: item.answer,
        ...(item.elapsedMs != null ? { elapsedMs: item.elapsedMs } : {}),
        ...(item.answerLabel !== undefined ? { answerLabel: item.answerLabel } : {}),
        ...(item.answerFormat !== undefined ? { answerFormat: item.answerFormat } : {}),
        ...(item.correct !== undefined ? { correct: item.correct } : {}),
      }))
    add(`lecture_exercise_${number}`, 'exercise-answers', {
      startedAt: timing?.startedAt ?? null, completedAt: timing?.completedAt ?? null,
      durationMs: timing?.durationMs ?? null, submissions,
      timedOut: timing?.timedOut ?? null, completionReason: timing?.completionReason ?? null,
      timeLimitSeconds: timing?.timeLimitSeconds ?? null,
      ...(lectureDrafts[exerciseId] != null ? { draftAnswer: lectureDrafts[exerciseId] } : {}),
    }, { conditionId: 'lecture', conditionNumber, exerciseId })
  }
  function addGeoScratch(exerciseId, name, conditionNumber) {
    const interactions = Array.isArray(interactionLog) ? interactionLog.filter((event) => event.exerciseId === exerciseId && event.conditionId === 'geoscratch') : []
    // Keep only a small completion/skip summary, never tutorial interaction data.
    add(name, 'exercise-tracking', {
      ...(exerciseId === TRIAL ? { tutorial: tutorialSummary ?? { status: 'not-recorded', skipSource: null } } : {}),
      ...(geoscratchResults.find((item) => item.exerciseId === exerciseId)
        ? { result: geoscratchResults.find((item) => item.exerciseId === exerciseId) } : {}),
      ...(interactions?.length ? { interactionSchemaVersion: interactions.some((event) => event.schemaVersion === 3) ? 3 : 2, interactions } : {}),
    },
      { conditionId: 'geoscratch', conditionNumber, exerciseId })
  }

  addQuestionnaire('demographics', 'demographics')
  if (!studyOrder) return { researchId, studyOrder: null, folder, files }
  const conditions = studyOrder === 'lecture-first' ? ['lecture', 'geoscratch'] : ['geoscratch', 'lecture']
  conditions.forEach((conditionId, index) => {
    const conditionNumber = index + 1
    if (conditionId === 'lecture') {
      addLecture(ROTATION, 1, conditionNumber)
      addLecture(DISTANCE, 2, conditionNumber)
    } else {
      addGeoScratch(TRIAL, 'geoscratch_trial', conditionNumber)
      addGeoScratch(ROTATION, 'geoscratch_exercise_1', conditionNumber)
      addGeoScratch(DISTANCE, 'geoscratch_exercise_2', conditionNumber)
    }
    addQuestionnaire(`condition_${conditionNumber}_${conditionId}`, `condition-${conditionId}`, { conditionId, conditionNumber })
  })
  addQuestionnaire('post_study', 'post-study')
  return { researchId, studyOrder, folder, files }
}

export function createSessionZip(session) {
  const archive = buildSessionFiles(session)
  const entries = Object.fromEntries(archive.files.map((file) => [file.path,
    Uint8Array.from(strToU8(JSON.stringify(file.data, null, 2)))]))
  return { archive, bytes: zipSync(entries, { level: 1 }) }
}

export function downloadSessionZip(session) {
  const { archive, bytes } = createSessionZip(session)
  const blob = new Blob([bytes], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${archive.folder}.zip`
  document.body.append(anchor)
  try { anchor.click() } finally {
    anchor.remove()
    // Give the browser time to start consuming the archive.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
