import { useEffect, useRef, useState } from 'react'
import * as Blockly from 'blockly/core'
import ExercisePage from '@/pages/ExercisePage'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import tutorialExercise from './SphereTutorialExercise'
import { tutorialProgress } from './tutorialProgress'
import './SessionTutorial.css'

const COPY = {
  open: ['Open the Toolbox', 'Click Create to find your blocks.'],
  sphere: ['Drag a Sphere', 'Drag Sphere from the Toolbox into the Workspace.'],
  scalar: ['Add a Scalar', 'Drag Scalar from the Toolbox into the Workspace.'],
  radius: ['Connect the Scalar', 'Drag your Scalar block into the Sphere’s Radius socket.'],
  point: ['Add a Point', 'Drag Point from the Toolbox into the Workspace.'],
  centre: ['Connect the Point', 'Drag your Point block into the Sphere’s Centre socket.'],
  done: ['You made it!', 'You can now drag, connect, and edit blocks.'],
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

function TutorialGuide({ onDone }) {
  const workspace = useWorkspaceStore((state) => state.workspace)
  const [revision, setRevision] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)
  const [focus, setFocus] = useState(null)
  const [replay, setReplay] = useState(0)
  const [layoutRevision, setLayoutRevision] = useState(0)
  const demoRef = useRef(null)
  const progress = tutorialProgress(workspace, createOpen)
  const { stage, head, scalar, point, completed, part, fieldBlock, fieldName, expectedValue, fieldLabel } = progress
  const numberField = fieldBlock?.getField(fieldName)?.getSvgRoot()
  const coordinateGuide = stage === 'values' && fieldName && fieldName !== 'scalar'
  const inputArrowGuide = stage === 'values' && part?.key === 'head'

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
    const type = { sphere: 'geo_sphere', scalar: 'scalar', point: 'linalg_point' }[stage]
    const reference = stage === 'values' ? document.querySelector(`[data-tutorial-${coordinateGuide ? 'centre' : 'radius'}="${part.key}"]`) : null
    const target = stage === 'values' ? (inputArrowGuide ? numberField : reference)
      : stage === 'open' ? document.querySelector('[data-category-id="create"]')
      : type ? document.querySelector(`[data-block-type="${type}"]`)
        : stage === 'radius' ? scalar?.getSvgRoot() : stage === 'centre' ? point?.getSvgRoot() : numberField ?? head?.getSvgRoot()
    if (type) target?.scrollIntoView({ block: 'nearest' })
    reference?.scrollIntoView({ block: 'nearest' })
    reference?.classList.add('tutorial-table-highlight')
    const blockRoot = type ? target?.querySelector('.blocklyBlockCanvas > g')
      : stage === 'radius' ? scalar?.getSvgRoot()
        : stage === 'centre' ? point?.getSvgRoot()
          : stage === 'values' ? fieldBlock?.getSvgRoot() : null
    if (stage !== 'done') blockRoot?.classList.add('tutorial-block-highlight')
    const rect = target?.getBoundingClientRect()
    const referenceRect = reference?.getBoundingClientRect()
    setFocus(rect && stage !== 'done' ? { x: rect.x - 6, y: rect.y - 6, width: rect.width + 12, height: rect.height + 12, outline: stage === 'open', reference: referenceRect } : null)
    return () => {
      blockRoot?.classList.remove('tutorial-block-highlight')
      reference?.classList.remove('tutorial-table-highlight')
    }
  }, [stage, head, scalar, point, numberField, fieldBlock, revision, coordinateGuide, inputArrowGuide, part?.key])

  useEffect(() => {
    const host = demoRef.current
    host.replaceChildren()
    const animations = []
    if (stage === 'values' && !inputArrowGuide) return undefined
    const type = { sphere: 'geo_sphere', scalar: 'scalar', point: 'linalg_point' }[stage]
    const preview = type ? document.querySelector(`[data-block-type="${type}"]`) : null
    const createButton = document.querySelector('[data-category-id="create"]')
    const existing = stage === 'radius' ? scalar?.getSvgRoot() : stage === 'centre' ? point?.getSvgRoot() : null
    const source = stage === 'open' ? createButton : numberField ?? existing ?? preview
    const original = existing ?? preview?.querySelector('.blocklyBlockCanvas > g')
    const rect = (original ?? source)?.getBoundingClientRect()
    if (!rect) return undefined
    const cursor = pointerSvg()
    host.append(cursor)
    cursor.style.left = `${rect.x + (original ? Math.min(rect.width / 2, 30) : rect.width / 2)}px`
    cursor.style.top = `${rect.y + (original ? 12 : rect.height / 2)}px`
    if (stage === 'open' || stage === 'values') {
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
  }, [stage, workspace, head, scalar, point, numberField, fieldBlock, fieldName, fieldLabel, expectedValue, part?.key, inputArrowGuide, replay, createOpen, layoutRevision])

  const [title, description] = coordinateGuide
    ? ['Set the centre', `Use the ${part.name.toLowerCase()} coordinates in the table on the left to fill in x, y and z in your Point block.`]
    : stage === 'values'
    ? ['Set the radius', `Use the highlighted radius in the table on the left to fill in your Scalar block.`]
    : COPY[stage]
  return <>
    {focus && <svg className="tutorial-spotlight" aria-hidden="true"><path fillRule="evenodd" d={`M0 0H${window.innerWidth}V${window.innerHeight}H0Z M${focus.x} ${focus.y}v${focus.height}h${focus.width}v-${focus.height}Z${inputArrowGuide && focus.reference ? ` M${focus.reference.x} ${focus.reference.y}v${focus.reference.height}h${focus.reference.width}v-${focus.reference.height}Z` : ''}`} />{focus.outline && <rect x={focus.x} y={focus.y} width={focus.width} height={focus.height} rx="8" />}</svg>}
    <div className="tutorial-demo" ref={demoRef} aria-hidden="true" />
    <section className="tutorial-coach" aria-label="Tutorial guide">
      <div className="tutorial-coach__top"><span className="tutorial-eyebrow">Quick tutorial · {completed.length}/3 spheres{part ? ` · ${part.name}` : ''}</span><button type="button" className="tutorial-skip" onClick={onDone}>Skip</button></div>
      <h2>{title}</h2><p aria-live="polite">{description}</p>
      {stage === 'done' ? <button type="button" className="tutorial-primary" onClick={onDone}>Start the first exercise →</button>
        : <div className="tutorial-coach__actions"><span>Your turn — try it in the workspace.</span><button type="button" onClick={() => setReplay((value) => value + 1)}>Watch again</button></div>}
    </section>
  </>
}

export default function SessionTutorial({ researchId, onDone }) {
  return <div className="app-container flex h-dvh flex-col overflow-hidden">
    <main className="flex min-h-0 flex-1 flex-col">
      <ExercisePage exerciseModule={tutorialExercise} standalone
        workspaceId={`userstudy-Li-${researchId}-tutorial`}
        trackingEnabled={false} workspaceCloudSyncEnabled={false} showDebugSolution={false}
        showAnswerHighlight={false} hideAnimationTransport wideTaskPanel />
      <TutorialGuide onDone={onDone} />
    </main>
  </div>
}
