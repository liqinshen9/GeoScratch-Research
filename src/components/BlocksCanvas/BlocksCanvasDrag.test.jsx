// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BlocksCanvas from './BlocksCanvas'
import addBlockToWorkspace from '@/utils/addBlockToWorkspace'
import addCompositeBlockToWorkspace from '@/utils/addCompositeBlockToWorkspace'

const mocks = vi.hoisted(() => ({ workspace: {}, syncScene: vi.fn(), deleteUserBlock: vi.fn() }))
vi.mock('@/components/BlocksCanvas/hooks/useBlocksWorkspace', () => ({ useBlocksWorkspace: () => ({
  workspace: mocks.workspace, syncScene: mocks.syncScene, clearObjects: vi.fn(),
}) }))
vi.mock('@/components/BlocksCanvas/hooks/useWorkspaceAutosave', () => ({ useWorkspaceAutosave: () => {} }))
vi.mock('@/components/BlocksCanvas/hooks/useBlockSelectionSync', () => ({ useBlockSelectionSync: () => {} }))
vi.mock('@/components/BlocksCanvas/hooks/useBlockTrash', () => ({
  TRASH_BLOCK_XML_TRANSFER_TYPE: 'application/x-geoscratch-trash-block-xml',
  TRASH_BLOCK_ID_TRANSFER_TYPE: 'application/x-geoscratch-trash-block-id',
  useBlockTrash: () => ({}),
}))
vi.mock('@/utils/addBlockToWorkspace', () => ({ default: vi.fn() }))
vi.mock('@/utils/addCompositeBlockToWorkspace', () => ({ default: vi.fn(() => true) }))
vi.mock('@/store/useWorkspaceStore', () => {
  const state = { selectedBlockId: null, setSelectedBlockId: vi.fn(), addUserBlock: vi.fn(),
    deleteUserBlock: mocks.deleteUserBlock, userBlocks: [{ id: 'saved-cube', name: 'Saved cube', xmlText: '<xml><block type="geo_cube"/></xml>' }] }
  const store = (selector) => selector(state)
  store.getState = () => state
  return { default: store }
})
vi.mock('@/components/BlocksCanvas/MyBlockDialog', () => ({ default: () => null }))
vi.mock('@/components/BlocksCanvas/WorkspaceControls', () => ({ default: () => null }))
vi.mock('@/components/BlocksCanvas/palette/BlockPalette', () => ({ default: () => (
  <div>
    <div data-testid="preview" onDragOver={(event) => event.stopPropagation()}>Block preview</div>
    <button className="my-block-trash" onDrop={() => mocks.deleteUserBlock('saved-cube')}>Saved blocks trash</button>
  </div>
) }))

let host, root
function dispatchDrag(target, type, payload, x = 300, y = 200) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y })
  const transfer = { types: Object.keys(payload), getData: (key) => payload[key] ?? '', dropEffect: 'none' }
  Object.defineProperty(event, 'dataTransfer', { value: transfer })
  act(() => target.dispatchEvent(event))
  return { event, transfer }
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root.render(<BlocksCanvas id="userstudy-Li-test-create-complex-object" />))
  act(() => host.querySelector('[data-category-id="create"]').click())
  host.querySelector('.workspace-host').getBoundingClientRect = () => ({ left: 200, right: 700, top: 100, bottom: 600 })
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  delete globalThis.IS_REACT_ACT_ENVIRONMENT
})

describe('workspace drops through the overlapping toolbox flyout', () => {
  it.each([
    ['regular block', { 'application/x-geoscratch-block-type': 'geo_cube' }],
    ['saved block', { 'application/x-geoscratch-my-block-id': 'saved-cube' }],
  ])('accepts drag entry and drops a %s once, even if a preview swallows bubbling', (_name, payload) => {
    const preview = host.querySelector('[data-testid="preview"]')
    const enter = dispatchDrag(preview, 'dragenter', payload)
    expect(enter.event.defaultPrevented).toBe(true)
    expect(enter.transfer.dropEffect).toBe('copy')
    expect(dispatchDrag(preview, 'dragover', payload).event.defaultPrevented).toBe(true)
    expect(dispatchDrag(preview, 'drop', payload).event.defaultPrevented).toBe(true)
    if ('application/x-geoscratch-block-type' in payload) {
      expect(addBlockToWorkspace).toHaveBeenCalledExactlyOnceWith(mocks.workspace, 'geo_cube', { clientX: 300, clientY: 200 })
      expect(addCompositeBlockToWorkspace).not.toHaveBeenCalled()
    } else {
      expect(addCompositeBlockToWorkspace).toHaveBeenCalledExactlyOnceWith(mocks.workspace, expect.any(String), {
        clientX: 300, clientY: 200, myBlockId: 'saved-cube',
      })
      expect(addBlockToWorkspace).not.toHaveBeenCalled()
    }
  })

  it('leaves saved-block trash drops to the trash rather than adding another workspace block', () => {
    const trash = host.querySelector('.my-block-trash')
    const payload = { 'application/x-geoscratch-my-block-id': 'saved-cube' }
    expect(dispatchDrag(trash, 'dragover', payload).event.defaultPrevented).toBe(false)
    dispatchDrag(trash, 'drop', payload)
    expect(mocks.deleteUserBlock).toHaveBeenCalledExactlyOnceWith('saved-cube')
    expect(addCompositeBlockToWorkspace).not.toHaveBeenCalled()
  })

  it('rejects outside-workspace drops and unrelated dragged data', () => {
    const preview = host.querySelector('[data-testid="preview"]')
    const payload = { 'application/x-geoscratch-block-type': 'geo_cube' }
    expect(dispatchDrag(preview, 'drop', payload, 100, 200).event.defaultPrevented).toBe(false)
    expect(dispatchDrag(preview, 'drop', { 'text/plain': 'unrelated text' }).event.defaultPrevented).toBe(false)
    expect(addBlockToWorkspace).not.toHaveBeenCalled()
    expect(addCompositeBlockToWorkspace).not.toHaveBeenCalled()
  })
})
