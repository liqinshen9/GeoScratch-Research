import { useCallback, useEffect, useRef, useState } from 'react'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import useSettingsStore from '@/store/useSettingsStore'
import useThemeSync from '@/hooks/useThemeSync'
import ExercisePage from '@/pages/ExercisePage'
import ExerciseCountdown from './userStudyLi/ExerciseCountdown'
import { generateResearchId } from '@/study/session/researchId'
import { markQuestionnaireSubmitted, readSessionQuestionnaires, restoreSessionQuestionnaires } from '@/study/session/questionnaireDrafts'
import { buildSessionFiles, downloadSessionZip } from '@/study/session/sessionExport'
import useLectureExerciseTiming from '@/study/session/useLectureExerciseTiming'
import { clearStoredStudyData, STUDY_PERSISTENCE_ENABLED } from '@/study/session/studyStorage'
import useFirebaseStudySync from '@/study/firebase/useFirebaseStudySync'
import { firebaseSessionRecords } from '@/study/firebase/sessionRecords'
import { beginExerciseResult, countExerciseAction, finishExerciseResult } from '@/study/session/compactExerciseResults'
import useStudyRecoveryBackup from '@/study/session/useStudyRecoveryBackup'
import { readActiveStudySession, saveStudyBackup, setActiveStudySession } from '@/study/session/studyRecoveryStore'
import { recoveredSession } from '@/study/session/recoveredSession'
import { recoverFirebaseStudy, signInResearcher } from '@/study/firebase/studyFirebase'
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
  { id: 'create-complex-object', heading: 'Trial Exercise', limitSeconds: 5 * 60, steps: ['cube', 'point', 'pair'] },
  { id: 'cube-point-pivot-rotation', limitSeconds: 10 * 60, steps: ['pipeline', 'toOrigin', 'rotate', 'back'] },
  { id: 'point-plane-distance', title: 'Calculate the shortest distance from a point to a plane', limitSeconds: 10 * 60,
    steps: ['plane', 'pointP', 'pointQ', 'difference', 'normalFromQ', 'projection', 'distance'] },
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
  if (!STUDY_PERSISTENCE_ENABLED) return true
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

