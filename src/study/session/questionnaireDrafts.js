import { useEffect } from 'react'

const PREFIX = 'userstudyLi.questionnaireDrafts.'
const keyFor = (researchId, questionnaireId) => `${PREFIX}${researchId}.${questionnaireId}`

export function readQuestionnaireDraft(researchId, questionnaireId) {
  const saved = window.localStorage.getItem(keyFor(researchId, questionnaireId))
  return saved ? JSON.parse(saved) : null
}

export function readSessionQuestionnaires(researchId) {
  const prefix = `${PREFIX}${researchId}.`
  const results = []
  for (let index = 0; index < window.localStorage.length; index++) {
    const key = window.localStorage.key(index)
    if (key?.startsWith(prefix)) results.push(JSON.parse(window.localStorage.getItem(key)))
  }
  return results.sort((a, b) => a.questionnaireId.localeCompare(b.questionnaireId))
}

export function markQuestionnaireSubmitted(researchId, questionnaireId, payload) {
  const previous = readQuestionnaireDraft(researchId, questionnaireId)
  window.localStorage.setItem(keyFor(researchId, questionnaireId), JSON.stringify({
    ...previous, ...payload, researchId, questionnaireId, status: 'submitted',
    updatedAt: new Date().toISOString(),
  }))
}

export function useQuestionnaireAutosave({ researchId, questionnaireId, answers, buildPayload, enabled }) {
  useEffect(() => {
    if (!researchId) return
    window.localStorage.setItem(keyFor(researchId, questionnaireId), JSON.stringify({
      ...buildPayload(answers, researchId), researchId, questionnaireId,
      rawAnswers: answers, status: 'draft', submittedAt: null,
      updatedAt: new Date().toISOString(), collectionEnabled: enabled,
    }))
  }, [researchId, questionnaireId, answers, buildPayload, enabled])

  useEffect(() => () => {
    if (!researchId) return
    const previous = readQuestionnaireDraft(researchId, questionnaireId)
    if (previous?.status === 'draft') window.localStorage.setItem(keyFor(researchId, questionnaireId), JSON.stringify({
      ...previous, status: 'not-submitted', leftAt: new Date().toISOString(),
    }))
  }, [researchId, questionnaireId])
}
