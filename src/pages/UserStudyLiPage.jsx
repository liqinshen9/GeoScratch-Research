import { useState } from 'react'
import useThemeSync from '@/hooks/useThemeSync'
import ExercisePage from '@/pages/ExercisePage'

const STUDY_EXERCISES = ['cube-point-pivot-rotation', 'point-plane-distance']

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
  const exerciseId = STUDY_EXERCISES[exerciseIndex]

  return (
    <div className="app-container flex h-dvh flex-col overflow-hidden">
      <main className="flex min-h-0 flex-1 flex-col">
        <ExercisePage
          key={exerciseId}
          exerciseId={exerciseId}
          standalone
          workspaceId={`userstudy-Li-${exerciseId}`}
          settingsOverrides={SETTINGS}
          showAnswerHighlight={false}
          hideAnimationTransport
          hiddenBlockTypes={HIDDEN_BLOCK_TYPES}
          trackingEnabled={false}
          workspaceCloudSyncEnabled={false}
          showDebugSolution={false}
          wideTaskPanel
          onPreviousExercise={
            exerciseIndex > 0 ? () => setExerciseIndex((index) => index - 1) : undefined
          }
          onNextExercise={
            exerciseIndex < STUDY_EXERCISES.length - 1
              ? () => setExerciseIndex((index) => index + 1)
              : undefined
          }
          transformObjects={styleStudyPoints}
          toggleLabelsOnLeftClick
        />
      </main>
    </div>
  )
}
