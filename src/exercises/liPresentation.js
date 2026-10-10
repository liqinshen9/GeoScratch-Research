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
export const HIDDEN_BLOCK_TYPES = ['geo_object_with_point']

export const SETTINGS = Object.freeze({
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

export function styleStudyPoints(objects) {
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
