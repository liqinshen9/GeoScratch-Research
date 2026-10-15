// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Blockly from 'blockly/core'
import THREE from '@/utils/three'
import defineBlocks from './index'
import { namedSavedWorkspaceXml } from './savedWorkspace'
import { generateAndRun } from '@/utils/generateAndRun'
import cubePointPivot from '@/exercises/exercise10-cubePointPivot'
import pointPlane from '@/exercises/exercise05-pointPlane'
import { findLabelOwner } from '@/utils/scenePicking'
import { getLabelsForObject, getLabelVisibilityKeysForObject } from '@/components/Scene3D/labels/labelData'
import { BlockRegistry } from '../state/BlockRegistry'

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
  window.GeoScratchColors = { forInstance: () => '#3366cc', forRole: () => '#3366cc', forInstanceVariant: () => '#3366cc', subscribeToPreset: () => () => {} }
  const context = new Proxy({}, { get: () => () => {}, set: () => true })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => context)
  errors = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  workspace.dispose()
  vi.restoreAllMocks()
})

describe('named saved constructions', () => {
  it('reuses the displayed Q1 label when its rounded coordinates are copied into a manual vector', () => {
    Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(pointPlane.solutionXml), workspace)
    generateAndRun(workspace)
    const displayedQ = workspace.getBlocksByType('geo_show_point_on_object', false)[0]
    const sampledPoint = window.threeObjStore[displayedQ.id].userData.point
    const coordinates = sampledPoint.toArray().map((value) => Number(value.toFixed(2)))
    const difference = workspace.getBlocksByType('vector_arithmetic', false)[0]
    displayedQ.unplug()
    difference.getInputTargetBlock('U').unplug()
    difference.dispose()
    const manual = workspace.newBlock('linalg_vec3')
    const q = workspace.newBlock('linalg_point')
    for (const [index, field] of ['X', 'Y', 'Z'].entries()) {
      q.setFieldValue(String(coordinates[index]), field)
      manual.setFieldValue(String([-9, 8, 7][index] - coordinates[index]), field)
    }
    manual.getInput('ORIGIN').connection.connect(q.outputConnection)
    // As in the screenshot, the displacement is a standalone vector.
    generateAndRun(workspace)
    expect(errors).not.toHaveBeenCalled()
    const original = window.threeObjStore[displayedQ.id]
    const originalLabels = original.userData.labels
    let objects = pointPlane.decorateObjects(Object.values(window.threeObjStore), workspace)
    objects = pointPlane.decorateObjects(objects, workspace)
    const qLabels = []
    objects.forEach((object) => object.traverse((child) => {
      qLabels.push(...getLabelsForObject(child).filter((label) => label.anchor === 'q'))
    }))
    expect(qLabels).toHaveLength(1)
    expect(original.userData.labels).toBe(originalLabels)
    expect(objects).toContain(original)
    expect(getLabelVisibilityKeysForObject(original)).toHaveLength(1)
    expect(objects.some((object) => object.userData.geoType === 'exercise_point_q')).toBe(false)
    expect(pointPlane.evaluate({ objects, workspace }).steps.difference).toBe(true)
  })
  it('accepts the manually calculated displacement from the photo through the full distance computation', () => {
    Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(pointPlane.solutionXml), workspace)
    const displayedQ = workspace.getBlocksByType('geo_show_point_on_object', false)[0]
    displayedQ.getInputTargetBlock('OBJECT').unplug()
    displayedQ.dispose()
    const difference = workspace.getBlocksByType('vector_arithmetic', false)[0]
    difference.getInputTargetBlock('U').unplug()
    difference.dispose()
    const makeQ = () => {
      const q = workspace.newBlock('linalg_point')
      q.setFieldValue('-10.6', 'X'); q.setFieldValue('5.61', 'Y'); q.setFieldValue('-3.62', 'Z')
      return q
    }
    const manual = workspace.newBlock('linalg_vec3')
    manual.setFieldValue('1.6', 'X'); manual.setFieldValue('2.39', 'Y'); manual.setFieldValue('10.62', 'Z')
    manual.getInput('ORIGIN').connection.connect(makeQ().outputConnection)
    const projection = workspace.getBlocksByType('vector_project', false)[0]
    projection.getInput('U').connection.connect(manual.outputConnection)
    projection.getInputTargetBlock('V').getInput('ORIGIN').connection.connect(makeQ().outputConnection)
    generateAndRun(workspace)
    expect(errors).not.toHaveBeenCalled()
    const result = pointPlane.evaluate({ objects: Object.values(window.threeObjStore), workspace })
    expect(result.steps.difference).toBe(true)
    expect(Object.values(result.steps).every(Boolean)).toBe(true)
    expect(result.passed).toBe(true)
    let objects = pointPlane.decorateObjects(Object.values(window.threeObjStore), workspace)
    const labelsFor = (id, anchor) => {
      const labels = []
      objects.forEach((object) => object.traverse((child) => {
        if (child.userData.srcBlockId === id) {
          labels.push(...(child.userData.labels ?? []).filter((label) => label.anchor === anchor))
        }
      }))
      return labels
    }
    expect(labelsFor(projection.id, 'uTip')).toEqual([expect.objectContaining({ name: 'P − Q1' })])
    manual.unplug()
    generateAndRun(workspace)
    objects = pointPlane.decorateObjects(Object.values(window.threeObjStore), workspace)
    // Repeated decoration must retain the name even after Q1 has its label.
    objects = pointPlane.decorateObjects(objects, workspace)
    expect(labelsFor(manual.id, 'tip')).toEqual([expect.objectContaining({ name: 'P − Q1' })])
  })
  it.each([false, true])('renders the same construction and playback for manual P - Q1 (copy displayed Q: %s)', (keepDisplayedQ) => {
    const options = { runtimeMode: 'userstudy-Li-preview-point-plane-distance' }
    Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(pointPlane.solutionXml), workspace)
    generateAndRun(workspace, options)
    const displayedQ = workspace.getBlocksByType('geo_show_point_on_object', false)[0]
    const coordinates = keepDisplayedQ
      ? window.threeObjStore[displayedQ.id].userData.point.toArray().map((n) => Number(n.toFixed(2)))
      : [4.64, -10.73, 13.82]
    const makeQ = () => {
      const q = workspace.newBlock('linalg_point')
      for (const [index, field] of ['X', 'Y', 'Z'].entries()) q.setFieldValue(String(coordinates[index]), field)
      return q
    }
    const difference = workspace.getBlocksByType('vector_arithmetic', false)[0]
    displayedQ.unplug()
    if (!keepDisplayedQ) {
      displayedQ.getInputTargetBlock('OBJECT').unplug()
      displayedQ.dispose()
    }
    difference.getInputTargetBlock('U').unplug()
    difference.dispose()
    const manual = workspace.newBlock('linalg_vec3')
    for (const [index, field] of ['X', 'Y', 'Z'].entries()) {
      manual.setFieldValue(String([-9, 8, 7][index] - coordinates[index]), field)
    }
    manual.getInput('ORIGIN').connection.connect(makeQ().outputConnection)
    const projection = workspace.getBlocksByType('vector_project', false)[0]
    projection.getInput('U').connection.connect(manual.outputConnection)
    projection.getInputTargetBlock('V').getInput('ORIGIN').connection.connect(makeQ().outputConnection)
    generateAndRun(workspace, options)
    expect(errors).not.toHaveBeenCalled()
    const registry = new BlockRegistry()
    registry.reconcile(Object.values(window.threeObjStore))
    const objects = pointPlane.decorateObjects(registry.list().map((entry) => entry.obj), workspace)
    const distance = objects.find((object) => object.userData.geoType === 'point_plane_distance_projection_magnitude')
    expect(distance).toBeTruthy()
    expect(window.threeObjStore[projection.id].userData.labels).toEqual([
      expect.objectContaining({ text: 'n' }),
    ])
    const differenceObject = window.threeObjStore[manual.id]
    expect(differenceObject.userData.labels).toEqual([expect.objectContaining({ text: 'P − Q1' })])
    const animation = objects.find((object) => typeof object.userData.animateSteps === 'function')
    expect(animation).toBeTruthy()
    for (const progress of [0, 0.3, 0.6, 1]) {
      animation.userData.animateSteps(progress)
      expect(pointPlane.evaluate({ objects, workspace }).passed).toBe(true)
    }
  })
  it('calculates the full point-plane distance with a manually entered Q1', () => {
    Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(pointPlane.solutionXml), workspace)
    const displayedQ = workspace.getBlocksByType('geo_show_point_on_object', false)[0]
    displayedQ.getInputTargetBlock('OBJECT').unplug()
    const difference = workspace.getBlocksByType('vector_arithmetic', false)[0]
    displayedQ.dispose()
    const makeQ = () => {
      const q = workspace.newBlock('linalg_point')
      q.setFieldValue('0', 'X'); q.setFieldValue('-1.5', 'Y'); q.setFieldValue('0', 'Z')
      return q
    }
    difference.getInput('V').connection.connect(makeQ().outputConnection)
    const normal = workspace.getBlocksByType('vector_project', false)[0].getInputTargetBlock('V')
    normal.getInput('ORIGIN').connection.connect(makeQ().outputConnection)
    generateAndRun(workspace)
    expect(errors).not.toHaveBeenCalled()
    const result = pointPlane.evaluate({ objects: Object.values(window.threeObjStore), workspace })
    expect(Object.values(result.steps).every(Boolean)).toBe(true)
    expect(result.passed).toBe(true)
    const registry = new BlockRegistry()
    registry.reconcile(Object.values(window.threeObjStore))
    const objects = pointPlane.decorateObjects(registry.list().map((entry) => entry.obj), workspace)
    const q = objects.find((object) => object.userData.geoType === 'exercise_point_q')
    expect(q.userData.labels[0]).toMatchObject({ name: 'Q1', value: expect.stringContaining('-1.5') })
    expect(q.position.toArray()).toEqual([0, 0, 0])
    const marker = q.children[0]
    expect(marker.position.toArray()).toEqual([0, -1.5, 0])
    expect(marker.userData.clickLabelAnchor).toBe('q')
    expect(findLabelOwner(marker, getLabelsForObject)).toBe(q)
    expect(getLabelVisibilityKeysForObject(q)).toHaveLength(1)
    const animation = objects.find((object) => typeof object.userData.animateSteps === 'function')
    expect(animation).toBeTruthy()
    animation.userData.animateSteps(0)
    expect(marker.visible).toBe(false)
    expect(q.userData.labels[0].revealed()).toBe(false)
    animation.userData.animateSteps(2.4 / 9.7)
    expect(marker.visible).toBe(true)
    expect(q.userData.labels[0].revealed()).toBe(true)
    animation.userData.animateSteps(1)
    expect(pointPlane.evaluate({ objects, workspace }).passed).toBe(true)
  })
  it('allows the real generated cube rotation solution to pass all steps and the exercise', () => {
    Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(cubePointPivot.solutionXml), workspace)
    generateAndRun(workspace)
    expect(errors).not.toHaveBeenCalled()
    const objects = Object.values(window.threeObjStore)
    const result = cubePointPivot.evaluate({ objects, workspace })
    expect(result.steps).toEqual({ pipeline: true, toOrigin: true, rotate: true, back: true })
    expect(result.correct).toBe(true)
    expect(result.passed).toBe(true)
    cubePointPivot.decorateObjects(objects, workspace)
    const target = result.target
    for (const progress of [0, 0.5, 0.625, 1]) {
      target.userData.animateSteps(progress)
      expect(cubePointPivot.evaluate({ objects, workspace }).passed, `animation progress ${progress}`).toBe(true)
    }
  })
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
