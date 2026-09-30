const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0))
const CONSTRUCTION_STAGE_COUNT = 6
const CONSTRUCTION_STAGE_UNITS = 1.2
const CONSTRUCTION_DURATION_UNITS = CONSTRUCTION_STAGE_COUNT * CONSTRUCTION_STAGE_UNITS
const FINAL_GLOW_UNITS = 2.5
const ANIMATION_DURATION_UNITS = CONSTRUCTION_DURATION_UNITS + FINAL_GLOW_UNITS

function attachedBlockIds(root) {
  const ids = []
  const visited = new Set()
  const visit = (block) => {
    if (!block || visited.has(block.id)) return
    visited.add(block.id)
    ids.push(block.id)
    for (const input of block.inputList ?? []) visit(input.connection?.targetBlock?.())
  }
  visit(root)
  return ids
}

function inputBlock(block, inputName) {
  return (
    block?.getInputTargetBlock?.(inputName) ??
    block?.inputList?.find((input) => input.name === inputName)?.connection?.targetBlock?.() ??
    null
  )
}

function objectForBlock(objects, block) {
  if (!block) return null
  let match = null
  for (const object of objects) {
    object?.traverse?.((child) => {
      if (!match && child.userData?.srcBlockId === block.id) match = child
    })
    if (match) break
  }
  return match
}

function childWithType(root, geoType) {
  let match = null
  root?.traverse?.((child) => {
    if (!match && child.userData?.geoType === geoType) match = child
  })
  return match
}

function gateLabels(object, state, firstStage, waitForStageEnd = false) {
  for (const label of object?.userData?.labels ?? []) {
    if (label.__pointPlaneStepGate) continue
    const original = label.revealed
    label.revealed = () =>
      (!state.playing ||
        state.stage > firstStage ||
        (state.stage === firstStage && (!waitForStageEnd || state.localProgress >= 0.95))) &&
      (typeof original !== 'function' || original() !== false)
    label.__pointPlaneStepGate = true
  }
}

/**
 * Installs the user-study construction playback on the projection scene group.
 * Stages reveal plane, P, Q, grow n from Q, show P-Q, project a copy, then label d.
 */
