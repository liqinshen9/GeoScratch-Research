import { useState } from 'react'
import useThemeSync from '@/hooks/useThemeSync'
import ExercisePage from '@/pages/ExercisePage'
import { generateResearchId } from '@/study/session/researchId'
import DemographicsQuestionnaire from './userStudyLi/DemographicsQuestionnaire'
import ConditionQuestionnaire from './userStudyLi/ConditionQuestionnaire'
import PostStudyQuestionnaire from './userStudyLi/PostStudyQuestionnaire'
import TutorialWelcome from './userStudyLi/TutorialWelcome'
import SessionTutorial from './userStudyLi/SessionTutorial'
import './UserStudyLiPage.css'

const STUDY_EXERCISES = [
  { id: 'create-complex-object' },
  { id: 'cube-point-pivot-rotation' },
  { id: 'point-plane-distance', title: 'Calculate the shortest distance from a point to a plane' },
]
const CURRENT_RESEARCH_ID_KEY = 'userstudyLi.currentResearchId'

const POINT_STYLES = {
  attached_corner_point: { color: '#3b82f6', label: 'P', anchor: 'p' },
  pivot_center_point: { color: '#6b7280', label: 'C', anchor: 'c' },
}
const CLICK_LABEL_ANCHORS = {
  attached_corner_point: 'p',
  pivot_center_point: 'c',
  exercise_point_p: 'p',
  selectable_point_marker: 'q',
}
const LABEL_COLORS = Object.fromEntries(
  Object.values(POINT_STYLES).map(({ label, color }) => [label, color]),
)
const HIDDEN_BLOCK_TYPES = ['geo_object_with_point']

const SETTINGS = Object.freeze({
  showAxisToggleButton: false,
  cubeShowEdges: false,
  objectHighlightEnabled: false,
  objectsReceiveShadows: false,
  primitivesCastShadows: false,
  pointShadowsEnabled: false,
  cameraShadowsEnabled: false,
  haloEnabled: false,
  haloLineVectorEnabled: false,
  labelDetail: 'nameAndValue',
})

function safeFileSegment(value) {
  return value.trim().replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '') || 'anonymous'
}

