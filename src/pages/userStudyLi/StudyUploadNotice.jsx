export default function StudyUploadNotice({ researchId, warning, state, onRetry }) {
  if (!warning) return null
  return <aside className="user-study-li-cloud-status is-form is-error user-study-li-upload-warning" role="alert">
    <strong>Firebase upload not confirmed · {researchId}</strong>
    <p>The latest results have not been confirmed in Firebase. Keep this browser tab open and tell the researcher. Your browser backup is kept while uploads are retried.</p>
    <p>{warning.code === 'offline' ? 'This browser is offline.' : warning.code === 'upload-unconfirmed'
      ? 'The upload is taking too long to confirm.' : `Upload failed: ${warning.code ?? 'unknown error'}`}</p>
    <button type="button" disabled={state === 'saving'} onClick={() => { void onRetry().catch(() => {}) }}>
      {state === 'saving' ? 'Retrying upload…' : 'Retry Firebase upload'}
    </button>
  </aside>
}
