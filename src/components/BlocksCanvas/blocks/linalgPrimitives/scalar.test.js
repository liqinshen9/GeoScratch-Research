// @vitest-environment jsdom
import * as Blockly from 'blockly/core'
import { javascriptGenerator } from 'blockly/javascript'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { initScalarBlock } from './scalar'

let workspace
beforeEach(() => {
  initScalarBlock()
  workspace = new Blockly.Workspace()
})
afterEach(() => workspace.dispose())

describe('positive Scalar input', () => {
  it('rejects zero and negative values while preserving the last positive value', () => {
    const block = workspace.newBlock('scalar')
    block.setFieldValue('2', 'scalar')
    for (const value of ['0', '-1', '-0.5']) {
      block.setFieldValue(value, 'scalar')
      expect(block.getFieldValue('scalar')).toBe(2)
    }
    block.setFieldValue('0.001', 'scalar')
    expect(block.getFieldValue('scalar')).toBe(0.001)
  })
  it('rejects invalid saved values when restoring a block', () => {
    const block = Blockly.serialization.blocks.append({ type: 'scalar', fields: { scalar: -2 } }, workspace)
    expect(block.getFieldValue('scalar')).toBe(1)
  })
  it('generates a positive fallback for invalid values and preserves positive fractions', () => {
    for (const value of [0, -2, Infinity, NaN]) {
      expect(javascriptGenerator.forBlock.scalar({ getFieldValue: () => value })[0]).toBe('1')
    }
    expect(javascriptGenerator.forBlock.scalar({ getFieldValue: () => 0.25 })[0]).toBe('0.25')
  })
})
