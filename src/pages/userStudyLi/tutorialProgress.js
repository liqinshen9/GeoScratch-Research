import THREE from '@/utils/three'
import { isSphereBlock, getInputBlock, closeNumber } from '@/exercises/shared/blockQueries'

export const TUTORIAL_SPHERES = [
  { key: 'head', name: 'Head', radius: 2, centre: [0, 2, 0] },
  { key: 'left', name: 'Left ear', radius: 1, centre: [-2, 4, 0] },
  { key: 'right', name: 'Right ear', radius: 1, centre: [2, 4, 0] },
]

export function tutorialProgress(workspace, createOpen = false) {
  const spheres = workspace?.getBlocksByType('geo_sphere', false) ?? []
  const matches = Object.fromEntries(TUTORIAL_SPHERES.map((spec) => [spec.key,
    spheres.find((block) => getInputBlock(block, 'RADIUS_INPUT')?.type === 'scalar'
      && getInputBlock(block, 'CENTRE')?.type === 'linalg_point'
      && isSphereBlock(block, new THREE.Vector3(...spec.centre), spec.radius)),
  ]))
  const completed = Object.keys(matches).filter((key) => matches[key])
  const part = TUTORIAL_SPHERES.find((spec) => !matches[spec.key])
  const assigned = new Set(Object.values(matches).filter(Boolean))
  const head = spheres.find((block) => !assigned.has(block))
  const scalar = workspace?.getBlocksByType('scalar', false).find((block) => !block.getParent?.())
  const point = workspace?.getBlocksByType('linalg_point', false).find((block) => !block.getParent?.())
  const state = { head, scalar, point, completed, part }
  if (completed.length === 3) return { stage: 'done', head, completed }
  if (!head) return { ...state, stage: createOpen ? 'sphere' : 'open' }
  if (getInputBlock(head, 'RADIUS_INPUT')?.type !== 'scalar') return { ...state, stage: scalar ? 'radius' : createOpen ? 'scalar' : 'open' }
  if (getInputBlock(head, 'CENTRE')?.type !== 'linalg_point') return { ...state, stage: point ? 'centre' : createOpen ? 'point' : 'open' }
  const radius = getInputBlock(head, 'RADIUS_INPUT')
  const centre = getInputBlock(head, 'CENTRE')
  if (!closeNumber(radius.getFieldValue('scalar'), part.radius)) {
    return { ...state, stage: 'values', fieldBlock: radius, fieldName: 'scalar', expectedValue: part.radius, fieldLabel: 'radius' }
  }
  for (const [index, fieldName] of ['X', 'Y', 'Z'].entries()) {
    if (!closeNumber(centre.getFieldValue(fieldName), part.centre[index])) {
      return { ...state, stage: 'values', fieldBlock: centre, fieldName, expectedValue: part.centre[index], fieldLabel: `centre ${fieldName.toLowerCase()}` }
    }
  }
  return { ...state, stage: 'values' }
}
