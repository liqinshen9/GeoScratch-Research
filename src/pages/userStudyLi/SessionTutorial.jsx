import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as Blockly from 'blockly/core'
import ExercisePage from '@/pages/ExercisePage'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import usePivotPlaybackStore from '@/store/usePivotPlaybackStore'
import tutorialExercise from './SphereTutorialExercise'
import { tutorialProgress } from './tutorialProgress'
import { instructionIndex, TUTORIAL_INSTRUCTIONS } from './tutorialInstructions'
import './SessionTutorial.css'

const COPY = {
  open: ['Open the Toolbox to explore all the available blocks.', ''],
  sphere: ['Drag the block from the Toolbox into the Workspace.', ''],
  scalar: ['Drag the block from the Toolbox into the Workspace.', ''],
  radius: ['Connect the Scalar', 'Drag your Scalar block into the Sphere’s Radius socket.'],
  point: ['Drag the block from the Toolbox into the Workspace.', ''],
  centre: ['Connect the Point', 'Drag your Point block into the Sphere’s Centre socket.'],
  duplicate: ['Duplicate a Sphere', 'Right-click the Sphere block and select Duplicate.'],
  replay: ['Replay the 3D animation', 'Click Show animation on the left to replay the 3D steps. You can rotate the 3D view to find a clear viewing angle.'],
  labels: ['Toggle a sphere’s label', 'Left-click a sphere in the 3D view to show its name. Click it again to hide the label.'],
  done: ['Tutorial complete', 'You’re ready to practise dragging, connecting, and editing blocks in the trial exercise.'],
}

function pointerSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 32 40')
  svg.classList.add('tutorial-demo-pointer')
  svg.innerHTML = '<path d="M5 2L5 28L12 22L18 36L24 33L18 20L28 20Z" fill="white" stroke="#2563eb" stroke-width="2" stroke-linejoin="round"/>'
  return svg
}

function connectionPosition(workspace, block, input) {
  const connection = input ? block?.getInput(input)?.connection : block?.outputConnection
  if (!connection) return null
  const blockPosition = block.getRelativeToSurfaceXY()
  const offset = connection.getOffsetInBlock()
  return Blockly.utils.svgMath.wsToScreenCoordinates(workspace, new Blockly.utils.Coordinate(blockPosition.x + offset.x, blockPosition.y + offset.y))
}

