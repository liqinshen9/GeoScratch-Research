import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Blockly from 'blockly/core'
import { useNavigate, useParams } from 'react-router-dom'
import THREE from '@/utils/three'
import BlocksCanvas from '@/components/BlocksCanvas/BlocksCanvas'
import Scene3D from '@/components/Scene3D/Scene3D'
import EditorColumnHeaders from '@/components/EditorShell/EditorColumnHeaders'
import ExerciseNavigation from './ExerciseNavigation'
import { ArrowLeft, ArrowRight, AllApplication, CheckOne } from '@icon-park/react'
import useSceneStore from '@/store/useSceneStore'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import useSettingsStore from '@/store/useSettingsStore'
import {
  getExercise,
  orderedExercises,
  getAdjacentExercises,
  getSectionForExercise,
} from '@/data/exercises'
import { getExerciseModule, hasExerciseModule } from '@/exercises'
import PerceptualQuestion from '@/exercises/shared/PerceptualQuestion'
import { fillSolution } from '@/exercises/shared/fillSolution'
import { markExerciseSolved, unmarkExerciseSolved } from '@/utils/exerciseProgress'
import { workspaceStudyContext } from '@/study/session/studyEvents'

import '@/components/EditorShell/editor-shell.css'
import './ExercisePage.css'

/** @param {number} n */
const fixed2 = (n) => n.toFixed(2)

/**
 * The pass/fail readout under the task list. Transform exercises show the
 * object's live pose (there is no single number to check); distance exercises
 * show the computed scalar.
 */
function AnswerCard({ result, className }) {
  const { answer, target } = result

  if (answer.type === 'position') {
    return (
      <div className={className}>
        <span>Current position:</span>
        <strong>
          {target
            ? `(${fixed2(target.position.x)}, ${fixed2(target.position.y)}, ${fixed2(target.position.z)})`
            : ''}
        </strong>
      </div>
    )
  }

  if (answer.type === 'scale' || answer.type === 'scaleAndRotation') {
    const euler = target ? new THREE.Euler().setFromQuaternion(target.quaternion, 'XYZ') : null
    const deg = (radians) => THREE.MathUtils.radToDeg(radians).toFixed(1)

    return (
      <div className={className}>
        <span>Current scale:</span>
        <strong>
          {target
            ? `(${fixed2(target.scale.x)}, ${fixed2(target.scale.y)}, ${fixed2(target.scale.z)})`
            : ''}
        </strong>
        {answer.type === 'scaleAndRotation' && (
          <>
            <span>Current rotation (X, Y, Z):</span>
            <strong>{euler ? `(${deg(euler.x)}°, ${deg(euler.y)}°, ${deg(euler.z)}°)` : ''}</strong>
          </>
        )}
      </div>
    )
  }

  return (
    <div className={className}>
      <span>Your answer:</span>
      <strong>{answer.value !== null ? Number(answer.value.toFixed(3)) : ''}</strong>
    </div>
  )
}

