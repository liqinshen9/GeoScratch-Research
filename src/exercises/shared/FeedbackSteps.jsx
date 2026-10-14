import { useEffect, useState } from 'react'
import { feedbackText } from './feedbackMessages'

export default function FeedbackSteps({ steps = {}, feedback = {}, partialSteps, partialMessages, feedbackRevision, passed, tasks, onStepAction }) {
  const [checked, setChecked] = useState({})
  const [expanded, setExpanded] = useState({})
  useEffect(() => { setChecked({}); setExpanded({}) }, [feedbackRevision])
  return <ol className={`exercise-task-steps${passed ? ' is-passed' : ''}`}>
    {tasks.map(([key, text]) => {
      const item = feedback[key] ?? (!steps[key] ? { message: partialMessages?.[key] || feedbackText(partialSteps?.[key] ? 'genericValues' : 'incomplete') } : null)
      const complete = steps[key] && !item?.incomplete
      return <li key={key} className={complete ? 'is-complete' : checked[key] ? 'is-partial' : ''}>
        <div className="exercise-step-row">
          <span>{text}</span>
          <button type="button" className="exercise-step-check" data-step-key={key}
            data-complete={complete ? 'true' : undefined}
            onClick={() => { onStepAction?.({ action: 'check', stepKey: key }); setChecked((state) => ({ ...state, [key]: true })) }}>
            {feedbackText(complete ? 'complete' : 'check')}
          </button>
        </div>
        {checked[key] && item && <div className="exercise-step-feedback" role="status">
          <span>{item.message}</span>
          {item.detail && <>
            {' '}<button type="button" className="exercise-step-check" aria-expanded={Boolean(expanded[key])}
              onClick={() => {
                if (!expanded[key]) onStepAction?.({ action: 'more-help', stepKey: key })
                setExpanded((state) => ({ ...state, [key]: !state[key] }))
              }}>{feedbackText('moreHelp')}</button>
            {expanded[key] && <p>{item.detail}</p>}
          </>}
        </div>}
      </li>
    })}
  </ol>
}
