import { useNavigate, useParams } from 'react-router-dom'
import ExercisePage from './ExercisePage'
import { getExercise, getAdjacentExercises, orderedExercises } from '@/data/exercises'
import { SETTINGS, HIDDEN_BLOCK_TYPES, styleStudyPoints } from '@/exercises/liPresentation'
import './UserStudyLiPage.css'

export default function GeoScratchExercisePage() {
  const { exerciseId } = useParams()
  const navigate = useNavigate()
  const exercise = getExercise(exerciseId) ?? orderedExercises()[0]
  const { previous, next } = getAdjacentExercises(exercise.id)
  // Reuse LI's geometry mode with a separate autosave key.
  const workspaceId = `userstudy-Li-geoscratch-${exercise.id}`

  return (
    <ExercisePage
      key={exercise.id}
      exerciseId={exercise.id}
      exerciseTitle={exercise.title}
      standalone
      workspaceId={workspaceId}
      settingsOverrides={SETTINGS}
      showAnswerHighlight={false}
      hideAnimationTransport
      hiddenBlockTypes={HIDDEN_BLOCK_TYPES}
      showDebugSolution={false}
      wideTaskPanel
      onPreviousExercise={previous ? () => navigate(`/exercise/${previous.id}`) : undefined}
      onNextExercise={next ? () => navigate(`/exercise/${next.id}`) : undefined}
      transformObjects={styleStudyPoints}
      toggleLabelsOnLeftClick
    />
  )
}
