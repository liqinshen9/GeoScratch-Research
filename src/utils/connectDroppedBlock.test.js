import { describe, expect, it, vi } from 'vitest'
import * as Blockly from 'blockly/core'
import connectDroppedBlock from './connectDroppedBlock'

vi.mock('blockly/core', async (original) => {
  const module = await original()
  const actual = module.default ?? module
  return { ...actual, utils: { ...actual.utils, svgMath: {
    ...actual.utils.svgMath, wsToScreenCoordinates: (_workspace, point) => point,
  } } }
})

Blockly.Blocks.drop_test_sphere = { init() {
  this.appendValueInput('RADIUS').setCheck('Number')
  this.appendValueInput('CENTRE').setCheck('Point')
  this.setOutput(true, 'Sphere')
} }
Blockly.Blocks.drop_test_point = { init() { this.setOutput(true, 'Point') } }
Blockly.Blocks.drop_test_scalar = { init() { this.setOutput(true, 'Number') } }

function setup() {
  const workspace = new Blockly.Workspace()
  const sphere = workspace.newBlock('drop_test_sphere')
  sphere.getRelativeToSurfaceXY = () => ({ x: 100, y: 100 })
  for (const [name, y] of [['RADIUS', 20], ['CENTRE', 50]]) {
    sphere.getInput(name).connection.getOffsetInBlock = () => ({ x: 20, y })
  }
  sphere.outputConnection.getOffsetInBlock = () => ({ x: 0, y: 0 })
  return { workspace, sphere }
}

describe('connecting blocks directly from the palette', () => {
  it.each([['drop_test_point', 'CENTRE', 150], ['drop_test_scalar', 'RADIUS', 120]])(
    'connects %s to its compatible socket without any tutorial stage or animation', (type, name, y) => {
      const { workspace, sphere } = setup()
      try {
        const block = workspace.newBlock(type)
        const socket = connectDroppedBlock(workspace, block, { clientX: 120, clientY: y })
        expect(socket).toBe(sphere.getInput(name).connection)
        expect(sphere.getInputTargetBlock(name)).toBe(block)
      } finally { workspace.dispose() }
    },
  )
  it('leaves incompatible, distant and occupied sockets untouched', () => {
    const { workspace, sphere } = setup()
    try {
      const point = workspace.newBlock('drop_test_point')
      // Point dropped directly over Radius must not attach there.
      expect(connectDroppedBlock(workspace, point, { clientX: 120, clientY: 120 })).toBeNull()
      expect(connectDroppedBlock(workspace, point, { clientX: 400, clientY: 400 })).toBeNull()
      const existing = workspace.newBlock('drop_test_point')
      sphere.getInput('CENTRE').connection.connect(existing.outputConnection)
      expect(connectDroppedBlock(workspace, point, { clientX: 120, clientY: 150 })).toBeNull()
      expect(sphere.getInputTargetBlock('CENTRE')).toBe(existing)
    } finally { workspace.dispose() }
  })
})