function TutorialGuide({ onDone, labelToggleCount }) {
  const [coachHost, setCoachHost] = useState(null)
  const workspace = useWorkspaceStore((state) => state.workspace)
  const [revision, setRevision] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)
  const [focus, setFocus] = useState(null)
  const [replay, setReplay] = useState(0)
  const [layoutRevision, setLayoutRevision] = useState(0)
  const [watchedAnimation, setWatchedAnimation] = useState(false)
  const [triedLabels, setTriedLabels] = useState(false)
  const [instructionSelection, setInstructionSelection] = useState(null)
  const previousLabelToggleCount = useRef(labelToggleCount)
  const animationPlaying = usePivotPlaybackStore((state) => Boolean(state.target?.userData?.tutorialPreview))
  const demoRef = useRef(null)
  const progress = tutorialProgress(workspace, createOpen)
  const { stage: workspaceStage, head, scalar, point, completed, part, fieldBlock, fieldName, expectedValue, fieldLabel, duplicateSource } = progress
  const stage = workspaceStage === 'done'
    ? !watchedAnimation ? 'replay' : !triedLabels ? 'labels' : 'done'
    : workspaceStage
  const automaticIndex = instructionIndex(progress, stage)
  // Resume automatic guidance whenever the user's workspace advances or changes step.
  const automaticKey = `${progress.part?.key ?? ''}:${stage}:${fieldName ?? ''}`
  const selectedIndex = instructionSelection?.automaticKey === automaticKey
    ? instructionSelection.index : automaticIndex
  const browsing = selectedIndex !== automaticIndex
  const instruction = TUTORIAL_INSTRUCTIONS[selectedIndex]
  const numberField = fieldBlock?.getField(fieldName)?.getSvgRoot()
  const coordinateGuide = stage === 'values' && fieldName && fieldName !== 'scalar'
  const inputArrowGuide = stage === 'values' && part?.key === 'head'

  useEffect(() => {
    setCoachHost(document.querySelector('.exercise-page[data-exercise-id="session-sphere-tutorial"] .editor-body-3d'))
  }, [])

  useEffect(() => usePivotPlaybackStore.subscribe((state, previous) => {
    if (!state.target && state.progress >= 1 && previous.target?.userData?.tutorialPreview) {
      setWatchedAnimation(true)
    }
  }), [])
  useEffect(() => {
    if (workspaceStage !== 'done') {
      setWatchedAnimation(false)
      setTriedLabels(false)
    }
  }, [workspaceStage])
  useEffect(() => {
    if (labelToggleCount !== previousLabelToggleCount.current && watchedAnimation && workspaceStage === 'done') {
      setTriedLabels(true)
    }
    previousLabelToggleCount.current = labelToggleCount
  }, [labelToggleCount, watchedAnimation, workspaceStage])

  useEffect(() => {
    const refresh = (event) => {
      setCreateOpen(Boolean(document.querySelector('[data-category-id="create"].is-active')))
      setRevision((value) => value + 1)
      if (event?.type === Blockly.Events.BLOCK_MOVE || event?.type === 'resize' || event?.type === 'scroll') {
        setLayoutRevision((value) => value + 1)
      }
    }
    const observer = new MutationObserver(refresh)
    const shell = document.querySelector('.blocks-shell')
    if (shell) observer.observe(shell, { childList: true, subtree: true })
    workspace?.addChangeListener(refresh)
    window.addEventListener('resize', refresh)
    document.addEventListener('scroll', refresh, true)
    document.addEventListener('click', refresh)
    refresh()
    return () => {
      observer.disconnect()
      workspace?.removeChangeListener(refresh)
      window.removeEventListener('resize', refresh)
      document.removeEventListener('scroll', refresh, true)
      document.removeEventListener('click', refresh)
    }
  }, [workspace])

  useEffect(() => {
    if (browsing) {
      setFocus(null)
      return undefined
    }
    const type = { sphere: 'geo_sphere', scalar: 'scalar', point: 'linalg_point' }[stage]
    const reference = stage === 'values' ? document.querySelector(`[data-tutorial-${coordinateGuide ? 'centre' : 'radius'}="${part.key}"]`) : null
    const target = stage === 'replay' ? (animationPlaying ? null : document.querySelector('[data-tutorial-animation]'))
      : stage === 'values' ? (inputArrowGuide ? numberField : reference)
      : stage === 'duplicate' ? duplicateSource?.getSvgRoot()?.querySelector(':scope > .blocklyPath')
      : stage === 'open' ? document.querySelector('[data-category-id="create"]')
      : type ? document.querySelector(`[data-block-type="${type}"]`)
        : stage === 'radius' ? scalar?.getSvgRoot() : stage === 'centre' ? point?.getSvgRoot() : numberField ?? head?.getSvgRoot()
    if (type) target?.scrollIntoView({ block: 'nearest' })
    reference?.scrollIntoView({ block: 'nearest' })
    reference?.classList.add('tutorial-table-highlight')
    const checkButton = stage === 'values' ? document.querySelector(`.exercise-step-check[data-step-key="${part.key}"]`) : null
    checkButton?.classList.add('tutorial-check-highlight')
    const blockRoot = stage === 'duplicate' ? duplicateSource?.getSvgRoot()
      : type ? target?.querySelector('.blocklyBlockCanvas > g')
      : stage === 'radius' ? scalar?.getSvgRoot()
        : stage === 'centre' ? point?.getSvgRoot()
          : stage === 'values' ? fieldBlock?.getSvgRoot() : null
    if (stage !== 'done') blockRoot?.classList.add('tutorial-block-highlight')
    const rect = target?.getBoundingClientRect()
    const referenceRect = reference?.getBoundingClientRect()
    const padding = stage === 'replay' ? 3 : 6
    if (stage !== 'replay') setFocus(rect && stage !== 'done' ? { x: rect.x - padding, y: rect.y - padding, width: rect.width + padding * 2, height: rect.height + padding * 2, outline: stage === 'open', reference: referenceRect, check: checkButton?.getBoundingClientRect() } : null)
    return () => {
      blockRoot?.classList.remove('tutorial-block-highlight')
      reference?.classList.remove('tutorial-table-highlight')
      checkButton?.classList.remove('tutorial-check-highlight')
      if (stage === 'replay') target?.classList.remove('tutorial-check-highlight')
    }
  }, [browsing, stage, head, scalar, point, numberField, fieldBlock, revision, coordinateGuide, inputArrowGuide, part?.key, duplicateSource, animationPlaying])

  useEffect(() => {
    if (browsing || stage !== 'replay') return undefined
    if (animationPlaying) {
      setFocus(null)
      return undefined
    }
    let frame
    let positioned = false
    const followButton = () => {
      const button = document.querySelector('[data-tutorial-animation]')
      if (button) {
        if (!positioned) {
          button.scrollIntoView({ block: 'center', behavior: 'instant' })
          positioned = true
        }
        // Completion changes the panel layout after the workspace event. Read
        // the live rectangle each frame, including during scrolling/layout shifts.
        const rect = button.getBoundingClientRect()
        const next = { x: rect.x - 6, y: rect.y - 6, width: rect.width + 12, height: rect.height + 12, outline: false }
        setFocus((current) => current && current.x === next.x && current.y === next.y
          && current.width === next.width && current.height === next.height ? current : next)
      }
      frame = requestAnimationFrame(followButton)
    }
    frame = requestAnimationFrame(followButton)
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [browsing, stage, animationPlaying])

  useEffect(() => {
    const host = demoRef.current
    host.replaceChildren()
    const animations = []
    if (browsing) return undefined
    if (stage === 'values' && !inputArrowGuide) return undefined
    const type = { sphere: 'geo_sphere', scalar: 'scalar', point: 'linalg_point' }[stage]
    const preview = type ? document.querySelector(`[data-block-type="${type}"]`) : null
    const createButton = document.querySelector('[data-category-id="create"]')
    const existing = stage === 'radius' ? scalar?.getSvgRoot() : stage === 'centre' ? point?.getSvgRoot() : null
    const source = stage === 'duplicate' ? duplicateSource?.getSvgRoot()?.querySelector(':scope > .blocklyPath')
      : stage === 'open' ? createButton : numberField ?? existing ?? preview
    const original = existing ?? preview?.querySelector('.blocklyBlockCanvas > g')
    const rect = (original ?? source)?.getBoundingClientRect()
    if (!rect) return undefined
    const cursor = pointerSvg()
    host.append(cursor)
    cursor.style.left = `${rect.x + (original ? Math.min(rect.width / 2, 30) : rect.width / 2)}px`
    cursor.style.top = `${rect.y + (original ? 12 : rect.height / 2)}px`
    if (stage === 'duplicate') {
      // The group's bounds include attached inputs; aim at the Sphere title itself.
      cursor.style.left = `${rect.x + 16}px`
      cursor.style.top = `${rect.y + 8}px`
    }
    if (stage === 'open' || stage === 'values' || stage === 'duplicate') {
      animations.push(cursor.animate([{ transform: 'translate(20px, 24px)', opacity: 0 }, { transform: 'translate(0, 0)', opacity: 1, offset: 0.4 }, { transform: 'translate(0, 0) scale(.9)', opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: 3300, iterations: Infinity }))
      if (numberField) {
        // Radius is guided from above; centre fields from below, clear of Radius.
        const blockRect = fieldBlock.getSvgRoot().getBoundingClientRect()
        const fromBelow = fieldName !== 'scalar'
        // Point to the real field, stopping outside its clickable area.
        cursor.remove()
        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        arrow.classList.add('tutorial-demo-input-arrow')
        arrow.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`)
        const tipX = rect.x + rect.width / 2
        const tipY = fromBelow ? rect.bottom + 6 : rect.top - 6
        const startX = tipX
        const startY = fromBelow ? blockRect.bottom + 38 : Math.max(8, blockRect.top - 38)
        const direction = fromBelow ? 1 : -1
        arrow.innerHTML = `<path d="M${startX} ${startY} L${tipX} ${tipY + direction * 12} L${tipX} ${tipY}" fill="none" stroke="#2563eb" stroke-width="2" stroke-linejoin="round"/><path d="M${tipX - 5} ${tipY + direction * 7} L${tipX} ${tipY} L${tipX + 5} ${tipY + direction * 7}" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
        host.prepend(arrow)
        animations.push(arrow.animate([{ opacity: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], { duration: 3300, iterations: Infinity }))
      }
    } else if (preview || existing) {
      const workspaceRect = document.querySelector('.workspace-host')?.getBoundingClientRect()
      if (!original || !workspaceRect || !workspace) return undefined
      const box = original.getBBox()
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('class', `${original.closest('svg')?.getAttribute('class') ?? 'blocklySvg'} tutorial-demo-block`)
      svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`)
      svg.setAttribute('width', String(box.width * workspace.scale))
      svg.setAttribute('height', String(box.height * workspace.scale))
      const block = original.cloneNode(true)
      block.removeAttribute('transform')
      // Blockly themes scope text/field styles to the original workspace.
      // Freeze those computed styles so the moving copy stays identical.
      const originals = [original, ...original.querySelectorAll('*')]
      const copies = [block, ...block.querySelectorAll('*')]
      originals.forEach((element, index) => {
        const style = window.getComputedStyle(element)
        for (const property of ['fill', 'stroke', 'stroke-width', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'opacity']) {
          copies[index].style.setProperty(property, style.getPropertyValue(property))
        }
      })
      const defs = source.closest('svg')?.querySelector('defs') ?? preview?.querySelector('svg defs')
      if (defs) svg.append(defs.cloneNode(true))
      svg.append(block)
      svg.style.left = `${rect.x}px`
      svg.style.top = `${rect.y}px`
      host.prepend(svg)
      let end = { x: workspaceRect.x + workspaceRect.width * 0.65, y: workspaceRect.y + workspaceRect.height * 0.25 }
      const input = stage === 'radius' || stage === 'scalar' ? 'RADIUS_INPUT'
        : stage === 'centre' || stage === 'point' ? 'CENTRE' : null
      const socket = input ? connectionPosition(workspace, head, input) : null
      const child = existing ? (stage === 'radius' ? scalar : point)
        : Blockly.common.getAllWorkspaces()
          .flatMap((previewWorkspace) => previewWorkspace.getAllBlocks(false))
          .find((previewBlock) => previewBlock.getSvgRoot?.() === original)
      const output = child?.outputConnection?.getOffsetInBlock()
      // Align the actual plug and socket, including the tab outside the SVG bounds.
      // A fixed vertical offset leaves the demonstration visibly disconnected.
      if (socket && output) end = {
        x: socket.x - (output.x - box.x) * workspace.scale,
        y: socket.y - (output.y - box.y) * workspace.scale,
      }
      const dx = end.x - rect.x
      const dy = end.y - rect.y
      const connected = Boolean(socket && output)
      const destination = `translate(${dx}px, ${dy}px)`
      const frames = [{ transform: 'translate(0, 0)', opacity: 0 }, { transform: 'translate(0, 0)', opacity: 0.9, offset: 0.15 }, { transform: destination, opacity: 1, offset: 0.6 }, { transform: destination, opacity: 1, offset: 0.92 }, { transform: destination, opacity: 0 }]
      const timing = { duration: connected ? 4200 : 3300, iterations: Infinity, easing: 'ease-in-out' }
      animations.push(svg.animate(frames, timing))
      // Release the pointer after snapping so both joined blocks are easy to see.
      const pointerFrames = connected
        ? [...frames.slice(0, 3), { transform: destination, opacity: 0, offset: 0.68 }, { transform: destination, opacity: 0 }]
        : frames
      animations.push(cursor.animate(pointerFrames, timing))
    }
    return () => { animations.forEach((animation) => animation.cancel()); host.replaceChildren() }
  }, [browsing, stage, workspace, head, scalar, point, numberField, fieldBlock, fieldName, fieldLabel, expectedValue, part?.key, inputArrowGuide, replay, createOpen, layoutRevision, duplicateSource])

  const [title, description] = coordinateGuide
    ? ['Set the centre', 'Enter the centre coordinates in your Point block.']
    : stage === 'values'
    ? ['Set the radius', 'Enter the radius in your Scalar block.']
    : COPY[stage]
  const [instructionTitle, instructionDescription] = instruction.stage === 'values'
    ? instruction.fieldName === 'scalar'
      ? ['Set the radius', `Set the ${instruction.part.name.toLowerCase()} radius to ${instruction.part.radius} in your Scalar block.`]
      : ['Set the centre', `Set ${instruction.fieldName} to ${instruction.part.centre[['X', 'Y', 'Z'].indexOf(instruction.fieldName)]} in the Point block for the ${instruction.part.name.toLowerCase()}.`]
    : COPY[instruction.stage]
  const restartTutorial = () => {
    setInstructionSelection(null)
    setWatchedAnimation(false)
    setTriedLabels(false)
    workspace?.clear()
    workspace?.clearUndo()
    document.querySelector('[data-category-id].is-active')?.click()
    setCreateOpen(false)
    setRevision((value) => value + 1)
    setReplay((value) => value + 1)
  }
  return <>
    {focus && <svg className="tutorial-spotlight" aria-hidden="true"><path fillRule="evenodd" d={`M0 0H${window.innerWidth}V${window.innerHeight}H0Z M${focus.x} ${focus.y}v${focus.height}h${focus.width}v-${focus.height}Z${inputArrowGuide && focus.reference ? ` M${focus.reference.x} ${focus.reference.y}v${focus.reference.height}h${focus.reference.width}v-${focus.reference.height}Z` : ''}${focus.check ? ` M${focus.check.x - 3} ${focus.check.y - 3}v${focus.check.height + 6}h${focus.check.width + 6}v-${focus.check.height + 6}Z` : ''}`} />{focus.outline && <rect x={focus.x} y={focus.y} width={focus.width} height={focus.height} rx="8" />}</svg>}
    <div className="tutorial-demo" ref={demoRef} aria-hidden="true" />
    {focus && stage === 'replay' && !browsing && !animationPlaying && (
      <svg className="tutorial-animation-arrow" aria-hidden="true">
        <path d={`M${focus.x + focus.width / 2} ${focus.y - 38} L${focus.x + focus.width / 2} ${focus.y - 6} M${focus.x + focus.width / 2 - 5} ${focus.y - 13} L${focus.x + focus.width / 2} ${focus.y - 6} L${focus.x + focus.width / 2 + 5} ${focus.y - 13}`} />
      </svg>
    )}
    {coachHost && createPortal(<section className="tutorial-coach" aria-label="Tutorial guide">
      <div className="tutorial-coach__top"><span className="tutorial-eyebrow">{completed.length}/3</span>{workspaceStage !== 'done' && <button type="button" className="tutorial-skip" onClick={onDone}>Skip tutorial</button>}</div>
      <div aria-live="polite">
        <h2>{browsing ? instructionTitle : title}</h2>
        {(browsing ? instructionDescription : description) && <p>{browsing ? instructionDescription : description}</p>}
      </div>
      {instruction.stage === 'values' && <p>Click Check for this step if you need a hint.</p>}
      {stage === 'done' && !browsing && <div className="tutorial-coach__actions tutorial-coach__completion-actions">
        <button type="button" className="tutorial-primary" onClick={onDone}>Start trial exercise</button>
        <button type="button" className="tutorial-coach__watch-again" onClick={restartTutorial}>Watch again</button>
      </div>}
      <nav className="tutorial-coach__navigation tutorial-coach__actions" aria-label="Tutorial instructions">
        <button type="button" disabled={selectedIndex === 0}
          onClick={() => setInstructionSelection({ automaticKey, index: selectedIndex - 1 })}>Previous</button>
        <button type="button" disabled={selectedIndex >= automaticIndex}
          onClick={() => setInstructionSelection({ automaticKey, index: Math.min(selectedIndex + 1, automaticIndex) })}>Next</button>
      </nav>
    </section>, coachHost)}
  </>
}

export default function SessionTutorial({ researchId, onDone }) {
  const [labelToggleCount, setLabelToggleCount] = useState(0)
  return <div className="app-container flex h-dvh flex-col overflow-hidden">
    <main className="flex min-h-0 flex-1 flex-col">
      <ExercisePage exerciseModule={tutorialExercise} standalone
        workspaceId={`userstudy-Li-${researchId}-tutorial`} showDebugSolution={false}
        showAnswerHighlight={false} hideAnimationTransport wideTaskPanel
        toggleLabelsOnLeftClick onLabelsToggle={() => setLabelToggleCount((count) => count + 1)} />
      <TutorialGuide onDone={onDone} labelToggleCount={labelToggleCount} />
    </main>
  </div>
}
