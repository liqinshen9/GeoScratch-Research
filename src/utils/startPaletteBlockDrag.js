import * as Blockly from 'blockly/core'

// Use the same Blockly dragger/connection previewer as blocks already in the
// workspace. Create the real blocks at pickup, not when the mouse is released.
export default function startPaletteBlockDrag(workspace, create, event, source, acceptsDrop) {
  if (!workspace?.rendered) return null
  const existing = new Set(workspace.getAllBlocks(false).map((block) => block.id))
  const previousGroup = Blockly.Events.getGroup()
  Blockly.Events.setGroup(true)
  const group = Blockly.Events.getGroup()
  create({ clientX: event.clientX, clientY: event.clientY, snapOnDrop: false })
  const blocks = workspace.getTopBlocks(false).filter((block) => !existing.has(block.id))
  if (!blocks.length) { Blockly.Events.setGroup(previousGroup); return null }
  const preview = source.querySelector('.blocklyBlockCanvas') ?? source
  const origin = preview.getBoundingClientRect()
  const rects = blocks.map((block) => block.getSvgRoot().getBoundingClientRect())
  const x = Math.min(...rects.map((rect) => rect.x))
  const y = Math.min(...rects.map((rect) => rect.y))
  blocks.forEach((block) => block.moveBy((origin.x - x) / workspace.scale, (origin.y - y) / workspace.scale))
  const Dragger = Blockly.registry.getClassFromOptions(Blockly.registry.Type.BLOCK_DRAGGER, workspace.options)
  const draggers = blocks.map((block) => new Dragger(block, workspace))
  draggers.forEach((dragger) => dragger.onDragStart(event))
  const flyout = source.closest('.blocks-col--palette-flyout')
  flyout?.classList.add('is-blockly-dragging')
  let finished = false
  function move(pointer) {
    if (finished) return
    const delta = new Blockly.utils.Coordinate(pointer.clientX - event.clientX, pointer.clientY - event.clientY)
    draggers.forEach((dragger) => dragger.onDrag(pointer, delta))
  }
  function cancel() {
    if (finished) return
    finished = true
    Blockly.Events.setGroup(group)
    blocks.forEach((block) => {
      if (!block.isDeadOrDying()) { block.revertDrag(); block.endDrag(); block.dispose(false) }
    })
    flyout?.classList.remove('is-blockly-dragging')
    Blockly.Events.setGroup(previousGroup)
  }
  return { move, cancel, end(pointer) {
    const target = document.elementFromPoint(pointer.clientX, pointer.clientY)
    if (!acceptsDrop(pointer, target)) { cancel(); return false }
    move(pointer)
    finished = true
    Blockly.Events.setGroup(group)
    try { draggers.forEach((dragger) => dragger.onDragEnd(pointer)) } finally {
      flyout?.classList.remove('is-blockly-dragging')
      Blockly.Events.setGroup(previousGroup)
    }
    return true
  } }
}
