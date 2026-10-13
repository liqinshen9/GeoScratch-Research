import { useState } from 'react'
import { readQuestionnaireDraft, useQuestionnaireAutosave } from '@/study/session/questionnaireDrafts'

export const CONDITION_RESPONSE_BACKUP_KEY = 'userstudyLi.conditionResponses'
const LIKERT_OPTIONS = ['1', '2', '3', '4', '5']

const CONDITION_META_FIELDS = [
  {
    id: 'conditionOrder',
    label: 'Condition order',
    options: ['First', 'Second'],
  },
  {
    id: 'condition',
    label: 'Condition',
    options: ['GeoScratch Exercise', 'Lecture slides'],
  },
]
const CONDITION_RATING_SECTIONS = [
  {
    title: 'Section A',
    fields: [
      {
        id: 'expectedTaskClarity',
        label: 'I understood what I was expected to do in the exercises.',
      },
      {
        id: 'mistakeAwareness',
        label: 'I could tell when I had made a mistake in my solution.',
      },
      {
        id: 'incorrectUnderstanding',
        label: 'When my solution was incorrect, I understood what had gone wrong.',
      },
      {
        id: 'mistakeReconsideration',
        label: 'When I made a mistake, I knew what I needed to reconsider or change.',
      },
      {
        id: 'progressAfterStuck',
        label: 'I was able to make progress after making a mistake or getting stuck.',
      },
      {
        id: 'resultUnderstanding',
        label: 'I understood why my solution produced the result I got.',
      },
      {
        id: 'conceptImprovement',
        label:
          'By the end of the exercises, I felt I understood the geometry concept better than when I started.',
      },
    ],
  },
  {
    title: 'Section B',
    fields: [
      {
        id: 'exerciseUnderstanding',
        label: 'I think I understood the exercises pretty well.',
      },
      {
        id: 'geometryCompetence',
        label: 'After working on the exercises, I felt more competent with geometry concepts.',
      },
      {
        id: 'productiveEffort',
        label: 'The effort required by the exercises helped me think through the problem.',
      },
      {
        id: 'exerciseInterest',
        label: 'I found the exercises interesting.',
      },
      {
        id: 'learningUsefulness',
        label: 'I believe the exercises could be useful for learning 3D geometry.',
      },
      {
        id: 'futureWillingness',
        label:
          'I would be willing to do exercises like this again because it has value for my learning.',
      },
    ],
  },
]
const CONDITION_RATING_FIELDS = CONDITION_RATING_SECTIONS.flatMap((section) => section.fields)
const CONDITION_OPEN_FIELDS = [
  {
    id: 'mistakeDetectionExample',
    label:
      'If you made a mistake, how did you know that something was wrong? Please give a specific example.',
  },
  {
    id: 'stuckDecisionHelp',
    label: 'When you were unsure or stuck, what helped you decide what to do next?',
  },
  {
    id: 'incorrectButUnclear',
    label:
      'Was there any point where you knew your solution was incorrect but did not understand why? Please explain.',
  },
  {
    id: 'mostHelpfulPart',
    label:
      'What part of the exercises helped you understand the geometry concepts most? Please explain.',
  },
  {
    id: 'mostDifficultPart',
    label:
      'What part of the exercises made it difficult to understand the geometry concepts? Please explain.',
  },
]

function todayForDateInput() {
  const today = new Date()
  const offsetDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
  return offsetDate.toISOString().slice(0, 10)
}

function makeInitialConditionAnswers(researchId = '') {
  return {
    researchId,
    date: todayForDateInput(),
    condition: 'GeoScratch Exercise',
  }
}

function fieldAnswer(field, answers, extra = {}) {
  return {
    id: field.id,
    question: field.label,
    answer: answers[field.id] || null,
    ...extra,
  }
}

function buildConditionResponsePayload(answers, researchId) {
  const submittedAt = new Date().toISOString()
  const metaFields = CONDITION_META_FIELDS.map((field) => fieldAnswer(field, answers))
  const ratingFields = CONDITION_RATING_FIELDS.map((field) =>
    fieldAnswer(field, answers, { scale: '1 = strongly disagree to 5 = strongly agree' }),
  )
  const openFields = CONDITION_OPEN_FIELDS.map((field) => fieldAnswer(field, answers))
  const fields = [...metaFields, ...ratingFields, ...openFields]

  return {
    questionnaire: 'Condition Questionnaire',
    submittedAt,
    researchId: researchId || null,
    date: answers.date || null,
    conditionOrder: answers.conditionOrder || null,
    condition: answers.condition || null,
    answers: Object.fromEntries(fields.map((field) => [field.id, field.answer])),
    fields,
  }
}