export default function ExercisePage({
  exerciseModule,
  exerciseId: fixedExerciseId,
  exerciseTitle,
  exerciseHeading,
  exerciseTimer,
  standalone = false,
  workspaceId,
  settingsOverrides,
  showAnswerHighlight = true,
  hideAnimationTransport = false,
  hiddenBlockTypes,
  showDebugSolution = true,
  wideTaskPanel = false,
  onPreviousExercise,
  onNextExercise,
  transformObjects,
  toggleLabelsOnLeftClick = false,
  onLabelsToggle,
  onPassedChange,
  onStepAction,
}) {
  const { objects, autoRender, setPendingObjects, setObjects } = useSceneStore()
  const { workspace, userBlocks } = useWorkspaceStore()
  const userStudyMode = useSettingsStore((s) => s.settings.userStudyMode)
  const setExerciseOverrides = useSettingsStore((s) => s.setExerciseOverrides)
  const clearExerciseOverrides = useSettingsStore((s) => s.clearExerciseOverrides)
  const navigate = useNavigate()
  const { exerciseId: routeExerciseId } = useParams()
  const [workspaceMaximized, setWorkspaceMaximized] = useState(false)
  const [perceptualPicked, setPerceptualPicked] = useState(null)
  const [stepFeedbackRevision, setStepFeedbackRevision] = useState(0)
  const clearWorkspaceRef = useRef(() => {})
  const editorShellRef = useRef(null)

  // The URL is the source of truth for which exercise is open;
  // /exercise with no param (or an unknown id) defaults to the first one.
  const requestedExerciseId = fixedExerciseId ?? routeExerciseId
  const registeredExercise = getExercise(requestedExerciseId)
  const routeOnlyExercise = hasExerciseModule(requestedExerciseId)
    ? getExerciseModule(requestedExerciseId)
    : null
  const baseExerciseConfig =
    exerciseModule ??
    registeredExercise ??
    (routeOnlyExercise
      ? {
          id: routeOnlyExercise.id,
          title: routeOnlyExercise.title,
          difficulty: null,
        }
      : orderedExercises()[0])
  const activeExerciseConfig = exerciseTitle
    ? { ...baseExerciseConfig, title: exerciseTitle }
    : baseExerciseConfig
  const activeExercise = activeExerciseConfig.id
  const exercise = exerciseModule ?? getExerciseModule(activeExercise)

  useEffect(() => {
    setStepFeedbackRevision((revision) => revision + 1)
    if (!workspace) return undefined

    const editableEvents = new Set([
      Blockly.Events.BLOCK_CHANGE,
      Blockly.Events.BLOCK_CREATE,
      Blockly.Events.BLOCK_DELETE,
      Blockly.Events.BLOCK_MOVE,
    ])
    const clearSubmittedFeedback = (event) => {
      if (editableEvents.has(event?.type)) {
        setStepFeedbackRevision((revision) => revision + 1)
      }
    }
    workspace.addChangeListener(clearSubmittedFeedback)
    return () => workspace.removeChangeListener(clearSubmittedFeedback)
  }, [activeExercise, workspace])

  const { previous: previousExercise, next: nextExercise } = getAdjacentExercises(activeExercise)
  const placement = getSectionForExercise(activeExercise)
  const unit = placement?.unit

  // Everything the page needs to know about progress comes from one call into
  // the exercise's own checker.
  const result = exercise.evaluate({ objects, workspace, userBlocks })
  const answerCardClass = `exercise-answer-card${result.correct ? ' is-correct' : ''}${
    result.incorrect ? ' is-incorrect' : ''
  }`

  // Perceptual exercises have no checker pass -- a correct MCQ pick is the pass.
  const isPerceptual = exercise.kind === 'perceptual'
  const passed = result.passed || (isPerceptual && perceptualPicked === exercise.mcq?.correctId)
  useEffect(() => { onPassedChange?.(Boolean(passed)) }, [passed, onPassedChange])
  const studyEvaluation = JSON.stringify({ exerciseId: activeExercise, passed: Boolean(passed),
    correct: Boolean(result.correct), incorrect: Boolean(result.incorrect), steps: result.steps ?? null,
    answer: result.answer ?? null })
  useEffect(() => {
    if (workspaceStudyContext(workspaceId)) {
      window.dispatchEvent(new CustomEvent('geoscratch:exercise-evaluation', { detail: JSON.parse(studyEvaluation) }))
    }
  }, [workspaceId, studyEvaluation])

  // Mirror the solve state into localStorage so the exercise browser shows
  // progress. A pass records it. It comes back off once we've seen this
  // exercise pass on this visit and it then stops passing -- so editing a
  // solved workspace so it no longer works un-ticks it, while merely opening it
  // (empty/still-restoring, never passed yet this visit) leaves the tick alone.
  const sawPassThisVisit = useRef(false)
  useEffect(() => {
    sawPassThisVisit.current = false
  }, [activeExercise])
  useEffect(() => {
    if (passed) {
      sawPassThisVisit.current = true
      markExerciseSolved(activeExercise)
    } else if (sawPassThisVisit.current || (isPerceptual && perceptualPicked != null)) {
      unmarkExerciseSolved(activeExercise)
    }
  }, [passed, activeExercise, isPerceptual, perceptualPicked])

  const handleSelectExercise = useCallback(
    (id) => {
      navigate(`/exercise/${id}`)
      setWorkspaceMaximized(false)
      setPendingObjects([])
      setObjects([])
    },
    [navigate, setObjects, setPendingObjects],
  )

  const handleWorkspaceMaximizedChange = useCallback((maximized) => {
    const shell = editorShellRef.current
    if (maximized && shell) {
      const headerHeight = shell.querySelector('.editor-header-row')?.getBoundingClientRect().height
      if (headerHeight) shell.style.setProperty('--exercise-header-height', `${headerHeight}px`)
    }
    setWorkspaceMaximized(maximized)
  }, [])

  // Clear a stale MCQ pick when moving between exercises.
  useEffect(() => {
    setPerceptualPicked(null)
  }, [activeExercise])

  // Sets up starter blocks for exercises that have seedWorkspace
  useEffect(() => {
    if (exercise.seedWorkspace && workspace && workspace.rendered) {
      exercise.seedWorkspace(workspace)
    }
  }, [exercise, workspace])

  // An exercise can force certain settings while it is open (its
  // settingsOverrides export); reverted when the student leaves or switches.
  useEffect(() => {
    setExerciseOverrides({ ...exercise.settingsOverrides, ...settingsOverrides })
    return () => clearExerciseOverrides()
  }, [exercise, settingsOverrides, setExerciseOverrides, clearExerciseOverrides])

  const handleObjectsChange = useCallback(
    (objs) => {
      const exerciseObjects = exercise.decorateObjects
        ? exercise.decorateObjects(objs, workspace)
        : objs
      const finalObjects = transformObjects?.(exerciseObjects) ?? exerciseObjects
      setPendingObjects(finalObjects)
      if (autoRender) setObjects(finalObjects)
    },
    [exercise, autoRender, setPendingObjects, setObjects, transformObjects, workspace],
  )

  // The exercise names the object holding its answer; the scene glows it green
  // or red. `correct` is the value being right, which is deliberately not the
  // same as `passed` -- that additionally requires the working to be built.
  const answerHighlight = useMemo(
    () => ({
      target: result.target,
      state: result.correct ? 'correct' : result.incorrect ? 'incorrect' : null,
    }),
    [result.target, result.correct, result.incorrect],
  )

  const { Givens, Steps } = exercise

  return (
    <div
      className={`exercise-page exercise-page--editor${
        wideTaskPanel ? ' exercise-page--wide-task-panel' : ''
      }`}
      data-exercise-id={activeExercise}
    >
      <main
        ref={editorShellRef}
        className={`editor-shell editor-shell--with-leading exercise-editor-shell${
          workspaceMaximized ? ' editor-shell--maximized' : ''
        }`}
      >
        <EditorColumnHeaders
          leadingHeader={
            <div className="exercise-column-heading">
              <h2>{exerciseHeading ?? (exercise.kind === 'tutorial' ? 'Tutorial' : 'Exercise')}</h2>
              {onPreviousExercise || onNextExercise ? (
                <ExerciseNavigation onPrevious={onPreviousExercise} onNext={onNextExercise}
                  studyMode={userStudyMode} passed={passed} />
              ) : !standalone ? (
                <div className="exercise-column-heading__nav" aria-label="Exercise navigation">
                  <button
                    type="button"
                    className="exercise-nav-button exercise-nav-button--wide"
                    onClick={() => navigate(unit ? `/exercises/${unit.id}` : '/exercises')}
                    title="Browse all exercises"
                    aria-label="Browse all exercises"
                  >
                    <AllApplication
                      theme="outline"
                      size="13"
                      fill="currentColor"
                      aria-hidden="true"
                    />
                    <span>Browse</span>
                  </button>
                  <button
                    type="button"
                    className="exercise-nav-button"
                    onClick={() => !userStudyMode && previousExercise && handleSelectExercise(previousExercise.id)}
                    disabled={userStudyMode || !previousExercise}
                    title="Previous exercise"
                    aria-label="Previous exercise"
                  >
                    <ArrowLeft theme="outline" size="13" fill="currentColor" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="exercise-nav-button"
                    onClick={() => (!userStudyMode || passed) && nextExercise && handleSelectExercise(nextExercise.id)}
                    disabled={!nextExercise || (userStudyMode && !passed)}
                    title="Next exercise"
                    aria-label="Next exercise"
                  >
                    <ArrowRight theme="outline" size="13" fill="currentColor" aria-hidden="true" />
                  </button>
                </div>
              ) : null}
            </div>
          }
          workspace={workspace}
          sceneHeaderContent={exerciseTimer}
          workspaceMaximized={workspaceMaximized}
          preserveColumns
          hideAnimationTransport={hideAnimationTransport}
          onWorkspaceMaximizedChange={handleWorkspaceMaximizedChange}
          onClearWorkspace={() => clearWorkspaceRef.current()}
        />

        <div className="editor-body-row">
          <aside
            className={`exercise-task-panel${passed ? ' is-passed' : ''}`}
            aria-hidden={workspaceMaximized}
          >
            <div className="exercise-task-panel__top">
              {placement && !standalone && (
                <p className="exercise-task-panel__crumb">
                  {placement.unit.title} · {placement.section.title}
                </p>
              )}
              <h1>
                <strong>{activeExerciseConfig.title}</strong>
              </h1>
            </div>

            <Givens />
            {isPerceptual && exercise.mcq && (
              <PerceptualQuestion mcq={exercise.mcq} onPickedChange={setPerceptualPicked} />
            )}
            <Steps
              steps={result.steps}
              partialSteps={result.partialSteps}
              partialMessages={result.partialMessages}
              feedback={result.feedback}
              feedbackRevision={stepFeedbackRevision}
              passed={passed}
              onStepAction={onStepAction}
            />
            {!isPerceptual && !exercise.hideAnswerCard && (
              <AnswerCard result={result} className={answerCardClass} />
            )}
            {exercise.AnimationButton ? (
              <div className={`exercise-completion-row${passed ? ' is-passed' : ''}`}>
                {passed && (
                  <div className="exercise-pass-banner" role="status">
                    <CheckOne theme="filled" size="18" fill="currentColor" aria-hidden="true" />
                    <span>Passed</span>
                  </div>
                )}
                <exercise.AnimationButton objects={objects} workspace={workspace} />
              </div>
            ) : (
              passed && (
                <div className="exercise-pass-banner" role="status">
                  <CheckOne theme="filled" size="18" fill="currentColor" aria-hidden="true" />
                  <span>Passed</span>
                </div>
              )
            )}
            {/* Dev only: import.meta.env.DEV is false in the study build, so
                  the control is compiled out rather than merely hidden. */}
            {showDebugSolution && import.meta.env?.DEV && exercise.solutionXml && (
              <button
                type="button"
                className="exercise-debug-fill"
                onClick={() =>
                  fillSolution(workspace, exercise.solutionXml, exercise.seedWorkspace)
                }
              >
                Fill solution (dev)
              </button>
            )}
          </aside>

          <BlocksCanvas
            key={workspaceId ?? `exercise-${activeExercise}`}
            id={workspaceId ?? `exercise-${activeExercise}`}
            workspaceMaximized={workspaceMaximized}
            preserveColumns
            hiddenBlockTypes={hiddenBlockTypes}
            reusableBlockTemplate={
              exercise.getReusableBlockTemplate?.({ workspace, result }) ??
              (result.passed ? exercise.reusableBlockTemplate : null)
            }
            onObjectsChange={handleObjectsChange}
            onRegisterClear={(fn) => {
              clearWorkspaceRef.current = fn
            }}
          />
          <Scene3D
            cameraPosition={exercise.cameraPosition}
            objects={objects}
            answer={showAnswerHighlight ? answerHighlight : undefined}
            toggleLabelsOnLeftClick={toggleLabelsOnLeftClick}
            onLabelsToggle={onLabelsToggle}
          />
        </div>
      </main>
    </div>
  )
}
