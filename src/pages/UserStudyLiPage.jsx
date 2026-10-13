import { useCallback, useEffect, useRef, useState } from 'react'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import useSettingsStore from '@/store/useSettingsStore'
import useThemeSync from '@/hooks/useThemeSync'
import ExercisePage from '@/pages/ExercisePage'
import { generateResearchId } from '@/study/session/researchId'
import useStudyInteractionTracking from '@/study/session/useStudyInteractionTracking'
import { markQuestionnaireSubmitted, readSessionQuestionnaires } from '@/study/session/questionnaireDrafts'
import { buildSessionFiles, downloadSessionZip } from '@/study/session/sessionExport'
import useLectureExerciseTiming from '@/study/session/useLectureExerciseTiming'
import DemographicsQuestionnaire from './userStudyLi/DemographicsQuestionnaire'
import ConditionQuestionnaire from './userStudyLi/ConditionQuestionnaire'
import PostStudyQuestionnaire from './userStudyLi/PostStudyQuestionnaire'
import TutorialWelcome from './userStudyLi/TutorialWelcome'
import SessionTutorial from './userStudyLi/SessionTutorial'
import StudyOrderSelection from './userStudyLi/StudyOrderSelection'
import LectureSlides from './userStudyLi/LectureSlides'
import { nextStudyPhase, conditionDetails } from './userStudyLi/studyFlow'
import './UserStudyLiPage.css'

const STUDY_EXERCISES = [
  { id: 'create-complex-object', heading: 'Trial Exercise' },
  { id: 'cube-point-pivot-rotation' },
  { id: 'point-plane-distance', title: 'Calculate the shortest distance from a point to a plane' },
]
const CURRENT_RESEARCH_ID_KEY = 'userstudyLi.currentResearchId'
const LECTURE_RESPONSES_KEY = 'userstudyLi.lectureExerciseResponses'

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

