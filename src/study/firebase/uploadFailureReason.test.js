import { expect, it } from 'vitest'
import { uploadFailureReason } from './uploadFailureReason'
it.each([
  ['resource-exhausted', 'Quota:'], ['auth/network-request-failed', 'Network:'], ['unavailable', 'Network:'],
  ['permission-denied', 'Access:'], ['auth/invalid-api-key', 'Configuration:'],
  ['invalid-argument', 'Data or request:'], ['unknown-error', 'Other upload error'],
  ['upload-unconfirmed', 'failure has not been confirmed'],
])('explains %s without treating quota or access failures as network failures', (code, reason) => {
  expect(uploadFailureReason(code)).toContain(reason)
})
