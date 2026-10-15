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
import { STUDY_PERSISTENCE_ENABLED } from '@/study/session/studyStorage'
import useFirebaseStudySync from '@/study/firebase/useFirebaseStudySync'
import { firebaseSessionRecords } from '@/study/firebase/sessionRecords'
import { beginExerciseResult, countExerciseAction, finishExerciseResult } from '@/study/session/compactExerciseResults'
import useFirestoreInteractionTracking from '@/study/firebase/useFirestoreInteractionTracking'
import useStudyRecoveryBackup from '@/study/session/useStudyRecoveryBackup'
import { readActiveStudySession, saveStudyBackup, setActiveStudySession } from '@/study/session/studyRecoveryStore'
import { recoveredSession } from '@/study/session/recoveredSession'
import { recoverFirebaseStudy, signInResearcher, readFirebaseStudyInteractions } from '@/study/firebase/studyFirebase'
import DemographicsQuestionnaire from './userStudyLi/DemographicsQuestionnaire'
import ConditionQuestionnaire from './userStudyLi/ConditionQuestionnaire'
import PostStudyQuestionnaire from './userStudyLi/PostStudyQuestionnaire'
import TutorialWelcome from './userStudyLi/TutorialWelcome'
import SessionTutorial from './userStudyLi/SessionTutorial'
import StudyOrderSelection from './userStudyLi/StudyOrderSelection'
import ResearcherPendingUploads from './userStudyLi/ResearcherPendingUploads'
import LectureSlides from './userStudyLi/LectureSlides'
import { nextStudyPhase, conditionDetails, studySequence } from './userStudyLi/studyFlow'
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
  const [recoveryId, setRecoveryId] = useState('')
  const [recoveryMessage, setRecoveryMessage] = useState('')
  const [researcherAccount, setResearcherAccount] = useState(null)
  const [researchUploadStatus, setResearchUploadStatus] = useState(null)
  const [recovering, setRecovering] = useState(false)
  const [recoveredReadOnly, setRecoveredReadOnly] = useState(false)
  const [loadingSession, setLoadingSession] = useState(autoResume && !researcherOnly && userStudyMode)
  const [transitionBusy, setTransitionBusy] = useState(false)
  const transitionLock = useRef(false)
  const transitionEpoch = useRef(0)
  const [transitionError, setTransitionError] = useState('')
  const recordingId = userStudyMode && !recoveredReadOnly ? researchId : ''
  const { start: startLectureTiming, finish: finishLectureTiming, elapsed: lectureElapsed, read: readLectureTimings, restore: restoreLectureTimings, storageError: timingStorageError } = useLectureExerciseTiming(researchId)
  useEffect(() => {
    const changed = (event) => { if (event.detail.researchId === researchId) setDraftRevision((revision) => revision + 1) }
    const failed = (event) => { if (event.detail.researchId === researchId) setExportError('This device could not back up your answers. Keep this tab open and contact the researcher.') }
    window.addEventListener('geoscratch:questionnaire-changed', changed)
    window.addEventListener('geoscratch:study-local-error', failed)
    return () => { window.removeEventListener('geoscratch:questionnaire-changed', changed); window.removeEventListener('geoscratch:study-local-error', failed) }
  }, [researchId])
  const startLectureExercise = useCallback((exerciseId) => {
    if (!userStudyMode) return
    startLectureTiming(exerciseId, userStudyMode ? 600 : null)
    setLectureTimingRevision((revision) => revision + 1)
  }, [startLectureTiming, userStudyMode])
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

  const firebaseSync = useFirebaseStudySync({ researchId: recordingId, studyOrder,
    records: recordingId ? firebaseSessionRecords({ ...sessionPayload(), lectureTimingRevision, draftRevision }) : [],
    initialSession: initialFirebaseSession })
  const interactionTracking = useFirestoreInteractionTracking({
    researchId: recordingId, writeInteraction: firebaseSync.writeInteraction,
    flushUploads: firebaseSync.flush,
    context: { phase, researchId, conditionId: phase === 'geoscratch' && tutorialPhase === 'done' ? 'geoscratch' : null,
      exerciseId: phase === 'geoscratch' && tutorialPhase === 'done' ? exerciseId : null, studyOrder },
  })
  const captureInteraction = interactionTracking.capture
  const downloadStudyDataRef = useRef(null)
  const exportEpoch = useRef(0)
  const studyModeRef = useRef(userStudyMode)
  studyModeRef.current = userStudyMode
  useEffect(() => {
    if (userStudyMode) return
    exportEpoch.current += 1
    transitionEpoch.current += 1
    transitionLock.current = false
    setTransitionBusy(false)
    setTransitionError('')
    setTimeUpMessage('')
    setExportError('')
    setLoadingSession(false)
    activeGeoResult.current = null
  }, [userStudyMode])
  async function downloadStudyData(payload = sessionPayload()) {
    if (!studyModeRef.current && !researcherOnly) return
    const epoch = exportEpoch.current
    try {
      await interactionTracking.flush()
      if (epoch !== exportEpoch.current || (!studyModeRef.current && !researcherOnly)) return
      const interactionLog = recoveredReadOnly && initialFirebaseSession?.path
        ? await readFirebaseStudyInteractions(initialFirebaseSession, true)
        : await firebaseSync.readInteractions?.() ?? []
      if (epoch !== exportEpoch.current || (!studyModeRef.current && !researcherOnly)) return
      downloadSessionZip({ ...payload, ...(interactionLog.length ? { interactionLog } : {}) })
    } catch {
      if (epoch !== exportEpoch.current) return
      setExportError('The study history could not be downloaded from Firebase. Check the connection and retry Download study data.')
    }
  }
  downloadStudyDataRef.current = downloadStudyData

  const { error: localBackupError, pending: recoveryUploadPending } = useStudyRecoveryBackup({
    researchId: recordingId, studyOrder, phase, exerciseIndex, tutorialPhase, tutorialSummary,
    lectureExerciseResponses: lectureResponses, lectureExerciseTimings: readLectureTimings(),
    geoscratchResults, activeGeoResult: activeGeoResult.current, questionnaires: readSessionQuestionnaires(researchId),
    lectureDrafts, lectureExerciseNumber, userStudyMode, geoRevision,
  })

  const ensureGeoResult = useCallback(() => {
    if (!userStudyMode || phase !== 'geoscratch' || tutorialPhase !== 'done') return null
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
    if (!userStudyMode) return
    captureInteraction(action.action === 'check' ? 'step_check' : 'step_more_help', action)
    countExerciseAction(ensureGeoResult(), action)
    setGeoRevision((revision) => revision + 1)
  }, [ensureGeoResult, captureInteraction, userStudyMode])

  function finishGeoScratch(reason) {
    const active = ensureGeoResult()
    if (!active) return
    const result = finishExerciseResult(active, reason)
    interactionTracking.capture(reason === 'timeout' ? 'exercise_timeout' : 'exercise_finished', { result })
    setGeoscratchResults((results) => [...results.filter((item) => item.exerciseId !== result.exerciseId), result])
    return result
  }

  function finishLectureExercise(id) {
    if (!userStudyMode) return transitionTo({ lectureExerciseNumber: 2 })
    if (userStudyMode && !lectureResponsesRef.current.some((response) => response.exerciseId === id && typeof response.answer === 'string' && response.answer.trim())) return false
    finishLectureTiming(id)
    setLectureTimingRevision((revision) => revision + 1)
    return transitionTo({ lectureExerciseNumber: 2 })
  }

  function expireLectureExercise(id) {
    transitionEpoch.current += 1
    transitionLock.current = false
    setTransitionBusy(false)
    finishLectureTiming(id, 'timeout')
    setLectureTimingRevision((revision) => revision + 1)
    setTimeUpMessage(`Time is up for lecture exercise ${id === 'cube-point-pivot-rotation' ? '1' : '2'}. You have moved to the next question.`)
    void transitionTo(id === 'cube-point-pivot-rotation' ? { lectureExerciseNumber: 2 }
      : { phase: nextStudyPhase(studyOrder, 'lecture') }, { lectureExerciseTimings: readLectureTimings() })
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
      if (target.tutorialPhase != null) setTutorialPhase(target.tutorialPhase)
      if (target.tutorialSummary != null) setTutorialSummary(target.tutorialSummary)
    }
    if (!userStudyMode || !firebaseSync.commit) { apply(); return true }
    if (transitionLock.current) return false
    transitionLock.current = true
    const epoch = transitionEpoch.current
    setTransitionBusy(true)
    setTransitionError('')
    return (async () => {
      const current = checkpoint(data)
      const next = { ...current, ...target }
      try {
        await saveStudyBackup(researchId, { snapshot: current })
        if (epoch !== transitionEpoch.current) return false
        if (phase === 'geoscratch' && !(await interactionTracking.flush())) throw new Error('This device could not back up the exercise. Keep this tab open and contact the researcher.')
        const saved = await firebaseSync.commit(firebaseSessionRecords(next), next, next.studyOrder)
        if (epoch !== transitionEpoch.current) return false
        if (!saved) throw new Error('This device could not back up your results. Keep this tab open and contact the researcher.')
        await saveStudyBackup(researchId, { snapshot: next })
        apply()
        return true
      } catch (error) {
        if (epoch !== transitionEpoch.current) return false
        setTransitionError(error.message ?? 'Your data could not be saved. Retry before continuing.')
        return false
      } finally { if (epoch === transitionEpoch.current) { transitionLock.current = false; setTransitionBusy(false) } }
    })()
  }

  useEffect(() => {
    if (!userStudyMode || phase !== 'complete' || !researchId || automaticallyExportedSession.current === researchId) return
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
      try { void downloadStudyDataRef.current(payload) } catch {
        setExportError('The automatic export could not finish. Use Download study data (ZIP) to save a copy.')
      }
    }
  }, [phase, researchId, studyOrder, lectureResponses, tutorialSummary, geoscratchResults, lectureDrafts, userStudyMode, readLectureTimings])

  useEffect(() => {
    useWorkspaceStore.getState().setUserBlockScope(researchId ? `userstudy-Li-${researchId}` : null)
    return () => useWorkspaceStore.getState().setUserBlockScope(null)
  }, [researchId])

  function startNewSession() {
    exportEpoch.current += 1
    transitionEpoch.current += 1
    transitionLock.current = false
    setTransitionBusy(false)
    setTransitionError('')
    setRecoveryMessage('')
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
    setLectureDrafts({})
    setLectureExerciseNumber(1)
    setRecoveredReadOnly(false)
    setExportError('')
    setTimeUpMessage('')
    setPhase('demographics')
    if (userStudyMode) void setActiveStudySession(nextResearchId).catch(() => setExportError('Automatic refresh recovery could not be enabled on this device. Keep this tab open until your data is saved to Firebase.'))
    try {
      if (userStudyMode && STUDY_PERSISTENCE_ENABLED) window.localStorage.setItem(CURRENT_RESEARCH_ID_KEY, nextResearchId)
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
    const result = finishGeoScratch('timeout')
    setTimeUpMessage(`Time is up for ${exercise.heading || (exerciseIndex === 1 ? 'the cube rotation exercise' : 'the point-to-plane distance exercise')}. You have moved to the next question.`)
    void transitionTo(exerciseIndex < STUDY_EXERCISES.length - 1 ? { exerciseIndex: exerciseIndex + 1 }
      : { phase: nextStudyPhase(studyOrder, phase) },
    { geoscratchResults: result ? [...geoscratchResults.filter((item) => item.exerciseId !== result.exerciseId), result] : geoscratchResults })
  }

  function saveLectureAnswer(response) {
    if (!userStudyMode) return true
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
    return transitionTo({}, { lectureExerciseResponses: lectureResponsesRef.current })
  }

  function saveStudyQuestionnaire(payload, type, backupKey) {
    if (!userStudyMode) return
    const questionnaireId = phase === 'demographics' ? 'demographics' : phase === 'post'
      ? 'post-study' : phase === 'lecture-questionnaire' ? 'condition-lecture' : 'condition-geoscratch'
    const saved = markQuestionnaireSubmitted(researchId, questionnaireId, payload)
    const backupSaved = saveQuestionnairePayload(payload, type, backupKey)
    if (!saved || !backupSaved) setExportError('Some answers could not be backed up in browser storage. Keep this tab open, finish the study, and download the study ZIP before closing or refreshing.')
  }

  function followTutorial() {
    void transitionTo({ tutorialPhase: 'active', ...(userStudyMode ? { tutorialSummary: { status: 'started', skipSource: null } } : {}) })
  }

  function skipTutorial(source) {
    void transitionTo({ tutorialPhase: 'done', ...(userStudyMode ? { tutorialSummary: { status: tutorialPhase === 'active' ? 'skipped-after-start' : 'skipped', skipSource: source } } : {}) })
  }

  function finishTutorial() {
    void transitionTo({ tutorialPhase: 'done', ...(userStudyMode ? { tutorialSummary: { status: 'completed', skipSource: null } } : {}) })
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
      const remote = local?.snapshot ? null : await recoverFirebaseStudy(id, !automaticRecord)
      if (automaticRecord && !studyModeRef.current) return
      const snapshot = local?.snapshot ?? (remote ? (automaticRecord ? remote.snapshot : recoveredSession(remote, id)) : null)
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
      setResearchUploadStatus(readOnly ? snapshot.uploadStatus ?? null : null)
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
    if (!autoResume || researcherOnly || !userStudyMode || researchId) return
    let cancelled = false
    void readActiveStudySession().then(async (session) => {
      if (!cancelled && session) await recoverSession(session)
    }).catch(() => {
      if (!cancelled) setExportError('Automatic refresh recovery is unavailable on this device. Keep this tab open until your work is saved to Firebase.')
    }).finally(() => { if (!cancelled) setLoadingSession(false) })
    return () => { cancelled = true }
  // Restore once before presenting participant controls.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoResume, researcherOnly, userStudyMode])

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
          <p>{userStudyMode ? 'Your study progress is saved automatically. Please use the same browser if you need to return to this session.' : 'Developer preview: no timers, data recording, or ZIP downloads. You can move freely between steps.'}</p>
          {recoveryMessage && <p role="alert">{recoveryMessage}</p>}
          {recoveryMessage && <button type="button" onClick={() => { void readActiveStudySession().then((session) => session && recoverSession(session)) }}>Retry opening saved study</button>}
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
          {researcherAccount?.authorized && <ResearcherPendingUploads />}
          </>}
        </section>
      </div>
    )
  }

  if (phase === 'demographics') {
    return (
      <DemographicsQuestionnaire
        recordResponses={userStudyMode}
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
      recordAnswers={userStudyMode}
      allowPrevious={!userStudyMode}
      requireSubmission={userStudyMode} submittedExerciseIds={lectureResponses.filter((response) => typeof response.answer === 'string' && response.answer.trim()).map((response) => response.exerciseId)}
      timerEnabled={userStudyMode} timings={readLectureTimings()} onExerciseTimeout={expireLectureExercise} timeUpMessage={timeUpMessage}
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
        recordResponses={userStudyMode}
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
        recordResponses={userStudyMode}
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
          {researcherOnly && phase === 'recovered' && <p>{researchUploadStatus
            ? `${researchUploadStatus.allAcknowledged ? 'All expected records acknowledged' : 'Upload incomplete'} · ${researchUploadStatus.uploadedEventCount} interaction events acknowledged · ${researchUploadStatus.pendingItems} pending items at last checkpoint`
            : 'This older session has no upload completeness receipt.'}</p>}
          {userStudyMode || researcherOnly
            ? <p>The study ZIP contains a folder named by your research ID, with separate JSON files in study order. If the automatic download did not appear, use the button below.</p>
            : <p>Developer preview complete. No study data was recorded or downloaded.</p>}
          {storageWarning && <p role="alert">{storageWarning}</p>}
          <footer className="user-study-li-session-footer">
            {(userStudyMode || researcherOnly) && <button className="user-study-li-primary-action" type="button" onClick={() => { void downloadStudyData() }}>Download study data (ZIP)</button>}
            <button
              className="user-study-li-new-session-action"
              type="button"
              disabled={userStudyMode && !recoveredReadOnly && (interactionTracking.pending || Boolean(interactionTracking.error) || recoveryUploadPending)}
              onClick={researcherOnly ? () => { exportEpoch.current += 1; setResearchId(''); setPhase('new') } : startNewSession}
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

  const previewSteps = [{ phase: 'demographics' }, { phase: 'order' }, ...studySequence(studyOrder).flatMap((step) =>
    step === 'lecture' ? [1, 2].map((lectureExerciseNumber) => ({ phase: step, lectureExerciseNumber }))
      : step === 'geoscratch' ? STUDY_EXERCISES.map((_, exerciseIndex) => ({ phase: step, exerciseIndex })) : [{ phase: step }])]
  const previewIndex = previewSteps.findIndex((step) => step.phase === phase
    && (step.lectureExerciseNumber == null || step.lectureExerciseNumber === lectureExerciseNumber)
    && (step.exerciseIndex == null || step.exerciseIndex === exerciseIndex))
  const navigatePreview = (offset) => {
    const target = previewSteps[previewIndex + offset]
    if (!target) return
    if (target.phase === 'geoscratch') setTutorialPhase('done')
    transitionTo(target)
  }

  const developerPreview = !userStudyMode && !researcherOnly
  return <div className={developerPreview ? 'user-study-li-preview-shell' : undefined} style={developerPreview ? undefined : { display: 'contents' }}>
    {!userStudyMode && !researcherOnly && researchId && previewIndex >= 0 && <nav className="user-study-li-preview-nav" aria-label="Developer preview navigation">
      <span>Developer preview · Recording off</span>
      <button type="button" disabled={previewIndex === 0} onClick={() => navigatePreview(-1)}>Previous preview step</button>
      <button type="button" disabled={previewIndex === previewSteps.length - 1} onClick={() => navigatePreview(1)}>Next preview step</button>
    </nav>}
    {transitionBusy && <div className="user-study-li-saving-overlay" role="status" data-saving-transition="true">Saving your results before continuing…</div>}
    {userStudyMode && researchId && !recoveredReadOnly && !transitionBusy && (interactionTracking.error || firebaseSync.state === 'local-error' || localBackupError || transitionError) && <div className="user-study-li-cloud-status is-form" role="alert">
      {firebaseSync.state === 'local-error' && <p>This device could not back up your results. Keep this tab open and contact the researcher.</p>}
      {localBackupError && <p role="alert">{localBackupError}</p>}
      {interactionTracking.error && <p role="alert">{interactionTracking.error}</p>}
      {transitionError && <p role="alert">{transitionError}</p>}
    </div>}
    <div className={developerPreview ? 'user-study-li-preview-content' : undefined} style={developerPreview ? undefined : { display: 'contents' }} inert={transitionBusy || undefined}>{renderStudyContent()}</div>
  </div>
}
