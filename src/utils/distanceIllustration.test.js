// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest'
import THREE from '@/utils/three'
import { buildNormalVectorGlyph } from './distanceIllustration'

beforeAll(() => {
  const noop = () => {}
  const fakeContext = new Proxy(
    { fillStyle: '', canvas: null },
    { get: (target, key) => (key in target ? target[key] : noop) },
  )
  HTMLCanvasElement.prototype.getContext = () => fakeContext
})

describe('buildNormalVectorGlyph', () => {
  it('draws a dashed arrow from the supplied point at the requested length', () => {
    const origin = new THREE.Vector3(2, -1, 4)
    const { glyph, tip } = buildNormalVectorGlyph(THREE, {
      blockId: 'normal',
      origin,
      normal: new THREE.Vector3(0.5, 1, 0.5),
      length: 8,
      color: '#ef4444',
    })

    expect(glyph.userData.geoType).toBe('distance_normal_arrow')
    expect(glyph.userData.vectorOrigin.toArray()).toEqual(origin.toArray())
    expect(glyph.userData.vectorLength).toBeCloseTo(8)
    expect(tip.distanceTo(origin)).toBeCloseTo(8)
    let hasDashedMaterial = false
    let hasArrowhead = false
    glyph.traverse((child) => {
      if (child.material?.isLineDashedMaterial) hasDashedMaterial = true
      if (child.userData?.geoType === 'distance_normal_arrowhead') hasArrowhead = true
    })
    expect(hasDashedMaterial).toBe(true)
    expect(hasArrowhead).toBe(true)

    glyph.userData.setVectorLength(3)
    expect(glyph.userData.vectorLength).toBeCloseTo(3)
    expect(glyph.userData.vectorTip.distanceTo(origin)).toBeCloseTo(3)
  })
})
