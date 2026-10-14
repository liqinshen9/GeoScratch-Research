import * as Blockly from 'blockly/core'
import { javascriptGenerator, JavascriptGenerator, Order } from 'blockly/javascript'
import { MY_BLOCK_COLOUR } from './myBlockAppearance'
import { collectStatementChain } from '@/utils/sceneHelpers'

let registered = false

export function initSavedWorkspaceBlock() {
  if (registered) return
  registered = true
  Blockly.Blocks.geo_saved_workspace = {
    init() {
      this.savedXml_ = '<xml></xml>'
      this.savedOutput_ = 'obj3D'
      this.appendDummyInput().appendField(new Blockly.FieldLabelSerializable('My block'), 'BLOCK_NAME')
      this.setColour(MY_BLOCK_COLOUR)
      this.setOutput(true, 'obj3D')
      this.setTooltip('A saved construction. Drag or connect this block to reuse it.')
    },
    mutationToDom() {
      const mutation = Blockly.utils.xml.createElement('mutation')
      mutation.setAttribute('source', this.savedXml_)
      mutation.setAttribute('output', Array.isArray(this.savedOutput_) ? this.savedOutput_.join(',') : this.savedOutput_ ?? '')
      return mutation
    },
    domToMutation(mutation) {
      this.savedXml_ = mutation.getAttribute('source') || '<xml></xml>'
      this.savedOutput_ = mutation.getAttribute('output')?.split(',').filter(Boolean) || null
      if (!this.savedOutput_?.length) this.savedOutput_ = null
      this.setOutput(Boolean(this.savedOutput_), this.savedOutput_)
    },
    saveExtraState() { return { source: this.savedXml_, output: this.savedOutput_ } },
    loadExtraState(state) {
      this.savedXml_ = state.source || '<xml></xml>'
      this.savedOutput_ = state.output || null
      this.setOutput(Boolean(this.savedOutput_), this.savedOutput_)
    },
  }

  javascriptGenerator.forBlock.geo_saved_workspace = function (block) {
    const temporary = new Blockly.Workspace()
    try {
      const dom = Blockly.utils.xml.textToDom(block.savedXml_)
      // Stable private IDs prevent separate instances sharing rendered objects.
      dom.querySelectorAll('block, shadow').forEach((node, index) => node.setAttribute('id', `${block.id}_saved_${index}`))
      Blockly.Xml.domToWorkspace(dom, temporary)
      const generator = new JavascriptGenerator()
      Object.assign(generator.forBlock, javascriptGenerator.forBlock)
      generator.addReservedWords('values,objects,result,visual,key,value,window,THREE,threeObjStore,vectorNotation')
      generator.init(temporary)
      const roots = temporary.getTopBlocks(true)
      const code = roots.map((root) => {
        const generated = generator.blockToCode(root)
        return Array.isArray(generated) ? `values.push((${generated[0]}));\n` : generated
      }).join('')
      const body = generator.finish(code)
      const pipelines = temporary.getBlocksByType('transform_pipeline', false).map((pipeline) => ({
        id: pipeline.id, inputId: pipeline.getInputTargetBlock('INPUT')?.id,
        steps: collectStatementChain(pipeline.getInputTargetBlock('STEPS')).map((step) => ({
          type: step.type, fields: Object.fromEntries(['TX', 'TY', 'TZ', 'SX', 'SY', 'SZ', 'AXIS', 'DEGREES'].map((field) => [field, step.getFieldValue(field)])),
        })),
      }))
      const id = JSON.stringify(block.id)
      const prefix = JSON.stringify(`${block.id}_saved_`)
      const expression = `(function(){
        const values = [];
        ${body}
        window.__geoScratchRunSavedPipelines?.(${JSON.stringify(pipelines)});
        const objects = Object.entries(window.threeObjStore)
          .filter(([key, value]) => key.startsWith(${prefix}) && value?.isObject3D && !value.parent)
          .map(([, value]) => value);
        let result = values.length === 1 ? values[0] : null;
        let visual = objects.length === 1 ? objects[0] : null;
        if (objects.length > 1) {
          visual = new window.THREE.Group();
          visual.add(...objects);
          visual.userData.geoType = 'saved_workspace';
          visual.userData.renderNestedLabels = true;
        }
        if (visual) {
          visual.traverse(child => { child.userData.srcBlockId = ${id}; });
          if (result?.isObject3D || values.length !== 1) result = visual;
        }
        // Keep only the wrapper's rendered result in the scene registry.
        for (const key of Object.keys(window.threeObjStore)) {
          if (key.startsWith(${prefix})) delete window.threeObjStore[key];
        }
        if (visual) window.threeObjStore[${id}] = visual;
        return result;
      })()`
      return block.outputConnection ? [expression, Order.FUNCTION_CALL] : `${expression};\n`
    } finally { temporary.dispose() }
  }
}

/** Display existing saved XML as one named block without changing its backup. */
export function namedSavedWorkspaceXml(xmlText, name) {
  initSavedWorkspaceBlock()
  const dom = Blockly.utils.xml.textToDom(xmlText)
  const roots = [...dom.children].filter((node) => node.tagName.toLowerCase() === 'block')
  // This exercise-specific block is already a single encapsulated construction.
  if (roots.length === 1 && ['geo_special_cube', 'geo_saved_workspace'].includes(roots[0].getAttribute('type'))) {
    let field = [...roots[0].children].find((node) => node.tagName.toLowerCase() === 'field' && node.getAttribute('name') === 'BLOCK_NAME')
    if (!field) { field = Blockly.utils.xml.createElement('field'); field.setAttribute('name', 'BLOCK_NAME'); roots[0].appendChild(field) }
    field.textContent = name
    return Blockly.Xml.domToText(dom)
  }
  let output = null
  const temporary = new Blockly.Workspace()
  try {
    dom.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'))
    Blockly.Xml.domToWorkspace(dom, temporary)
    const blocks = temporary.getTopBlocks(false)
    const checks = blocks.map((block) => (block.type === 'transform_pipeline'
      ? block.getInputTargetBlock('INPUT')?.outputConnection : block.outputConnection)?.getCheck())
    if (blocks.length === 1) output = checks[0] || null
    else if (blocks.length && checks.every((check) => check?.includes('obj3D'))) output = ['obj3D']
  } finally { temporary.dispose() }
  const xml = Blockly.utils.xml.createElement('xml')
  const wrapper = Blockly.utils.xml.createElement('block')
  wrapper.setAttribute('type', 'geo_saved_workspace')
  const mutation = Blockly.utils.xml.createElement('mutation')
  mutation.setAttribute('source', xmlText)
  mutation.setAttribute('output', output?.join(',') || '')
  const field = Blockly.utils.xml.createElement('field')
  field.setAttribute('name', 'BLOCK_NAME')
  field.textContent = name
  wrapper.append(mutation, field)
  xml.appendChild(wrapper)
  return Blockly.Xml.domToText(xml)
}
