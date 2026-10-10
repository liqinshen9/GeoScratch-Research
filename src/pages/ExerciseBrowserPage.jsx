import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Components, CheckOne } from '@icon-park/react'
import { EXERCISES } from '@/data/exercises'
import { getSolvedExerciseIds } from '@/utils/exerciseProgress'
import './ExerciseBrowserPage.css'

export default function ExerciseBrowserPage() {
  const [solved, setSolved] = useState(getSolvedExerciseIds)
  useEffect(() => {
    const refresh = () => setSolved(getSolvedExerciseIds())
    window.addEventListener('storage', refresh)
    return () => window.removeEventListener('storage', refresh)
  }, [])

  return (
    <div className="unit-page">
      <main className="unit-page__main">
        <h1 className="unit-page__title">Exercises</h1>
        <section className="unit-page__card unit-page__section">
          <ol className="unit-page__links">
            {EXERCISES.map((exercise) => (
              <li key={exercise.id}>
                <Link to={`/exercise/${exercise.id}`} className="unit-page__link">
                  {solved.has(exercise.id) ? (
                    <CheckOne
                      className="unit-page__link-icon unit-page__link-icon--solved"
                      theme="filled"
                      size="15"
                      aria-label="solved"
                    />
                  ) : (
                    <Components className="unit-page__link-icon" theme="outline" size="15" />
                  )}
                  <span className="unit-page__link-title">{exercise.title}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
        <p className="unit-page__footnote">3 exercises</p>
      </main>
    </div>
  )
}
