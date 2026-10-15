import { useCallback, useRef, useState } from 'react'
import { STUDY_PERSISTENCE_ENABLED } from './studyStorage'

export default function useLectureExerciseTiming(researchId) {
  const session = useRef({ researchId: null, exercises: {} })
  const [storageError, setStorageError] = useState(null)
  const entries = useCallback(() => {
    if (session.current.researchId !== researchId) session.current = { researchId, exercises: {} }
    return session.current.exercises
  }, [researchId])
  const read = useCallback(() => Object.values(entries()).map((entry) => ({
    exerciseId: entry.exerciseId, startedAt: entry.startedAt,
    completedAt: entry.completedAt, durationMs: entry.durationMs,
    timedOut: entry.timedOut ?? null, completionReason: entry.completionReason ?? null,
    timeLimitSeconds: entry.timeLimitSeconds ?? null,
  })), [entries])
  const persist = useCallback(() => {
    if (!STUDY_PERSISTENCE_ENABLED) return
    try {
      window.localStorage.setItem(`userstudyLi.lectureExerciseTiming.${researchId}`, JSON.stringify(read()))
      setStorageError(null)
    } catch {
      // The timing entries remain in memory and are included in the ZIP.
      setStorageError('Lecture timings are kept in this tab because browser backup is unavailable. Finish and download the study ZIP before closing or refreshing.')
    }
  }, [researchId, read])
  const start = useCallback((exerciseId, timeLimitSeconds = null) => {
    if (!researchId) return
    const exercises = entries()
    if (exercises[exerciseId]) return
    exercises[exerciseId] = { exerciseId, startedAt: new Date().toISOString(),
      startedMonotonic: performance.now(), completedAt: null, durationMs: null,
      timeLimitSeconds, timedOut: false, completionReason: null }
    persist()
  }, [entries, persist, researchId])
  const elapsed = useCallback((exerciseId) => {
    const entry = entries()[exerciseId]
    return entry ? Math.max(0, Math.round(performance.now() - entry.startedMonotonic)) : null
  }, [entries])
  const finish = useCallback((exerciseId, reason = 'next') => {
    const entry = entries()[exerciseId]
    if (!entry || (entry.completedAt !== null && (reason !== 'timeout' || entry.timedOut))) return
    entry.completedAt = new Date().toISOString()
    entry.durationMs = elapsed(exerciseId)
    entry.timedOut = reason === 'timeout'
    entry.completionReason = reason
    persist()
  }, [entries, elapsed, persist])
  const restore = useCallback((nextResearchId, timings) => {
    session.current = { researchId: nextResearchId, exercises: Object.fromEntries((timings ?? []).map((entry) => [entry.exerciseId, {
      ...entry, startedMonotonic: performance.now() - Math.max(0, Date.now() - Date.parse(entry.startedAt)),
    }])) }
  }, [])
  return { start, finish, elapsed, read, restore, storageError }
}
