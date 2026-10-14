import { useEffect, useRef, useState } from 'react'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import { createInteractionTracker } from './interactionTracking'
import { exerciseTrackingDisabled } from './studyEvents'

export default function useStudyInteractionTracking(researchId, context) {
  const tracker = useRef(null)
  const latestContext = useRef(context)
  const [storageError, setStorageError] = useState(null)
  useEffect(() => { latestContext.current = context; tracker.current?.setContext(context) }, [context])
  useEffect(() => {
    if (!researchId) return
    setStorageError(null)
    tracker.current = createInteractionTracker({ researchId,
      getWorkspace: () => useWorkspaceStore.getState().workspace,
      onError: () => setStorageError('Interaction records could not be saved locally. Download the study data before closing this page.'),
      onRecovered: () => setStorageError(null),
    })
    tracker.current.setContext(latestContext.current)
    const unsubscribe = useWorkspaceStore.subscribe?.((next, previous) => {
      if (exerciseTrackingDisabled(latestContext.current)) return
      if (next.userBlocks === previous.userBlocks) return
      const before = previous.userBlocks ?? [], after = next.userBlocks ?? []
      for (const block of after) {
        const old = before.find((item) => item.id === block.id)
        if (!old) tracker.current?.record('custom_block_saved', { customBlock: block })
        else if (JSON.stringify(old) !== JSON.stringify(block)) tracker.current?.record('custom_block_updated', { before: old, after: block })
      }
      for (const block of before) if (!after.some((item) => item.id === block.id)) {
        tracker.current?.record('custom_block_deleted', { customBlock: block })
      }
    })
    return () => {
      window.dispatchEvent(new CustomEvent('geoscratch:request-workspace-snapshot', { detail: { reason: 'route-exit' } }))
      unsubscribe?.()
      tracker.current.stop()
      tracker.current = null
    }
  }, [researchId])
  return {
    // A tutorial logging failure must not appear on lecture pages, untracked
    // exercises, or completion screens. Keep the pending data for export.
    storageError: context?.phase === 'geoscratch' && context?.exerciseId === 'tutorial' ? storageError : null,
    record: (type, details) => tracker.current?.record(type, details),
    read: () => tracker.current?.read() ?? [],
  }
}
