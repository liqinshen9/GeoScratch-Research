export const STUDY_ORDERS = [
  { id: 'geoscratch-first', title: 'Condition 1: GeoScratch', conditions: ['geoscratch', 'lecture'] },
  { id: 'lecture-first', title: 'Condition 2: Lecture slides', conditions: ['lecture', 'geoscratch'] },
]

export function studySequence(orderId) {
  const order = STUDY_ORDERS.find(({ id }) => id === orderId)
  if (!order) return []
  return [...order.conditions.flatMap((condition) => [condition, `${condition}-questionnaire`]), 'post', 'complete']
}

export function nextStudyPhase(orderId, phase) {
  const sequence = studySequence(orderId)
  const index = sequence.indexOf(phase)
  return index < 0 ? sequence[0] : sequence[Math.min(index + 1, sequence.length - 1)]
}

export function conditionDetails(orderId, condition) {
  const order = STUDY_ORDERS.find(({ id }) => id === orderId)
  return {
    condition: condition === 'geoscratch' ? 'GeoScratch Exercise' : 'Lecture slides',
    conditionOrder: order?.conditions.indexOf(condition) === 0 ? 'First' : 'Second',
    studyOrder: orderId === 'geoscratch-first' ? 'GeoScratch Exercise first' : 'Lecture slides first',
  }
}
