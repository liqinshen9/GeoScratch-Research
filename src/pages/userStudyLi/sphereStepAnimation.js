import THREE from '@/utils/three'
import { TUTORIAL_SPHERES } from './tutorialProgress'

export function createSphereStepAnimation(objects) {
  const preview = new THREE.Group()
  preview.visible = false
  preview.userData.tutorialPreview = true
  for (const spec of TUTORIAL_SPHERES) {
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(spec.radius, 32, 24),
      new THREE.MeshStandardMaterial({ color: '#111111' }),
    )
    sphere.position.set(...spec.centre)
    preview.add(sphere)
  }
  let originalVisibility = null
  preview.userData.animateSteps = (progress, ease = (value) => value) => {
    if (progress >= 1) {
      preview.visible = false
      if (originalVisibility) objects.forEach((object, index) => { object.visible = originalVisibility[index] })
      originalVisibility = null
      return
    }
    if (!originalVisibility) originalVisibility = objects.map((object) => object.visible)
    objects.forEach((object) => { object.visible = false })
    preview.visible = true
    const stage = Math.max(0, progress) * 3
    preview.children.forEach((sphere, index) => {
      // Each sphere appears, then stays still while the next step plays.
      const amount = Math.min(1, Math.max(0, (stage - index) / 0.45))
      sphere.visible = amount > 0
      sphere.scale.setScalar(ease(amount))
    })
  }
  preview.userData.animateSteps.durationScale = 4
  return preview
}
