import { useState } from 'react'
import LectureCubeDiagram from './LectureCubeDiagram'

const SLIDES = [
  ['translation-scaling-coordinate-axes.png', '1. Learn the translation and scaling matrices for the coordinate axes', '3D Affine Transformations: the homogeneous translation matrix has tx, ty and tz in the rightmost column; the scaling matrix has sx, sy and sz on the diagonal.'],
  ['rotation-coordinate-axes.png', '2. Learn the rotation matrices for the coordinate axes', 'Rotation around Coordinate Axes: homogeneous matrices for positive right-handed rotations around x, y and z.'],
  ['composition-transformations.png', '3. Combine transformations to rotate about the centre', 'Composition of Transformations: translate the centre to the origin, rotate, then translate back. Multiply the matrices with the first transformation on the right.'],
]

const TRANSLATE_POSITIVE = [[1, 0, 0, 1], [0, 1, 0, 1], [0, 0, 1, 1], [0, 0, 0, 1]]
const TRANSLATE_NEGATIVE = [[1, 0, 0, -1], [0, 1, 0, -1], [0, 0, 1, -1], [0, 0, 0, 1]]
const ROTATE_Y_90 = [[0, 0, 1, 0], [0, 1, 0, 0], [-1, 0, 0, 0], [0, 0, 0, 1]]

const ANSWER_CHOICES = [
  { id: 'A', label: 'Translate (1, 1, 1) × Rotate (Y, 90°) × Translate (−1, −1, −1)', matrices: [TRANSLATE_POSITIVE, ROTATE_Y_90, TRANSLATE_NEGATIVE] },
  { id: 'B', label: 'Translate (−1, −1, −1) × Rotate (Y, 90°) × Translate (1, 1, 1)', matrices: [TRANSLATE_NEGATIVE, ROTATE_Y_90, TRANSLATE_POSITIVE] },
  { id: 'C', label: 'None of the others' },
  { id: 'D', label: 'Rotate (Y, 90°) only', matrices: [ROTATE_Y_90] },
]

function MatrixProduct({ matrices }) {
  return <span className="user-study-li-matrix-product" aria-hidden="true">
    {matrices.map((matrix, index) => <span className="user-study-li-choice-matrix" key={index}>
      {matrix.flat().map((value, cellIndex) => <span key={cellIndex}>{String(value).replace('-', '−')}</span>)}
    </span>)}
  </span>
}

export default function LectureCubeRotation({ onSubmitAnswer, initialAnswer = '', onDraftChange, recordResponses = true }) {
  const [answer, setAnswer] = useState(ANSWER_CHOICES.some((choice) => choice.id === initialAnswer) ? initialAnswer : '')
  const [saved, setSaved] = useState(false)
  return <section className="user-study-li-lecture-cube" aria-labelledby="lecture-cube-title">
    <h1 id="lecture-cube-title">Exercise 1: Rotate a cube and its corner point</h1>
    <section className="user-study-li-lecture-slides user-study-li-rotation-slides" aria-label="Rotation and transformation lecture slides">
      {SLIDES.map(([file, caption, alt]) => <figure key={file}>
        <figcaption>{caption}</figcaption>
        <a href={`${import.meta.env.BASE_URL}userstudy-Li/${file}`} target="_blank" rel="noopener noreferrer" aria-label={`Open slide ${caption.charAt(0)} at full size in a new tab`}>
          <img src={`${import.meta.env.BASE_URL}userstudy-Li/${file}`} alt={alt} />
        </a>
      </figure>)}
    </section>
    <p className="user-study-li-slide-zoom-note">You can click a slide to view it at full size.</p>
    <section className="user-study-li-lecture-exercise" aria-label="Cube rotation question">
      <p>You have one object consisting of a cube and its corner point P. The cube has side length 2 and is centred at <strong>C = (1, 1, 1)</strong>. The corner point starts at <strong>P = (0, 2, 2)</strong>.</p>
      <p>How would you transform the cube and point P together into the target orientation shown below using as few transformation steps as possible? After all transformations are complete, the cube’s centre must be at <strong>C = (1, 1, 1)</strong>, and P must be at <strong>(2, 2, 2)</strong>.</p>
      <p><strong>Important: Rotation matrices in the above slides rotate about axes through the origin.</strong></p>
      <div className="user-study-li-cube-question-layout">
        <div className="user-study-li-cube-diagrams">
          <figure className="user-study-li-cube-example">
            <figcaption>Initial</figcaption>
            <LectureCubeDiagram />
          </figure>
          <span className="user-study-li-cube-direction" role="img" aria-label="Initial transforms into target">→</span>
          <figure className="user-study-li-cube-example">
            <figcaption>Target</figcaption>
            <LectureCubeDiagram target />
          </figure>
        </div>
        <form className="user-study-li-cube-response" onSubmit={async (event) => {
          event.preventDefault()
          const choice = ANSWER_CHOICES.find((choice) => choice.id === answer)
          if (!choice) return
          const success = await onSubmitAnswer({ exerciseId: 'cube-point-pivot-rotation', answer,
            answerLabel: choice.label, correct: answer === 'A', answerFormat: 'multiple-choice',
            submittedAt: new Date().toISOString() })
          setSaved(success !== false)
        }}>
          <fieldset className="user-study-li-lecture-answers" aria-describedby="lecture-cube-matrix-order">
            <legend>Which matrix product produces the target transformation? Select one option.</legend>
            <p id="lecture-cube-matrix-order">The transformations are applied <strong>from right to left</strong>.</p>
            {ANSWER_CHOICES.map(({ id, label, matrices }) => <label className="user-study-li-lecture-answer user-study-li-matrix-answer" key={id}>
              <input type="radio" name="lecture-cube-matrix-product" value={id} checked={answer === id} aria-label={`${id}. ${label}`}
                onChange={() => { setAnswer(id); onDraftChange?.(id); setSaved(false) }} />
              <span aria-hidden="true">{id}.</span>
              <span className="user-study-li-matrix-product-container">
                {matrices ? <MatrixProduct matrices={matrices} /> : <span>{label}</span>}
                <span className={`user-study-li-lecture-answer-result ${id === 'A' ? 'is-correct' : 'is-incorrect'}`}>
                  {saved && answer === id && <span role="status" aria-label={id === 'A' ? 'Correct answer' : 'Incorrect answer'}>
                    {id === 'A' ? '✓' : '✗'}
                  </span>}
                </span>
              </span>
            </label>)}
          </fieldset>
          <div className="user-study-li-cube-answer-submit">
            <button type="submit" className="user-study-li-primary-action" disabled={!answer.trim()}>Submit</button>
            <span role={saved ? 'status' : undefined}>{saved ? (recordResponses ? 'Answer saved.' : 'Answer checked. Recording is off.') : ''}</span>
          </div>
        </form>
      </div>
    </section>
  </section>
}
