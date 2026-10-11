export default function LectureSlides({ onComplete }) {
  return <div className="user-study-li-form-page user-study-li-lecture-page">
    <main className="user-study-li-lecture-content">
      <h1>Lecture slides</h1>
    </main>
    <footer className="user-study-li-lecture-footer">
      <button type="button" className="user-study-li-primary-action" onClick={onComplete}>
        Continue to questionnaire
      </button>
    </footer>
  </div>
}
