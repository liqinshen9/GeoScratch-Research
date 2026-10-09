import THREE from '@/utils/three'

export function buildNormalPlaneRightAngle(origin, normal, color, size = 0.38) {
  const normalUnit = normal.lengthSq() > 1e-12
    ? normal.clone().normalize() : new THREE.Vector3(0, 1, 0)
  const tangent = Math.abs(normalUnit.y) < 0.9
    ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
  tangent.addScaledVector(normalUnit, -tangent.dot(normalUnit)).normalize()
  const marker = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      origin.clone().addScaledVector(normalUnit, size),
      origin.clone().addScaledVector(normalUnit, size).addScaledVector(tangent, size),
      origin.clone().addScaledVector(tangent, size),
    ]),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false }),
  )
  marker.renderOrder = 22
  marker.userData.geoType = 'normal_plane_right_angle'
  return marker
}
