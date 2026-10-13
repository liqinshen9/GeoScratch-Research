import { useCallback, useRef } from 'react'

export default function useLectureExerciseTiming(researchId) {
  const session = useRef({ researchId: null, exercises: {} })
  const entries = useCallback(() => {
    if (session.current.researchId !== researchId) session.current = { researchId, exercises: {} }
    return session.current.exercises
  }, [researchId])
  const read = useCallback(() => Object.values(entries()).map((entry) => ({
    exerciseId: entry.exerciseId, startedAt: entry.startedAt,
    completedAt: entry.completedAt, durationMs: entry.durationMs,
  })), [entries])
  const persist = useCallback(() => {
    window.localStorage.setItem(`userstudyLi.lectureExerciseTiming.${researchId}`, JSON.stringify(read()))
  }, [researchId, read])
  const start = useCallback((exerciseId) => {
    const exercises = entries()
    if (exercises[exerciseId]) return
    exercises[exerciseId] = { exerciseId, startedAt: new Date().toISOString(),
      startedMonotonic: performance.now(), completedAt: null, durationMs: null }
    persist()
  }, [entries, persist])
  const elapsed = useCallback((exerciseId) => {
    const entry = entries()[exerciseId]
    return entry ? Math.max(0, Math.round(performance.now() - entry.startedMonotonic)) : null
  }, [entries])
  const finish = useCallback((exerciseId) => {
    const entry = entries()[exerciseId]
    if (!entry || entry.completedAt !== null) return
    entry.completedAt = new Date().toISOString()
    entry.durationMs = elapsed(exerciseId)
    persist()
  }, [entries, elapsed, persist])
  return { start, finish, elapsed, read }
}
