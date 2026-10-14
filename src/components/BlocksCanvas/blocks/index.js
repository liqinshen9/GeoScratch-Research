import { initGeometricBlocks } from './geometric'
import { initGeometricVariablesBlocks } from './geometricVariables'
import { initLinalgPrimitivesBlocks } from './linalgPrimitives'
import { initLinalgOperatorsBlocks } from './linalgOperators'
import { initSavedWorkspaceBlock } from './savedWorkspace'
const defineBlocks = () => {
  initGeometricBlocks()
  initGeometricVariablesBlocks()
  initLinalgPrimitivesBlocks()
  initLinalgOperatorsBlocks()
  initSavedWorkspaceBlock()
}

defineBlocks() // before palette workspaces inject blocks

export default defineBlocks
