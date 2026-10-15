import { useEffect, useState } from 'react'
import { STUDY_PERSISTENCE_ENABLED } from './studyStorage'

const PREFIX = 'userstudyLi.questionnaireDrafts.'
const keyFor = (researchId, questionnaireId) => `${PREFIX}${researchId}.${questionnaireId}`
const unsaved = new Map()

function readRecord(key) {
  if (unsaved.has(key)) return unsaved.get(key)
  if (!STUDY_PERSISTENCE_ENABLED) return null
  try {
    const saved = window.localStorage.getItem(key)
    return saved ? JSON.parse(saved) : null
  } catch { return null }
}

function writeRecord(key, record) {
  if (!STUDY_PERSISTENCE_ENABLED) {
    unsaved.set(key, record)
    window.dispatchEvent(new CustomEvent('geoscratch:questionnaire-changed', { detail: { researchId: record.researchId } }))
    return true
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(record))
    unsaved.delete(key)
    return true
  } catch {
    // Preserve answers for the final download even when localStorage is full.
    unsaved.set(key, record)
    return false
  }
}

export function restoreSessionQuestionnaires(researchId, records) {
  for (const record of records ?? []) unsaved.set(keyFor(researchId, record.questionnaireId), record)
}

export function readQuestionnaireDraft(researchId, questionnaireId) {
  return readRecord(keyFor(researchId, questionnaireId))
}

export function readSessionQuestionnaires(researchId) {
  const prefix = `${PREFIX}${researchId}.`
  const results = new Map()
  try {
    for (let index = 0; STUDY_PERSISTENCE_ENABLED && index < window.localStorage.length; index++) {
      const key = window.localStorage.key(index)
      if (key?.startsWith(prefix)) {
        const record = readRecord(key)
        if (record) results.set(key, record)
      }
    }
  } catch { /* In-memory answers remain available for export. */ }
  for (const [key, record] of unsaved) if (key.startsWith(prefix)) results.set(key, record)
  return [...results.values()].sort((a, b) => a.questionnaireId.localeCompare(b.questionnaireId))
}

export function markQuestionnaireSubmitted(researchId, questionnaireId, payload) {
  const previous = readQuestionnaireDraft(researchId, questionnaireId)
  return writeRecord(keyFor(researchId, questionnaireId), {
    ...previous, ...payload, researchId, questionnaireId, status: 'submitted',
    updatedAt: new Date().toISOString(),
  })
}

export function useQuestionnaireAutosave({ researchId, questionnaireId, answers, buildPayload, enabled }) {
  const [storageError, setStorageError] = useState(null)
  useEffect(() => {
    if (!researchId || !enabled) return
    const saved = writeRecord(keyFor(researchId, questionnaireId), {
      ...buildPayload(answers, researchId), researchId, questionnaireId,
      rawAnswers: answers, status: 'draft', submittedAt: null,
      updatedAt: new Date().toISOString(), collectionEnabled: enabled,
    })
    setStorageError(saved ? null : 'Browser storage is full or unavailable. These answers are kept in this tab only. Finish and download your study data before closing or refreshing this page.')
  }, [researchId, questionnaireId, answers, buildPayload, enabled])

  useEffect(() => () => {
    if (!researchId || !enabled) return
    const previous = readQuestionnaireDraft(researchId, questionnaireId)
    if (previous?.status === 'draft') writeRecord(keyFor(researchId, questionnaireId), {
      ...previous, status: 'not-submitted', leftAt: new Date().toISOString(),
    })
  }, [researchId, questionnaireId, enabled])
  return storageError
}
