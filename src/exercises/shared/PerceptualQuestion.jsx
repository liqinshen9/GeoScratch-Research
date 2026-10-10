import { useEffect, useState } from 'react'

/**
 * The radio group for a "look and answer" exercise (08/09). The exercise module
 * supplies an `mcq` descriptor ({ prompt, choices, correctId }); ExercisePage
 * renders this and uses the picked choice for pass/fail feedback.
 *
 * @param {{ prompt: string, choices: {id: string, label: string}[], correctId: string }} mcq
 * @param {(picked: string | null) => void} [onPickedChange]  drives ExercisePage's `passed`
 */
export default function PerceptualQuestion({ mcq, onPickedChange }) {
  const [picked, setPicked] = useState(null)

  // Reset when the question changes (ExercisePage keys the page by exercise, so
  // this mainly guards a descriptor swap in the same mount).
  useEffect(() => {
    setPicked(null)
  }, [mcq])

  useEffect(() => {
    onPickedChange?.(picked)
  }, [picked, onPickedChange])

  const choose = (id) => {
    setPicked(id)
  }

  return (
    <div aria-label="Question" style={{ display: 'grid', gap: '0.75rem' }}>
      <p style={{ fontSize: '0.95rem', lineHeight: 1.4 }}>{mcq.prompt}</p>
      <div style={{ display: 'grid', gap: '0.4rem' }}>
        {mcq.choices.map((choice) => (
          <label
            key={choice.id}
            style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.95rem' }}
          >
            <input
              type="radio"
              name={`mcq-${mcq.correctId}-${mcq.choices.length}`}
              checked={picked === choice.id}
              onChange={() => choose(choice.id)}
            />
            {choice.label}
          </label>
        ))}
      </div>
      {picked && (
        <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>
          {picked === mcq.correctId ? 'Correct.' : 'Not quite — try looking again.'}
        </p>
      )}
    </div>
  )
}
