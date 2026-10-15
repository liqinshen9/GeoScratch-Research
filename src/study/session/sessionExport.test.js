import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { buildSessionFiles, createSessionZip } from './sessionExport'

const session = {
  researchId: 'research-123', studyOrder: 'lecture-first',
  questionnaires: [{ questionnaireId: 'demographics', status: 'submitted', submittedAt: '2026-10-13T01:00:00.000Z',
    route: '/userstudy-Li', date: '2026-10-13', rawAnswers: { gender: 'A' }, answers: { gender: 'A' },
    fields: [{ id: 'gender', question: 'Gender?', answer: 'A', detail: null }] }],
  lectureExerciseResponses: [
    { exerciseId: 'cube-point-pivot-rotation', submittedAt: '2026-10-13T01:02:00.000Z', answer: '第二次答案' },
    { exerciseId: 'cube-point-pivot-rotation', submittedAt: '2026-10-13T01:01:00.000Z', answer: 'First answer' },
  ],
  interactionLog: [
    { researchId: 'research-123', studyOrder: 'lecture-first', phase: 'geoscratch', conditionId: 'geoscratch',
      exerciseId: 'create-complex-object', occurredAt: '2026-10-13T01:05:00.000Z', sequence: 4, type: 'click', target: { label: 'Save' } },
    { phase: 'geoscratch', conditionId: 'geoscratch', exerciseId: 'tutorial', occurredAt: '2026-10-13T01:04:00.000Z', sequence: 3, type: 'screen_enter' },
  ],
  lectureExerciseTimings: [{ exerciseId: 'cube-point-pivot-rotation', startedAt: '2026-10-13T01:00:00.000Z', completedAt: '2026-10-13T01:03:00.000Z', durationMs: 180000 }],
}

describe('ordered session archive', () => {
  it('creates the nine stages in lecture-first order without duplicate questionnaire representations', () => {
    const result = buildSessionFiles(session)
    expect(result.files.map((file) => file.path)).toEqual([
      'research-123/01_demographics.json', 'research-123/02_lecture_exercise_1.json',
      'research-123/03_lecture_exercise_2.json', 'research-123/04_condition_1_lecture.json',
      'research-123/05_geoscratch_trial.json', 'research-123/06_geoscratch_exercise_1.json',
      'research-123/07_geoscratch_exercise_2.json', 'research-123/08_condition_2_geoscratch.json',
      'research-123/09_post_study.json',
    ])
    expect(result.files[0].data.responses).toEqual([{ id: 'gender', question: 'Gender?', answer: 'A' }])
    expect(result.files[0].data.date).toBe('2026-10-13')
    expect(result.files.every((file) => !Object.hasOwn(file.data, 'sequence'))).toBe(true)
    expect(JSON.stringify(result)).not.toContain('"route"')
    expect(JSON.stringify(result)).not.toContain('"rawAnswers"')
    expect(result.files[1].data.submissions.map((answer) => answer.answer)).toEqual(['First answer', '第二次答案'])
    expect(result.files[1].data.submissions.map((answer) => answer.attempt)).toEqual([1, 2])
    expect(result.files[1].data).toMatchObject({ startedAt: '2026-10-13T01:00:00.000Z', completedAt: '2026-10-13T01:03:00.000Z', durationMs: 180000 })
    expect(result.files[2].data).toMatchObject({ startedAt: null, completedAt: null, durationMs: null })
    expect(result.files[4].data).not.toHaveProperty('tutorialEvents')
    for (const file of result.files.slice(4, 7)) {
      expect(file.data).not.toHaveProperty('events')
      expect(file.data).not.toHaveProperty('finalWorkspace')
    }
  })

  it('switches file ordering and condition numbers for GeoScratch-first', () => {
    const result = buildSessionFiles({ ...session, studyOrder: 'geoscratch-first' })
    expect(result.files.map((file) => file.path.split('/')[1])).toEqual([
      '01_demographics.json', '02_geoscratch_trial.json', '03_geoscratch_exercise_1.json',
      '04_geoscratch_exercise_2.json', '05_condition_1_geoscratch.json', '06_lecture_exercise_1.json',
      '07_lecture_exercise_2.json', '08_condition_2_lecture.json', '09_post_study.json',
    ])
    expect(result.files[5].data.conditionNumber).toBe(2)
  })
  it('preserves a small tutorial completion summary without exporting historical tutorial logs', () => {
    const archive = buildSessionFiles({ ...session, tutorialSummary: { status: 'completed', skipSource: null } })
    expect(archive.files[4].data.tutorial).toEqual({ status: 'completed', skipSource: null })
    expect(JSON.stringify(archive)).not.toContain('screen_enter')
  })

  it('includes exercise interaction histories without changing the original records', () => {
    const records = ['create-complex-object', 'cube-point-pivot-rotation', 'point-plane-distance'].map((exerciseId) => ({
      phase: 'geoscratch', conditionId: 'geoscratch', exerciseId, type: 'workspace_snapshot',
      snapshot: { largePrivateSnapshot: 'old saved workspace' }, occurredAt: '2026-10-13T01:05:00.000Z',
    }))
    const before = JSON.stringify(records)
    const archive = buildSessionFiles({ ...session, interactionLog: [...session.interactionLog, ...records] })
    expect(JSON.stringify(archive)).toContain('largePrivateSnapshot')
    expect(JSON.stringify(records)).toBe(before)
  })

  it('creates a readable ZIP preserving JSON contents and Unicode answers', () => {
    const { archive, bytes } = createSessionZip(session)
    const extracted = unzipSync(bytes)
    expect(Object.keys(extracted)).toEqual(archive.files.map((file) => file.path))
    for (const file of archive.files) expect(JSON.parse(strFromU8(extracted[file.path]))).toEqual(file.data)
  })

  it('rejects unspecified sessions and prevents folder path injection', () => {
    expect(() => buildSessionFiles({ ...session, researchId: '' })).toThrow()
    expect(buildSessionFiles({ ...session, studyOrder: null }).files).toHaveLength(1)
    expect(buildSessionFiles({ ...session, researchId: '../outside' }).folder).toBe('---outside')
  })
})
