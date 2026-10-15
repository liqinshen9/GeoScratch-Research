import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'
import { forInstance } from '@/store/colorSystem'
import { isEffectivelyStandalone, vector3FromBlock } from '@/utils/sceneHelpers'
import { isPointPlaneManualDifference } from '@/utils/pointPlaneManualDifference'
import { vectorArithmeticCode } from '../linalgOperators/vectorArithmetic'

let REGISTERED = false

/**
 * Register linalg_vec3 (3-dimensional vector) building blocks + code generator
 * Output type: 'vector3'
 * Field: X/Y/Z (number)
 */
export function initVec3Block() {
  if (REGISTERED) return
  REGISTERED = true

  function appendPointFields(block) {
    block
      .appendDummyInput()
      .appendField('Point: (')
      .appendField(new Blockly.FieldNumber(1), 'X')
      .appendField(',')
      .appendField(new Blockly.FieldNumber(1), 'Y')
      .appendField(',')
      .appendField(new Blockly.FieldNumber(1), 'Z')
      .appendField(')')
  }

  function appendVectorFields(block) {
    block.appendDummyInput().appendField('Vector')
    for (const axis of ['X', 'Y', 'Z']) {
      block
        .appendDummyInput()
        .appendField(`${axis.toLowerCase()}:`)
        .appendField(new Blockly.FieldNumber(1), axis)
    }
    block.appendValueInput('ORIGIN').setCheck('vector3').appendField('from point:')
  }

  function initVector3LikeBlock(block, tooltip, objectType) {
    if (objectType === 'point') appendPointFields(block)
    else appendVectorFields(block)
    block.setStyle(objectType === 'point' ? BLOCK_STYLES.CREATE_POINT : BLOCK_STYLES.CREATE_VECTOR)
    block.setColour(forInstance(objectType, block.id))
    block.setTooltip(tooltip)
    block.setDeletable(true)
    block.setMovable(true)
    block.setOutput(true, 'vector3')
  }

  Blockly.Blocks['linalg_vec3'] = {
    init() {
      initVector3LikeBlock(this, '3D vector coordinate', 'vector')
    },
  }

  Blockly.Blocks['linalg_point'] = {
    init() {
      initVector3LikeBlock(this, '3D point coordinate', 'point')
    },
  }

  function vector3Generator(block) {
    const coords = `${block.getFieldValue('X')}, ${block.getFieldValue('Y')}, ${block.getFieldValue('Z')}`
    const blockId = JSON.stringify(block.id)
    // A point/vector block feeding another block's input keeps its old
    // value-only behaviour (rendering that is handled by whatever consumes
    // it); only a block sitting alone on the workspace gets its own glyph.
    const isStandalone = isEffectivelyStandalone(block)

    if (block.type === 'linalg_point') {
      return [
        `(function(){
        const point = new THREE.Vector3(${coords});
        const label = geoNaming.nameFor(${blockId});
        point.userData = {
          geoType: 'linalg_point_vector',
          label,
          point: point.clone(),
        };
        ${
          isStandalone
            ? `
        const pointColor = window.GeoScratchColors.forInstance('point', ${blockId});
        const marker = window.geoPointMarker({ color: pointColor, geoType: 'linalg_point_marker', srcBlockId: ${blockId} });
        marker.position.copy(point);
        marker.userData.labelAnchors = { p: { type: 'world', position: [point.x, point.y, point.z] } };
        marker.userData.labels = [
          { anchor: 'p', name: label, value: vectorNotation.formatVector(point), distanceFactor: 8, offset: [0.12, 0.12, 0], color: pointColor },
        ];
        if (typeof threeObjStore === 'object' && threeObjStore) threeObjStore[${blockId}] = marker;
        `
            : ''
        }
        return point;
      })()`,
        Order.FUNCTION_CALL,
      ]
    }

    const originInput = block.getInput?.('ORIGIN')
    const originConnected = Boolean(originInput?.connection?.targetConnection)
    const originCode = originConnected
      ? javascriptGenerator.valueToCode(block, 'ORIGIN', Order.FUNCTION_CALL)
      : ''

    let manualScene = null
    const originBlock = block.getInputTargetBlock('ORIGIN')
    if (originBlock?.type === 'linalg_point'
      && isPointPlaneManualDifference(vector3FromBlock(block), vector3FromBlock(originBlock))) {
      // Render the learner's valid manual displacement with the same generator
      // as P - Q1. This also supplies the metadata used by projection/playback.
      const point = (code, label, id) => `(function(){const p = ${code};
        p.userData = { ...(p.userData || {}), geoType: 'linalg_point_vector',
          label: ${JSON.stringify(label)}, srcBlockId: ${JSON.stringify(id)} }; return p;})()`
      manualScene = vectorArithmeticCode(block, javascriptGenerator, {
        op: 'subtract',
        u: point('new THREE.Vector3(-9, 8, 7)', 'P', block.id),
        v: point(originCode, 'Q1', originBlock.id),
        uLabel: 'P', vLabel: 'Q1',
        uColor: `window.GeoScratchColors.forRole('operandA')`,
        vColor: `window.GeoScratchColors.forRole('operandB')`,
      })[0]
    }

    const genericCode = `(function(){
      const vec = new THREE.Vector3(${coords});
      const originValue = ${originConnected ? originCode || 'null' : 'null'};
      const origin = originValue?.isVector3 ? originValue.clone() : new THREE.Vector3(0, 0, 0);
      if (${originConnected}) {
        vec.userData = { ...(vec.userData || {}), anchor: origin.clone() };
      }
      ${
        isStandalone
          ? `
      const label = geoNaming.nameFor(${blockId});
      const tip = origin.clone().add(vec);
      const len = vec.length();
      const vectorColor = window.GeoScratchColors.forInstance('vector', ${blockId});
      let visual;
      if (len > 1e-8) {
        visual = window.buildVectorShaftGlyph(THREE, ${blockId}, origin, vec.clone().normalize(), len, vectorColor);
      } else {
        visual = window.geoPointMarker({ color: vectorColor, radius: 0.04 });
        visual.position.copy(origin);
      }
      visual.userData.geoType = 'geo_vector';
      visual.userData.srcBlockId = ${blockId};
      // The shaft itself, before the tail-marker wrapper below replaces
      // visual with a group -- a group can't be grown, this can.
      const shaftGlyph = visual;
      visual.userData.labelAnchors = { tip: { type: 'world', position: [tip.x, tip.y, tip.z] } };
      visual.userData.labels = [
        { anchor: 'tip', name: label, value: vectorNotation.formatVector(vec), distanceFactor: 8, offset: [0.12, 0.12, 0], color: vectorColor },
      ];
      // Another block is already drawing this exact vector: two coincident
      // glyphs can't be depth-ordered (speckling) and one label hides the
      // other. Hand our label to the owner and drop our own glyph.
      // See src/utils/duplicateVectorRegistry.js.
      const duplicateOwnerId = window.registerVectorGlyph
        ? window.registerVectorGlyph(${blockId}, origin, vec)
        : null;
      if (duplicateOwnerId) {
        const owner = window.threeObjStore?.[duplicateOwnerId];
        const ownerAnchor = Object.keys(owner?.userData?.labelAnchors || {})[0];
        if (owner?.userData?.labels && ownerAnchor) {
          owner.userData.labels.push({
            anchor: ownerAnchor,
            name: label,
            value: vectorNotation.formatVector(vec),
            distanceFactor: 8,
            offset: [0.12, 0.12 - owner.userData.labels.length * 0.3, 0],
            color: vectorColor,
          });
        }
        visual.traverse((child) => {
          child.geometry?.dispose?.();
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m) => m?.dispose?.());
        });
      } else if (typeof threeObjStore === 'object' && threeObjStore) {
        threeObjStore[${blockId}] = visual;
      }
      // Provenance: this exact arrow is already on screen, from this tail, so
      // an operator downstream draws no coincident copy of it (and its reveal
      // skips a stage that could only grow underneath this one).
      // See vectorArithmetic.js's ownerGlyphs.
      if (len > 1e-8) {
        const ownerShaft = duplicateOwnerId
          ? window.threeObjStore?.[duplicateOwnerId]
          : shaftGlyph;
        vec.userData = {
          ...(vec.userData || {}),
          glyph: {
            blockId: duplicateOwnerId || ${blockId},
            anchor: origin.clone(),
            // What a consumer's staged reveal grows in place of a copy.
            objs: ownerShaft?.userData?.setVectorLength ? [ownerShaft] : [],
          },
        };
      }
      `
          : ''
      }
      // Which block this value came from. Deliberately NOT a label: a value
      // carrying one makes shouldShowOperandLabels false, which suppresses the
      // operand labels an operator draws, and a socketed vec3 renders no glyph
      // of its own to carry the name instead. This just lets a consumer look the
      // name up when it wants to show it.
      vec.userData = { ...(vec.userData || {}), srcBlockId: ${blockId} };
      return vec;
    })()`
    return [manualScene
      ? `(String(window.__geoScratchRuntimeMode || '').endsWith('point-plane-distance') ? ${manualScene} : ${genericCode})`
      : genericCode, Order.FUNCTION_CALL]
  }

  //Linalg primitives
  javascriptGenerator.forBlock['linalg_vec3'] = vector3Generator
  javascriptGenerator.forBlock['linalg_point'] = vector3Generator
}