function saveQuestionnairePayload(payload, type, backupKey) {
  try {
    const storedResponses = JSON.parse(window.localStorage.getItem(backupKey) || '[]')
    storedResponses.push({ ...payload, responseType: type })
    window.localStorage.setItem(backupKey, JSON.stringify(storedResponses))
    return true
  } catch { return false }
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
  const userStudyMode = useSettingsStore((state) => state.settings.userStudyMode)
  const [exerciseIndex, setExerciseIndex] = useState(0)
  const [phase, setPhase] = useState('new')
  const [studyOrder, setStudyOrder] = useState(null)
  const [researchId, setResearchId] = useState('')
  const [tutorialPhase, setTutorialPhase] = useState('welcome')
  const [lectureResponses, setLectureResponses] = useState([])
  const [lectureExerciseId, setLectureExerciseId] = useState('cube-point-pivot-rotation')
  const { start: startLectureTiming, finish: finishLectureTiming, elapsed: lectureElapsed, read: readLectureTimings } = useLectureExerciseTiming(researchId)
  const startLectureExercise = useCallback((exerciseId) => {
    startLectureTiming(exerciseId)
    setLectureExerciseId(exerciseId)
  }, [startLectureTiming])
  const [exportError, setExportError] = useState('')
  const automaticallyExportedSession = useRef(null)
  const exercise = STUDY_EXERCISES[exerciseIndex]
  const exerciseId = exercise.id
  const interactionTracking = useStudyInteractionTracking(researchId, {
    phase, studyOrder,
    conditionId: phase.startsWith('lecture') ? 'lecture' : phase.startsWith('geoscratch') ? 'geoscratch' : null,
    exerciseId: phase === 'lecture' ? lectureExerciseId : phase === 'geoscratch'
      ? tutorialPhase === 'done' ? exerciseId : 'tutorial' : null,
  })

  function sessionPayload() {
    return {
      researchId, studyOrder, submittedAt: new Date().toISOString(),
      questionnaires: readSessionQuestionnaires(researchId),
      lectureExerciseResponses: lectureResponses,
      lectureExerciseTimings: readLectureTimings(),
      interactionLog: interactionTracking.read(),
    }
  }

  useEffect(() => {
    if (phase !== 'complete' || automaticallyExportedSession.current === researchId) return
    automaticallyExportedSession.current = researchId
    const payload = {
      researchId, studyOrder, submittedAt: new Date().toISOString(),
      questionnaires: readSessionQuestionnaires(researchId),
      lectureExerciseResponses: lectureResponses, lectureExerciseTimings: readLectureTimings(), interactionLog: interactionTracking.read(),
    }
    try {
      window.localStorage.setItem(`userstudyLi.sessionExport.${researchId}`, JSON.stringify(buildSessionFiles(payload)))
    } catch {
      setExportError('The local session backup could not be saved. Download the study ZIP before closing this page.')
    }
    if (userStudyMode) {
      try { downloadSessionZip(payload) } catch {
        setExportError('The automatic export could not finish. Use Download study data (ZIP) to save a copy.')
      }
    }
  }, [phase, researchId, studyOrder, lectureResponses, interactionTracking, userStudyMode, readLectureTimings])

  useEffect(() => {
    useWorkspaceStore.getState().setUserBlockScope(researchId ? `userstudy-Li-${researchId}` : null)
    return () => useWorkspaceStore.getState().setUserBlockScope(null)
  }, [researchId])

  function startNewSession() {
    const nextResearchId = generateResearchId()
    useWorkspaceStore.getState().setUserBlockScope(`userstudy-Li-${nextResearchId}`)
    setResearchId(nextResearchId)
    setExerciseIndex(0)
    setTutorialPhase('welcome')
    setStudyOrder(null)
    setLectureResponses([])
    setLectureExerciseId('cube-point-pivot-rotation')
    setExportError('')
    setPhase('demographics')
    window.localStorage.setItem(CURRENT_RESEARCH_ID_KEY, nextResearchId)
  }

  function advanceCondition() {
    setPhase(nextStudyPhase(studyOrder, phase))
  }

  function saveLectureAnswer(response) {
    const record = { ...response, elapsedMs: lectureElapsed(response.exerciseId), researchId, studyOrder, conditionId: 'lecture' }
    const storedResponses = JSON.parse(window.localStorage.getItem(LECTURE_RESPONSES_KEY) || '[]')
    window.localStorage.setItem(LECTURE_RESPONSES_KEY, JSON.stringify([...storedResponses, record]))
    setLectureResponses((responses) => [...responses, record])
    interactionTracking.record('answer_submit', { submission: record })
    interactionTracking.read()
  }

  function saveStudyQuestionnaire(payload, type, backupKey) {
    const questionnaireId = phase === 'demographics' ? 'demographics' : phase === 'post'
      ? 'post-study' : phase === 'lecture-questionnaire' ? 'condition-lecture' : 'condition-geoscratch'
    const saved = markQuestionnaireSubmitted(researchId, questionnaireId, payload)
    interactionTracking.record('questionnaire_submit', { questionnaireType: type })
    interactionTracking.read()
    // Logs are already stored separately. Duplicating the full log here can exhaust storage and block Next.
    const backupSaved = saveQuestionnairePayload(payload, type, backupKey)
    if (!saved || !backupSaved) setExportError('Some answers could not be backed up in browser storage. Keep this tab open, finish the study, and download the study ZIP before closing or refreshing.')
  }

  function followTutorial() {
    interactionTracking.record('tutorial_start', { exerciseId: 'tutorial', source: 'welcome' })
    interactionTracking.read()
    setTutorialPhase('active')
  }

  function skipTutorial(source) {
    interactionTracking.record('tutorial_skip', { exerciseId: 'tutorial', source })
    interactionTracking.read()
    setTutorialPhase('done')
  }

  function finishTutorial() {
    interactionTracking.record('tutorial_complete', { exerciseId: 'tutorial', source: 'in-tutorial' })
    interactionTracking.read()
    setTutorialPhase('done')
  }

  if (phase === 'new') {
    return (
      <div className="user-study-li-form-page user-study-li-session-page">
        <section className="user-study-li-session-card" aria-labelledby="new-session-title">
          <h1 id="new-session-title">New study session</h1>
          <p>
            A research ID is generated when the session starts and is used to link the
            questionnaires and study log data.
          </p>
          <button className="user-study-li-primary-action" type="button" onClick={startNewSession}>
            Start new session
          </button>
        </section>
      </div>
    )
  }

  if (phase === 'demographics') {
    return (
      <DemographicsQuestionnaire
        storageWarning={exportError}
        researchId={researchId}
        onComplete={() => setPhase('order')}
        onSave={saveStudyQuestionnaire}
      />
    )
  }

  if (phase === 'order') {
    return <StudyOrderSelection onSelect={(order) => {
      setStudyOrder(order)
      setPhase(nextStudyPhase(order))
    }} />
  }

  if (phase === 'lecture') {
    return <LectureSlides onComplete={advanceCondition} onSubmitAnswer={saveLectureAnswer} onExerciseChange={startLectureExercise}
      onExerciseFinish={finishLectureTiming} trackingError={interactionTracking.storageError} />
  }

  if (phase === 'geoscratch-questionnaire' || phase === 'lecture-questionnaire') {
    const condition = phase === 'geoscratch-questionnaire' ? 'geoscratch' : 'lecture'
    const details = conditionDetails(studyOrder, condition)
    return (
      <ConditionQuestionnaire
        storageWarning={exportError}
        key={phase}
        researchId={researchId}
        condition={details.condition}
        conditionOrder={details.conditionOrder}
        onComplete={advanceCondition}
        onSave={(payload, type, backupKey) => saveStudyQuestionnaire(
          { ...payload, studyOrder, conditionId: condition }, type, backupKey,
        )}
      />
    )
  }

  if (phase === 'post') {
    return (
      <PostStudyQuestionnaire
        storageWarning={exportError}
        researchId={researchId}
        conditionOrder={conditionDetails(studyOrder, 'geoscratch').studyOrder}
        onComplete={advanceCondition}
        onSave={(payload, type, backupKey) => saveStudyQuestionnaire(
          { ...payload, studyOrder }, type, backupKey,
        )}
      />
    )
  }

  if (phase === 'complete') {
    return (
      <div className="user-study-li-form-page user-study-li-session-page">
        <section className="user-study-li-session-card" aria-labelledby="session-complete-title">
          <h1 id="session-complete-title">Study session complete</h1>
          <p>Research ID: {researchId}</p>
          <p>The study ZIP contains a folder named by your research ID, with separate JSON files in study order. {userStudyMode
            ? 'If the automatic download did not appear, use the button below.'
            : 'Automatic downloads are off. Use the button below to download a copy.'}</p>
          {exportError && <p role="alert">{exportError}</p>}
          {interactionTracking.storageError && <p role="alert">{interactionTracking.storageError}</p>}
          <footer className="user-study-li-session-footer">
            <button className="user-study-li-primary-action" type="button" onClick={() => downloadSessionZip(sessionPayload())}>Download study data (ZIP)</button>
            <button
              className="user-study-li-new-session-action"
              type="button"
              onClick={() => setPhase('new')}
            >
              Start new session
            </button>
          </footer>
        </section>
      </div>
    )
  }

  if (tutorialPhase === 'active') {
    return <SessionTutorial researchId={researchId} onDone={finishTutorial} onSkip={() => skipTutorial('in-tutorial')} />
  }

  return (
    <div className="app-container flex h-dvh flex-col overflow-hidden">
      {tutorialPhase === 'welcome' && exerciseIndex === 0 && <TutorialWelcome
        onFollow={followTutorial} onSkip={() => skipTutorial('welcome')} />}
      <main className="flex min-h-0 flex-1 flex-col">
        {interactionTracking.storageError && <p role="alert">{interactionTracking.storageError}</p>}
        <ExercisePage
          key={exerciseId}
          exerciseId={exerciseId}
          exerciseTitle={exercise.title}
          exerciseHeading={exercise.heading}
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
              : advanceCondition
          }
          transformObjects={styleStudyPoints}
          toggleLabelsOnLeftClick
        />
      </main>
    </div>
  )
}
