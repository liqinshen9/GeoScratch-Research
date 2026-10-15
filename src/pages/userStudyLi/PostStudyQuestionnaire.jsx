import { useState } from 'react'
import { readQuestionnaireDraft, useQuestionnaireAutosave } from '@/study/session/questionnaireDrafts'

export const POST_RESPONSE_BACKUP_KEY = 'userstudyLi.postStudyResponses'
const LIKERT_OPTIONS = ['1', '2', '3', '4', '5']

const POST_META_FIELDS = [
  {
    id: 'conditionOrder',
    label: 'Condition order',
    options: ['GeoScratch Exercise first', 'Lecture slides first'],
  },
]
const POST_STUDY_SECTIONS = [
  {
    title: 'Section A',
    note: 'This section is evaluating GeoScratch.',
    ratings: [
      {
        id: 'controlsObjectClarity',
        label:
          'The block-based controls made it clear how to create and change the geometric objects needed for the exercises.',
      },
      {
        id: 'controlsFindUse',
        label:
          'I could easily find and use the block-based controls I needed to complete the tasks.',
      },
      {
        id: 'controlsWithoutTrialError',
        label: 'I could use the block-based controls without unnecessary trial and error.',
      },
      {
        id: 'blocksViewConnectionClear',
        label: 'The connection between the blocks and the 3D view was clear.',
      },
      {
        id: 'tutorialEffectiveness',
        label: 'The tutorial animation helped me learn how to use GeoScratch to complete the exercises.',
        allowNotApplicable: true,
      },
    ],
    open: [
      {
        id: 'interfaceEasiestHardest',
        label:
          'Which part of the GeoScratch interface made it easiest or hardest to complete the exercises, and why? Please give a specific example.',
      },
      {
        id: 'sectionAAdditional',
        label:
          'Is there anything you would like to add or explain further about your answers in this section?',
      },
    ],
  },
  {
    title: 'Section B',
    note: 'This section is evaluating GeoScratch.',
    ratings: [
      {
        id: 'blocksReduceFormulaReliance',
        label:
          'Using blocks helped me perform geometric operations without relying heavily on mathematical formulas.',
      },
      {
        id: 'blocksBreakProblemSteps',
        label: 'Using blocks helped me break a geometry problem into smaller steps.',
      },
      {
        id: 'blocksUsefulLearning',
        label: 'I found the block-based approach useful for learning 3D geometry.',
      },
      {
        id: 'blockPurposeClear',
        label: 'I could tell what each block was supposed to do before using it.',
      },
      {
        id: 'blockConnectionsUnderstanding',
        label:
          'The way blocks connected helped me understand which geometric operations could be used together.',
      },
      {
        id: 'blocksFeltLimited',
        label: 'I felt limited by the blocks when trying to express my solution.',
      },
    ],
    open: [
      {
        id: 'blocksChangedThinking',
        label:
          'Did using blocks change how you thought about or approached the geometry problems? If so, how? Please give a specific example.',
      },
      {
        id: 'blocksHelpfulWithoutFormulas',
        label:
          'Did you find the block-based approach helpful for understanding the geometry without relying heavily on formulas?',
      },
      {
        id: 'sectionBAdditional',
        label:
          'Is there anything you would like to add or explain further about your answers in this section?',
      },
    ],
  },
  {
    title: 'Section C',
    note: 'This section is evaluating GeoScratch.',
    ratings: [
      {
        id: 'viewVisualizationHelp',
        label: 'The 3D view helped me visualize the geometric objects and their relationships.',
      },
      {
        id: 'animationConstructionHelp',
        label:
          'The animation helped me understand how the geometric objects were constructed step by step.',
      },
      {
        id: 'feedbackUnderstandingHelp',
        label:
          'The feedback after my actions or answers helped me understand why my solution was correct or incorrect.',
      },
      {
        id: 'instructionsHintsFocus',
        label:
          'The instructions, or hints helped me focus on the important parts of the geometry problem.',
      },
      {
        id: 'reasoningBehindSolution',
        label:
          'The GeoScratch exercises helped me understand the reasoning behind the solution, rather than only following the steps to complete the task.',
      },
      {
        id: 'difficultyAppropriate',
        label: 'The difficulty level of the GeoScratch exercises was appropriate.',
      },
    ],
    open: [
      {
        id: 'geoscratchHelpfulAspects',
        label:
          'Which aspects of GeoScratch helped you understand the geometry concepts most, such as the 3D view, blocks, animations, guidance, or feedback? Please explain why and give a specific example.',
      },
      {
        id: 'geoscratchImprovements',
        label:
          'What, if anything, could be improved in GeoScratch’s 3D view, blocks, animations, guidance, or feedback to better support your understanding of the geometry concepts?',
      },
      {
        id: 'sectionCAdditional',
        label:
          'Is there anything you would like to add or explain further about your answers in this section?',
      },
    ],
  },
  {
    title: 'Section D',
    note: 'This section is evaluating GeoScratch.',
    ratings: [
      {
        id: 'focusOnGeometryNotTool',
        label:
          'I was able to focus my mental effort on solving the geometry problem rather than figuring out how to use GeoScratch.',
      },
      {
        id: 'tooMuchInformation',
        label:
          'Using GeoScratch required me to keep track of too much information at the same time.',
      },
    ],
    choices: [
      {
        id: 'mostMentalEffort',
        label: 'When using GeoScratch, what required the most mental effort?',
        options: [
          'Understanding how to use the GeoScratch interface',
          'Solving the geometry problems',
          'Both the interface and the geometry problems',
          'Neither required much mental effort',
        ],
        detailLabel: 'Please explain your choice.',
      },
    ],
  },
  {
    title: 'Section E',
    note: 'This section is asking about your experience across the whole study.',
    open: [
      {
        id: 'solutionChangeBetweenConditions',
        label:
          'Did the way you solved the geometry problems change between the first and second condition? Please give one specific example.',
      },
    ],
    choices: [
      {
        id: 'geoscratchLearningRole',
        label: 'Based on your experience, what role should GeoScratch have in learning 3D geometry?',
        options: [
          'It should replace traditional lecture materials.',
          'It should be combined with traditional lecture materials.',
          'It should not be used for learning these 3D geometry topics.',
          'Other',
        ],
        detailLabel: 'Please explain your choice.',
      },
      {
        id: 'postStudyGeometryConfidence',
        label: 'After completing the study, how confident do you feel about solving 3D geometry tasks?',
        options: [
          'Not confident',
          'Slightly confident',
          'Moderately confident',
          'Very confident',
          'Extremely confident',
        ],
        detailLabel:
          'What influenced your confidence level? Please mention anything from GeoScratch, the traditional exercises, or your prior experience.',
      },
    ],
  },
]

