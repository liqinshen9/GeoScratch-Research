import { describe, expect, it } from 'vitest'
import { collectStudyBackup, recoverStudySessions } from '../../../public/study-recovery.js'

function storageFor(values) {
  return { length: Object.keys(values).length, key: (index) => Object.keys(values)[index],
    getItem: (key) => values[key], setItem: () => { throw new Error('Recovery must never write storage') } }
}

describe('unfinished study recovery', () => {
  it('recovers the known and unidentified earlier session, including unsubmitted open answers, without changing evidence', () => {
    const values = {
      'userstudyLi.questionnaireDrafts.EARLIER.condition-lecture': JSON.stringify({
        researchId: 'EARLIER', questionnaireId: 'condition-lecture', status: 'draft',
        updatedAt: '2026-10-13T01:00:00Z', answers: { mostHelpfulPart: 'Important early answer' },
        rawAnswers: { mostHelpfulPart: 'Important early answer' },
      }),
      'userstudyLi.questionnaireDrafts.3CGHXK.condition-geoscratch': JSON.stringify({
        researchId: '3CGHXK', questionnaireId: 'condition-geoscratch', status: 'draft',
        updatedAt: '2026-10-13T02:00:00Z', answers: { mostDifficultPart: 'Important final answer' },
      }),
      'userstudyLi.lectureExerciseResponses': JSON.stringify([{ researchId: 'EARLIER',
        exerciseId: 'cube-point-pivot-rotation', answer: 'Translate, rotate, translate',
        studyOrder: 'lecture-first', submittedAt: '2026-10-13T00:30:00Z' }]),
      'userstudyLi.interactions.3CGHXK.stream.0': JSON.stringify([{ eventId: 'event-1', sequence: 1,
        type: 'block_field_change', fieldName: 'ANGLE', oldValue: 30, newValue: 90,
        studyOrder: 'lecture-first', occurredAt: '2026-10-13T01:30:00Z' }]),
      'geoscratch:workspace-xml': JSON.stringify({ 'userstudy-Li-3CGHXK-point-plane-distance': '<xml>blocks</xml>' }),
      'unrelated-account-data': 'must not export',
      'userstudyLi.broken': 'preserve malformed original',
    }
    const original = JSON.stringify(values)
    const backup = collectStudyBackup(storageFor(values))
    expect(backup.rawStorage['unrelated-account-data']).toBeUndefined()
    expect(backup.rawStorage['userstudyLi.broken']).toBe('preserve malformed original')
    const sessions = recoverStudySessions(backup)
    expect(sessions.map((item) => item.researchId)).toEqual(['3CGHXK', 'EARLIER'])
    expect(sessions[0]).toMatchObject({ studyOrder: 'lecture-first',
      questionnaires: [{ status: 'draft', answers: { mostDifficultPart: 'Important final answer' } }],
      interactionLog: [{ oldValue: 30, newValue: 90 }],
      savedWorkspaces: { 'userstudy-Li-3CGHXK-point-plane-distance': '<xml>blocks</xml>' },
    })
    expect(sessions[1].questionnaires[0].answers.mostHelpfulPart).toBe('Important early answer')
    expect(sessions[1].lectureExerciseResponses[0].answer).toBe('Translate, rotate, translate')
    expect(JSON.stringify(values)).toBe(original)
  })

  it('uses legacy questionnaire backups and their embedded logs without losing newer drafts', () => {
    const event = { eventId: 'one', type: 'click', sequence: 1, occurredAt: '2026-10-13T01:00:00Z' }
    const backup = collectStudyBackup(storageFor({
      'userstudyLi.questionnaireDrafts.3CGHXK.condition-lecture': JSON.stringify({
        answers: { mostHelpfulPart: 'Revised draft' }, status: 'draft',
      }),
      'userstudyLi.conditionResponses': JSON.stringify([{ researchId: '3CGHXK', condition: 'Lecture slides',
        answers: { mostHelpfulPart: 'Submitted earlier' }, studyOrder: 'lecture-first', interactionLog: [event] }]),
      'userstudyLi.interactions.3CGHXK.stream.0': JSON.stringify([event]),
      'userstudyLi.postStudyResponses': JSON.stringify([{ researchId: 'POSTID', conditionOrder: 'Lecture slides first',
        answers: { tutorialEffectiveness: '5' }, submittedAt: '2026-10-13T03:00:00Z' }]),
    }))
    const sessions = recoverStudySessions(backup)
    const target = sessions.find((item) => item.researchId === '3CGHXK')
    expect(target.questionnaires.map((item) => item.answers.mostHelpfulPart)).toEqual(['Revised draft', 'Submitted earlier'])
    expect(target.interactionLog).toHaveLength(1)
    expect(sessions.find((item) => item.researchId === 'POSTID').questionnaires[0]).toMatchObject({
      questionnaireId: 'post-study', status: 'submitted', answers: { tutorialEffectiveness: '5' },
    })
  })
})
