// This page deliberately only reads storage. Never repair, overwrite, or clear evidence.
export function collectStudyBackup(storage) {
  const rawStorage = {}
  const errors = []
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index)
    if (!key?.startsWith('userstudyLi.') && !key?.startsWith('geoscratch:userBlocks:userstudy-Li-')
      && key !== 'geoscratch:workspace-xml') continue
    try { rawStorage[key] = storage.getItem(key) } catch (error) {
      errors.push({ key, error: error.message })
    }
  }
  return { format: 'geoscratch-study-recovery-v1', recoveredAt: new Date().toISOString(), rawStorage, errors }
}

export function recoverStudySessions(backup) {
  const sessions = new Map()
  function session(id) {
    if (!id) return null
    if (!sessions.has(id)) sessions.set(id, { researchId: id, questionnaires: [], lectureExerciseResponses: [],
      lectureExerciseTimings: [], interactionLog: [], savedWorkspaces: {}, customBlocks: [],
      completedArchive: null, firstSavedAt: null, lastSavedAt: null, studyOrder: null })
    return sessions.get(id)
  }
  function observe(target, item) {
    if (!target || !item || typeof item !== 'object') return
    if (['lecture-first', 'geoscratch-first'].includes(item.studyOrder)) target.studyOrder = item.studyOrder
    if (item.conditionOrder === 'Lecture slides first') target.studyOrder = 'lecture-first'
    if (item.conditionOrder === 'GeoScratch Exercise first') target.studyOrder = 'geoscratch-first'
    for (const key of ['startedAt', 'submittedAt', 'updatedAt', 'occurredAt', 'completedAt', 'leftAt']) {
      const time = item[key]
      if (typeof time !== 'string' || !Number.isFinite(Date.parse(time))) continue
      if (!target.firstSavedAt || time < target.firstSavedAt) target.firstSavedAt = time
      if (!target.lastSavedAt || time > target.lastSavedAt) target.lastSavedAt = time
    }
  }
  const parsed = []
  for (const [key, raw] of Object.entries(backup.rawStorage)) {
    if (key === 'userstudyLi.currentResearchId' && raw) session(raw)
    try { parsed.push([key, JSON.parse(raw)]) } catch { /* Raw evidence is still in the backup. */ }
  }
  // Prefer current drafts over older submitted copies, but retain both if their answers differ.
  for (const [key, value] of parsed) {
    const draft = key.match(/^userstudyLi\.questionnaireDrafts\.([^.]+)\.(.+)$/)
    const interactions = key.match(/^userstudyLi\.interactions\.([^.]+)\./)
    const timing = key.match(/^userstudyLi\.lectureExerciseTiming\.([^.]+)$/)
    const archive = key.match(/^userstudyLi\.sessionExport\.([^.]+)$/)
    const blocks = key.match(/^geoscratch:userBlocks:userstudy-Li-(.+)$/)
    if (draft && value && typeof value === 'object') {
      const target = session(draft[1])
      target.questionnaires.push({ ...value, questionnaireId: draft[2], recoverySource: key })
      observe(target, value)
    } else if (interactions && Array.isArray(value)) {
      const target = session(interactions[1])
      target.interactionLog.push(...value)
      value.forEach((item) => observe(target, item))
    } else if (timing && Array.isArray(value)) {
      const target = session(timing[1])
      target.lectureExerciseTimings = value
      value.forEach((item) => observe(target, item))
    } else if (archive && value) {
      const target = session(archive[1])
      target.completedArchive = value
      if (value.studyOrder) target.studyOrder = value.studyOrder
    } else if (blocks && Array.isArray(value)) session(blocks[1]).customBlocks = value
    else if (key === 'geoscratch:workspace-xml' && value && typeof value === 'object') {
      for (const [workspaceId, xml] of Object.entries(value)) {
        const match = workspaceId.match(/^userstudy-Li-(.+)-(create-complex-object|cube-point-pivot-rotation|point-plane-distance|tutorial)$/)
        if (match) session(match[1]).savedWorkspaces[workspaceId] = xml
      }
    } else if (key === 'userstudyLi.currentResearchId' && typeof value === 'string') session(value)
  }
  const eventIds = new Map([...sessions].map(([id, target]) => [id,
    new Set(target.interactionLog.map((item) => item.eventId).filter(Boolean))]))
  const questionnaireIds = { 'userstudyLi.demographicsResponses': 'demographics',
    'userstudyLi.postStudyResponses': 'post-study' }
  for (const [key, value] of parsed) {
    if (!Array.isArray(value)) continue
    if (key === 'userstudyLi.lectureExerciseResponses') {
      for (const record of value) {
        const target = session(record.researchId)
        if (target) {
          if (!target.lectureExerciseResponses.some((item) => JSON.stringify(item) === JSON.stringify(record))) {
            target.lectureExerciseResponses.push(record)
          }
          observe(target, record)
        }
      }
    } else if (key in questionnaireIds || key === 'userstudyLi.conditionResponses') {
      for (const record of value) {
        const target = session(record.researchId)
        if (!target) continue
        const questionnaireId = questionnaireIds[key] ?? `condition-${record.conditionId
          ?? (record.condition === 'Lecture slides' ? 'lecture' : 'geoscratch')}`
        const sameAnswers = target.questionnaires.some((item) => item.questionnaireId === questionnaireId
          && JSON.stringify(item.answers) === JSON.stringify(record.answers))
        if (!sameAnswers) target.questionnaires.push({ ...record, questionnaireId,
          status: 'submitted', recoverySource: key })
        observe(target, record)
        // Earlier versions duplicated records into submitted questionnaires.
        if (!eventIds.has(target.researchId)) eventIds.set(target.researchId, new Set())
        const seen = eventIds.get(target.researchId)
        for (const event of record.interactionLog ?? []) {
          if (!event.eventId || !seen.has(event.eventId)) {
            target.interactionLog.push(event)
            if (event.eventId) seen.add(event.eventId)
          }
          observe(target, event)
        }
        for (const answer of record.lectureExerciseResponses ?? []) {
          if (!target.lectureExerciseResponses.some((item) => JSON.stringify(item) === JSON.stringify(answer))) {
            target.lectureExerciseResponses.push(answer)
          }
        }
      }
    }
  }
  for (const target of sessions.values()) {
    target.interactionLog.sort((a, b) => (a.occurredAt ?? '').localeCompare(b.occurredAt ?? '') || a.sequence - b.sequence)
    target.lectureExerciseResponses.sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''))
  }
  return [...sessions.values()].sort((a, b) => (b.firstSavedAt ?? '').localeCompare(a.firstSavedAt ?? ''))
}

export function downloadRecoveryJson(data, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
