// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInteractionTracker, describeTarget, readInteractionRecords } from './interactionTracking'

let tracker
function pointer(type, target, x, y) {
  const event = new Event(type, { bubbles: true })
  Object.assign(event, { pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y, button: 0 })
  target.dispatchEvent(event)
}
beforeEach(() => {
  vi.useFakeTimers()
  window.localStorage.clear()
  document.body.innerHTML = '<div class="user-study-li-lecture-footer"><button id="next"><span>Next</span></button></div><div id="scroll-panel" class="blocks-col--workspace"><textarea id="answer">private draft</textarea></div>'
  tracker = createInteractionTracker({ researchId: 'participant-1' })
  tracker.setContext({ phase: 'geoscratch', conditionId: 'geoscratch', exerciseId: 'tutorial' })
})
afterEach(() => { tracker.stop(); vi.useRealTimers(); document.body.innerHTML = ''; window.localStorage.clear() })

describe('study interaction tracking', () => {
  it.each(['create-complex-object', 'cube-point-pivot-rotation', 'point-plane-distance'])('does not record any activity for %s', (exerciseId) => {
    tracker.setContext({ phase: 'geoscratch', conditionId: 'geoscratch', exerciseId })
    const before = tracker.read()
    document.querySelector('#next').click()
    pointer('pointerdown', document.querySelector('#next'), 0, 0)
    pointer('pointermove', document.querySelector('#next'), 30, 0)
    pointer('pointerup', document.querySelector('#next'), 30, 0)
    document.querySelector('#next').dispatchEvent(new WheelEvent('wheel', { bubbles: true }))
    tracker.record('custom_block_saved', { xmlText: 'large workspace' })
    tracker.record('workspace_snapshot', { snapshot: { large: true } })
    tracker.record('exercise_evaluation', { passed: true })
    tracker.record('exercise_timeout')
    vi.advanceTimersByTime(1500)
    expect(tracker.read()).toEqual(before)
    expect(tracker.read().some((entry) => entry.exerciseId === exerciseId)).toBe(false)
  })
  it('identifies the actual button when its child is clicked, without reading input values', () => {
    document.querySelector('#next span').dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 20, clientY: 30, detail: 1 }))
    const click = tracker.read().find((entry) => entry.type === 'click')
    expect(click).toMatchObject({ researchId: 'participant-1', exerciseId: 'tutorial',
      source: 'mouse', position: { x: 20, y: 30 }, target: { area: 'exercise-navigation', tag: 'button', elementId: 'next', label: 'Next' } })
    const input = describeTarget(document.querySelector('textarea'))
    expect(JSON.stringify(input)).not.toContain('private draft')
    expect(input).toMatchObject({ area: 'block-workspace', tag: 'textarea' })
  })

  it('ignores unpressed movement and tiny jitter, but records drags and cancellation', () => {
    const source = document.querySelector('#next')
    const destination = document.querySelector('#scroll-panel')
    pointer('pointermove', source, 100, 100)
    pointer('pointerdown', source, 10, 10)
    pointer('pointermove', source, 12, 12)
    pointer('pointerup', source, 12, 12)
    expect(tracker.read().filter((entry) => entry.type.startsWith('drag'))).toHaveLength(0)
    pointer('pointerdown', source, 10, 10)
    pointer('pointermove', destination, 30, 10)
    vi.advanceTimersByTime(100)
    pointer('pointerup', destination, 40, 10)
    expect(tracker.read().find((entry) => entry.type === 'drag_end')).toMatchObject({
      start: { x: 10, y: 10 }, end: { x: 40, y: 10 }, durationMs: 100, distancePx: 30, cancelled: false,
      target: { elementId: 'next' }, endTarget: { elementId: 'scroll-panel' },
    })
    pointer('pointerdown', source, 0, 0)
    pointer('pointermove', source, 10, 0)
    window.dispatchEvent(new Event('blur'))
    expect(tracker.read().filter((entry) => entry.type === 'drag_end')[1].cancelled).toBe(true)
  })

  it('records wheel input separately from actual scrolling and saves the final offset', () => {
    const panel = document.querySelector('#scroll-panel')
    panel.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 120, deltaMode: 0 }))
    panel.scrollTop = 50
    panel.dispatchEvent(new Event('scroll'))
    panel.scrollTop = 100
    panel.dispatchEvent(new Event('scroll'))
    vi.advanceTimersByTime(200)
    expect(tracker.read().find((entry) => entry.type === 'wheel')).toMatchObject({ deltaY: 120, target: { area: 'block-workspace' } })
    expect(tracker.read().find((entry) => entry.type === 'scroll')).toMatchObject({ position: { top: 100, left: 0 }, eventCount: 2 })
  })

  it('records elapsed screen time, submissions, and changed exercise evaluation', () => {
    vi.advanceTimersByTime(1500)
    tracker.record('answer_submit', { submission: { answer: 'my first answer' } })
    tracker.setContext({ phase: 'geoscratch', conditionId: 'geoscratch', exerciseId: 'tutorial', tutorialStep: 'labels' })
    window.dispatchEvent(new CustomEvent('geoscratch:exercise-evaluation', { detail: { passed: true, correct: true } }))
    expect(tracker.read().find((entry) => entry.type === 'screen_leave').durationMs).toBe(1500)
    expect(tracker.read().find((entry) => entry.type === 'answer_submit')).toMatchObject({ exerciseId: 'tutorial', submission: { answer: 'my first answer' } })
    expect(tracker.read().find((entry) => entry.type === 'exercise_evaluation').passed).toBe(true)
    expect(readInteractionRecords('another-participant')).toEqual([])
  })

  it('resolves Blockly block identity without recording the whole workspace', () => {
    const blockRoot = document.createElement('div')
    blockRoot.className = 'blocklyDraggable'
    document.querySelector('#scroll-panel').append(blockRoot)
    const workspace = { getAllBlocks: () => [{ id: 'block-123', type: 'rot_matrix', getSvgRoot: () => blockRoot }] }
    expect(describeTarget(blockRoot, () => workspace)).toMatchObject({ blockId: 'block-123', blockType: 'rot_matrix', area: 'block-workspace' })
  })

  it('keeps unsaved records available for export when local storage fails and removes listeners on stop', () => {
    tracker.stop()
    const onError = vi.fn()
    const failingStorage = { length: 0, setItem: () => { throw new Error('quota') } }
    tracker = createInteractionTracker({ researchId: 'participant-2', storage: failingStorage, onError })
    tracker.setContext({ phase: 'geoscratch', conditionId: 'geoscratch' })
    expect(tracker.read().some((entry) => entry.type === 'screen_enter')).toBe(true)
    expect(onError).toHaveBeenCalled()
    tracker.stop()
    const count = tracker.read().length
    document.querySelector('#next').click()
    expect(tracker.read()).toHaveLength(count)
  })

  it('reports one warning per storage failure and clears it after pending records are saved successfully', () => {
    tracker.stop()
    let fail = true
    const onError = vi.fn(), onRecovered = vi.fn()
    const storage = {
      get length() { return window.localStorage.length },
      key: (index) => window.localStorage.key(index),
      getItem: (key) => window.localStorage.getItem(key),
      setItem: (key, value) => {
        if (fail) throw new Error('quota')
        window.localStorage.setItem(key, value)
      },
    }
    tracker = createInteractionTracker({ researchId: 'recovering-session', storage, onError, onRecovered })
    tracker.setContext({ phase: 'geoscratch', conditionId: 'geoscratch' })
    tracker.record('click', { target: { label: 'My Blocks' } })
    tracker.flush()
    tracker.flush()
    expect(onError).toHaveBeenCalledOnce()
    expect(onRecovered).not.toHaveBeenCalled()
    fail = false
    tracker.flush()
    expect(onRecovered).toHaveBeenCalledOnce()
    const entries = tracker.read()
    expect(entries.filter((entry) => entry.type === 'click')).toHaveLength(1)
    tracker.flush()
    expect(onRecovered).toHaveBeenCalledOnce()
    fail = true
    tracker.record('click')
    tracker.flush()
    expect(onError).toHaveBeenCalledTimes(2)
  })

  it('records lecture submissions only and resumes activity tracking in GeoScratch', () => {
    tracker.setContext({ phase: 'lecture', conditionId: 'lecture', exerciseId: 'tutorial' })
    const target = document.querySelector('#next')
    target.click()
    pointer('pointerdown', target, 0, 0)
    pointer('pointermove', target, 20, 0)
    pointer('pointerup', target, 20, 0)
    target.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 120 }))
    target.dispatchEvent(new Event('scroll'))
    document.dispatchEvent(new Event('visibilitychange'))
    tracker.record('answer_submit', { submission: { answer: 'first answer' } })
    tracker.record('answer_submit', { submission: { answer: 'revised answer' } })
    vi.advanceTimersByTime(1000)
    const lecture = tracker.read().filter((entry) => entry.conditionId === 'lecture')
    expect(lecture.map((entry) => entry.type)).toEqual(['answer_submit', 'answer_submit'])
    expect(lecture[0]).not.toHaveProperty('viewport')
    tracker.setContext({ phase: 'geoscratch', conditionId: 'geoscratch', exerciseId: 'tutorial' })
    target.click()
    expect(tracker.read().find((entry) => entry.type === 'click')).toMatchObject({ conditionId: 'geoscratch' })
    tracker.setContext({ phase: 'geoscratch-questionnaire', conditionId: 'geoscratch' })
    const before = tracker.read().length
    target.click()
    expect(tracker.read()).toHaveLength(before)
  })
})
