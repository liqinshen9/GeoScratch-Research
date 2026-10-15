import { useEffect, useState } from 'react'
import useWorkspaceStore from '@/store/useWorkspaceStore'

export default function useStudyRecoveryBackup(snapshot, onCloudSnapshot) {
  const [pending, setPending] = useState(false)
  const json = JSON.stringify(snapshot)
  useEffect(() => {
    if (!snapshot.researchId) return
    let cloudTimer
    const save = () => {
      setPending(true)
      const state = useWorkspaceStore.getState()
      const prefix = `userstudy-Li-${snapshot.researchId}`
      const recovery = { ...JSON.parse(json),
        savedXml: Object.fromEntries(Object.entries(state.savedXml ?? {}).filter(([id]) => id.startsWith(`${prefix}-`))),
        userBlocks: state.userBlockScope === prefix ? state.userBlocks : [],
      }
      if (recovery.activeGeoResult) delete recovery.activeGeoResult.startedMonotonic
      window.clearTimeout(cloudTimer)
      cloudTimer = window.setTimeout(() => { onCloudSnapshot(recovery); setPending(false) }, 750)
    }
    save()
    const unsubscribe = useWorkspaceStore.subscribe?.((state, previous) => {
      if (state.savedXml !== previous.savedXml || state.userBlocks !== previous.userBlocks) save()
    })
    return () => { window.clearTimeout(cloudTimer); unsubscribe?.() }
  // The serialized snapshot is the stable dependency; exclude new object identities.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [json, onCloudSnapshot])
  return { error: '', pending }
}