export default function UserStudyLiPage({ researcherOnly = false, autoResume = true }) {
  useThemeSync()
  useEffect(() => {
    try { clearStoredStudyData() } catch { /* Memory-only study still works if browser storage is unavailable. */ }
    const store = useWorkspaceStore.getState()
    const oldStudyIds = Object.keys(store.savedXml ?? {}).filter((id) => id.startsWith('userstudy-Li-'))
    if (oldStudyIds.length) store.clearSavedWorkspaces?.(oldStudyIds)
  }, [])
  const userStudyMode = useSettingsStore((state) => state.settings.userStudyMode)
  const [exerciseIndex, setExerciseIndex] = useState(0)
  const [phase, setPhase] = useState('new')
  const [studyOrder, setStudyOrder] = useState(null)
  const [researchId, setResearchId] = useState('')
  const [tutorialPhase, setTutorialPhase] = useState('welcome')
  const [tutorialSummary, setTutorialSummary] = useState({ status: 'not-recorded', skipSource: null })
  const [lectureResponses, setLectureResponses] = useState([])
  const lectureResponsesRef = useRef([])
  const [geoscratchResults, setGeoscratchResults] = useState([])
  const activeGeoResult = useRef(null)
  const [lectureTimingRevision, setLectureTimingRevision] = useState(0)
  const [draftRevision, setDraftRevision] = useState(0)
  const [geoRevision, setGeoRevision] = useState(0)
  const [lectureDrafts, setLectureDrafts] = useState({})
  const [lectureExerciseNumber, setLectureExerciseNumber] = useState(1)
  const [initialFirebaseSession, setInitialFirebaseSession] = useState(null)
  const [cloudRecoverySnapshot, setCloudRecoverySnapshot] = useState(null)
  const [recoveryId, setRecoveryId] = useState('')
  const [recoveryMessage, setRecoveryMessage] = useState('')
  const [researcherAccount, setResearcherAccount] = useState(null)
  const [recovering, setRecovering] = useState(false)
  const [recoveredReadOnly, setRecoveredReadOnly] = useState(false)
  const [loadingSession, setLoadingSession] = useState(autoResume && !researcherOnly)
  const [transitionBusy, setTransitionBusy] = useState(false)
  const transitionLock = useRef(false)
  const [transitionError, setTransitionError] = useState('')
  const { start: startLectureTiming, finish: finishLectureTiming, elapsed: lectureElapsed, read: readLectureTimings, restore: restoreLectureTimings, storageError: timingStorageError } = useLectureExerciseTiming(researchId)
  useEffect(() => {
    const changed = (event) => { if (event.detail.researchId === researchId) setDraftRevision((revision) => revision + 1) }
    window.addEventListener('geoscratch:questionnaire-changed', changed)
    return () => window.removeEventListener('geoscratch:questionnaire-changed', changed)
  }, [researchId])
  const startLectureExercise = useCallback((exerciseId) => {
    startLectureTiming(exerciseId)
    setLectureTimingRevision((revision) => revision + 1)
  }, [startLectureTiming])
  const [exportError, setExportError] = useState('')
  const storageWarning = exportError || timingStorageError
  const [timeUpMessage, setTimeUpMessage] = useState('')
  useEffect(() => {
    if (!timeUpMessage) return
    const timer = window.setTimeout(() => setTimeUpMessage(''), 5000)
    return () => window.clearTimeout(timer)
  }, [timeUpMessage])
  const automaticallyExportedSession = useRef(null)
  const exercise = STUDY_EXERCISES[exerciseIndex]
  const exerciseId = exercise.id

  function sessionPayload() {
    return {
      researchId, studyOrder, submittedAt: new Date().toISOString(),
      questionnaires: readSessionQuestionnaires(researchId),
      lectureExerciseResponses: lectureResponses,
      lectureExerciseTimings: readLectureTimings(),
      tutorialSummary,
      geoscratchResults,
      lectureDrafts,
    }
  }

  const firebaseSync = useFirebaseStudySync({ researchId: recoveredReadOnly ? '' : researchId, studyOrder,
    records: firebaseSessionRecords({ ...sessionPayload(), lectureTimingRevision, draftRevision }),
    recoverySnapshot: cloudRecoverySnapshot, initialSession: initialFirebaseSession })

  const { error: localBackupError, pending: recoveryUploadPending } = useStudyRecoveryBackup({
    researchId: recoveredReadOnly ? '' : researchId, studyOrder, phase, exerciseIndex, tutorialPhase, tutorialSummary,
    lectureExerciseResponses: lectureResponses, lectureExerciseTimings: readLectureTimings(),
    geoscratchResults, activeGeoResult: activeGeoResult.current, questionnaires: readSessionQuestionnaires(researchId),
    lectureDrafts, lectureExerciseNumber, userStudyMode, geoRevision,
  }, setCloudRecoverySnapshot)

  const ensureGeoResult = useCallback(() => {
    if (phase !== 'geoscratch' || tutorialPhase !== 'done') return null
    if (activeGeoResult.current?.exerciseId !== exercise.id) {
      activeGeoResult.current = beginExerciseResult(exercise.id, exercise.steps, userStudyMode)
      setGeoRevision((revision) => revision + 1)
    }
    return activeGeoResult.current
  }, [phase, tutorialPhase, exercise, userStudyMode])
  useEffect(() => { ensureGeoResult() }, [ensureGeoResult])
  const updateGeoPassed = useCallback((passed) => {
    const result = ensureGeoResult()
    if (result && result.passed !== passed) { result.passed = passed; setGeoRevision((revision) => revision + 1) }
  }, [ensureGeoResult])
  const recordStepAction = useCallback((action) => {
    countExerciseAction(ensureGeoResult(), action)
    setGeoRevision((revision) => revision + 1)
  }, [ensureGeoResult])

  function finishGeoScratch(reason) {
    const active = ensureGeoResult()
    if (!active) return
    const result = finishExerciseResult(active, reason)
    setGeoscratchResults((results) => [...results.filter((item) => item.exerciseId !== result.exerciseId), result])
    return result
  }

  function finishLectureExercise(id) {
    finishLectureTiming(id)
    setLectureTimingRevision((revision) => revision + 1)
    return transitionTo({ lectureExerciseNumber: 2 })
  }

  function checkpoint(overrides = {}) {
    const store = useWorkspaceStore.getState()
    const prefix = `userstudy-Li-${researchId}`
    return { ...sessionPayload(), lectureExerciseResponses: lectureResponsesRef.current,
      phase, exerciseIndex, tutorialPhase, lectureDrafts, lectureExerciseNumber, userStudyMode,
      activeGeoResult: activeGeoResult.current ? { ...activeGeoResult.current, startedMonotonic: undefined } : null,
      savedXml: Object.fromEntries(Object.entries(store.savedXml ?? {}).filter(([id]) => id.startsWith(`${prefix}-`))),
      userBlocks: store.userBlockScope === prefix ? store.userBlocks : [], ...overrides }
  }

  function transitionTo(target, data = {}) {
    const apply = () => {
      if (target.phase != null) setPhase(target.phase)
      if (target.exerciseIndex != null) setExerciseIndex(target.exerciseIndex)
      if (target.studyOrder != null) setStudyOrder(target.studyOrder)
      if (target.lectureExerciseNumber != null) setLectureExerciseNumber(target.lectureExerciseNumber)
    }
    if (!firebaseSync.commit) { apply(); return true }
    if (transitionLock.current) return false
    transitionLock.current = true
    setTransitionBusy(true)
    setTransitionError('')
    return (async () => {
      const current = checkpoint(data)
      const next = { ...current, ...target }
      try {
        await saveStudyBackup(researchId, { snapshot: current })
        const saved = await firebaseSync.commit(firebaseSessionRecords(next), next, next.studyOrder)
        if (!saved) throw new Error('Your work is kept on this laptop. Check the internet connection, then press Next again. You have not moved to the next stage.')
        await saveStudyBackup(researchId, { snapshot: next })
        apply()
        return true
      } catch (error) {
        setTransitionError(error.message ?? 'Your data could not be saved. Retry before continuing.')
        return false
      } finally { transitionLock.current = false; setTransitionBusy(false) }
    })()
  }

  useEffect(() => {
    if (phase !== 'complete' || automaticallyExportedSession.current === researchId) return
    automaticallyExportedSession.current = researchId
    const payload = {
      researchId, studyOrder, submittedAt: new Date().toISOString(),
      questionnaires: readSessionQuestionnaires(researchId),
      lectureExerciseResponses: lectureResponses, lectureExerciseTimings: readLectureTimings(), tutorialSummary, geoscratchResults, lectureDrafts,
    }
    try {
      if (STUDY_PERSISTENCE_ENABLED) window.localStorage.setItem(`userstudyLi.sessionExport.${researchId}`, JSON.stringify(buildSessionFiles(payload)))
    } catch {
      setExportError('The local session backup could not be saved. Download the study ZIP before closing this page.')
    }
    if (userStudyMode) {
      try { downloadSessionZip(payload) } catch {
        setExportError('The automatic export could not finish. Use Download study data (ZIP) to save a copy.')
      }
    }
  }, [phase, researchId, studyOrder, lectureResponses, tutorialSummary, geoscratchResults, lectureDrafts, userStudyMode, readLectureTimings])

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
    setTutorialSummary({ status: 'not-recorded', skipSource: null })
    setStudyOrder(null)
    setLectureResponses([])
    lectureResponsesRef.current = []
    setGeoscratchResults([])
    activeGeoResult.current = null
    setInitialFirebaseSession(null)
    setCloudRecoverySnapshot(null)
    setLectureDrafts({})
    setLectureExerciseNumber(1)
    setRecoveredReadOnly(false)
    setExportError('')
    setTimeUpMessage('')
    setPhase('demographics')
    void setActiveStudySession(nextResearchId).catch(() => setExportError('Automatic refresh recovery could not be enabled on this device. Keep this tab open until your data is saved to Firebase.'))
    try {
      if (STUDY_PERSISTENCE_ENABLED) window.localStorage.setItem(CURRENT_RESEARCH_ID_KEY, nextResearchId)
    } catch {
      setExportError('Browser backup is unavailable. Keep this tab open, finish the study, and download the study ZIP before closing or refreshing.')
    }
  }

  function advanceCondition() {
    return transitionTo({ phase: nextStudyPhase(studyOrder, phase) })
  }

  function advanceGeoScratch() {
    const result = finishGeoScratch('next')
    setTimeUpMessage('')
    return transitionTo(exerciseIndex < STUDY_EXERCISES.length - 1
      ? { exerciseIndex: exerciseIndex + 1 } : { phase: nextStudyPhase(studyOrder, phase) },
    { geoscratchResults: result ? [...geoscratchResults.filter((item) => item.exerciseId !== result.exerciseId), result] : geoscratchResults })
  }

  function expireGeoScratch() {
    finishGeoScratch('timeout')
    setTimeUpMessage(`Time is up for ${exercise.heading || (exerciseIndex === 1 ? 'the cube rotation exercise' : 'the point-to-plane distance exercise')}. You have moved to the next question.`)
    if (exerciseIndex < STUDY_EXERCISES.length - 1) setExerciseIndex((index) => index + 1)
    else advanceCondition()
  }

  function saveLectureAnswer(response) {
    const record = { ...response, elapsedMs: lectureElapsed(response.exerciseId), researchId, studyOrder, conditionId: 'lecture' }
    lectureResponsesRef.current = [...lectureResponsesRef.current, record]
    setLectureResponses(lectureResponsesRef.current)
    try {
      if (STUDY_PERSISTENCE_ENABLED) {
        const storedResponses = JSON.parse(window.localStorage.getItem(LECTURE_RESPONSES_KEY) || '[]')
        window.localStorage.setItem(LECTURE_RESPONSES_KEY, JSON.stringify([...storedResponses, record]))
      }
    } catch {
      setExportError('Your lecture answer is kept in this tab because browser backup is unavailable. Finish and download the study ZIP before closing or refreshing.')
    }
  }

  function saveStudyQuestionnaire(payload, type, backupKey) {
    const questionnaireId = phase === 'demographics' ? 'demographics' : phase === 'post'
      ? 'post-study' : phase === 'lecture-questionnaire' ? 'condition-lecture' : 'condition-geoscratch'
    const saved = markQuestionnaireSubmitted(researchId, questionnaireId, payload)
    const backupSaved = saveQuestionnairePayload(payload, type, backupKey)
    if (!saved || !backupSaved) setExportError('Some answers could not be backed up in browser storage. Keep this tab open, finish the study, and download the study ZIP before closing or refreshing.')
  }

  function followTutorial() {
    setTutorialSummary({ status: 'started', skipSource: null })
    setTutorialPhase('active')
  }

  function skipTutorial(source) {
    setTutorialSummary({ status: tutorialPhase === 'active' ? 'skipped-after-start' : 'skipped', skipSource: source })
    setTutorialPhase('done')
  }

  function finishTutorial() {
    setTutorialSummary({ status: 'completed', skipSource: null })
    setTutorialPhase('done')
  }

  async function recoverSession(automaticRecord) {
    const id = automaticRecord?.researchId ?? recoveryId.trim().toUpperCase()
    if (!id) return
    if (!automaticRecord && !researcherAccount?.authorized) {
      setRecoveryMessage('Sign in with your authorized researcher account before looking up results.')
      return
    }
    setRecovering(true)
    setRecoveryMessage('Looking for your saved study…')
    try {
      const local = automaticRecord ?? null
      const remote = !automaticRecord ? await recoverFirebaseStudy(id, true) : null
      const snapshot = local ? (local.snapshot ?? { phase: 'demographics', studyOrder: null }) : remote ? recoveredSession(remote, id) : null
      if (!snapshot) throw new Error('No recoverable session was found for this research ID. For another computer, sign in as an authorized researcher first.')
      restoreSessionQuestionnaires(id, snapshot.questionnaires)
      restoreLectureTimings(id, snapshot.lectureExerciseTimings)
      useWorkspaceStore.getState().restoreStudyWorkspace?.(id, snapshot)
      setResearchId(id)
      setStudyOrder(snapshot.studyOrder)
      setExerciseIndex(snapshot.exerciseIndex ?? 0)
      setTutorialPhase(snapshot.tutorialPhase ?? 'welcome')
      setTutorialSummary(snapshot.tutorialSummary ?? { status: 'not-recorded', skipSource: null })
      setLectureResponses(snapshot.lectureExerciseResponses ?? [])
      lectureResponsesRef.current = snapshot.lectureExerciseResponses ?? []
      setGeoscratchResults(snapshot.geoscratchResults ?? [])
      activeGeoResult.current = snapshot.activeGeoResult ? { ...snapshot.activeGeoResult,
        startedMonotonic: performance.now() - Math.max(0, Date.now() - Date.parse(snapshot.activeGeoResult.startedAt)),
      } : null
      setLectureDrafts(snapshot.lectureDrafts ?? {})
      setLectureExerciseNumber(snapshot.lectureExerciseNumber ?? 1)
      setInitialFirebaseSession(local?.firebaseSession ?? remote?.firebaseSession ?? { sessionId: local?.firebaseSessionId })
      const readOnly = !automaticRecord
      setRecoveredReadOnly(readOnly)
      setCloudRecoverySnapshot(readOnly ? null : snapshot)
      setPhase(readOnly ? 'recovered' : snapshot.phase)
      if (!readOnly && snapshot.userStudyMode != null) useSettingsStore.getState().updateSetting('userStudyMode', snapshot.userStudyMode)
      setRecoveryMessage('')
      if (!readOnly) await setActiveStudySession(id)
    } catch (error) { setRecoveryMessage(error.message ?? 'Recovery failed. Check your internet connection and retry.') }
    finally { setRecovering(false) }
  }

  async function researcherSignIn() {
    setRecoveryMessage('Opening researcher sign-in…')
    try {
      const account = await signInResearcher()
      setResearcherAccount(account)
      setRecoveryMessage(account.authorized ? 'Researcher access is ready. Enter a research ID to retrieve its results.'
        : `This account needs researcher access. Account ID: ${account.uid}`)
    } catch (error) { setRecoveryMessage(`Researcher sign-in failed: ${error.code ?? error.message}`) }
  }

  useEffect(() => {
    if (!autoResume || researcherOnly) return
    let cancelled = false
    void readActiveStudySession().then(async (session) => {
      if (!cancelled && session) await recoverSession(session)
    }).catch(() => {
      if (!cancelled) setExportError('Automatic refresh recovery is unavailable on this device. Keep this tab open until your work is saved to Firebase.')
    }).finally(() => { if (!cancelled) setLoadingSession(false) })
    return () => { cancelled = true }
  // Restore once before presenting participant controls.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoResume, researcherOnly])

  function renderStudyContent() {
  if (loadingSession) return <div className="user-study-li-form-page"><p role="status">Opening your study…</p></div>
  if (phase === 'new') {
    return (
      <div className="user-study-li-form-page user-study-li-session-page">
        <section className="user-study-li-session-card" aria-labelledby="new-session-title">
          <h1 id="new-session-title">{researcherOnly ? 'Researcher study results' : 'New study session'}</h1>
          {!researcherOnly && <>
          <p>
            A research ID is generated when the session starts and is used to link the
            questionnaires and exercise answers.
          </p>
          <p>Your work is backed up automatically. Refreshing this page reopens the same study. Next saves your answers to Firebase before continuing.</p>
          {storageWarning && <p role="alert">{storageWarning}</p>}
          <button className="user-study-li-primary-action" type="button" onClick={startNewSession}>
            Start new session
          </button>
          </>}
          {researcherOnly && <>
          <hr />
          <h2>Recover by research ID</h2>
          <p>Sign in as an authorized researcher, then enter the participant’s research ID to retrieve and download their uploaded results.</p>
          <label>Research ID <input value={recoveryId} onChange={(event) => setRecoveryId(event.target.value)} autoComplete="off" /></label>
          <button type="button" onClick={() => recoverSession()} disabled={recovering || !recoveryId.trim() || !researcherAccount?.authorized}>Recover study</button>
          <button type="button" onClick={researcherSignIn}>Researcher sign-in</button>
          {recoveryMessage && <p role="status">{recoveryMessage}</p>}
          {researcherAccount && <p>Researcher account: {researcherAccount.email} · Account ID: {researcherAccount.uid}</p>}
          </>}
        </section>
      </div>
    )
  }

  if (phase === 'demographics') {
    return (
      <DemographicsQuestionnaire
        storageWarning={storageWarning}
        researchId={researchId}
        onComplete={() => transitionTo({ phase: 'order' })}
        onSave={saveStudyQuestionnaire}
      />
    )
  }

  if (phase === 'order') {
    return <StudyOrderSelection onSelect={(order) => {
      transitionTo({ studyOrder: order, phase: nextStudyPhase(order) })
    }} />
  }

  if (phase === 'lecture') {
    return <LectureSlides onComplete={advanceCondition} onSubmitAnswer={saveLectureAnswer} onExerciseChange={startLectureExercise}
      onExerciseFinish={finishLectureExercise} initialExercise={lectureExerciseNumber} drafts={lectureDrafts}
      onDraftChange={(id, answer) => setLectureDrafts((drafts) => ({ ...drafts, [id]: answer }))}
      onExerciseNumberChange={setLectureExerciseNumber} />
  }

  if (phase === 'geoscratch-questionnaire' || phase === 'lecture-questionnaire') {
    const condition = phase === 'geoscratch-questionnaire' ? 'geoscratch' : 'lecture'
    const details = conditionDetails(studyOrder, condition)
    return (
      <>
      {timeUpMessage && <p className="user-study-li-time-up" role="alert">{timeUpMessage}</p>}
      <ConditionQuestionnaire
        storageWarning={storageWarning}
        key={phase}
        researchId={researchId}
        condition={details.condition}
        conditionOrder={details.conditionOrder}
        onComplete={() => { setTimeUpMessage(''); advanceCondition() }}
        onSave={(payload, type, backupKey) => saveStudyQuestionnaire(
          { ...payload, studyOrder, conditionId: condition }, type, backupKey,
        )}
      />
      </>
    )
  }

  if (phase === 'post') {
    return (
      <PostStudyQuestionnaire
        storageWarning={storageWarning}
        researchId={researchId}
        conditionOrder={conditionDetails(studyOrder, 'geoscratch').studyOrder}
        onComplete={advanceCondition}
        onSave={(payload, type, backupKey) => saveStudyQuestionnaire(
          { ...payload, studyOrder }, type, backupKey,
        )}
      />
    )
  }

  if (phase === 'complete' || phase === 'recovered') {
    return (
      <div className="user-study-li-form-page user-study-li-session-page">
        <section className="user-study-li-session-card" aria-labelledby="session-complete-title">
          <h1 id="session-complete-title">{phase === 'recovered' ? 'Recovered study results' : 'Study session complete'}</h1>
          <p>Research ID: {researchId}</p>
          {phase === 'recovered' && <p>These are the latest results uploaded from the participant’s device. You can download the study ZIP below.</p>}
          <p>The study ZIP contains a folder named by your research ID, with separate JSON files in study order. {userStudyMode
            ? 'If the automatic download did not appear, use the button below.'
            : 'Automatic downloads are off. Use the button below to download a copy.'}</p>
          {storageWarning && <p role="alert">{storageWarning}</p>}
          <footer className="user-study-li-session-footer">
            <button className="user-study-li-primary-action" type="button" onClick={() => downloadSessionZip(sessionPayload())}>Download study data (ZIP)</button>
            <button
              className="user-study-li-new-session-action"
              type="button"
              disabled={!recoveredReadOnly && (recoveryUploadPending || firebaseSync.state === 'saving' || firebaseSync.state === 'error' || firebaseSync.state === 'offline')}
              onClick={() => { if (!researcherOnly) void setActiveStudySession(null).catch(() => {}); setResearchId(''); setPhase('new') }}
            >
              {researcherOnly ? 'Look up another study' : 'Start new session'}
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
        {timeUpMessage && <p className="user-study-li-time-up" role="alert">{timeUpMessage}</p>}
        <ExercisePage
          key={exerciseId}
          exerciseId={exerciseId}
          exerciseTitle={exercise.title}
          exerciseHeading={exercise.heading}
          exerciseTimer={<ExerciseCountdown key={`${researchId}-${exerciseId}`}
            enabled={userStudyMode && tutorialPhase === 'done'} limitSeconds={exercise.limitSeconds}
            startedAt={activeGeoResult.current?.exerciseId === exerciseId ? activeGeoResult.current.startedAt : undefined}
            onTimeout={expireGeoScratch} />}
          standalone
          workspaceId={`userstudy-Li-${researchId || 'no-session'}-${exerciseId}`}
          settingsOverrides={SETTINGS}
          showAnswerHighlight={false}
          hideAnimationTransport
          hiddenBlockTypes={HIDDEN_BLOCK_TYPES}
          showDebugSolution={false}
          wideTaskPanel
          onPreviousExercise={
            exerciseIndex > 0 ? () => {
              if (!userStudyMode) { finishGeoScratch('previous'); setTimeUpMessage(''); setExerciseIndex((index) => index - 1) }
            } : undefined
          }
          onNextExercise={
            advanceGeoScratch
          }
          transformObjects={styleStudyPoints}
          toggleLabelsOnLeftClick
          onPassedChange={updateGeoPassed}
          onStepAction={recordStepAction}
        />
      </main>
    </div>
  )
  }

  return <>
    {transitionBusy && <div className="user-study-li-saving-overlay" role="status" data-saving-transition="true">Saving your results before continuing…</div>}
    {researchId && !recoveredReadOnly && <div className={`user-study-li-cloud-status is-${firebaseSync.state}${phase === 'geoscratch' ? '' : ' is-form'}`} role={firebaseSync.state === 'error' ? 'alert' : 'status'}>
      <span>Research ID: {researchId} · </span>
      {firebaseSync.state === 'saving' || (recoveryUploadPending && firebaseSync.state !== 'offline' && firebaseSync.state !== 'error') ? 'Saving study data to Firebase…'
        : firebaseSync.state === 'saved' ? `Saved to Firebase · ${firebaseSync.count} study records`
        : firebaseSync.state === 'error' ? `Firebase save failed (${firebaseSync.code}). Keep this tab open and retry. Your study ZIP is still available.`
        : firebaseSync.state === 'offline' ? 'Offline. Results are backed up on this device and will upload when the internet returns.'
        : 'Backing up your study…'}
      {localBackupError && <p role="alert">{localBackupError}</p>}
      {transitionError && <p role="alert">{transitionError}</p>}
      {firebaseSync.state === 'error' && <button type="button" onClick={firebaseSync.retry}>Retry Firebase save</button>}
    </div>}
    <div style={{ display: 'contents' }} inert={transitionBusy || undefined}>{renderStudyContent()}</div>
  </>
}
