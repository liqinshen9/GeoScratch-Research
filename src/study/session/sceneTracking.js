import THREE from '@/utils/three'
import { resolveSrcBlockId } from '@/utils/scenePicking'

export function describeSceneHit(hit, getLabels = () => []) {
  if (!hit) return null
  let owner = hit.object
  for (let node = hit.object; node; node = node.parent) {
    if (node.userData?.geoType || getLabels(node).length) { owner = node; break }
  }
  const labels = getLabels(owner).map(({ name, value, text, anchor }) => ({
    ...(name != null ? { name } : {}), ...(value != null ? { value } : {}),
    ...(text != null ? { text } : {}), ...(anchor != null ? { anchor } : {}),
  }))
  const point = owner.userData?.point
  return {
    objectId: owner.uuid, objectName: owner.name || null, objectType: owner.type,
    geoType: owner.userData?.geoType ?? null, sourceBlockId: resolveSrcBlockId(hit.object), labels,
    worldPosition: owner.getWorldPosition(new THREE.Vector3()).toArray(),
    ...(point?.isVector3 ? { pointCoordinates: point.toArray() } : {}),
    hitPosition: hit.point?.toArray() ?? null,
  }
}

export function describeCamera(camera, controls) {
  return camera ? { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(),
    zoom: camera.zoom, target: controls?.target?.toArray() ?? null } : null
}
