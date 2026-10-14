import { useState } from 'react'
import LectureCubeDiagram from './LectureCubeDiagram'

const SLIDES = [
  ['rotation-coordinate-axes.png', '1. Learn the rotation matrices for the coordinate axes', 'Rotation around Coordinate Axes: homogeneous matrices for positive right-handed rotations around x, y and z.'],
  ['order-transformations.png', '2. Learn why the order of transformations matters', 'The Order of Transformations Matters: scaling then rotating gives a different matrix from rotating then scaling.'],
  ['composition-transformations.png', '3. Combine transformations to rotate about the centre', 'Composition of Transformations: translate the centre to the origin, rotate, then translate back. Multiply the matrices with the first transformation on the right.'],
]

export default function LectureCubeRotation({ onSubmitAnswer, initialAnswer = '', onDraftChange }) {
  const [answer, setAnswer] = useState(initialAnswer)
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
      <p>How would you transform the cube and P together into the target orientation shown below using as few transformation steps as possible? Include only the transformations needed to reach the target. After all transformations are complete, the cube’s centre must be at <strong>C = (1, 1, 1)</strong>, and P must be at <strong>(2, 2, 2)</strong>. The rotation step is a positive 90° rotation about the Y axis.</p>
      <p><strong>Important: Rotation matrices in the above slides rotate about axes through the origin.</strong></p>
      <div className="user-study-li-cube-question-layout">
        <div className="user-study-li-cube-diagrams">
          <figure className="user-study-li-cube-example">
            <figcaption>Initial</figcaption>
            <LectureCubeDiagram />
          </figure>
          <figure className="user-study-li-cube-example">
            <figcaption>Target</figcaption>
            <LectureCubeDiagram target />
          </figure>
        </div>
        <form className="user-study-li-cube-response" onSubmit={(event) => {
          event.preventDefault()
          if (!answer.trim()) return
          onSubmitAnswer({ exerciseId: 'cube-point-pivot-rotation', answer, submittedAt: new Date().toISOString() })
          setSaved(true)
        }}>
          <label className="user-study-li-field">
            <span>Write the required transformation matrices from left to right in the matrix product. Clearly identify each matrix: for rotation, specify the axis and angle in degrees; for translation, specify the amounts along x, y, and z; for scaling, specify the scale factors along x, y, and z. Use only the transformations needed; you do not have to use all three types.</span>
            <small><strong>Important: When transformations are composed as a matrix product, they are applied from right to left, as explained in the slides above.</strong></small>
            <textarea rows={4} placeholder="Write the matrices and their parameters from left to right." value={answer}
              onChange={(event) => { setAnswer(event.target.value); onDraftChange?.(event.target.value); setSaved(false) }} />
          </label>
          <div className="user-study-li-cube-answer-submit">
            <button type="submit" className="user-study-li-primary-action" disabled={!answer.trim()}>Submit</button>
            <span role={saved ? 'status' : undefined}>{saved ? 'Answer saved.' : ''}</span>
          </div>
        </form>
      </div>
    </section>
  </section>
}
