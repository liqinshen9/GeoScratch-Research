// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Blockly from 'blockly/core'
import THREE from '@/utils/three'
import defineBlocks from './index'
import { namedSavedWorkspaceXml } from './savedWorkspace'
import { generateAndRun } from '@/utils/generateAndRun'

vi.mock('@/store/colorSystem', () => ({ forRole: () => '#3366cc', forInstance: () => '#3366cc',
  forInstanceVariant: () => '#3366cc', subscribeToPreset: () => () => {} }))

const sphere = (radius, x, y) => `<block type="geo_sphere"><value name="RADIUS_INPUT"><block type="scalar"><field name="scalar">${radius}</field></block></value><value name="CENTRE"><block type="linalg_point"><field name="X">${x}</field><field name="Y">${y}</field><field name="Z">0</field></block></value></block>`
const mouse = `<xml>${sphere(2, 0, 2)}${sphere(1, -2, 4)}${sphere(1, 2, 4)}</xml>`
let workspace, errors
function insert(xml, name = 'micki') {
  const dom = Blockly.utils.xml.textToDom(namedSavedWorkspaceXml(xml, name))
  const ids = Blockly.Xml.domToWorkspace(dom, workspace)
  return workspace.getBlockById(ids[0])
}
beforeEach(() => {
  defineBlocks()
  workspace = new Blockly.Workspace()
  window.threeObjStore = {}
  window.GeoScratchColors = { forInstance: () => '#3366cc', forRole: () => '#3366cc', forInstanceVariant: () => '#3366cc' }
  const context = new Proxy({}, { get: () => () => {}, set: () => true })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => context)
  errors = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  workspace.dispose()
  vi.restoreAllMocks()
})

describe('named saved constructions', () => {
  it('shows one block with the exact chosen name and stores the construction inside', () => {
    const block = insert(mouse)
    expect(workspace.getAllBlocks(false)).toHaveLength(1)
    expect(block.type).toBe('geo_saved_workspace')
    expect(block.getFieldValue('BLOCK_NAME')).toBe('micki')
    expect(block.outputConnection.getCheck()).toEqual(['obj3D'])
    expect(block.savedXml_).toBe(mouse)
  })
  it('renders all three saved spheres once, with their original radii and centres', () => {
    const block = insert(mouse)
    generateAndRun(workspace)
    expect(errors).not.toHaveBeenCalled()
    expect(Object.keys(window.threeObjStore)).toEqual([block.id])
    const result = window.threeObjStore[block.id]
    expect(result.children).toHaveLength(3)
    expect(result.children.map((child) => child.userData.radius).sort()).toEqual([1, 1, 2])
    expect(result.children.map((child) => child.position.toArray()).sort()).toEqual([[-2, 4, 0], [0, 2, 0], [2, 4, 0]].sort())
    expect(result.children.every((child) => child.userData.srcBlockId === block.id)).toBe(true)
  })
  it('keeps separate copies independent and preserves contents through JSON and XML restoration', () => {
    insert(mouse)
    insert(mouse)
    const state = Blockly.serialization.workspaces.save(workspace)
    workspace.clear()
    Blockly.serialization.workspaces.load(state, workspace)
    const xml = Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(workspace))
    workspace.clear()
    Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(xml), workspace)
    generateAndRun(workspace)
    expect(errors).not.toHaveBeenCalled()
    const objects = Object.values(window.threeObjStore)
    expect(objects).toHaveLength(2)
    expect(objects[0].children[0]).not.toBe(objects[1].children[0])
    expect(objects.every((group) => group.children.length === 3)).toBe(true)
  })
  it('retains internal transforms and accepts an external transform on the named object', () => {
    const xml = `<xml><block type="transform_pipeline"><value name="INPUT">${sphere(2, 0, 2)}</value><statement name="STEPS"><block type="trans_matrix"><field name="TX">4</field><field name="TY">0</field><field name="TZ">0</field></block></statement></block></xml>`
    const block = insert(xml, 'moved sphere')
    const pipeline = workspace.newBlock('transform_pipeline')
    pipeline.getInput('INPUT').connection.connect(block.outputConnection)
    const translation = workspace.newBlock('trans_matrix')
    translation.setFieldValue('3', 'TX')
    pipeline.getInput('STEPS').connection.connect(translation.previousConnection)
    generateAndRun(workspace)
    expect(errors).not.toHaveBeenCalled()
    expect(window.threeObjStore[block.id].getWorldPosition(new THREE.Vector3()).x).toBeCloseTo(7)
  })
  it('preserves scalar output types and the existing named cube exercise block', () => {
    const scalar = insert('<xml><block type="scalar"><field name="scalar">2</field></block></xml>', 'size')
    expect(scalar.outputConnection.getCheck()).toEqual(['scalar'])
    const cube = insert('<xml><block type="geo_special_cube" /></xml>', 'My cube')
    expect(cube.type).toBe('geo_special_cube')
    expect(cube.getFieldValue('BLOCK_NAME')).toBe('My cube')
  })
})
