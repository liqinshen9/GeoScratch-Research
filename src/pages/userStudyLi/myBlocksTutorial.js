import { canonicalizeWorkspaceXml } from '@/utils/blocklyXml'

export const MY_BLOCK_TUTORIAL_STAGES = ['myblocks', 'make', 'name', 'save']

export function myBlocksTutorialStage({ open, dialogOpen, nameEdited, name, savedBlock }) {
  if (savedBlock) return 'done'
  if (dialogOpen) return nameEdited && name.trim() ? 'save' : 'name'
  if (!open) return 'myblocks'
  return 'make'
}

// Existing unrelated saved blocks must not complete this tutorial step. A
// matching saved workspace also lets Watch again work without duplicate saves.
export function findSavedTutorialBlock(userBlocks, workspaceXml) {
  if (!workspaceXml) return null
  const fingerprint = canonicalizeWorkspaceXml(workspaceXml)
  if (!fingerprint) return null
  return userBlocks.find((block) => block.name?.trim()
    && canonicalizeWorkspaceXml(block.xmlText) === fingerprint) ?? null
}
