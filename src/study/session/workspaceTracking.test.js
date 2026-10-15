// @vitest-environment jsdom
import * as Blockly from 'blockly/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installWorkspaceStudyTracking } from './workspaceTracking'
import { installConnectionTypeFeedback } from '@/utils/connectionTypeFeedback'
import { createInteractionTracker } from './interactionTracking'
import { buildSessionFiles } from './sessionExport'

Blockly.defineBlocksWithJsonArray([
  { type: 'study_tracking_rotation', message0: 'rotate %1 degrees', args0: [{ type: 'field_number', name: 'DEGREES', value: 30 }], output: 'matrix3' },
  { type: 'study_tracking_parent', message0: 'matrix %1', args0: [{ type: 'input_value', name: 'M', check: 'matrix3' }] },
  { type: 'study_tracking_scalar', message0: 'number %1', args0: [{ type: 'field_number', name: 'VALUE', value: 2 }], output: 'Number' },
])
let workspace, tracking, emit, cleanupFeedback, recorder
const flushEvents = () => vi.runAllTimers()
const eventsOf = (type) => emit.mock.calls.filter(([eventType]) => eventType === type).map(([, details]) => details)
beforeEach(() => {
  vi.useFakeTimers()
  workspace = new Blockly.Workspace()
  emit = vi.fn()
  tracking = installWorkspaceStudyTracking(workspace, { runtimeId: 'userstudy-Li-participant-tutorial', emit,
    getCustomBlocks: () => [{ id: 'my-block-test', name: 'Saved cube', xmlText: '<xml></xml>', source: 'workspace' }] })
  flushEvents()
})
afterEach(() => {
  cleanupFeedback?.()
  cleanupFeedback = null
  tracking.stop()
  workspace.dispose()
  recorder?.stop()
  recorder = null
  vi.runAllTimers()
  vi.useRealTimers()
})