export default function ConditionQuestionnaire({ researchId, condition, conditionOrder, onComplete, onSave }) {
  const questionnaireId = condition === 'Lecture slides' ? 'condition-lecture' : 'condition-geoscratch'
  const acceptConditionResponses = true
  const [conditionAnswers, setConditionAnswers] = useState(() =>
    (readQuestionnaireDraft(researchId, questionnaireId)?.rawAnswers ?? { ...makeInitialConditionAnswers(researchId),
      ...(condition ? { condition } : {}),
      ...(conditionOrder ? { conditionOrder } : {}),
    }),
  )
  const [conditionSavedMessage, setConditionSavedMessage] = useState('')
  useQuestionnaireAutosave({ researchId, questionnaireId, answers: conditionAnswers, buildPayload: buildConditionResponsePayload, enabled: acceptConditionResponses })

  function updateConditionAnswer(id, value) {
    setConditionAnswers((current) => ({ ...current, [id]: value }))
    setConditionSavedMessage('')
  }

  function submitConditionQuestionnaire(event) {
    event.preventDefault()
    if (!acceptConditionResponses) return

    const payload = buildConditionResponsePayload(conditionAnswers, researchId)
    onSave(payload, 'condition', CONDITION_RESPONSE_BACKUP_KEY)
    setConditionSavedMessage('Answers saved.')
    onComplete()
  }

  return (
    <div className="user-study-li-form-page">
      <header className="user-study-li-form-header">
        <div>
          <h1>Condition Questionnaire</h1>
          <p>
            Complete this after each condition. Answer only about the condition you just completed.
          </p>
        </div>
      </header>

      <form className="user-study-li-questionnaire" onSubmit={submitConditionQuestionnaire}>
        <section className="user-study-li-section">
          <div className="user-study-li-two-column user-study-li-session-fields">
            <label className="user-study-li-field">
              <span>Research ID</span>
              <input value={researchId} readOnly disabled={!acceptConditionResponses} />
            </label>
            <label className="user-study-li-field">
              <span>Date</span>
              <input
                type="date"
                value={conditionAnswers.date}
                onChange={(event) => updateConditionAnswer('date', event.target.value)}
                disabled={!acceptConditionResponses}
              />
            </label>
          </div>

          {CONDITION_META_FIELDS.map((field) => (
            <fieldset className="user-study-li-question" key={field.id}>
              <legend>{field.label}</legend>
              <div className="user-study-li-options user-study-li-inline-options">
                {field.options.map((option) => (
                  <label className="user-study-li-option" key={option}>
                    <input
                      type="radio"
                      name={field.id}
                      value={option}
                      checked={conditionAnswers[field.id] === option}
                      onChange={(event) => updateConditionAnswer(field.id, event.target.value)}
                      disabled={!acceptConditionResponses || Boolean(field.id === 'condition' ? condition : conditionOrder)}
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </section>

        {CONDITION_RATING_SECTIONS.map((section) => (
          <section className="user-study-li-section" key={section.title}>
            <h2 className="user-study-li-section-title">{section.title}</h2>
            {section.fields.map((field) => (
              <fieldset
                className="user-study-li-question user-study-li-rating-question"
                key={field.id}
              >
                <legend>{field.label}</legend>
                <p>1 = strongly disagree to 5 = strongly agree</p>
                <div className="user-study-li-options user-study-li-rating-options">
                  {LIKERT_OPTIONS.map((option) => (
                    <label className="user-study-li-option" key={option}>
                      <input
                        type="radio"
                        name={field.id}
                        value={option}
                        checked={conditionAnswers[field.id] === option}
                        onChange={(event) => updateConditionAnswer(field.id, event.target.value)}
                        disabled={!acceptConditionResponses}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </section>
        ))}

        <section className="user-study-li-section">
          <h2 className="user-study-li-section-title">Section C</h2>
          {CONDITION_OPEN_FIELDS.map((field) => (
            <label className="user-study-li-field user-study-li-open-question" key={field.id}>
              <span>{field.label}</span>
              <textarea
                value={conditionAnswers[field.id] || ''}
                onChange={(event) => updateConditionAnswer(field.id, event.target.value)}
                disabled={!acceptConditionResponses}
                rows={5}
              />
            </label>
          ))}
        </section>

        <footer className="user-study-li-actions">
          <button
            className="user-study-li-primary-action"
            type="submit"
          >
            Next
          </button>
        </footer>
        {conditionSavedMessage ? (
          <p className="user-study-li-save-message">{conditionSavedMessage}</p>
        ) : null}
      </form>
    </div>
  )
}
