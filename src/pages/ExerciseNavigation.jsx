import { ArrowLeft, ArrowRight } from '@icon-park/react'

export default function ExerciseNavigation({ onPrevious, onNext, studyMode, passed }) {
  return <div className="exercise-column-heading__nav" aria-label="Study exercise navigation">
    {onPrevious && <button type="button" className="exercise-nav-button exercise-nav-button--wide"
      disabled={studyMode} onClick={() => { if (!studyMode) onPrevious() }}
      title="Previous exercise" aria-label="Previous exercise">
      <ArrowLeft theme="outline" size="13" fill="currentColor" aria-hidden="true" />
      <span>Previous</span>
    </button>}
    {onNext && <button type="button" className="exercise-nav-button exercise-nav-button--wide"
      disabled={studyMode && !passed} onClick={() => { if (!studyMode || passed) onNext() }}
      title={studyMode && !passed ? 'Complete and pass this exercise to continue' : 'Next exercise'}
      aria-label="Next exercise">
      <span>Next</span>
      <ArrowRight theme="outline" size="13" fill="currentColor" aria-hidden="true" />
    </button>}
  </div>
}
