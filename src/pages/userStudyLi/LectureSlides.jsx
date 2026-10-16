import { useEffect, useState } from 'react'
import LectureCubeRotation from './LectureCubeRotation'
import ExerciseCountdown from './ExerciseCountdown'

const ANSWER_CHOICES = [
  { id: 'dot-product', label: '8.5' },
  { id: 'none', label: 'None of the answers' },
  { id: 'on-plane', label: '0, because P is on the plane' },
  { id: 'distance', label: '8.5/√1.5 (approximately 6.94)' },
  { id: 'divide-squared-normal', label: '17 / 3' },
]

export default function LectureSlides({ onComplete, onSubmitAnswer, onExerciseChange, onExerciseFinish, trackingError, initialExercise = 1, drafts = {}, onDraftChange, onExerciseNumberChange, timerEnabled = false, timings = [], onExerciseTimeout, timeUpMessage, requireSubmission = false, submittedExerciseIds = [], allowPrevious = false, recordAnswers = true }) {
  const [exercise, setExercise] = useState(initialExercise)
  const [selectedAnswer, setSelectedAnswer] = useState(drafts['point-plane-distance'] ?? '')
  const [submittedAnswer, setSubmittedAnswer] = useState('')
  const [hintExerciseId, setHintExerciseId] = useState('')
  useEffect(() => { setExercise(initialExercise) }, [initialExercise])
  useEffect(() => {
    onExerciseChange?.(exercise === 1 ? 'cube-point-pivot-rotation' : 'point-plane-distance')
  }, [exercise, onExerciseChange])
  const exerciseId = exercise === 1 ? 'cube-point-pivot-rotation' : 'point-plane-distance'
  const submissionRequired = requireSubmission && !submittedExerciseIds.includes(exerciseId)
  const showSubmissionHint = submissionRequired && hintExerciseId === exerciseId
  const startedAt = timings.find((timing) => timing.exerciseId === exerciseId)?.startedAt
  const countdown = <div className="user-study-li-lecture-timer-bar">
    <ExerciseCountdown key={exerciseId} enabled={timerEnabled && Boolean(startedAt)} limitSeconds={600} startedAt={startedAt}
      onTimeout={() => {
        onExerciseTimeout?.(exerciseId)
        if (exercise === 1) { setExercise(2); onExerciseNumberChange?.(2) }
      }} />
  </div>

  if (exercise === 1) {
    return <div key="cube" className="user-study-li-form-page user-study-li-lecture-page user-study-li-lecture-cube-page">
      {timerEnabled && countdown}
      <main className="user-study-li-lecture-content">
        {timeUpMessage && <p className="user-study-li-time-up" role="alert">{timeUpMessage}</p>}
        {trackingError && <p role="alert">{trackingError}</p>}
        <LectureCubeRotation recordResponses={recordAnswers} onSubmitAnswer={onSubmitAnswer} initialAnswer={drafts['cube-point-pivot-rotation'] ?? ''}
          onDraftChange={(answer) => onDraftChange?.('cube-point-pivot-rotation', answer)} />
      </main>
      <footer className="user-study-li-lecture-footer">
        {showSubmissionHint && <span id="lecture-submit-required" role="status">Submit an answer to continue.</span>}
        <button type="button" className="user-study-li-primary-action" aria-disabled={submissionRequired} aria-describedby={showSubmissionHint ? 'lecture-submit-required' : undefined} onClick={() => {
          if (submissionRequired) { setHintExerciseId(exerciseId); return }
          const proceed = (saved) => { if (saved !== false) { setExercise(2); onExerciseNumberChange?.(2) } }
          const saved = onExerciseFinish?.('cube-point-pivot-rotation')
          if (saved?.then) void saved.then(proceed)
          else proceed(saved)
        }}>
          Next
        </button>
      </footer>
    </div>
  }

  return <div key="distance" className="user-study-li-form-page user-study-li-lecture-page">
    {timerEnabled && countdown}
    <main className="user-study-li-lecture-content">
      {timeUpMessage && <p className="user-study-li-time-up" role="alert">{timeUpMessage}</p>}
      {trackingError && <p role="alert">{trackingError}</p>}
      <h1 id="lecture-point-plane-title">Exercise 2: Calculate the shortest distance from a point to a plane</h1>
      <section className="user-study-li-lecture-slides" aria-label="Plane definition and distance lecture slides">
        <figure>
          <figcaption>1. Learn how to find the normal vector of a plane</figcaption>
          <img
            src={`${import.meta.env.BASE_URL}userstudy-Li/point-normal-plane.png`}
            alt="The Point-Normal Form of a Plane. A point S on the plane and a perpendicular normal n define the plane by n dot (p minus s) = 0, or n dot p = d where d = n dot s. In coordinates, ax + by + cz = d."
          />
        </figure>
        <figure>
          <figcaption>2. Use the formula to calculate the shortest distance from a point to the plane</figcaption>
          <img
            src={`${import.meta.env.BASE_URL}userstudy-Li/point-plane-distance.png`}
            alt="Distance of a Point to a Plane. The shortest line from Q to the plane is parallel to the normal n. For a unit normal, project the position vector q onto n and subtract the plane offset d. The signed distance is q dot n minus d."
          />
        </figure>
      </section>
      <section className="user-study-li-lecture-exercise" aria-labelledby="lecture-point-plane-title">
        <p>How far is point <strong>P = (−9, 8, 7)</strong> from the plane 0.5x + y + 0.5z = −1.5?</p>
        <p>Note that d = −1.5. After normalization, d̂ = d / ‖n‖ is the signed distance from the origin to the plane along the unit normal.</p>
        <p className="user-study-li-lecture-slide-note">
          <strong>Hint:</strong> The formulas in the slides assume a unit normal vector
          (‖n‖ = 1). In this exercise, n = (0.5, 1, 0.5) has length √1.5, so first
          normalize it: n̂ = n / ‖n‖. Divide both sides of the plane equation by √1.5
          to obtain n̂ ⋅ p = d̂, where d̂ = −1.5 / √1.5. Then use the slide’s formula
          to calculate the distance for the given point: P ⋅ n̂ − d̂.
        </p>
        <form
          className="user-study-li-lecture-answer-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (selectedAnswer) {
              onSubmitAnswer({
                exerciseId: 'point-plane-distance',
                answer: selectedAnswer,
                answerLabel: ANSWER_CHOICES.find((choice) => choice.id === selectedAnswer).label,
                correct: selectedAnswer === 'distance',
                submittedAt: new Date().toISOString(),
              })
              setSubmittedAnswer(selectedAnswer)
            }
          }}
        >
          <fieldset className="user-study-li-lecture-answers">
            <legend>Select one:</legend>
            {ANSWER_CHOICES.map(({ id, label }, index) => (
              <label className="user-study-li-lecture-answer" key={id}>
                <input
                  type="radio"
                  name="lecture-point-plane-distance"
                  value={id}
                  checked={selectedAnswer === id}
                  onChange={() => {
                    setSelectedAnswer(id)
                    onDraftChange?.('point-plane-distance', id)
                    setSubmittedAnswer('')
                  }}
                />
                <span>{String.fromCharCode(97 + index)}. {label}</span>
                <span className={`user-study-li-lecture-answer-result ${id === 'distance' ? 'is-correct' : 'is-incorrect'}`}>
                  {submittedAnswer === id && (
                    <span role="status" aria-label={id === 'distance' ? 'Correct answer' : 'Incorrect answer'}>
                      {id === 'distance' ? '✓' : '✗'}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </fieldset>
          <div className="user-study-li-cube-answer-submit">
            <button type="submit" className="user-study-li-primary-action" disabled={!selectedAnswer}>
              Submit
            </button>
            <span role={submittedAnswer ? 'status' : undefined}>
              {submittedAnswer ? (submittedAnswer === 'distance' ? 'Correct' : 'Incorrect') : ''}
            </span>
          </div>
        </form>
      </section>
    </main>
    <footer className="user-study-li-lecture-footer">
      {allowPrevious && <button type="button" className="user-study-li-secondary-action" onClick={() => { setExercise(1); onExerciseNumberChange?.(1) }}>Previous</button>}
      {showSubmissionHint && <span id="lecture-submit-required" role="status">Submit an answer to continue.</span>}
      <button type="button" className="user-study-li-primary-action" aria-disabled={submissionRequired} aria-describedby={showSubmissionHint ? 'lecture-submit-required' : undefined} onClick={() => {
        if (submissionRequired) { setHintExerciseId(exerciseId); return }
        const saved = onExerciseFinish?.('point-plane-distance')
        if (saved?.then) void saved.then((success) => { if (success !== false) onComplete() })
        else if (saved !== false) onComplete()
      }}>
        Continue to questionnaire
      </button>
    </footer>
  </div>
}
