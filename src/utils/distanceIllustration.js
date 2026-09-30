import { createPointMarker } from '@/utils/pointMarker'

// The picture drawn for a point-to-plane distance: the plane's normal, a dashed
// guide along the plane, and a right angle where the perpendicular meets it.
//
// It lived in three places -- vector_project, point_plane_distance and the dot
// product's codegen -- and they drifted. Two still anchored the perpendicular at
// the wrong point after the third was fixed, and the dot product's copy kept
// references to variables a migration had deleted, so its distance branch threw
// at runtime. One copy, published to builders as window.buildDistanceIllustration.
//
// Colours arrive as arguments rather than being looked up here: importing the
// colour system pulls in @material/material-color-utilities, which does not
// resolve under vitest, and every caller already has window.GeoScratchColors.
//
// See docs/architecture/animation.md and selection-and-picking.md.

const GUIDE_DASH = { dashSize: 0.14, gapSize: 0.1, transparent: true, opacity: 0.82 }

/** Draws the long dashed normal used by the point-to-plane construction. */
export function buildNormalVectorGlyph(
  THREE,
  { blockId, origin, normal, length, color, store = null },
) {
  const normalUnit =
    normal.lengthSq() > 1e-12 ? normal.clone().normalize() : new THREE.Vector3(0, 1, 0)
  const forwardLength = Math.max(0, length)
  const normalTip = origin.clone().addScaledVector(normalUnit, forwardLength)
  const authoredHeadLength = Math.min(0.34, forwardLength)
  const shaftTip = normalTip.clone().addScaledVector(normalUnit, -authoredHeadLength)
  const glyph = new THREE.Group()

  const shaft = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([origin.clone(), shaftTip]),
    new THREE.LineDashedMaterial({
      color,
      dashSize: 0.28,
      gapSize: 0.18,
      transparent: true,
      opacity: 0.95,
    }),
  )
  shaft.computeLineDistances()
  shaft.userData.geoType = 'distance_normal_shaft'
  shaft.userData.srcBlockId = blockId
  glyph.add(shaft)

  let head = null
  if (authoredHeadLength > 0) {
    const headRadius = 0.12
    const headGeometry = new THREE.ConeGeometry(headRadius, authoredHeadLength, 12)
    headGeometry.translate(0, -authoredHeadLength / 2, 0)
    head = new THREE.Mesh(headGeometry, new THREE.MeshBasicMaterial({ color }))
    head.position.copy(normalTip)
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalUnit)
    head.userData.zoomInvariantRadius = headRadius
    head.userData.thickenGroup = 'vector'
    head.userData.geoType = 'distance_normal_arrowhead'
    head.userData.srcBlockId = blockId
    glyph.add(head)
  }

  glyph.userData.geoType = 'distance_normal_arrow'
  glyph.userData.srcBlockId = blockId
  glyph.userData.vectorOrigin = origin.clone()
  glyph.userData.vectorTip = normalTip.clone()
  glyph.userData.vectorLength = forwardLength
  glyph.userData.setVectorLength = (nextLength) => {
    const visibleLength = Math.max(0, Math.min(forwardLength, Number(nextLength) || 0))
    const visibleHeadLength = Math.min(authoredHeadLength, visibleLength)
    const visibleTip = origin.clone().addScaledVector(normalUnit, visibleLength)
    const visibleShaftTip = visibleTip.clone().addScaledVector(normalUnit, -visibleHeadLength)
    shaft.geometry.setFromPoints([origin.clone(), visibleShaftTip])
    shaft.computeLineDistances()
    if (head) {
      head.position.copy(visibleTip)
      head.visible = visibleLength >= authoredHeadLength
    }
    glyph.userData.vectorTip = visibleTip
    glyph.userData.vectorLength = visibleLength
    const labelAnchor = glyph.userData.labelAnchors?.normal
    if (labelAnchor) labelAnchor.position = visibleTip.toArray()
  }
  if (store) store[`${blockId}_normal`] = glyph

  return { glyph, tip: normalTip }
}

