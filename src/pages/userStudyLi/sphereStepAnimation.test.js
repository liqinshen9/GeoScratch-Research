import { describe, expect, it } from 'vitest'
import THREE from '@/utils/three'
import { createSphereStepAnimation } from './sphereStepAnimation'

describe('tutorial 3D step replay', () => {
  it('reveals head, left ear and right ear in order at the specified positions', () => {
    const preview = createSphereStepAnimation([])
    preview.userData.animateSteps(0)
    expect(preview.children.map((sphere) => sphere.visible)).toEqual([false, false, false])
    preview.userData.animateSteps(0.3)
    expect(preview.children.map((sphere) => sphere.visible)).toEqual([true, false, false])
    preview.userData.animateSteps(0.6)
    expect(preview.children.map((sphere) => sphere.visible)).toEqual([true, true, false])
    preview.userData.animateSteps(0.9)
    expect(preview.children.map((sphere) => sphere.visible)).toEqual([true, true, true])
    expect(preview.children.map((sphere) => sphere.position.toArray())).toEqual([[0, 2, 0], [-2, 4, 0], [2, 4, 0]])
  })
  it('restores the student scene after playback and supports replaying again', () => {
    const visible = new THREE.Group()
    const hidden = new THREE.Group()
    hidden.visible = false
    const preview = createSphereStepAnimation([visible, hidden])
    for (let replay = 0; replay < 2; replay++) {
      preview.userData.animateSteps(0.3)
      expect(visible.visible).toBe(false)
      preview.userData.animateSteps(1)
      expect(preview.visible).toBe(false)
      expect(visible.visible).toBe(true)
      expect(hidden.visible).toBe(false)
    }
  })
})
