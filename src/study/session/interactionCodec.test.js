import { describe, expect, it } from 'vitest'
import { compactInteraction, expandInteractionSnapshots, workspaceChanges, applyWorkspaceChanges, encodeInteractionChunk, decodeInteractionChunk } from './interactionCodec'
import * as Blockly from 'blockly/core'
const clone = (x) => JSON.parse(JSON.stringify(x))
it('reconstructs exact nested states across creation, input changes, connection, deletion, undo, and redo', () => {
  Blockly.defineBlocksWithJsonArray([
    { type: 'codec_number', message0: '%1', args0: [{ type: 'field_number', name: 'N', value: 1 }], output: null },
    { type: 'codec_parent', message0: 'input %1', args0: [{ type: 'input_value', name: 'INPUT' }] },
  ])
  const workspace = new Blockly.Workspace(), snapshots = []
  const capture = () => snapshots.push({ format: 'blockly-json', state: Blockly.serialization.workspaces.save(workspace),
    customBlocks: [{ id: 'custom', xmlText: '<xml><block type="codec_number" /></xml>' }] })
  try {
    capture()
    const parent = workspace.newBlock('codec_parent'), number = workspace.newBlock('codec_number')
    capture(); number.setFieldValue(90, 'N'); capture()
    parent.getInput('INPUT').connection.connect(number.outputConnection); capture()
    const connected = clone(snapshots.at(-1))
    number.dispose(); capture()
    // Full undo/redo checkpoints use the same lossless codec, independent of
    // Blockly's asynchronous undo stack dispatch.
    snapshots.push(connected, clone(snapshots.at(-1)))
    const states = new Map()
    const events = snapshots.map((snapshot, index) => compactInteraction({ eventId: `e-${index}`, streamId: 's', exerciseId: 'point-plane-distance',
      type: 'workspace_snapshot', reason: index ? 'after-change' : 'initial', snapshot }, states))
    expect(events.slice(1).every((event) => !event.snapshot)).toBe(true)
    expect(expandInteractionSnapshots(events).map((event) => event.snapshot)).toEqual(snapshots)
  } finally { workspace.dispose() }
})
it('retains full boundary snapshots and detects a missing change instead of silently claiming complete evidence', () => {
  const states = new Map()
  const make = (id, snapshot, type = 'workspace_snapshot') => compactInteraction({ eventId: id, streamId: 's', exerciseId: 'x', type, reason: 'after-change', snapshot }, states)
  const a = make('a', { blocks: [] }), b = make('b', { blocks: [{ id: 'b' }] }), c = make('c', { blocks: [{ id: 'b', x: 2 }] })
  expect(() => expandInteractionSnapshots([a, c])).toThrow('missing')
  expect(expandInteractionSnapshots([a, b, c]).at(-1).snapshot.blocks[0].x).toBe(2)
  expect(make('timeout', { blocks: [{ id: 'b', x: 2 }] }, 'exercise_timeout').snapshot).toBeTruthy()
})
it('packs Unicode names and exact old/new field values without losing evidence', () => {
  const events = [{ eventId: '1', type: 'block_field_change', oldValue: '-1', newValue: '90', blockType: 'rot_matrix',
    feedback: { message: 'Wrong axis — try Y' }, name: '平面😀' }]
  expect(decodeInteractionChunk(encodeInteractionChunk(events))).toEqual(events)
  expect(() => decodeInteractionChunk({ ...encodeInteractionChunk(events), count: 2 })).toThrow('incomplete')
})
it('removes array entries and object properties without changing other blocks', () => {
  const before = { blocks: [{ id: 'a' }, { id: 'b', fields: { x: 1 } }, { id: 'c' }], viewport: { x: 4 } }
  const after = { blocks: [{ id: 'b', fields: { x: 90 } }], viewport: {} }
  expect(applyWorkspaceChanges(before, workspaceChanges(before, after))).toEqual(after)
})
describe('storage efficiency', () => {
  it('stores repeated edits without copying an unchanged custom library and workspace each time', () => {
    const states = new Map(), raw = [], compact = []
    for (let index = 0; index < 100; index++) {
      const event = { eventId: String(index), streamId: 's', exerciseId: 'x', type: 'workspace_snapshot', reason: 'after-change',
        snapshot: { blocks: [{ type: 'rotation', fields: { degrees: index } }], customBlocks: [{ xml: 'unchanged-library'.repeat(2000) }] } }
      raw.push(event); compact.push(compactInteraction(event, states))
    }
    expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(raw).length / 10)
    expect(expandInteractionSnapshots(compact).map((event) => event.snapshot)).toEqual(raw.map((event) => event.snapshot))
  })
})