describe('detailed Blockly study tracking', () => {
  it.each(['create-complex-object', 'cube-point-pivot-rotation', 'point-plane-distance'])('captures block edits and nested snapshots for %s', (exerciseId) => {
    const other = new Blockly.Workspace()
    const ignored = vi.fn(), getCustomBlocks = vi.fn()
    const originalUndo = other.undo
    try {
      const disabled = installWorkspaceStudyTracking(other, { runtimeId: `userstudy-Li-participant-${exerciseId}`, emit: ignored, getCustomBlocks })
      other.newBlock('study_tracking_rotation')
      disabled.snapshot('checkpoint')
      disabled.warning('Connection warning', {})
      flushEvents()
      disabled.stop()
      expect(ignored).toHaveBeenCalledWith('block_create', expect.anything(), expect.objectContaining({ exerciseId }))
      expect(getCustomBlocks).toHaveBeenCalled()
      expect(other.undo).toBe(originalUndo)
    } finally { other.dispose() }
  })
  it('records actual created/deleted blocks and precise old/new numeric values', () => {
    const rotation = workspace.newBlock('study_tracking_rotation')
    flushEvents()
    rotation.setFieldValue(90, 'DEGREES')
    flushEvents()
    expect(eventsOf('block_create').some((event) => event.blocks.some((block) => block.blockId === rotation.id && block.blockType === rotation.type))).toBe(true)
    expect(eventsOf('block_field_change').at(-1)).toMatchObject({ blockId: rotation.id, blockType: rotation.type, fieldName: 'DEGREES', oldValue: 30, newValue: 90 })
    const id = rotation.id
    rotation.dispose()
    flushEvents()
    expect(eventsOf('block_delete').at(-1)).toMatchObject({ blocks: [{ blockId: id, blockType: 'study_tracking_rotation' }] })
    expect(eventsOf('block_delete').at(-1).state.fields.DEGREES).toBe(90)
  })

  it('records exact connection/disconnection sockets and confirms a successful drag from the final graph', () => {
    const rotation = workspace.newBlock('study_tracking_rotation')
    const parent = workspace.newBlock('study_tracking_parent')
    flushEvents()
    Blockly.Events.fire(new Blockly.Events.BlockDrag(rotation, true, [rotation]))
    flushEvents()
    parent.getInput('M').connection.connect(rotation.outputConnection)
    Blockly.Events.fire(new Blockly.Events.BlockDrag(rotation, false, [rotation]))
    flushEvents()
    expect(eventsOf('block_connect').at(-1)).toMatchObject({ blockId: rotation.id, connection: { parentId: parent.id, parentType: parent.type, inputName: 'M' } })
    expect(eventsOf('block_drag_result').at(-1)).toMatchObject({ connectionOutcome: 'connected', warningShown: false,
      newConnections: [{ blockId: rotation.id, targetBlockId: parent.id, targetInputName: 'M' }] })
    rotation.outputConnection.disconnect()
    flushEvents()
    expect(eventsOf('block_disconnect').at(-1)).toMatchObject({ blockId: rotation.id, connection: { parentId: parent.id, inputName: 'M' } })
  })

  it('records the actual mismatch warning with block identities and an unsuccessful drop', () => {
    const scalar = workspace.newBlock('study_tracking_scalar')
    const parent = workspace.newBlock('study_tracking_parent')
    flushEvents()
    cleanupFeedback = installConnectionTypeFeedback(workspace, (message, details) => {
      if (message) tracking.warning(message, details)
    })
    Blockly.Events.fire(new Blockly.Events.BlockDrag(scalar, true, [scalar]))
    flushEvents()
    scalar.outputConnection.distanceFrom = () => 5
    workspace.connectionChecker.canConnectWithReason(scalar.outputConnection, parent.getInput('M').connection, true, 5)
    Blockly.Events.fire(new Blockly.Events.BlockDrag(scalar, false, [scalar]))
    flushEvents()
    expect(eventsOf('connection_warning').at(-1)).toMatchObject({
      message: 'This input needs 3x3 Matrix, but this block gives Number.',
      draggedConnection: { blockId: scalar.id, blockType: scalar.type },
      targetConnection: { blockId: parent.id, blockType: parent.type, inputName: 'M' },
    })
    expect(eventsOf('block_drag_result').at(-1)).toMatchObject({ connectionOutcome: 'unconnected', newConnections: [], warningShown: true })
    expect(eventsOf('connection_warning').at(-1).dragId).toBe(eventsOf('block_drag_result').at(-1).dragId)
  })

  it('distinguishes a block dropped into deletion from an unconnected block', () => {
    const rotation = workspace.newBlock('study_tracking_rotation')
    flushEvents()
    Blockly.Events.fire(new Blockly.Events.BlockDrag(rotation, true, [rotation]))
    flushEvents()
    const end = new Blockly.Events.BlockDrag(rotation, false, [rotation])
    rotation.dispose()
    Blockly.Events.fire(end)
    flushEvents()
    expect(eventsOf('block_drag_result').at(-1).connectionOutcome).toBe('deleted')
  })

  it('saves a complete, restorable final arrangement with field values and custom definitions', () => {
    const rotation = workspace.newBlock('study_tracking_rotation')
    const parent = workspace.newBlock('study_tracking_parent')
    rotation.setFieldValue(90, 'DEGREES')
    parent.getInput('M').connection.connect(rotation.outputConnection)
    parent.moveBy(100, 50)
    flushEvents()
    tracking.stop()
    const snapshot = eventsOf('workspace_snapshot').at(-1)
    expect(snapshot.reason).toBe('exit')
    expect(snapshot.snapshot.customBlocks[0]).toMatchObject({ id: 'my-block-test', name: 'Saved cube', xmlText: '<xml></xml>' })
    const restored = new Blockly.Workspace()
    try {
      Blockly.serialization.workspaces.load(snapshot.snapshot.state, restored)
      expect(restored.getBlockById(rotation.id).getFieldValue('DEGREES')).toBe(90)
      expect(restored.getBlockById(parent.id).getInputTargetBlock('M').id).toBe(rotation.id)
      expect(restored.getBlockById(parent.id).getRelativeToSurfaceXY()).toMatchObject({ x: 100, y: 50 })
    } finally { restored.dispose() }
  })

  it('records undo/redo and final state, and leaves non-study workspaces alone', () => {
    const rotation = workspace.newBlock('study_tracking_rotation')
    flushEvents()
    rotation.setFieldValue(90, 'DEGREES')
    flushEvents()
    workspace.undo(false)
    flushEvents()
    expect(rotation.getFieldValue('DEGREES')).toBe(30)
    expect(eventsOf('workspace_undo').at(-1).changed).toBe(true)
    workspace.undo(true)
    flushEvents()
    expect(rotation.getFieldValue('DEGREES')).toBe(90)
    expect(eventsOf('workspace_redo').at(-1).changed).toBe(true)
    const other = new Blockly.Workspace(), ignored = vi.fn()
    try {
      const listener = installWorkspaceStudyTracking(other, { runtimeId: 'sandbox', emit: ignored })
      other.newBlock('study_tracking_rotation')
      flushEvents()
      listener.stop()
      expect(ignored).not.toHaveBeenCalled()
    } finally { other.dispose() }
  })

  it('does not include historical tutorial semantic changes or snapshots in the export', () => {
    tracking.stop()
    recorder = createInteractionTracker({ researchId: 'semantic-participant' })
    recorder.setContext({ conditionId: 'geoscratch', phase: 'geoscratch', exerciseId: 'tutorial' })
    tracking = installWorkspaceStudyTracking(workspace, { runtimeId: 'userstudy-Li-semantic-participant-tutorial' })
    const rotation = workspace.newBlock('study_tracking_rotation')
    rotation.setFieldValue(90, 'DEGREES')
    vi.advanceTimersByTime(20)
    tracking.stop()
    const records = recorder.read()
    const archive = buildSessionFiles({ researchId: 'semantic-participant', studyOrder: 'geoscratch-first', interactionLog: records })
    const exercise = archive.files.find((file) => file.data.exerciseId === 'create-complex-object' && file.data.conditionId === 'geoscratch').data
    expect(exercise).not.toHaveProperty('tutorialEvents')
    expect(exercise).not.toHaveProperty('finalWorkspace')
    recorder.stop()
    window.localStorage.clear()
  })
})
