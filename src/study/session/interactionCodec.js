import { gzipSync, gunzipSync, strToU8, strFromU8 } from 'fflate'

const clone = (value) => JSON.parse(JSON.stringify(value))
export function workspaceChanges(before, after, path = []) {
  if (JSON.stringify(before) === JSON.stringify(after)) return []
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object'
    || Array.isArray(before) !== Array.isArray(after)) return [{ path, value: after }]
  const changes = []
  for (const key of Object.keys(after)) changes.push(...workspaceChanges(before[key], after[key], [...path, key]))
  // Remove array entries from the end so indices keep their meaning.
  for (const key of Object.keys(before).reverse()) {
    if (!(key in after)) changes.push({ path: [...path, key], remove: true })
  }
  return changes
}

export function applyWorkspaceChanges(snapshot, changes) {
  let result = clone(snapshot)
  for (const change of changes) {
    if (!change.path.length) { result = clone(change.value); continue }
    const key = change.path.at(-1)
    const parent = change.path.slice(0, -1).reduce((object, part) => object[part], result)
    if (change.remove) {
      if (Array.isArray(parent)) parent.splice(Number(key), 1)
      else delete parent[key]
    } else parent[key] = clone(change.value)
  }
  return result
}

// Checkpoints remain complete. Between them, store exact JSON changes, not
// another complete Blockly workspace and custom-block library for every edit.
export function compactInteraction(event, states) {
  const key = `${event.streamId}:${event.exerciseId}`
  const before = states.get(key)
  if (!event.snapshot) return event
  const snapshot = clone(event.snapshot)
  const count = (before?.count ?? 0) + 1
  states.set(key, { snapshot, count, eventId: event.eventId })
  const boundary = event.type !== 'workspace_snapshot' || !event.reason?.startsWith('after-') || count % 25 === 0
  if (!before || boundary) return { ...event, schemaVersion: 3 }
  const { snapshot: _snapshot, ...details } = event
  void _snapshot
  return { ...details, schemaVersion: 3, type: 'workspace_patch', baseSnapshotEventId: before.eventId,
    workspaceChanges: workspaceChanges(before.snapshot, snapshot) }
}

// Expand for existing research analysis/export consumers. The stored format is
// compact, but every patch can still expose the exact nested workspace state.
export function expandInteractionSnapshots(events) {
  const states = new Map()
  return events.map((event) => {
    const key = `${event.streamId}:${event.exerciseId}`
    if (event.snapshot) states.set(key, { snapshot: event.snapshot, eventId: event.eventId })
    else if (event.type === 'workspace_patch') {
      const before = states.get(key)
      if (!before || before.eventId !== event.baseSnapshotEventId) throw new Error('Interaction history has a missing workspace checkpoint or change.')
      const snapshot = applyWorkspaceChanges(before.snapshot, event.workspaceChanges)
      states.set(key, { snapshot, eventId: event.eventId })
      return { ...event, snapshot }
    }
    return event
  })
}

export function encodeInteractionChunk(events) {
  const bytes = gzipSync(strToU8(JSON.stringify(events)), { level: 1 })
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return { encoding: 'gzip-base64-v1', count: events.length, data: btoa(binary) }
}
export function decodeInteractionChunk(payload) {
  if (payload.encoding !== 'gzip-base64-v1') return [payload]
  const bytes = Uint8Array.from(atob(payload.data), (char) => char.charCodeAt(0))
  const events = JSON.parse(strFromU8(gunzipSync(bytes)))
  if (events.length !== payload.count) throw new Error('Interaction chunk is incomplete.')
  return events
}
