import * as Blockly from 'blockly/core'
import { emitStudyEvent, workspaceStudyContext } from './studyEvents'

const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value))
const coordinate = (value) => value ? { x: value.x, y: value.y } : null

export function workspaceSnapshot(workspace, customBlocks = []) {
  return {
    format: 'blockly-json', state: Blockly.serialization.workspaces.save(workspace),
    viewport: { scale: workspace.scale ?? 1, scrollX: workspace.scrollX ?? 0, scrollY: workspace.scrollY ?? 0 },
    customBlocks: customBlocks.map(({ id, name, xmlText, source }) => ({ id, name, xmlText, source })),
  }
}

function externalConnections(workspace, ids) {
  const group = new Set(ids)
  const edges = []
  for (const id of ids) {
    const block = workspace.getBlockById(id)
    for (const connection of block?.getConnections_?.(false) ?? []) {
      const other = connection.targetConnection?.getSourceBlock()
      if (!other || group.has(other.id)) continue
      edges.push({ blockId: id, blockType: block.type, connectionType: connection.type,
        targetBlockId: other.id, targetBlockType: other.type,
        targetInputName: other.inputList?.find((input) => input.connection === connection.targetConnection)?.name ?? null })
    }
  }
  return edges
}

export function installWorkspaceStudyTracking(workspace, { runtimeId, getCustomBlocks = () => [], emit = emitStudyEvent }) {
  const context = workspaceStudyContext(runtimeId)
  if (!context) return { stop() {}, warning() {}, snapshot() {} }
  let stopped = false
  let drag = null
  let dragNumber = 0
  let dragTimer = null
  const types = new Map(workspace.getAllBlocks(false).map((block) => [block.id, block.type]))
  const emitEvent = (type, details) => emit(type, { workspaceId: workspace.id, ...details }, context)
  const blockInfo = (id) => ({ blockId: id, blockType: workspace.getBlockById(id)?.type ?? types.get(id) ?? null })
  function snapshot(reason) {
    emitEvent('workspace_snapshot', { reason, snapshot: workspaceSnapshot(workspace, getCustomBlocks()) })
  }
  function settleDrag() {
    clearTimeout(dragTimer)
    dragTimer = null
    if (!drag) return
    const ending = externalConnections(workspace, drag.blockIds)
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
    emitEvent('block_drag_result', {
      dragId: drag.id, blockIds: drag.blockIds, durationMs: Math.round(performance.now() - drag.started),
      connectionOutcome: drag.blockIds.length && drag.blockIds.every((id) => !workspace.getBlockById(id))
        ? 'deleted' : ending.length ? 'connected' : 'unconnected',
      connectionsAtDrop: ending,
      newConnections: ending.filter((edge) => !drag.initial.some((old) => same(edge, old))),
      removedConnections: drag.initial.filter((edge) => !ending.some((next) => same(edge, next))),
      warningShown: drag.warningShown,
    })
    drag = null
  }
  const originalUndo = workspace.undo
  if (originalUndo) workspace.undo = function (redo) {
    const before = Blockly.serialization.workspaces.save(workspace)
    const result = originalUndo.call(this, redo)
    const after = Blockly.serialization.workspaces.save(workspace)
    emitEvent(redo ? 'workspace_redo' : 'workspace_undo', { changed: JSON.stringify(before) !== JSON.stringify(after) })
    snapshot(redo ? 'after-redo' : 'after-undo')
    return result
  }
  const trackedUndo = workspace.undo

  function listener(event) {
    if (stopped || (event.workspaceId && event.workspaceId !== workspace.id)) return
    const group = event.group || null
    const details = { group, recordUndo: event.recordUndo, ...blockInfo(event.blockId) }
    const json = () => clone(event.toJson?.() ?? {})
    if (event.type === Blockly.Events.BLOCK_DRAG) {
      if (event.isStart) {
        settleDrag()
        const root = workspace.getBlockById(event.blockId)
        const blockIds = (event.blocks?.length ? event.blocks : root?.getDescendants?.(false) ?? [root])
          .map((block) => typeof block === 'string' ? block : block?.id).filter(Boolean)
        drag = { id: `${workspace.id}-drag-${++dragNumber}`, blockIds, started: performance.now(),
          initial: externalConnections(workspace, blockIds), warningShown: false }
        emitEvent('block_drag_start', { ...details, dragId: drag.id, blockIds, connectionsBefore: drag.initial })
      } else {
        // Blockly may queue connection moves adjacent to drag-end. Read the actual graph after that batch.
        dragTimer = setTimeout(settleDrag, 0)
      }
      return
    }
    if (drag) details.dragId = drag.id
    if (event.type === Blockly.Events.BLOCK_CREATE) {
      const ids = event.ids ?? [event.blockId]
      ids.forEach((id) => { const block = workspace.getBlockById(id); if (block) types.set(id, block.type) })
      emitEvent('block_create', { ...details, blocks: ids.map(blockInfo), state: clone(event.json ?? json().json) })
    } else if (event.type === Blockly.Events.BLOCK_DELETE) {
      emitEvent('block_delete', { ...details, blocks: (event.ids ?? [event.blockId]).map(blockInfo),
        state: clone(event.oldJson ?? json().oldJson), wasShadow: event.wasShadow })
    } else if (event.type === Blockly.Events.BLOCK_CHANGE) {
      emitEvent(event.element === 'field' ? 'block_field_change' : 'block_change', {
        ...details, element: event.element, fieldName: event.name ?? null,
        oldValue: clone(event.oldValue), newValue: clone(event.newValue),
      })
    } else if (event.type === Blockly.Events.BLOCK_MOVE) {
      const from = { parentId: event.oldParentId ?? null, inputName: event.oldInputName ?? null, position: coordinate(event.oldCoordinate) }
      const to = { parentId: event.newParentId ?? null, inputName: event.newInputName ?? null, position: coordinate(event.newCoordinate) }
      emitEvent('block_move', { ...details, from, to, reason: event.reason ?? [] })
      if (from.parentId !== to.parentId || from.inputName !== to.inputName) {
        if (from.parentId) emitEvent('block_disconnect', { ...details, connection: { ...from, parentType: blockInfo(from.parentId).blockType } })
        if (to.parentId) emitEvent('block_connect', { ...details, connection: { ...to, parentType: blockInfo(to.parentId).blockType } })
      }
    } else if ([Blockly.Events.SELECTED, Blockly.Events.CLICK, Blockly.Events.TOOLBOX_ITEM_SELECT,
      Blockly.Events.VIEWPORT_CHANGE, Blockly.Events.VAR_CREATE, Blockly.Events.VAR_DELETE, Blockly.Events.VAR_RENAME].includes(event.type)) {
      emitEvent('blockly_event', { event: json() })
    }
  }
  workspace.addChangeListener(listener)
  const initialTimer = setTimeout(() => { if (!stopped) snapshot('initial') }, 0)
  const onPageHide = () => snapshot('pagehide')
  const onSnapshotRequest = (event) => snapshot(event.detail?.reason ?? 'checkpoint')
  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('geoscratch:request-workspace-snapshot', onSnapshotRequest)

  return {
    snapshot,
    warning(message, connectionDetails) {
      if (drag) drag.warningShown = true
      emitEvent('connection_warning', { message, dragId: drag?.id ?? null, ...connectionDetails })
    },
    stop() {
      if (stopped) return
      settleDrag()
      snapshot('exit')
      stopped = true
      clearTimeout(initialTimer)
      clearTimeout(dragTimer)
      workspace.removeChangeListener(listener)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('geoscratch:request-workspace-snapshot', onSnapshotRequest)
      if (workspace.undo === trackedUndo) workspace.undo = originalUndo
    },
  }
}