function downloadJson(payload, type = 'demographics') {
  const fileName = `userstudy-Li-${type}-${safeFileSegment(
    payload.researchId || '',
  )}-${payload.submittedAt.replace(/[:.]/g, '-')}.json`
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

function saveQuestionnairePayload(payload, type, backupKey) {
  const storedResponses = JSON.parse(window.localStorage.getItem(backupKey) || '[]')
  storedResponses.push(payload)
  window.localStorage.setItem(backupKey, JSON.stringify(storedResponses))
  downloadJson(payload, type)
}

function styleStudyPoints(objects) {
  objects.forEach((object) =>
    object?.traverse((child) => {
      const style = POINT_STYLES[child.userData?.geoType]
      const clickAnchor = CLICK_LABEL_ANCHORS[child.userData?.geoType]
      if (clickAnchor) child.userData.clickLabelAnchor = clickAnchor
      if (child.userData?.geoType === 'selectable_point_marker') {
        let owner = child
        while (owner && !owner.userData?.labels?.some((label) => label.anchor === 'q')) {
          owner = owner.parent
        }
        owner?.userData?.labels?.forEach((label) => {
          if (label.anchor === 'q') label.className = 'label--study-coordinate'
        })
      }
      if (child.userData?.geoType === 'exercise_point_p') {
        child.userData?.labels?.forEach((label) => {
          if (label.anchor !== 'p') return
          label.name = 'P'
          label.className = 'label--study-coordinate'
        })
      }
      if (style) {
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        materials.forEach((material) => material?.color?.set(style.color))
      }
      child.userData?.labels?.forEach((label) => {
        if (label.role === 'distance') label.className = 'label--study-coordinate'
        if (LABEL_COLORS[label.name]) label.color = LABEL_COLORS[label.name]
      })
    }),
  )
  return objects
}

export default function UserStudyLiPage() {
  useThemeSync()
  const [exerciseIndex, setExerciseIndex] = useState(0)
  const [sessionStarted, setSessionStarted] = useState(false)
  const [studyStarted, setStudyStarted] = useState(false)
  const [conditionStarted, setConditionStarted] = useState(false)
  const [conditionCompleted, setConditionCompleted] = useState(false)
  const [postCompleted, setPostCompleted] = useState(false)
  const [researchId, setResearchId] = useState('')
  const [tutorialPhase, setTutorialPhase] = useState('welcome')
  const exercise = STUDY_EXERCISES[exerciseIndex]
  const exerciseId = exercise.id

  function startNewSession() {
    const nextResearchId = generateResearchId()
    setResearchId(nextResearchId)
    setExerciseIndex(0)
    setTutorialPhase('welcome')
    setStudyStarted(false)
    setConditionStarted(false)
    setConditionCompleted(false)
    setPostCompleted(false)
    setSessionStarted(true)
    window.localStorage.setItem(CURRENT_RESEARCH_ID_KEY, nextResearchId)
  }

  if (!sessionStarted) {
    return (
      <div className="user-study-li-form-page user-study-li-session-page">
        <section className="user-study-li-session-card" aria-labelledby="new-session-title">
          <p className="user-study-li-kicker">UserStudyLi</p>
          <h1 id="new-session-title">New study session</h1>
          <p>
            For the researcher. A research ID is generated when the session starts and is used to
            link the questionnaire, later questionnaires, and study log data.
          </p>
          <button className="user-study-li-primary-action" type="button" onClick={startNewSession}>
            Start new session
          </button>
        </section>
      </div>
    )
  }

  if (!studyStarted) {
    return (
      <DemographicsQuestionnaire
        researchId={researchId}
        onComplete={() => setStudyStarted(true)}
        onSave={saveQuestionnairePayload}
      />
    )
  }

  if (conditionStarted && !conditionCompleted) {
    return (
      <ConditionQuestionnaire
        researchId={researchId}
        onComplete={() => setConditionCompleted(true)}
        onSave={saveQuestionnairePayload}
      />
    )
  }

  if (conditionCompleted && !postCompleted) {
    return (
      <PostStudyQuestionnaire
        researchId={researchId}
        onComplete={() => setPostCompleted(true)}
        onSave={saveQuestionnairePayload}
      />
    )
  }

  if (postCompleted) {
    return (
      <div className="user-study-li-form-page user-study-li-session-page">
        <section className="user-study-li-session-card" aria-labelledby="session-complete-title">
          <p className="user-study-li-kicker">UserStudyLi</p>
          <h1 id="session-complete-title">Study session complete</h1>
          <p>Research ID: {researchId}</p>
          <button className="user-study-li-primary-action" type="button" onClick={startNewSession}>
            Start new session
          </button>
        </section>
      </div>
    )
  }

  if (tutorialPhase === 'active') {
    return <SessionTutorial researchId={researchId} onDone={() => setTutorialPhase('done')} />
  }

  return (
    <div className="app-container flex h-dvh flex-col overflow-hidden">
      {tutorialPhase === 'welcome' && exerciseIndex === 0 && <TutorialWelcome
        onFollow={() => setTutorialPhase('active')} onSkip={() => setTutorialPhase('done')} />}
      <main className="flex min-h-0 flex-1 flex-col">
        <ExercisePage
          key={exerciseId}
          exerciseId={exerciseId}
          exerciseTitle={exercise.title}
          standalone
          workspaceId={`userstudy-Li-${researchId || 'no-session'}-${exerciseId}`}
          settingsOverrides={SETTINGS}
          showAnswerHighlight={false}
          hideAnimationTransport
          hiddenBlockTypes={HIDDEN_BLOCK_TYPES}
          showDebugSolution={false}
          wideTaskPanel
          onPreviousExercise={
            exerciseIndex > 0 ? () => setExerciseIndex((index) => index - 1) : undefined
          }
          onNextExercise={
            exerciseIndex < STUDY_EXERCISES.length - 1
              ? () => setExerciseIndex((index) => index + 1)
              : () => setConditionStarted(true)
          }
          transformObjects={styleStudyPoints}
          toggleLabelsOnLeftClick
        />
      </main>
    </div>
  )
}
