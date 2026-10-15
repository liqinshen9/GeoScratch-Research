import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { createInteractionTracker } from '../session/interactionTracking'
import { workspaceSnapshot } from '../session/workspaceTracking'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import { compactInteraction } from '../session/interactionCodec'

const EXERCISES = ['create-complex-object', 'cube-point-pivot-rotation', 'point-plane-distance']

// Persist compact evidence through the durable writer. Keep only the latest
// reconstruction baseline and locally failed writes in memory.
export default function useFirestoreInteractionTracking({ researchId, context, writeInteraction, flushUploads }) {
  const tracker = useRef(null)
  const writer = useRef(writeInteraction)
  writer.current = writeInteraction
  const upload = useRef(flushUploads)
  upload.current = flushUploads
  const current = useRef(context)
  current.current = context
  const requests = useRef(new Set())
  const failed = useRef(false)
  const unsaved = useRef(new Map())
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const enabled = Boolean(writeInteraction)
  const recording = useRef(researchId)
  recording.current = researchId
  const capture = useCallback((type, details = {}) => {
    if (!['workspace_snapshot', 'step_completed', 'step_check', 'exercise_timeout', 'exercise_finished'].includes(type)) {
      return tracker.current?.record(type, details)
    }
    const state = useWorkspaceStore.getState()
    const saved = Object.entries(state.savedXml ?? {}).find(([id]) => id.startsWith(`userstudy-Li-${current.current?.researchId ?? ''}`)
      && id.endsWith(`-${current.current?.exerciseId}`))
    return tracker.current?.record(type, { ...details,
      snapshot: state.workspace && !state.workspace.isDisposed?.() ? workspaceSnapshot(state.workspace, state.userBlocks ?? [])
        : saved ? { format: 'blockly-xml', xml: saved[1], customBlocks: state.userBlocks ?? [], source: 'saved-workspace' }
          : { format: 'blockly-json', state: {}, customBlocks: state.userBlocks ?? [], source: 'empty-workspace' },
    })
  }, [])
  useLayoutEffect(() => {
    if (!researchId || !enabled) return
    let closed = false
    failed.current = false
    setError('')
    const evaluations = new Map()
    const snapshots = new Map()
    const revisions = new Map()
    const writes = requests.current = new Set()
    tracker.current = createInteractionTracker({ researchId,
      getWorkspace: () => useWorkspaceStore.getState().workspace,
      sendEvent: (entry) => {
        if (!recording.current || entry.researchId !== recording.current) return
        if (!EXERCISES.includes(entry.exerciseId)) return
        const before = evaluations.get(entry.exerciseId)
        if (entry.type === 'exercise_evaluation' && before
          && JSON.stringify([before.steps, before.feedback, before.passed, before.correct])
            === JSON.stringify([entry.steps, entry.feedback, entry.passed, entry.correct])) return
        if (['block_create', 'block_delete', 'block_change', 'block_field_change', 'block_move'].includes(entry.type)) revisions.set(entry.exerciseId, (revisions.get(entry.exerciseId) ?? 0) + 1)
        if (entry.type === 'exercise_evaluation') evaluations.set(entry.exerciseId, entry)
        const evaluation = evaluations.get(entry.exerciseId)
        const event = compactInteraction({ ...entry, schemaVersion: 3, workspaceRevision: revisions.get(entry.exerciseId) ?? 0, studyOrder: current.current?.studyOrder ?? null,
          ...(['block_connect', 'connection_warning'].includes(entry.type) ? { connectionAccepted: entry.type === 'block_connect', connectionCorrectness: entry.type === 'block_connect' ? 'type-compatible' : 'rejected', solutionCorrectness: 'see-exercise-evaluation-at-this-revision' } : {}),
          stepContext: evaluation?.steps ?? {}, evaluation: evaluation ? {
            passed: evaluation.passed, correct: evaluation.correct, feedback: evaluation.feedback ?? {},
          } : null }, snapshots)
        const operation = Promise.resolve().then(() => recording.current === entry.researchId ? writer.current(event) : undefined).then(() => true, () => {
          unsaved.current.set(event.eventId, event)
          failed.current = true
          if (!closed) setError('This device could not back up an interaction. Keep this tab open and contact the researcher.')
          return false
        }).finally(() => {
          writes.delete(operation)
          if (!closed) setPending(writes.size > 0)
        })
        writes.add(operation)
        if (['step_check', 'step_completed', 'exercise_timeout', 'exercise_finished'].includes(entry.type)) {
          void Promise.all([...writes]).then(() => upload.current?.(true)).catch(() => {})
        }
        if (!closed) setPending(true)
        if (entry.type === 'exercise_evaluation') {
          for (const [stepKey, complete] of Object.entries(entry.steps ?? {})) {
            if (complete && !entry.feedback?.[stepKey]?.incomplete && (!before?.steps?.[stepKey] || before.feedback?.[stepKey]?.incomplete)) capture('step_completed', { stepKey })
          }
        }
      },
    })
    tracker.current.setContext(current.current)
    const unsubscribe = useWorkspaceStore.subscribe?.((next, previous) => {
      if (next.userBlocks === previous.userBlocks) return
      for (const block of next.userBlocks ?? []) {
        const old = previous.userBlocks?.find((item) => item.id === block.id)
        if (!old) capture('custom_block_saved', { customBlock: block })
        else if (JSON.stringify(old) !== JSON.stringify(block)) capture('custom_block_updated', { before: old, after: block })
      }
      for (const block of previous.userBlocks ?? []) {
        if (!next.userBlocks?.some((item) => item.id === block.id)) capture('custom_block_deleted', { customBlock: block })
      }
    })
    return () => { closed = true; unsubscribe?.(); tracker.current?.stop(); tracker.current = null }
  }, [researchId, enabled, capture])
  const serializedContext = JSON.stringify(context)
  useLayoutEffect(() => {
    tracker.current?.setContext(JSON.parse(serializedContext))
    // Include the final screen_leave generated by navigation, including the
    // completion page, rather than depending on a periodic background flush.
    if (recording.current && requests.current.size) {
      void Promise.all([...requests.current]).then(() => upload.current?.(true)).catch(() => {})
    }
  }, [serializedContext])
  const flush = useCallback(async () => {
    let timeout
    try {
      const results = await Promise.race([Promise.all([...requests.current]), new Promise((resolve) => { timeout = setTimeout(() => resolve(null), 12000) })])
      for (const [id, event] of unsaved.current) {
        if (event.researchId !== recording.current) continue
        try { await writer.current(event); unsaved.current.delete(id) } catch { return false }
      }
      failed.current = [...unsaved.current.values()].some((event) => event.researchId === recording.current)
      if (!failed.current) setError('')
      return Boolean(results) && !failed.current
    } finally { clearTimeout(timeout) }
  }, [])
  return { capture, flush, error, pending }
}
