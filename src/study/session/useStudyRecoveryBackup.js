import { useEffect, useState } from 'react'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import { saveStudyBackup } from './studyRecoveryStore'

export default function useStudyRecoveryBackup(snapshot, { enabled = true } = {}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const json = JSON.stringify(snapshot)
  useEffect(() => {
    if (!snapshot.researchId || !enabled) return
    let closed = false
    const save = () => {
      setPending(true)
      const state = useWorkspaceStore.getState()
      const prefix = `userstudy-Li-${snapshot.researchId}`
      const recovery = { ...JSON.parse(json),
        savedXml: Object.fromEntries(Object.entries(state.savedXml ?? {}).filter(([id]) => id.startsWith(`${prefix}-`))),
        userBlocks: state.userBlockScope === prefix ? state.userBlocks : [],
      }
      if (recovery.activeGeoResult) delete recovery.activeGeoResult.startedMonotonic
      // Local only: questionnaire edits must not produce Firestore writes.
      void saveStudyBackup(snapshot.researchId, { snapshot: recovery }).then(() => {
        if (!closed) { setError(''); setPending(false) }
      }).catch(() => { if (!closed) { setError('Device backup is unavailable. Keep this tab open and contact the researcher.'); setPending(false) } })
    }
    save()
    const unsubscribe = useWorkspaceStore.subscribe?.((state, previous) => {
      if (state.savedXml !== previous.savedXml || state.userBlocks !== previous.userBlocks) save()
    })
    return () => { closed = true; unsubscribe?.() }
  // The serialized snapshot is the stable dependency; exclude new object identities.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [json, enabled])
  return { error, pending }
}
