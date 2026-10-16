// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import LectureCubeRotation from './LectureCubeRotation'

let root, host
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div'); document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount()); host.remove()
  delete globalThis.IS_REACT_ACT_ENVIRONMENT
})

it.each(['A', 'B', 'C', 'D'])('saves option %s with its label and correctness', async (answer) => {
  const onSubmitAnswer = vi.fn(async () => true)
  const onDraftChange = vi.fn()
  act(() => root.render(<LectureCubeRotation onSubmitAnswer={onSubmitAnswer} onDraftChange={onDraftChange} />))
  expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(4)
  expect(host.querySelector('textarea')).toBeNull()
  expect(host.querySelector('button').disabled).toBe(true)
  const option = host.querySelector(`input[value="${answer}"]`)
  const answerLabel = option.getAttribute('aria-label').slice(3)
  act(() => option.click())
  expect(onDraftChange).toHaveBeenCalledWith(answer)
  expect(host.querySelector('.user-study-li-lecture-answer-result [role="status"]')).toBeNull()
  await act(async () => host.querySelector('button').click())
  expect(onSubmitAnswer).toHaveBeenCalledWith(expect.objectContaining({
    exerciseId: 'cube-point-pivot-rotation', answer, answerLabel,
    correct: answer === 'A', answerFormat: 'multiple-choice', submittedAt: expect.any(String),
  }))
  expect(host.querySelector('.user-study-li-cube-answer-submit [role="status"]').textContent).toBe(answer === 'A' ? 'Correct' : 'Incorrect')
  const feedback = option.closest('label').querySelector('.user-study-li-lecture-answer-result [role="status"]')
  expect(feedback.textContent).toBe(answer === 'A' ? '✓' : '✗')
  expect(feedback.getAttribute('aria-label')).toBe(answer === 'A' ? 'Correct answer' : 'Incorrect answer')
  act(() => host.querySelector(`input[value="${answer === 'A' ? 'B' : 'A'}"]`).click())
  expect(host.querySelector('.user-study-li-cube-answer-submit [role="status"]')).toBeNull()
  expect(host.querySelector('.user-study-li-lecture-answer-result [role="status"]')).toBeNull()
})

it('shows numeric 4×4 matrix products in A and B, and the Y 90° matrix alone in D', () => {
  act(() => root.render(<LectureCubeRotation />))
  const matrices = (option) => [...host.querySelector(`input[value="${option}"]`).closest('label').querySelectorAll('.user-study-li-choice-matrix')]
    .map((matrix) => {
      const cells = [...matrix.children].map((entry) => Number(entry.textContent.replace('−', '-')))
      return [0, 4, 8, 12].map((start) => cells.slice(start, start + 4))
    })
  const positive = [[1, 0, 0, 1], [0, 1, 0, 1], [0, 0, 1, 1], [0, 0, 0, 1]]
  const negative = [[1, 0, 0, -1], [0, 1, 0, -1], [0, 0, 1, -1], [0, 0, 0, 1]]
  const rotation = [[0, 0, 1, 0], [0, 1, 0, 0], [-1, 0, 0, 0], [0, 0, 0, 1]]
  expect(matrices('A')).toEqual([positive, rotation, negative])
  expect(matrices('B')).toEqual([negative, rotation, positive])
  expect(matrices('C')).toEqual([])
  expect(matrices('D')).toEqual([rotation])
})

it('restores a selected option but does not treat an older written draft as a valid choice', () => {
  act(() => root.render(<LectureCubeRotation key="choice" initialAnswer="B" />))
  expect(host.querySelector('input[value="B"]').checked).toBe(true)
  act(() => root.render(<LectureCubeRotation key="old" initialAnswer="Translate then rotate" />))
  expect(host.querySelector('input:checked')).toBeNull()
  expect(host.querySelector('button').disabled).toBe(true)
})

it('shows correctness only after the submitted answer is accepted', async () => {
  let finishSave
  const onSubmitAnswer = vi.fn(() => new Promise((resolve) => { finishSave = resolve }))
  act(() => root.render(<LectureCubeRotation initialAnswer="A" onSubmitAnswer={onSubmitAnswer} />))
  await act(async () => host.querySelector('button').click())
  expect(host.querySelector('.user-study-li-cube-answer-submit [role="status"]')).toBeNull()
  await act(async () => finishSave(false))
  expect(host.querySelector('.user-study-li-cube-answer-submit [role="status"]')).toBeNull()
  await act(async () => host.querySelector('button').click())
  await act(async () => finishSave(true))
  expect(host.querySelector('.user-study-li-cube-answer-submit [role="status"]').textContent).toBe('Correct')
})
