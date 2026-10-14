import { create } from 'zustand'
import { STUDY_PERSISTENCE_ENABLED } from '@/study/session/studyStorage'

const USER_BLOCKS_STORAGE_KEY = 'geoscratch:userBlocks'
const MAX_RECENT_DELETED_USER_BLOCKS = 8
const SAVED_XML_STORAGE_KEY = 'geoscratch:workspace-xml'
const studyBlocks = new Map()
const isStudyScope = (scope) => scope?.startsWith('userstudy-Li-')
const isMemoryStudyScope = (scope) => !STUDY_PERSISTENCE_ENABLED && isStudyScope(scope)

function userBlocksStorageKey(scope) {
  return scope ? `${USER_BLOCKS_STORAGE_KEY}:${scope}` : USER_BLOCKS_STORAGE_KEY
}

function loadUserBlocks(scope = null) {
  if (isMemoryStudyScope(scope)) return studyBlocks.get(scope) ?? []
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(userBlocksStorageKey(scope)) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.error('[GeoScratch] Failed to load user blocks:', err)
    return []
  }
}

function persistUserBlocks(userBlocks, scope = null) {
  if (isMemoryStudyScope(scope)) { studyBlocks.set(scope, userBlocks); return }
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(userBlocksStorageKey(scope), JSON.stringify(userBlocks))
  } catch (err) {
    console.error('[GeoScratch] Failed to save user blocks:', err)
  }
}

// Per-workspace serialized XML ({ [workspaceId]: xmlText }), persisted so that
// the sandbox and each exercise keep the blocks you built across reloads and
// sessions -- not just while the tab stays open.
function loadSavedXml() {
  if (typeof window === 'undefined') return {}
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SAVED_XML_STORAGE_KEY) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch (err) {
    console.error('[GeoScratch] Failed to load saved workspaces:', err)
    return {}
  }
}

function persistSavedXml(savedXml) {
  if (typeof window === 'undefined') return
  try {
    const persistent = Object.fromEntries(Object.entries(savedXml).filter(([id]) => !isMemoryStudyScope(id)))
    window.localStorage.setItem(SAVED_XML_STORAGE_KEY, JSON.stringify(persistent))
  } catch (err) {
    console.error('[GeoScratch] Failed to save workspace state:', err)
  }
}

const useWorkspaceStore = create((set) => ({
  // Blockly workspace instance (current active one)
  workspace: null,
  // Create Object Dialog Status
  dialogOpen: false,
  // Example XML
  exampleXml: null,
  // Title Status
  title: 'GeoScratch',

  // Memory bank for serialized workspace data, keyed by workspace id and
  // persisted to localStorage (see loadSavedXml).
  savedXml: loadSavedXml(),
  userBlocks: loadUserBlocks(),
  userBlockScope: null,
  setUserBlockScope: (scope = null) => set((state) =>
    state.userBlockScope === scope ? state : {
      userBlockScope: scope,
      userBlocks: loadUserBlocks(scope),
      recentDeletedUserBlocks: [],
    },
  ),
  recentDeletedUserBlocks: [],

  // Block id shared between the Blockly workspace and the 3D scene: selecting
  // a block or its 3D object drives the other side's highlight. null = nothing
  // selected. The identity short-circuit below is the primary guard against a
  // block.select() <-> SELECTED-event feedback loop.
  selectedBlockId: null,
  setSelectedBlockId: (id) =>
    set((state) => (state.selectedBlockId === id ? state : { selectedBlockId: id })),

  setWorkspace: (ws) => set({ workspace: ws }),
  restoreStudyWorkspace: (researchId, { savedXml = {}, userBlocks = [] }) => {
    const scope = `userstudy-Li-${researchId}`
    studyBlocks.set(scope, userBlocks)
    set((state) => ({ userBlockScope: scope, userBlocks,
      savedXml: { ...state.savedXml, ...savedXml }, recentDeletedUserBlocks: [] }))
  },
  setDialogOpen: (open) => set({ dialogOpen: open }),
  setExampleXml: (xml) => set({ exampleXml: xml }),
  setTitle: (newTitle) => set({ title: newTitle }),
  clearExampleXml: () => set({ exampleXml: null }),

  // Save the XML string for a specific workspace id (persisted).
  saveWorkspaceXml: (id, xmlText) =>
    set((state) => {
      const savedXml = { ...state.savedXml, [id]: xmlText }
      if (!isMemoryStudyScope(id)) persistSavedXml(savedXml)
      return { savedXml }
    }),
  clearSavedWorkspaces: (ids) =>
    set((state) => {
      const savedXml = { ...state.savedXml }
      for (const id of ids) delete savedXml[id]
      persistSavedXml(savedXml)
      return { savedXml }
    }),
  addUserBlock: ({ name, xmlText, source = 'workspace' }) => {
    const trimmedName = String(name || '').trim()
    if (!trimmedName || !xmlText) return null

    const block = {
      id: `my-block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmedName,
      xmlText,
      source,
      createdAt: new Date().toISOString(),
    }

    set((state) => {
      const userBlocks = [block, ...state.userBlocks]
      persistUserBlocks(userBlocks, state.userBlockScope)
      return { userBlocks }
    })

    return block
  },
  deleteUserBlock: (blockId) =>
    set((state) => {
      const deletedBlock = state.userBlocks.find((block) => block.id === blockId)
      if (!deletedBlock) return state
      const userBlocks = state.userBlocks.filter((block) => block.id !== blockId)
      const recentDeletedUserBlocks = [
        deletedBlock,
        ...state.recentDeletedUserBlocks.filter((block) => block.id !== blockId),
      ].slice(0, MAX_RECENT_DELETED_USER_BLOCKS)
      persistUserBlocks(userBlocks, state.userBlockScope)
      return { userBlocks, recentDeletedUserBlocks }
    }),
  restoreUserBlock: (block) =>
    set((state) => {
      if (!block?.id || !block.name || !block.xmlText) return state
      const userBlocks = [block, ...state.userBlocks.filter((item) => item.id !== block.id)]
      const recentDeletedUserBlocks = state.recentDeletedUserBlocks.filter(
        (item) => item.id !== block.id,
      )
      persistUserBlocks(userBlocks, state.userBlockScope)
      return { userBlocks, recentDeletedUserBlocks }
    }),
}))

export default useWorkspaceStore
