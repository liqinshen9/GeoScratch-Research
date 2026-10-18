import { uploadFailureReason } from '@/study/firebase/uploadFailureReason'

export default function StudyUploadNotice({ researchId, warning, state, pendingItems = [], onRetry }) {
  if (!warning) return null
  return <aside className="user-study-li-cloud-status is-form is-error user-study-li-upload-warning" role="alert">
    <strong>Firebase upload not confirmed · {researchId}</strong>
    <p>The latest results have not been confirmed in Firebase. Keep this browser tab open and tell the researcher. Your browser backup is kept while uploads are retried.</p>
    <p>{uploadFailureReason(warning.code)}</p>
    <p>Error code: {warning.code ?? 'unknown'}</p>
    {warning.message && <p>{warning.message}</p>}
    {pendingItems.length > 0 && <><strong>Not yet uploaded:</strong><ul>{pendingItems.map(item => <li key={item}>{item}</li>)}</ul></>}
    <button type="button" disabled={state === 'saving'} onClick={() => { void onRetry().catch(() => {}) }}>
      {state === 'saving' ? 'Retrying upload…' : 'Retry Firebase upload'}
    </button>
  </aside>
}