export function installPointPlaneStepAnimation({ objects, workspace, blocks }) {
  const planeObject = objectForBlock(objects, blocks.plane)
  const pointObject = objects.find((object) => object?.userData?.geoType === 'exercise_point_p')
  const pointOnPlaneObject = objectForBlock(objects, blocks.pointQ)
  const differenceObject = objectForBlock(objects, blocks.difference)
  const runtimeStore = globalThis.window?.threeObjStore
  const differenceGroup = runtimeStore?.[blocks.difference.id] ?? differenceObject
  const differenceArrow =
    runtimeStore?.[`${blocks.difference.id}_r`] ??
    childWithType(differenceGroup, 'geo_vector') ??
    differenceObject
  const normalObject = objectForBlock(objects, blocks.normalFromQ)
  const projectionObject = objectForBlock(objects, blocks.projection)
  const magnitudeObject = objectForBlock(objects, blocks.magnitude)
  const qMarker = childWithType(pointOnPlaneObject, 'selectable_point_marker')
  const planeDefinitionGroup = childWithType(planeObject, 'parametric_plane_point_normal_group')
  const planeDefinitionPoint = childWithType(planeObject, 'parametric_plane_point_marker')
  const planeDefinitionNormal = childWithType(planeObject, 'parametric_plane_normal_arrow')

  if (
    !planeObject ||
    !pointObject ||
    !pointOnPlaneObject ||
    !differenceObject ||
    !projectionObject ||
    typeof projectionObject.userData?.setDistanceConstructionProgress !== 'function'
  ) {
    return null
  }

  const state = { playing: false, stage: 0, localProgress: 0 }
  const planePoint = planeObject.userData?.point
  for (const label of planeObject.userData?.labels ?? []) {
    if (label.anchor !== 'point') continue
    label.name = 'A'
    label.value = planePoint?.isVector3 ? `(${planePoint.toArray().join(', ')})` : ''
    label.className = 'label--study-coordinate'
    label.revealed = () => planeDefinitionGroup?.visible ?? planeDefinitionPoint?.visible ?? false
  }
  gateLabels(planeObject, state, 0)
  gateLabels(pointObject, state, 1)
  gateLabels(pointOnPlaneObject, state, 2)
  gateLabels(normalObject ?? projectionObject, state, 3)
  gateLabels(differenceGroup, state, 4, true)
  gateLabels(projectionObject, state, 5)
  gateLabels(magnitudeObject, state, 6)
  if (normalObject) {
    for (const label of projectionObject.userData?.labels ?? []) {
      if (label.text === 'n') label.revealed = () => false
    }
  }

  const stageBlocks = [
    blocks.plane,
    blocks.pointP,
    blocks.pointQ,
    blocks.normalFromQ,
    blocks.difference,
    blocks.projection,
    blocks.magnitude,
  ]
  const highlightIdsForStage = (stage) => {
    if (stage === 5) {
      return [blocks.projection, blocks.difference, inputBlock(blocks.projection, 'V')]
        .filter(Boolean)
        .map((block) => block.id)
        .filter((id, index, ids) => ids.indexOf(id) === index)
    }
    if (stage === 6) return [blocks.magnitude.id]
    return attachedBlockIds(stageBlocks[stage])
  }
  const normalLength = normalObject?.userData?.vectorLength ?? 0
  const differenceLength = differenceArrow?.userData?.vectorLength ?? 0
  const usesStandaloneNormal = typeof normalObject?.userData?.setVectorLength === 'function'
  let highlighted = null

  const setVisible = (object, visible) => {
    if (object) object.visible = visible
  }
  const setPlaneDefinitionVisible = (visible) => {
    if (planeDefinitionGroup) {
      setVisible(planeDefinitionGroup, visible)
      return
    }
    setVisible(planeDefinitionPoint, visible)
    setVisible(planeDefinitionNormal, visible)
  }
  if (usesStandaloneNormal) {
    projectionObject.userData.setDistanceConstructionNormalOrigin?.(
      normalObject.userData.vectorOrigin,
    )
    setVisible(childWithType(projectionObject, 'distance_normal_arrow'), false)
  }
  setPlaneDefinitionVisible(false)
  const applyStage = (stage, localProgress = 0, blinkProgress = -1) => {
    state.stage = stage
    state.localProgress = clamp01(localProgress)
    setVisible(planeObject, true)
    setPlaneDefinitionVisible(stage < 2)
    setVisible(pointOnPlaneObject, true)
    setVisible(qMarker, stage >= 2)
    setVisible(pointObject, stage >= 1)
    setVisible(normalObject, stage >= 3)
    setVisible(differenceGroup, stage >= 4)
    setVisible(projectionObject, stage >= (usesStandaloneNormal ? 5 : 3))
    setVisible(magnitudeObject, stage >= 6)

    const normalProgress = stage < 3 ? 0 : stage > 3 ? 1 : clamp01(localProgress)
    if (usesStandaloneNormal) {
      normalObject.userData.setVectorLength(normalLength * normalProgress)
    } else {
      projectionObject.userData?.setDistanceNormalProgress?.(normalProgress)
    }

    const differenceProgress = stage < 4 ? 0 : stage > 4 ? 1 : clamp01(localProgress)
    differenceArrow?.userData?.setVectorLength?.(differenceLength * differenceProgress)
    if (differenceArrow) differenceArrow.visible = stage >= 4 && differenceProgress > 1e-3

    if (stage < 6) {
      projectionObject.userData.setDistanceFinalProgress?.(0)
      projectionObject.userData.setDistanceFinalBlink?.(-1)
    }
    const projectionProgress = stage < 5 ? 0 : stage > 5 ? 1 : clamp01(localProgress)
    projectionObject.userData.setDistanceConstructionProgress(projectionProgress)
    projectionObject.userData.setDistanceConstructionPhase?.(
      stage <= 4 ? 'normal' : stage >= 6 ? 'distance' : 'projection',
    )
    if (stage >= 6) {
      projectionObject.userData.setDistanceFinalProgress?.(1)
      projectionObject.userData.setDistanceFinalBlink?.(blinkProgress)
    }
    const midpoint = projectionObject.userData.distanceConstructionMidpoint
    const distanceAnchor = magnitudeObject?.userData?.labelAnchors?.distanceMid
    if (midpoint?.isVector3 && distanceAnchor) distanceAnchor.position = midpoint.toArray()
  }

  projectionObject.userData.animateSteps = (progress) => {
    const p = clamp01(progress)
    if (p >= 1) {
      state.playing = false
      state.stage = 6
      applyStage(6, 1, 1)
      if (highlighted !== null) workspace?.highlightBlock?.(null)
      highlighted = null
      return
    }

    state.playing = true
    const scaled = p * ANIMATION_DURATION_UNITS
    const stage =
      scaled < CONSTRUCTION_DURATION_UNITS
        ? Math.floor(scaled / CONSTRUCTION_STAGE_UNITS)
        : CONSTRUCTION_STAGE_COUNT
    const localProgress =
      stage < CONSTRUCTION_STAGE_COUNT
        ? (scaled - stage * CONSTRUCTION_STAGE_UNITS) / CONSTRUCTION_STAGE_UNITS
        : Math.min(1, scaled - CONSTRUCTION_DURATION_UNITS)
    const blinkProgress =
      scaled < CONSTRUCTION_DURATION_UNITS
        ? -1
        : Math.min(1, (scaled - CONSTRUCTION_DURATION_UNITS) / FINAL_GLOW_UNITS)
    applyStage(stage, localProgress, blinkProgress)

    const highlightIds = highlightIdsForStage(stage)
    const highlightKey = highlightIds.join('|')
    if (highlighted !== highlightKey) {
      workspace?.highlightBlock?.(highlightIds[0] ?? null)
      for (const id of highlightIds.slice(1)) workspace?.highlightBlock?.(id, true)
      highlighted = highlightKey
    }
  }
  projectionObject.userData.animateSteps.durationScale = ANIMATION_DURATION_UNITS
  return projectionObject
}

export default installPointPlaneStepAnimation
