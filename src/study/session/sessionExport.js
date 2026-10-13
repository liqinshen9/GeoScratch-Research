import { strToU8, zipSync } from 'fflate'

const ROTATION = 'cube-point-pivot-rotation'
const DISTANCE = 'point-plane-distance'
const TRIAL = 'create-complex-object'

function chronological(records, timestamp) {
  return [...records].sort((a, b) => (a[timestamp] ?? '').localeCompare(b[timestamp] ?? '')
    || (a.sequence ?? 0) - (b.sequence ?? 0))
}

function questionnaireData(questionnaire) {
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

function leanEvent(event, exerciseId) {
  // Session/exercise identity lives in the enclosing file, rather than every event.
  const result = { sequence: event.sequence, type: event.type, occurredAt: event.occurredAt,
    sessionElapsedMs: event.sessionElapsedMs }
  if (event.exerciseId !== exerciseId) result.exerciseId = event.exerciseId
  for (const [key, value] of Object.entries(event)) {
    if (['researchId', 'studyOrder', 'conditionId', 'phase', 'exerciseId', 'streamId', 'eventId', 'schemaVersion',
      'sequence', 'type', 'occurredAt', 'sessionElapsedMs'].includes(key)) continue
    if (value !== undefined) result[key] = value
  }
  return result
}

export function buildSessionFiles({ researchId, studyOrder, questionnaires = [], lectureExerciseResponses = [], lectureExerciseTimings = [], interactionLog = [] }) {
  if (!researchId) throw new Error('A research ID is required for session export.')
  if (!['lecture-first', 'geoscratch-first'].includes(studyOrder)) throw new Error('Unknown study order.')
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
        ...(item.correct !== undefined ? { correct: item.correct } : {}),
      }))
    add(`lecture_exercise_${number}`, 'exercise-answers', {
      startedAt: timing?.startedAt ?? null, completedAt: timing?.completedAt ?? null,
      durationMs: timing?.durationMs ?? null, submissions,
    }, { conditionId: 'lecture', conditionNumber, exerciseId })
  }
  function addGeoScratch(exerciseId, name, conditionNumber) {
    const rawEvents = chronological(interactionLog.filter((event) => event.conditionId === 'geoscratch'
      && event.phase === 'geoscratch' && (event.exerciseId === exerciseId || (exerciseId === TRIAL && event.exerciseId === 'tutorial'))), 'occurredAt')
    const finalSnapshot = [...rawEvents].reverse().find((event) => event.type === 'workspace_snapshot'
      && event.exerciseId === exerciseId && event.snapshot)
    const events = rawEvents.map((event) => {
      // Keep the latest full arrangement once, in finalWorkspace. Earlier snapshots remain in the timeline.
      const details = event === finalSnapshot ? { ...event, snapshot: undefined } : event
      return leanEvent(details, exerciseId)
    })
    let tutorial
    if (exerciseId === TRIAL) {
      const started = events.find((event) => event.type === 'tutorial_start')
      const skipped = events.find((event) => event.type === 'tutorial_skip')
      const completed = events.find((event) => event.type === 'tutorial_complete')
      tutorial = { status: skipped ? started ? 'skipped-after-start' : 'skipped' : completed ? 'completed' : started ? 'started' : 'not-recorded',
        startedAt: started?.occurredAt ?? null, skippedAt: skipped?.occurredAt ?? null,
        completedAt: completed?.occurredAt ?? null, skipSource: skipped?.source ?? null }
    }
    add(name, 'exercise-tracking', { ...(tutorial ? { tutorial } : {}),
      finalWorkspace: finalSnapshot ? { capturedAt: finalSnapshot.occurredAt, reason: finalSnapshot.reason, ...finalSnapshot.snapshot } : null,
      events }, { conditionId: 'geoscratch', conditionNumber, exerciseId })
  }

  addQuestionnaire('demographics', 'demographics')
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
