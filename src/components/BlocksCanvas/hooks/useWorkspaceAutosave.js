import { useEffect, useRef } from 'react'
import * as Blockly from 'blockly/core'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import setupChangeListener from '@/utils/setupChangeListener'
import { applyMyBlockColours } from '@/components/BlocksCanvas/blocks/myBlockAppearance'

/**
 * Restores this workspace's saved XML on first mount, then keeps the store in
 * sync as the user edits.
 *
 * Save/restore is keyed by `id` (e.g. 'sandbox', 'exercise-scale-object'), so
 * each page keeps its own independent workspace. The local copy is persisted to
 * localStorage by useWorkspaceStore, so it survives a reload or a new session.
 *
 * @param {object|null} workspace  Blockly workspace, once injected.
 * @param {string} id             Storage key for this workspace.
 * @param {(ws: object) => void} syncScene  Re-runs generation after a restore.
 */
export function useWorkspaceAutosave(workspace, id, syncScene) {
  const isFirstLoad = useRef(true)
  const saveWorkspaceXml = useWorkspaceStore((state) => state.saveWorkspaceXml)

  useEffect(() => {
    // The workspace must be fully injected before it can be written to;
    // loading blocks into a not-yet-rendered workspace throws "Cannot create a
    // rendered block in a headless workspace".
    if (!workspace || !workspace.rendered || !id) return

    const loadInitial = () => {
      const xml = useWorkspaceStore.getState().savedXml[id]
      if (xml && workspace.rendered) {
        try {
          // Events off while loading, so restoring does not immediately trigger
          // the save listener installed below and echo straight back.
          Blockly.Events.disable()
          const dom = Blockly.utils.xml.textToDom(xml)
          Blockly.Xml.clearWorkspaceAndLoadFromXml(dom, workspace)
          applyMyBlockColours(workspace)
          syncScene(workspace)
        } catch (err) {
          console.error('[GeoScratch] Failed to restore workspace state:', err)
        } finally {
          Blockly.Events.enable()
        }
      }
    }

    if (isFirstLoad.current) {
      isFirstLoad.current = false
      loadInitial()
    }

    // setupChangeListener handles the parts that are easy to get wrong: holding
    // off while a drag is in progress, ignoring purely visual events, and
    // coalescing a burst of events into one animation frame.
    const teardown = setupChangeListener(workspace, (changedWorkspace) => {
      // Re-checked here, not just at event time: the workspace can be disposed
      // between the event firing and this frame running.
      if (!changedWorkspace.rendered) return
      const dom = Blockly.Xml.workspaceToDom(changedWorkspace)
      const text = Blockly.Xml.domToText(dom)
      saveWorkspaceXml(id, text)
    })

    return () => {
      teardown?.()
    }
  }, [workspace, id, saveWorkspaceXml, syncScene])
}

export default useWorkspaceAutosave