function todayForDateInput() {
  const today = new Date()
  const offsetDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
  return offsetDate.toISOString().slice(0, 10)
}

function makeInitialPostAnswers(researchId = '') {
  return {
    researchId,
    date: todayForDateInput(),
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

function buildPostResponsePayload(answers, researchId) {
  const submittedAt = new Date().toISOString()
  const sections = [
    {
      title: 'Post-Study Details',
      fields: POST_META_FIELDS.map((field) => fieldAnswer(field, answers)),
    },
    ...POST_STUDY_SECTIONS.map((section) => ({
      title: section.title,
      note: section.note,
      fields: [
        ...(section.ratings || []).map((field) =>
          fieldAnswer(field, answers, { scale: '1 = strongly disagree to 5 = strongly agree' }),
        ),
        ...(section.choices || []).map((field) =>
          fieldAnswer(field, answers, { detail: answers[`${field.id}Detail`] || null }),
        ),
        ...(section.open || []).map((field) => fieldAnswer(field, answers)),
      ],
    })),
  ]
  const fields = sections.flatMap((section) => section.fields)

  return {
    questionnaire: 'Post-Study Questionnaire',
    submittedAt,
    researchId: researchId || null,
    date: answers.date || null,
    conditionOrder: answers.conditionOrder || null,
    sections,
    answers: Object.fromEntries(fields.map((field) => [field.id, field.answer])),
  }
}

export default function PostStudyQuestionnaire({ researchId, conditionOrder, onComplete, onSave, storageWarning, recordResponses = true }) {
  const acceptPostResponses = true
  const [postAnswers, setPostAnswers] = useState(() => ((recordResponses && readQuestionnaireDraft(researchId, 'post-study')?.rawAnswers) || {
    ...makeInitialPostAnswers(researchId),
    ...(conditionOrder ? { conditionOrder } : {}),
  }))
  const [postSavedMessage, setPostSavedMessage] = useState('')
  const storageError = useQuestionnaireAutosave({ researchId, questionnaireId: 'post-study', answers: postAnswers, buildPayload: buildPostResponsePayload, enabled: acceptPostResponses && recordResponses })

  function updatePostAnswer(id, value) {
    setPostAnswers((current) => ({ ...current, [id]: value }))
    setPostSavedMessage('')
  }

  function submitPostQuestionnaire(event) {
    event.preventDefault()
    if (!acceptPostResponses) return

    const payload = buildPostResponsePayload(postAnswers, researchId)
    if (recordResponses) onSave(payload, 'post-study', POST_RESPONSE_BACKUP_KEY)
    setPostSavedMessage(recordResponses ? 'Answers saved.' : 'Preview only. Answers are not recorded.')
    onComplete()
  }

  return (
    <div className="user-study-li-form-page">
      <header className="user-study-li-form-header">
        <div>
          <h1>Post-Study Questionnaire</h1>
          {(storageError || storageWarning) && <p role="alert">{storageError || storageWarning}</p>}
          <p>
            To be completed after both conditions. Please answer based on your overall experience
            across the whole study.
          </p>
        </div>
      </header>

      <form className="user-study-li-questionnaire" onSubmit={submitPostQuestionnaire}>
        <section className="user-study-li-section">
          <div className="user-study-li-two-column user-study-li-session-fields">
            <label className="user-study-li-field">
              <span>Research ID</span>
              <input value={researchId} readOnly disabled={!acceptPostResponses} />
            </label>
            <label className="user-study-li-field">
              <span>Date</span>
              <input
                type="date"
                value={postAnswers.date}
                onChange={(event) => updatePostAnswer('date', event.target.value)}
                disabled={!acceptPostResponses}
              />
            </label>
          </div>

          {POST_META_FIELDS.map((field) => (
            <fieldset className="user-study-li-question" key={field.id}>
              <legend>{field.label}</legend>
              <div className="user-study-li-options user-study-li-inline-options">
                {field.options.map((option) => (
                  <label className="user-study-li-option" key={option}>
                    <input
                      type="radio"
                      name={field.id}
                      value={option}
                      checked={postAnswers[field.id] === option}
                      onChange={(event) => updatePostAnswer(field.id, event.target.value)}
                      disabled={!acceptPostResponses || Boolean(conditionOrder)}
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </section>

        {POST_STUDY_SECTIONS.map((section) => (
          <section className="user-study-li-section" key={section.title}>
            <h2 className="user-study-li-section-title">{section.title}</h2>
            <p className="user-study-li-section-note">{section.note}</p>

            {(section.ratings || []).map((field) => (
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
                        checked={postAnswers[field.id] === option}
                        onChange={(event) => updatePostAnswer(field.id, event.target.value)}
                        disabled={!acceptPostResponses}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                  {field.allowNotApplicable && <label className="user-study-li-option user-study-li-rating-na">
                    <input type="radio" name={field.id} value="Not applicable — I did not use the tutorial"
                      checked={postAnswers[field.id] === 'Not applicable — I did not use the tutorial'}
                      onChange={(event) => updatePostAnswer(field.id, event.target.value)} />
                    <span>Not applicable — I did not use the tutorial</span>
                  </label>}
                </div>
              </fieldset>
            ))}

            {(section.choices || []).map((field) => (
              <fieldset className="user-study-li-question" key={field.id}>
                <legend>{field.label}</legend>
                <div className="user-study-li-options">
                  {field.options.map((option) => (
                    <label className="user-study-li-option" key={option}>
                      <input
                        type="radio"
                        name={field.id}
                        value={option}
                        checked={postAnswers[field.id] === option}
                        onChange={(event) => updatePostAnswer(field.id, event.target.value)}
                        disabled={!acceptPostResponses}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
                {field.detailLabel ? (
                  <label className="user-study-li-field user-study-li-detail">
                    <span>{field.detailLabel}</span>
                    <textarea
                      value={postAnswers[`${field.id}Detail`] || ''}
                      onChange={(event) =>
                        updatePostAnswer(`${field.id}Detail`, event.target.value)
                      }
                      disabled={!acceptPostResponses}
                      rows={4}
                    />
                  </label>
                ) : null}
              </fieldset>
            ))}

            {(section.open || []).map((field) => (
              <label className="user-study-li-field user-study-li-open-question" key={field.id}>
                <span>{field.label}</span>
                <textarea
                  value={postAnswers[field.id] || ''}
                  onChange={(event) => updatePostAnswer(field.id, event.target.value)}
                  disabled={!acceptPostResponses}
                  rows={5}
                />
              </label>
            ))}
          </section>
        ))}

        <footer className="user-study-li-actions">
          <button
            className="user-study-li-primary-action"
            type="submit"
            disabled={!acceptPostResponses}
          >
            Submit session
          </button>
        </footer>
        {postSavedMessage ? <p className="user-study-li-save-message">{postSavedMessage}</p> : null}
      </form>
    </div>
  )
}