/**
 * @param {object} THREE            The augmented THREE the caller is using.
 * @param {object} opts
 * @param {string} opts.blockId     Owning block, for srcBlockId and store keys.
 * @param {object} opts.foot        Vector3 where the perpendicular meets the plane.
 * @param {object} opts.normal      Vector3 plane normal; its magnitude is drawn.
 * @param {object} [opts.guideTo]   Vector3 the dashed guide runs to along the
 *   plane. Omitted, or coincident with the foot, draws no guide.
 * @param {number} opts.distanceLength  The distance itself, for marker sizing.
 * @param {string|number} opts.normalColor
 * @param {string|number} opts.accentColor   Guide line and right-angle marker.
 * @param {string|number} [opts.footDotColor]
 * @param {boolean} [opts.footDot]  Mark the foot with a dot.
 * @param {object} [opts.store]     threeObjStore, to register the normal glyph.
 * @returns {{group: object, guideLine: object|null, rightAngle: object, normalGlyph: object, normalTip: object}}
 */
export function buildDistanceIllustration(
  THREE,
  {
    blockId,
    foot,
    normal,
    guideTo,
    distanceLength,
    normalColor,
    accentColor,
    footDotColor,
    footDot = false,
    store = null,
  },
) {
  const group = new THREE.Group()
  const normalUnit =
    normal.lengthSq() > 1e-12 ? normal.clone().normalize() : new THREE.Vector3(0, 1, 0)
  const accent = accentColor

  // A direction along the plane, toward whatever the guide points at. Used for
  // the right angle's arm.
  const tangent = (guideTo ? guideTo.clone().sub(foot) : new THREE.Vector3()).clone()
  tangent.addScaledVector(normalUnit, -tangent.dot(normalUnit))
  if (tangent.lengthSq() < 1e-10) {
    tangent.set(1, 0, 0)
    tangent.addScaledVector(normalUnit, -tangent.dot(normalUnit))
    if (tangent.lengthSq() < 1e-10) tangent.set(0, 0, 1)
  }
  tangent.normalize()

  // Draw n as a deliberately tall red vector so its direction is unmistakable.
  const forwardLength = Math.max(8, Math.abs(distanceLength) + 5)
  const { glyph: normalGlyph, tip: normalTip } = buildNormalVectorGlyph(THREE, {
    blockId,
    origin: foot,
    normal,
    length: forwardLength,
    color: normalColor,
    store,
  })
  group.add(normalGlyph)

  let guideLine = null
  if (guideTo && guideTo.distanceToSquared(foot) > 1e-10) {
    guideLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([foot.clone(), guideTo.clone()]),
      new THREE.LineDashedMaterial({ color: accent, ...GUIDE_DASH }),
    )
    guideLine.computeLineDistances()
    guideLine.userData.geoType = 'geo_helper'
    guideLine.userData.srcBlockId = blockId
    group.add(guideLine)
  }

  const markerSize = Math.min(0.42, Math.max(0.18, Math.abs(distanceLength) * 0.16))
  const rightAngle = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      foot.clone().addScaledVector(normalUnit, markerSize),
      foot.clone().addScaledVector(normalUnit, markerSize).addScaledVector(tangent, markerSize),
      foot.clone().addScaledVector(tangent, markerSize),
    ]),
    new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.9 }),
  )
  rightAngle.userData.geoType = 'geo_helper'
  rightAngle.userData.srcBlockId = blockId
  group.add(rightAngle)

  if (footDot) {
    const dot = createPointMarker({ color: footDotColor ?? accentColor, radius: 0.04 })
    dot.position.copy(foot)
    group.add(dot)
  }

  group.userData.geoType = 'distance_projection_illustration'
  group.userData.srcBlockId = blockId
  // The Q sweep redraws this each frame as Q moves.
  group.userData.guideLine = guideLine
  group.userData.tangent = tangent
  group.userData.rightAngle = rightAngle
  group.userData.rightAngleSize = markerSize

  return { group, guideLine, rightAngle, normalGlyph, normalTip }
}

export default buildDistanceIllustration
