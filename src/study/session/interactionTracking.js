import { exerciseTrackingDisabled } from './studyEvents'

const PREFIX = 'userstudyLi.interactions.'
const SCROLL_IDLE_MS = 200
const DRAG_THRESHOLD_PX = 5

function id() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function selectorFor(element) {
  const parts = []
  for (let node = element; node?.tagName && parts.length < 6; node = node.parentElement) {
    if (node.id) { parts.unshift(`#${globalThis.CSS?.escape?.(node.id) ?? node.id.replace(/[^\w-]/g, '\\$&')}`); break }
    const tag = node.tagName.toLowerCase()
    const siblings = [...(node.parentElement?.children ?? [])].filter((sibling) => sibling.tagName === node.tagName)
    parts.unshift(`${tag}${siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(node) + 1})` : ''}`)
  }
  return parts.join(' > ')
}

const AREAS = [
  ['.blocks-col--toolbox', 'block-toolbox'],
  ['.blocks-col--palette', 'block-palette'],
  ['.blocks-col--workspace, .blocklyWidgetDiv, .blocklyDropDownDiv', 'block-workspace'],
  ['.editor-body-3d', '3d-view'],
  ['.exercise-task-panel', 'exercise-instructions'],
  ['.tutorial-coach', 'tutorial-guide'],
  ['.user-study-li-lecture-slides', 'lecture-slides'],
  ['.user-study-li-cube-diagrams', 'cube-diagrams'],
  ['.user-study-li-cube-response', 'lecture-written-answer'],
  ['.user-study-li-lecture-answers, .user-study-li-lecture-answer-form', 'lecture-answer-options'],
  ['.user-study-li-questionnaire', 'questionnaire'],
  ['.user-study-li-lecture-footer, .exercise-column-heading__nav', 'exercise-navigation'],
  ['.user-study-li-lecture-page', 'lecture-page'],
]

export function describeTarget(target, getWorkspace) {
  const element = target?.nodeType === 1 ? target : target?.parentElement
  if (!element) return null
  const control = element.closest('button, a, input, textarea, select, [role="button"], [role="tab"], [role="menuitem"], .blocklyDraggable') ?? element
  const area = control.closest('[data-study-area]')?.dataset.studyArea
    ?? AREAS.find(([selector]) => control.closest(selector))?.[1] ?? 'study-page'
  const tag = control.tagName.toLowerCase()
  const labelledBy = control.getAttribute('aria-labelledby')?.split(/\s+/).map((key) => document.getElementById(key)?.textContent ?? '').join(' ')
  const fieldLabel = control.labels?.[0]?.querySelector('span')?.textContent ?? control.labels?.[0]?.textContent
  const label = control.getAttribute('aria-label') || labelledBy || control.getAttribute('title')
    || fieldLabel || (['button', 'a'].includes(tag) ? control.textContent : '')
    || (tag === 'img' ? control.getAttribute('alt') : '')
  const descriptor = {
    area, tag, elementId: control.id || null,
    trackingId: control.getAttribute('data-study-element') || null,
    role: control.getAttribute('role'), name: control.getAttribute('name'),
    inputType: tag === 'input' ? control.getAttribute('type') : null,
    label: label?.replace(/\s+/g, ' ').trim().slice(0, 200) || null,
    selector: selectorFor(control),
    classes: [...control.classList].slice(0, 12),
    expanded: control.getAttribute('aria-expanded'),
  }
  // Blockly SVG groups do not consistently expose IDs on their DOM nodes.
  const blockRoot = element.closest('.blocklyDraggable')
  if (blockRoot) {
    const block = getWorkspace?.()?.getAllBlocks?.(false).find((candidate) => candidate.getSvgRoot?.() === blockRoot)
    descriptor.blockId = block?.id ?? blockRoot.getAttribute('data-id') ?? null
    descriptor.blockType = block?.type ?? null
  }
  // Never include text-field values, questionnaire choices, or full DOM HTML.
  return descriptor
}

export function readInteractionRecords(researchId, storage = window.localStorage) {
  const prefix = `${PREFIX}${researchId}.`
  const records = []
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index)
    if (key?.startsWith(prefix)) records.push(...JSON.parse(storage.getItem(key)))
  }
  return records.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.sequence - b.sequence)
}

export function createInteractionTracker({ researchId, storage = window.localStorage, getWorkspace, onError = () => {}, onRecovered = () => {}, sendEvent }) {
  const streamId = id()
  const started = performance.now()
  let sequence = 0
  let batch = 0
  let context = null
  let entered = started
  let pending = []
  let storageFailed = false
  const pointers = new Map()
  const scrolls = new Map()
  const listeners = []
  const tracksActivity = (eventContext = context) => eventContext?.conditionId === 'geoscratch'
    && eventContext?.phase === 'geoscratch' && !exerciseTrackingDisabled(eventContext)

  function record(type, details = {}, eventContext = context) {
    if (exerciseTrackingDisabled(eventContext)) return null
    // Lecture/questionnaire views record deliberate submissions only.
    if (!tracksActivity(eventContext) && !['answer_submit', 'questionnaire_submit'].includes(type)) return null
    const entry = {
      eventId: id(), streamId, sequence: ++sequence, schemaVersion: 1,
      researchId, ...eventContext, type, occurredAt: new Date().toISOString(),
      sessionElapsedMs: Math.round(performance.now() - started),
      ...(tracksActivity(eventContext) ? { viewport: { width: window.innerWidth, height: window.innerHeight } } : {}),
      ...details,
    }
    if (sendEvent) { sendEvent(entry); return entry }
    pending.push(entry)
    if (pending.length >= 100) flush()
    return entry
  }

  function flush() {
    if (!pending.length) return
    try {
      storage.setItem(`${PREFIX}${researchId}.${streamId}.${batch}`, JSON.stringify(pending))
      batch++
      pending = []
      if (storageFailed) { storageFailed = false; onRecovered() }
    } catch (error) {
      const firstFailure = !storageFailed
      storageFailed = true
      if (firstFailure) onError(error)
    }
  }

  function setContext(next) {
    if (JSON.stringify(next) === JSON.stringify(context)) return
    leaving('screen-change')
    if (context) record('screen_leave', { durationMs: Math.round(performance.now() - entered) })
    context = { ...next }
    entered = performance.now()
    record('screen_enter')
    flush()
  }

  const point = (event) => ({ x: event.clientX, y: event.clientY })
  function click(event) {
    if (!tracksActivity()) return
    record(event.type === 'contextmenu' ? 'context_menu' : 'click', {
      target: describeTarget(event.target, getWorkspace), position: point(event),
      button: event.button, clickCount: event.detail,
      source: event.detail === 0 ? 'keyboard-or-programmatic' : 'mouse',
      modifiers: { alt: event.altKey, ctrl: event.ctrlKey, meta: event.metaKey, shift: event.shiftKey },
    })
  }

  function pointerDown(event) {
    if (!tracksActivity()) return
    if (event.pointerType && event.pointerType !== 'mouse') return
    pointers.set(event.pointerId, {
      target: describeTarget(event.target, getWorkspace), context: { ...context },
      start: point(event), end: point(event), started: performance.now(),
      button: event.button, dragging: false, distancePx: 0,
    })
  }
  function pointerMove(event) {
    const drag = pointers.get(event.pointerId)
    if (!drag) return
    const next = point(event)
    drag.distancePx += Math.hypot(next.x - drag.end.x, next.y - drag.end.y)
    drag.end = next
    if (!drag.dragging && Math.hypot(next.x - drag.start.x, next.y - drag.start.y) >= DRAG_THRESHOLD_PX) {
      drag.dragging = true
      record('drag_start', { target: drag.target, position: drag.start, button: drag.button }, drag.context)
    }
  }
  function finishPointer(event, reason = event.type) {
    const drag = pointers.get(event.pointerId)
    if (!drag) return
    if (drag.dragging) record('drag_end', {
      target: drag.target, endTarget: event.target ? describeTarget(
        document.elementFromPoint?.(event.clientX, event.clientY) ?? event.target, getWorkspace) : null,
      start: drag.start, end: reason === 'pointerup' ? point(event) : drag.end,
      durationMs: Math.round(performance.now() - drag.started),
      distancePx: Math.round(drag.distancePx + (reason === 'pointerup'
        ? Math.hypot(event.clientX - drag.end.x, event.clientY - drag.end.y) : 0)), button: drag.button,
      cancelled: reason !== 'pointerup', reason,
    }, drag.context)
    pointers.delete(event.pointerId)
  }

  function finishScroll(target) {
    const scroll = scrolls.get(target)
    if (!scroll) return
    clearTimeout(scroll.timer)
    record('scroll', { target: scroll.descriptor, position: scroll.position,
      eventCount: scroll.count, durationMs: Math.round(performance.now() - scroll.started),
      startedAt: scroll.startedAt }, scroll.context)
    scrolls.delete(target)
  }
  function scroll(event) {
    if (!tracksActivity()) return
    const target = event.target === document ? document.scrollingElement : event.target
    if (!target) return
    let state = scrolls.get(target)
    if (!state) {
      state = { descriptor: describeTarget(target, getWorkspace), context: { ...context },
        count: 0, started: performance.now(), startedAt: new Date().toISOString() }
      scrolls.set(target, state)
    }
    state.position = { left: target.scrollLeft, top: target.scrollTop }
    state.count++
    clearTimeout(state.timer)
    state.timer = setTimeout(() => finishScroll(target), SCROLL_IDLE_MS)
  }
  function wheel(event) {
    if (!tracksActivity()) return
    record('wheel', { target: describeTarget(event.target, getWorkspace), position: point(event),
      deltaX: event.deltaX, deltaY: event.deltaY, deltaZ: event.deltaZ, deltaMode: event.deltaMode,
      ctrlKey: event.ctrlKey })
  }
  function leaving(reason) {
    for (const pointerId of pointers.keys()) finishPointer({ pointerId }, reason)
    for (const target of scrolls.keys()) finishScroll(target)
    flush()
  }
  function listen(target, type, handler) {
    target.addEventListener(type, handler, { capture: true, passive: true })
    listeners.push(() => target.removeEventListener(type, handler, true))
  }
  for (const type of ['click', 'auxclick', 'contextmenu']) listen(document, type, click)
  listen(document, 'pointerdown', pointerDown)
  listen(document, 'pointermove', pointerMove)
  listen(document, 'pointerup', finishPointer)
  listen(document, 'pointercancel', finishPointer)
  listen(document, 'wheel', wheel)
  listen(document, 'scroll', scroll)
  listen(document, 'visibilitychange', () => {
    record('visibility_change', { visibility: document.visibilityState })
    if (document.hidden) leaving('tab-hidden')
  })
  listen(window, 'blur', () => leaving('window-blur'))
  listen(window, 'pagehide', () => leaving('pagehide'))
  const timer = setInterval(flush, 1000)

  listen(window, 'geoscratch:exercise-evaluation', (event) => record('exercise_evaluation', event.detail))
  listen(window, 'geoscratch:study-event', (event) => {
    const { type, details, context: suppliedContext } = event.detail
    const entry = record(type, details, suppliedContext ? { ...context, ...suppliedContext } : context)
    if (entry && ['workspace_snapshot', 'connection_warning'].includes(type)) flush()
  })

  return { record, flush, setContext, read: () => { if (sendEvent) return []; flush(); return [...readInteractionRecords(researchId, storage), ...pending] },
    stop() {
      leaving('tracker-stopped')
      if (context) record('screen_leave', { durationMs: Math.round(performance.now() - entered) })
      flush()
      clearInterval(timer)
      listeners.forEach((remove) => remove())
    },
  }
}
