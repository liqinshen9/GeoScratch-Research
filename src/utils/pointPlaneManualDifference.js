// The point-plane exercise accepts components copied from two-decimal labels.
export function isPointPlaneManualDifference(vector, q) {
  if (!vector || !q || ![vector.x, vector.y, vector.z, q.x, q.y, q.z].every(Number.isFinite)) return false
  if (Math.abs(0.5 * q.x + q.y + 0.5 * q.z + 1.5) > 0.010000001) return false
  if (Math.abs(q.x + 5) <= 1e-5 && Math.abs(q.y) <= 1e-5 && Math.abs(q.z - 2) <= 1e-5) return false
  return Math.abs(vector.x - (-9 - q.x)) <= 0.005000001
    && Math.abs(vector.y - (8 - q.y)) <= 0.005000001
    && Math.abs(vector.z - (7 - q.z)) <= 0.005000001
}
