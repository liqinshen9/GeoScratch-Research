export function uploadFailureReason(code = '') {
  if (code === 'offline') return 'Network: this browser is offline.'
  if (code === 'upload-unconfirmed') return 'The upload is still awaiting confirmation; a failure has not been confirmed.'
  if (/resource-exhausted|quota-exceeded/.test(code)) return 'Quota: Firebase has reached a usage limit.'
  if (/network-request-failed|unavailable|deadline-exceeded/.test(code)) return 'Network: the connection to Firebase failed or timed out.'
  if (/invalid-api-key|configuration-not-found|operation-not-allowed/.test(code)) return 'Configuration: Firebase is not configured to accept this request.'
  if (/permission-denied|unauthenticated|^auth\//.test(code)) return 'Access: Firebase authentication or permissions prevented the upload.'
  if (/invalid-argument|failed-precondition|out-of-range/.test(code)) return 'Data or request: Firebase rejected the uploaded data or request.'
  return 'Other upload error. See the error code and message below.'
}
