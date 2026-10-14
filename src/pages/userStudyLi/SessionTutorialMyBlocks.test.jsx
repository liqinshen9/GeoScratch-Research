// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import * as Blockly from 'blockly/core'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import usePivotPlaybackStore from '@/store/usePivotPlaybackStore'
import MyBlockDialog from '@/components/BlocksCanvas/MyBlockDialog'
import SessionTutorial from './SessionTutorial'
import { MY_BLOCK_SAVED_EVENT } from '@/utils/myBlockSavedEvent'

vi.mock('./tutorialProgress', () => ({
  tutorialProgress: () => ({ stage: 'done', completed: ['head', 'left', 'right'] }),
  TUTORIAL_SPHERES: [{ key: 'head' }, { key: 'left' }, { key: 'right' }],
}))
vi.mock('./SphereTutorialExercise', () => ({ default: {} }))
vi.mock('@/pages/ExercisePage', () => ({ default: function TutorialWorkspace({ onLabelsToggle, workspaceId }) {
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState(false)
  const userBlocks = useWorkspaceStore((state) => state.userBlocks)
  return <div className="exercise-page" data-exercise-id="session-sphere-tutorial">
    <div className="blocks-shell">
      <button data-category-id="mybox" className={open ? 'is-active' : ''} onClick={() => setOpen(!open)}>My Blocks</button>
      {open && <>
        <button className="make-block-button" onClick={() => setDialog(true)}>Make a Block</button>
        {userBlocks.map((block) => <div key={block.id} data-my-block-id={block.id}>{block.name}</div>)}
      </>}
      <MyBlockDialog open={dialog} title="Make a Block" defaultName="My geometric block" confirmLabel="Save"
        onCancel={() => setDialog(false)} onConfirm={(name) => {
          const workspace = useWorkspaceStore.getState().workspace
          const savedBlock = useWorkspaceStore.getState().addUserBlock({ name, xmlText: Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(workspace)) })
          // Workspace metadata can change while the palette builds its preview.
          // Successful saving must advance the guide even if XML now differs.
          workspace.getTopBlocks(false)[0].data = 'updated after saving'
          window.dispatchEvent(new CustomEvent(MY_BLOCK_SAVED_EVENT, { detail: { workspaceId, blockId: savedBlock.id } }))
          setDialog(false)
        }} />
    </div>
    <div className="editor-body-3d"><button onClick={onLabelsToggle}>Toggle label</button></div>
  </div>
} }))

let host, root, workspace
const click = async (text) => act(async () => {
  const button = [...document.querySelectorAll('button')].find((element) => element.textContent === text)
  expect(button).toBeTruthy()
  button.click()
})
const heading = () => document.querySelector('[aria-label="Tutorial guide"] h2')?.textContent

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  HTMLElement.prototype.scrollIntoView = vi.fn()
  Blockly.Blocks.tutorial_saved_object = { init() { this.appendDummyInput().appendField('Tutorial object') } }
  workspace = new Blockly.Workspace()
  workspace.newBlock('tutorial_saved_object')
  useWorkspaceStore.setState({ workspace, userBlocks: [] })
  usePivotPlaybackStore.setState({ target: null, progress: 0 })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  workspace.dispose()
  useWorkspaceStore.setState({ workspace: null, userBlocks: [] })
  usePivotPlaybackStore.setState({ target: null, progress: 0 })
  delete Blockly.Blocks.tutorial_saved_object
  delete HTMLElement.prototype.scrollIntoView
  vi.unstubAllGlobals()
  localStorage.clear()
  delete globalThis.IS_REACT_ACT_ENVIRONMENT
})

it('guides a real naming dialog after labels and advances straight to completion after saving', async () => {
  const onDone = vi.fn()
  await act(async () => root.render(<SessionTutorial researchId="test" onDone={onDone} />))
  expect(heading()).toBe('Replay the 3D animation')
  await act(async () => {
    usePivotPlaybackStore.setState({ target: { userData: { tutorialPreview: true } }, progress: 0 })
    usePivotPlaybackStore.getState().advance(1)
  })
  expect(heading()).toBe('Toggle a sphere’s label')
  await click('Toggle label')
  expect(heading()).toBe('Open My Blocks')
  expect(document.querySelector('[data-category-id="mybox"]').classList.contains('tutorial-action-highlight')).toBe(true)
  expect(document.querySelector('.tutorial-animation-arrow')).toBeTruthy()
  await click('My Blocks')
  expect(heading()).toBe('Make a reusable block')
  await click('Make a Block')
  expect(heading()).toBe('Name your block')
  expect(document.querySelector('.tutorial-coach--dialog')?.parentElement).toBe(document.body)
  const input = document.querySelector('[data-my-block-name]')
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'My mouse head')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(heading()).toBe('Save your block')
  await click('Save')
  expect(heading()).toBe('Tutorial complete')
  expect(document.querySelector('[aria-label="Tutorial guide"]').textContent).not.toContain('Saved as:')
  expect(document.querySelector('.tutorial-animation-arrow')).toBeNull()
  expect(document.querySelector('.make-block-button').classList.contains('tutorial-action-highlight')).toBe(false)
  expect(onDone).not.toHaveBeenCalled()
  await click('Start trial exercise')
  expect(onDone).toHaveBeenCalledOnce()
})
