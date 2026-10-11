import { STUDY_ORDERS } from './studyFlow'

export default function StudyOrderSelection({ onSelect }) {
  return <div className="user-study-li-form-page user-study-li-session-page">
    <section className="user-study-li-order-card" aria-labelledby="study-order-title">
      <h1 id="study-order-title">Choose the study order</h1>
      <p>Both orders include GeoScratch and Lecture slides. Choose which to begin with.</p>
      <div className="user-study-li-order-options">
        {STUDY_ORDERS.map((order) => <button key={order.id} type="button"
          className="user-study-li-order-option" onClick={() => onSelect(order.id)}>
          <strong>{order.title}</strong>
          <span>{order.id === 'geoscratch-first' ? 'GeoScratch → Lecture slides' : 'Lecture slides → GeoScratch'}</span>
        </button>)}
      </div>
    </section>
  </div>
}
