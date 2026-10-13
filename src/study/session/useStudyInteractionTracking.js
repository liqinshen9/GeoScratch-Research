import { useEffect, useRef, useState } from 'react'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import { createInteractionTracker } from './interactionTracking'

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
    })
    tracker.current.setContext(latestContext.current)
    return () => { tracker.current.stop(); tracker.current = null }
  }, [researchId])
  return {
    storageError,
    record: (type, details) => tracker.current?.record(type, details),
    read: () => tracker.current?.read() ?? [],
  }
}
