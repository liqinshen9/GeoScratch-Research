const stages = {
  demographics: 'Demographics questionnaire',
  'lecture-exercise-1': 'Lecture exercise 1 answers',
  'lecture-exercise-2': 'Lecture exercise 2 answers',
  'condition-1': 'First condition questionnaire',
  'condition-2': 'Second condition questionnaire',
  'geoscratch-trial': 'GeoScratch trial result',
  'geoscratch-exercise-1': 'GeoScratch rotation result',
  'geoscratch-exercise-2': 'GeoScratch point-to-plane result',
  'post-study': 'Post-study questionnaire',
}
const exercises = {
  'create-complex-object': 'Trial exercise',
  'cube-point-pivot-rotation': 'Cube rotation exercise',
  'point-plane-distance': 'Point-to-plane exercise',
}
export function pendingUploadDetails(entries, hasSession = true) {
  const labels = hasSession ? [] : ['Study session registration']
  const logs = new Map()
  for (const entry of entries) {
    if (entry.kind === 'record') labels.push(stages[entry.id] ?? entry.id)
    else if (entry.kind === 'recovery') labels.push('Study progress checkpoint')
    else if (entry.kind === 'event' || entry.kind === 'chunk') {
      const exercise = exercises[entry.data.exerciseId] ?? entry.data.exerciseId
      logs.set(exercise, (logs.get(exercise) ?? 0) + (entry.kind === 'event' ? 1 : entry.data.eventCount ?? entry.data.count))
    }
  }
  for (const [exercise, count] of logs) labels.push(`${exercise} interaction log (${count} events)`)
  return labels
}
