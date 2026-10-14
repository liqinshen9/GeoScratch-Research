import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'
import { forRole } from '@/store/colorSystem'
import { COLOR_ROLES } from '@/store/colorPresets'
import { FieldObjectName } from '@/components/BlocksCanvas/blocks/naming/FieldObjectName'

let REGISTERED = false

export function initScalarBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks['scalar'] = {
    init() {
      this.appendDummyInput()
        .appendField('Scalar')
        .appendField(new FieldObjectName(), 'GEOSCRATCH_NAME')
        .appendField(new Blockly.FieldNumber(1, undefined, undefined, undefined,
          (value) => Number.isFinite(value) && value > 0 ? value : null), 'scalar')
      this.setStyle(BLOCK_STYLES.VALUE_PRIMITIVES)
      this.setColour(forRole(COLOR_ROLES.ACCENT))
      this.setTooltip('Enter a positive scalar greater than 0.')
      this.setDeletable(true)
      this.setMovable(true)
      this.setOutput(true, 'scalar')
    },
  }

  javascriptGenerator.forBlock['scalar'] = function (block) {
    const v = Number(block.getFieldValue('scalar'))
    return [String(Number.isFinite(v) && v > 0 ? v : 1), Order.ATOMIC]
  }
}
