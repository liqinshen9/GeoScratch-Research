import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate'
import { createSessionZip } from '../src/study/session/sessionExport.js'

const outputDirectory = path.dirname(fileURLToPath(import.meta.url))
const inputDirectory = 'C:/Users/spong/Downloads'
const ids = ['XRP43T', '3CGHXK']

for (const researchId of ids) {
  const sourcePath = path.join(inputDirectory, `${researchId}-recovered.json`)
  const originalBytes = await fs.readFile(sourcePath)
  const source = JSON.parse(originalBytes.toString('utf8'))
  assert.equal(source.researchId, researchId)
  assert.equal(source.studyOrder, 'lecture-first')
  // Use the production exporter, preserving each session's own answers and timestamps.
  const { archive, bytes } = createSessionZip(source)
  assert.equal(archive.files.length, 9)
  const entries = unzipSync(bytes)
  const notes = {
    researchId,
    sourceFilename: path.basename(sourcePath),
    sourceSha256: createHash('sha256').update(originalBytes).digest('hex'),
    studyOrder: source.studyOrder,
    firstSavedAt: source.firstSavedAt,
    lastSavedAt: source.lastSavedAt,
    format: 'The nine numbered JSON files use the current study exporter. The _recovery folder preserves the original recovered data and these notes.',
    sessionRelationship: 'This session is kept separate from the other interrupted session. No answers or durations have been copied between sessions.',
    postStudy: 'No post-study questionnaire exists in this recovered source. The separately collected post-study data has not been included or assigned to this research ID.',
    questionnaires: source.questionnaires.map((item) => ({
      questionnaireId: item.questionnaireId, status: item.status,
      submittedAt: item.submittedAt ?? null, updatedAt: item.updatedAt ?? null,
      nonEmptyAnswerCount: Object.values(item.answers ?? {}).filter((value) => value !== null && value !== '').length,
      recoverySource: item.recoverySource,
    })),
    missingQuestionnaires: ['demographics', 'condition-lecture', 'condition-geoscratch', 'post-study']
      .filter((id) => !source.questionnaires.some((item) => item.questionnaireId === id)),
    lectureSubmissionCount: source.lectureExerciseResponses.length,
    interactionRecordCount: source.interactionLog.length,
    savedWorkspaceIds: Object.keys(source.savedWorkspaces ?? {}),
    customBlockCount: source.customBlocks?.length ?? 0,
    limitations: [
      'Blank answers remain blank. Missing questionnaires are marked missing by the exporter.',
      'An exercise with no submissions/events does not imply that it was completed.',
      'Recorded lecture timings describe this session only; a brief revisit is not the duration of the earlier attempt.',
      'The original source retains all interaction contexts, saved workspace XML, custom blocks, and recovery metadata, including records outside the exercise timelines.',
    ],
  }
  entries[`${researchId}/_recovery/original_recovered_session.json`] = new Uint8Array(originalBytes)
  entries[`${researchId}/_recovery/recovery_notes.json`] = strToU8(JSON.stringify(notes, null, 2))
  const outputPath = path.join(outputDirectory, `${researchId}.zip`)
  await fs.writeFile(outputPath, zipSync(entries, { level: 6 }))

  // Verify the written archive, every questionnaire answer/detail, all submissions,
  // all exercise event counts, and the exact original source bytes.
  const verified = unzipSync(new Uint8Array(await fs.readFile(outputPath)))
  assert.equal(Object.keys(verified).length, 11)
  assert(Object.keys(verified).every((name) => name.startsWith(`${researchId}/`)))
  assert.deepEqual(Buffer.from(verified[`${researchId}/_recovery/original_recovered_session.json`]), originalBytes)
  for (const file of archive.files) {
    const actual = JSON.parse(strFromU8(verified[file.path]))
    assert.deepEqual(actual, file.data)
    if (actual.type === 'questionnaire') {
      const original = source.questionnaires.find((item) => item.questionnaireId === actual.questionnaireId)
      if (!original) { assert.equal(actual.status, 'missing'); continue }
      assert.equal(actual.status, original.status)
      for (const response of actual.responses) {
        assert.equal(response.answer, original.answers[response.id])
        const originalFields = original.fields ?? original.sections?.flatMap((section) => section.fields) ?? []
        const field = originalFields.find((item) => item.id === response.id)
        if (field?.detail != null) assert.equal(response.detail, field.detail)
      }
    } else if (actual.type === 'exercise-answers') {
      const original = source.lectureExerciseResponses.filter((item) => item.exerciseId === actual.exerciseId)
      assert.equal(actual.submissions.length, original.length)
      assert.deepEqual(actual.submissions.map((item) => item.answer), original.map((item) => item.answer))
    } else if (actual.type === 'exercise-tracking') {
      const expected = source.interactionLog.filter((event) => event.conditionId === 'geoscratch'
        && event.phase === 'geoscratch' && (event.exerciseId === actual.exerciseId
          || (actual.exerciseId === 'create-complex-object' && event.exerciseId === 'tutorial')))
      assert.equal(actual.events.length, expected.length)
    }
  }
  console.log(JSON.stringify({ researchId, outputPath, bytes: (await fs.stat(outputPath)).size,
    numberedFiles: archive.files.map((file) => path.basename(file.path)),
    missingQuestionnaires: notes.missingQuestionnaires, verified: true }))
}
