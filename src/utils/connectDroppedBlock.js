import * as Blockly from 'blockly/core'

// Palette insertion bypasses Blockly's existing-block dragger. Snap at release
// using the pointer's screen position, independently of tutorial guidance.
export default function connectDroppedBlock(workspace, block, { clientX, clientY }, radius = 24) {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null
  const ownBlocks = new Set(block.getDescendants(false))
  const plugs = [block.outputConnection, block.previousConnection, block.nextConnection]
    .filter((connection) => connection && !connection.isConnected())
  let nearest = null
  for (const other of workspace.getAllBlocks(false)) {
    if (ownBlocks.has(other) || other.isInsertionMarker?.()) continue
    for (const socket of other.getConnections_(false)) {
      if (socket.isConnected()) continue
      const xy = other.getRelativeToSurfaceXY()
      const offset = socket.getOffsetInBlock()
      const screen = Blockly.utils.svgMath.wsToScreenCoordinates(workspace,
        new Blockly.utils.Coordinate(xy.x + offset.x, xy.y + offset.y))
      const distance = Math.hypot(screen.x - clientX, screen.y - clientY)
      if (distance > radius || (nearest && distance >= nearest.distance)) continue
      const plug = plugs.find((candidate) => workspace.connectionChecker.canConnect(candidate, socket, false))
      if (plug) nearest = { plug, socket, distance }
    }
  }
  if (!nearest) return null
  nearest.socket.connect(nearest.plug)
  return nearest.socket
}
