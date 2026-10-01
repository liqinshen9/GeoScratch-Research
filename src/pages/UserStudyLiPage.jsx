import { useState } from 'react'
import useThemeSync from '@/hooks/useThemeSync'
import ExercisePage from '@/pages/ExercisePage'
import { Switch } from '@/components/ui/switch'
import { generateResearchId } from '@/study/session/researchId'
import './UserStudyLiPage.css'

const STUDY_EXERCISES = [
  { id: 'cube-point-pivot-rotation' },
  { id: 'point-plane-distance', title: 'Calculate distance from point P to a plane 1' },
  {
    id: 'userstudy-li-equation-point-plane-distance',
    title: 'Calculate distance from point P to a plane 2',
  },
]
const RESPONSE_SETTING_KEY = 'userstudyLi.acceptResponses'
const RESPONSE_BACKUP_KEY = 'userstudyLi.demographicsResponses'
const CONDITION_RESPONSE_SETTING_KEY = 'userstudyLi.acceptConditionResponses'
const CONDITION_RESPONSE_BACKUP_KEY = 'userstudyLi.conditionResponses'
const CURRENT_RESEARCH_ID_KEY = 'userstudyLi.currentResearchId'

const QUESTIONNAIRE_SECTIONS = [
  {
    title: 'About You',
    fields: [
      {
        id: 'gender',
        label: 'What is your gender?',
        options: ['Male', 'Female', 'Non-Binary', 'Transgender', 'Other', 'Prefer not to say'],
      },
      {
        id: 'ageRange',
        label: 'What is your age range?',
        options: ['18-20', '21-24', '25-34', '35-44', '45+'],
      },
      {
        id: 'areaOfStudyOrWork',
        label: 'What is your current area of study or work?',
        options: [
          'Computer science / software / data science',
          'Engineering',
          'Science / mathematics',
          'Design / architecture / creative technologies',
          'Other',
          'Prefer not to say',
        ],
        specifyWhen: 'Other',
        detailLabel: 'Other',
      },
    ],
  },
  {
    title: 'Mathematics Background',
    fields: [
      {
        id: 'highestMathStudied',
        label: 'What is the highest level of mathematics you have studied?',
        options: [
          'High school mathematics up to Year 11 or equivalent',
          'High school mathematics up to Year 13 or equivalent',
          'One or more university-level mathematics courses',
          'Mathematics, statistics, engineering, physics, or related major',
          'Postgraduate-level mathematics or related study',
          'Other',
          'Prefer not to say',
        ],
        specifyWhen: 'Other',
        detailLabel: 'Other',
      },
      {
        id: 'overallMathSkills',
        label: 'How would you rate your overall mathematics skills?',
        options: ['Very low', 'Low', 'Moderate', 'High', 'Very high', 'Prefer not to say'],
      },
      {
        id: 'problemSolvingSkills',
        label: 'How would you rate your general problem-solving skills?',
        options: ['Very low', 'Low', 'Moderate', 'High', 'Very high', 'Prefer not to say'],
      },
      {
        id: 'mathEnjoyment',
        label: 'How much do you enjoy mathematics?',
        options: [
          'Not at all',
          'Slightly',
          'Moderately',
          'Very much',
          'Extremely',
          'Prefer not to say',
        ],
      },
      {
        id: 'studiedVectorsBefore',
        label: 'Have you studied vectors before?',
        options: ['No', 'Yes, at high school level', 'Yes, at university level', 'Prefer not to say'],
      },
      {
        id: 'vectorConceptConfidence',
        label:
          'How confident do you feel with basic vector concepts, such as dot product, normal, and projection?',
        options: [
          'Not confident',
          'Slightly confident',
          'Moderately confident',
          'Very confident',
          'Extremely confident',
        ],
      },
    ],
  },
  {
    title: '3D And Tool Experience',
    fields: [
      {
        id: 'videoGameFrequency',
        label: 'How often do you play 3D video games?',
        options: ['Never', 'Rarely', 'Sometimes', 'Often', 'Very often'],
      },
      {
        id: 'spatialRotationAgreement',
        label: 'I can easily imagine what an object would look like if rotated in space.',
        options: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
      },
      {
        id: 'blockProgrammingExperience',
        label: 'Have you used block-based programming tools before, such as Scratch?',
        options: ['No', 'Yes, once or twice', 'Yes, occasionally', 'Yes, frequently', 'Not sure'],
      },
      {
        id: 'interactiveGeometryExperience',
        label: 'Have you used any interactive geometry or visual learning tools before?',
        helpText: 'For example, GeoGebra, BlocksCAD, Blockly Game, or similar tools.',
        options: ['No', 'Yes, once or twice', 'Yes, occasionally', 'Yes, frequently', 'Not sure'],
      },
      {
        id: 'visualToolsInterest',
        label:
          'Are you interested in using visual or interactive tools to help you learn 3D geometry concepts?',
        options: [
          'Not interested',
          'Slightly interested',
          'Moderately interested',
          'Very interested',
          'Extremely interested',
          'Not sure',
        ],
      },
      {
        id: 'preGeoScratchConfidence',
        label:
          'Before using GeoScratch, how confident do you feel about solving 3D geometry tasks?',
        options: [
          'Not confident',
          'Slightly confident',
          'Moderately confident',
          'Very confident',
          'Extremely confident',
        ],
      },
    ],
  },
  {
    title: 'GeoScratch Familiarity',
    fields: [
      {
        id: 'seenGeoScratchBefore',
        label:
          'Have you seen GeoScratch before, from YouTube, University of Auckland Open Day or another user study?',
        options: ['No', 'Yes'],
        specifyWhen: 'Yes',
        detailLabel: 'If Yes, briefly specify where you saw it',
      },
      {
        id: 'usedGeoScratchBefore',
        label:
          'Have you used GeoScratch before, from University of Auckland Open Day or another user study?',
        options: ['No', 'Yes'],
        specifyWhen: 'Yes',
        detailLabel: 'If Yes, briefly specify where you used it',
      },
    ],
  },
]
const QUESTIONNAIRE_FIELDS = QUESTIONNAIRE_SECTIONS.flatMap((section) => section.fields)
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
    options: ['GeoScratch Exercise', 'Traditional Exercise'],
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

const POINT_STYLES = {
  attached_corner_point: { color: '#3b82f6', label: 'P', anchor: 'p' },
  pivot_center_point: { color: '#6b7280', label: 'C', anchor: 'c' },
}
const CLICK_LABEL_ANCHORS = {
  attached_corner_point: 'p',
  pivot_center_point: 'c',
  exercise_point_p: 'p',
  selectable_point_marker: 'q',
}
const LABEL_COLORS = Object.fromEntries(
  Object.values(POINT_STYLES).map(({ label, color }) => [label, color]),
)
const HIDDEN_BLOCK_TYPES = ['geo_object_with_point']

const SETTINGS = Object.freeze({
  showAxisToggleButton: false,
  cubeShowEdges: false,
  objectHighlightEnabled: false,
  objectsReceiveShadows: false,
  primitivesCastShadows: false,
  pointShadowsEnabled: false,
  cameraShadowsEnabled: false,
  haloEnabled: false,
  haloLineVectorEnabled: false,
  labelDetail: 'nameAndValue',
})

function todayForDateInput() {
  const today = new Date()
  const offsetDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
  return offsetDate.toISOString().slice(0, 10)
}

function readAcceptResponsesSetting() {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(RESPONSE_SETTING_KEY) === 'true'
}

function readAcceptConditionResponsesSetting() {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(CONDITION_RESPONSE_SETTING_KEY) === 'true'
}

function makeInitialAnswers(researchId = '') {
  return {
    researchId,
    date: todayForDateInput(),
  }
}

function makeInitialConditionAnswers(researchId = '') {
  return {
    researchId,
    date: todayForDateInput(),
    condition: 'GeoScratch Exercise',
  }
}

function safeFileSegment(value) {
  return value.trim().replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '') || 'anonymous'
}

function buildResponsePayload(answers, researchId) {
  const submittedAt = new Date().toISOString()
  const fields = QUESTIONNAIRE_FIELDS.map((field) => ({
    id: field.id,
    question: field.label,
    answer: answers[field.id] || null,
    detail: answers[`${field.id}Detail`] || null,
  }))

  return {
    route: '/userstudy-Li',
    questionnaire: 'Pre-Study Questionnaire (Demographics)',
    submittedAt,
    participantId: researchId || null,
    researchId: researchId || null,
    date: answers.date || null,
    answers: Object.fromEntries(fields.map((field) => [field.id, field.answer])),
    fields,
  }
}

function buildConditionResponsePayload(answers, researchId) {
  const submittedAt = new Date().toISOString()
  const metaFields = CONDITION_META_FIELDS.map((field) => ({
    id: field.id,
    question: field.label,
    answer: answers[field.id] || null,
  }))
  const ratingFields = CONDITION_RATING_FIELDS.map((field) => ({
    id: field.id,
    question: field.label,
    scale: '1 = strongly disagree to 5 = strongly agree',
    answer: answers[field.id] || null,
  }))
  const openFields = CONDITION_OPEN_FIELDS.map((field) => ({
    id: field.id,
    question: field.label,
    answer: answers[field.id] || null,
  }))
  const fields = [...metaFields, ...ratingFields, ...openFields]

  return {
    route: '/userstudy-Li',
    questionnaire: 'Condition Questionnaire',
    submittedAt,
    participantId: researchId || null,
    researchId: researchId || null,
    date: answers.date || null,
    conditionOrder: answers.conditionOrder || null,
    condition: answers.condition || null,
    answers: Object.fromEntries(fields.map((field) => [field.id, field.answer])),
    fields,
  }
}

function downloadJson(payload, type = 'demographics') {
  const fileName = `userstudy-Li-${type}-${safeFileSegment(
    payload.researchId || '',
  )}-${payload.submittedAt.replace(/[:.]/g, '-')}.json`
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

function styleStudyPoints(objects) {
  objects.forEach((object) =>
    object?.traverse((child) => {
      const style = POINT_STYLES[child.userData?.geoType]
      const clickAnchor = CLICK_LABEL_ANCHORS[child.userData?.geoType]
      if (clickAnchor) child.userData.clickLabelAnchor = clickAnchor
      if (child.userData?.geoType === 'selectable_point_marker') {
        let owner = child
        while (owner && !owner.userData?.labels?.some((label) => label.anchor === 'q')) {
          owner = owner.parent
        }
        owner?.userData?.labels?.forEach((label) => {
          if (label.anchor === 'q') label.className = 'label--study-coordinate'
        })
      }
      if (child.userData?.geoType === 'exercise_point_p') {
        child.userData?.labels?.forEach((label) => {
          if (label.anchor !== 'p') return
          label.name = 'P'
          label.className = 'label--study-coordinate'
        })
      }
      if (style) {
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        materials.forEach((material) => material?.color?.set(style.color))
      }
      child.userData?.labels?.forEach((label) => {
        if (label.role === 'distance') label.className = 'label--study-coordinate'
        if (LABEL_COLORS[label.name]) label.color = LABEL_COLORS[label.name]
      })
    }),
  )
  return objects
}

export default function UserStudyLiPage() {
  useThemeSync()
  const [exerciseIndex, setExerciseIndex] = useState(0)
  const [sessionStarted, setSessionStarted] = useState(false)
  const [studyStarted, setStudyStarted] = useState(false)
  const [conditionStarted, setConditionStarted] = useState(false)
  const [conditionCompleted, setConditionCompleted] = useState(false)
  const [researchId, setResearchId] = useState('')
  const [acceptResponses, setAcceptResponses] = useState(readAcceptResponsesSetting)
  const [acceptConditionResponses, setAcceptConditionResponses] = useState(
    readAcceptConditionResponsesSetting,
  )
  const [answers, setAnswers] = useState(makeInitialAnswers)
  const [conditionAnswers, setConditionAnswers] = useState(makeInitialConditionAnswers)
  const [savedMessage, setSavedMessage] = useState('')
  const [conditionSavedMessage, setConditionSavedMessage] = useState('')
  const exercise = STUDY_EXERCISES[exerciseIndex]
  const exerciseId = exercise.id

  function startNewSession() {
    const nextResearchId = generateResearchId()
    setResearchId(nextResearchId)
    setAnswers(makeInitialAnswers(nextResearchId))
    setConditionAnswers(makeInitialConditionAnswers(nextResearchId))
    setExerciseIndex(0)
    setStudyStarted(false)
    setConditionStarted(false)
    setConditionCompleted(false)
    setSessionStarted(true)
    window.localStorage.setItem(CURRENT_RESEARCH_ID_KEY, nextResearchId)
    setSavedMessage('')
  }

  function updateAcceptResponses(checked) {
    setAcceptResponses(checked)
    window.localStorage.setItem(RESPONSE_SETTING_KEY, checked ? 'true' : 'false')
    setSavedMessage('')
  }

  function updateAcceptConditionResponses(checked) {
    setAcceptConditionResponses(checked)
    window.localStorage.setItem(CONDITION_RESPONSE_SETTING_KEY, checked ? 'true' : 'false')
    setConditionSavedMessage('')
  }

  function updateAnswer(id, value) {
    setAnswers((current) => ({ ...current, [id]: value }))
    setSavedMessage('')
  }

  function updateConditionAnswer(id, value) {
    setConditionAnswers((current) => ({ ...current, [id]: value }))
    setConditionSavedMessage('')
  }

  function submitQuestionnaire(event) {
    event.preventDefault()
    if (!acceptResponses) return

    const payload = buildResponsePayload(answers, researchId)
    const storedResponses = JSON.parse(window.localStorage.getItem(RESPONSE_BACKUP_KEY) || '[]')
    storedResponses.push(payload)
    window.localStorage.setItem(RESPONSE_BACKUP_KEY, JSON.stringify(storedResponses))
    downloadJson(payload)
    setSavedMessage('Response saved as a JSON file. A browser backup was also stored locally.')
    setStudyStarted(true)
  }

  function submitConditionQuestionnaire(event) {
    event.preventDefault()
    if (!acceptConditionResponses) return

    const payload = buildConditionResponsePayload(conditionAnswers, researchId)
    const storedResponses = JSON.parse(
      window.localStorage.getItem(CONDITION_RESPONSE_BACKUP_KEY) || '[]',
    )
    storedResponses.push(payload)
    window.localStorage.setItem(CONDITION_RESPONSE_BACKUP_KEY, JSON.stringify(storedResponses))
    downloadJson(payload, 'condition')
    setConditionSavedMessage('Response saved as a JSON file. A browser backup was also stored locally.')
    setConditionCompleted(true)
  }

  if (!sessionStarted) {
    return (
      <div className="user-study-li-form-page user-study-li-session-page">
        <section className="user-study-li-session-card" aria-labelledby="new-session-title">
          <p className="user-study-li-kicker">UserStudyLi</p>
          <h1 id="new-session-title">New study session</h1>
          <p>
            For the researcher. A research ID is generated when the session starts and is
            used to link the questionnaire, later questionnaires, and study log data.
          </p>
          <button className="user-study-li-primary-action" type="button" onClick={startNewSession}>
            Start new session
          </button>
        </section>
      </div>
    )
  }

  if (!studyStarted) {
    return (
      <div className="user-study-li-form-page">
        <header className="user-study-li-form-header">
          <div>
            <h1>Demographics Questionnaire</h1>
          </div>
          <label className="user-study-li-collection-toggle">
            <span>
              <strong>Accept responses</strong>
              <small>{acceptResponses ? 'JSON saving is on' : 'Students can skip this form'}</small>
            </span>
            <Switch checked={acceptResponses} onCheckedChange={updateAcceptResponses} />
          </label>
        </header>

        <form className="user-study-li-questionnaire" onSubmit={submitQuestionnaire}>
          <section className="user-study-li-section">
            <div className="user-study-li-two-column user-study-li-session-fields">
              <label className="user-study-li-field">
                <span>Participant ID</span>
                <input
                  value={researchId}
                  readOnly
                  disabled={!acceptResponses}
                />
              </label>
              <label className="user-study-li-field">
                <span>Date</span>
                <input
                  type="date"
                  value={answers.date}
                  onChange={(event) => updateAnswer('date', event.target.value)}
                  disabled={!acceptResponses}
                />
              </label>
            </div>
            <p className="user-study-li-form-note">
              Please answer the following questions. You may skip any question you do not wish
              to answer.
            </p>

            {QUESTIONNAIRE_FIELDS.map((field) => (
              <fieldset className="user-study-li-question" key={field.id}>
                <legend>{field.label}</legend>
                {field.helpText ? <p>{field.helpText}</p> : null}
                <div className="user-study-li-options">
                  {field.options.map((option) => (
                    <label className="user-study-li-option" key={option}>
                      <input
                        type="radio"
                        name={field.id}
                        value={option}
                        checked={answers[field.id] === option}
                        onChange={(event) => updateAnswer(field.id, event.target.value)}
                        disabled={!acceptResponses}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
                {field.detailLabel ? (
                  <label className="user-study-li-field user-study-li-detail">
                    <span>{field.detailLabel}</span>
                    <input
                      value={answers[`${field.id}Detail`] || ''}
                      onChange={(event) => updateAnswer(`${field.id}Detail`, event.target.value)}
                      disabled={!acceptResponses}
                    />
                  </label>
                ) : null}
              </fieldset>
            ))}
          </section>

          <footer className="user-study-li-actions">
            <button
              className="user-study-li-secondary-action"
              type="button"
              onClick={() => setStudyStarted(true)}
            >
              Skip questionnaire
            </button>
            <button className="user-study-li-primary-action" type="submit" disabled={!acceptResponses}>
              Save JSON and start
            </button>
          </footer>
          {savedMessage ? <p className="user-study-li-save-message">{savedMessage}</p> : null}
        </form>
      </div>
    )
  }

  if (conditionStarted && !conditionCompleted) {
    return (
      <div className="user-study-li-form-page">
        <header className="user-study-li-form-header">
          <div>
            <h1>Condition Questionnaire</h1>
            <p>
              Complete this after each condition. Answer only about the condition you just
              completed.
            </p>
          </div>
          <label className="user-study-li-collection-toggle">
            <span>
              <strong>Accept responses</strong>
              <small>
                {acceptConditionResponses
                  ? 'JSON saving is on'
                  : 'Students can skip this form'}
              </small>
            </span>
            <Switch
              checked={acceptConditionResponses}
              onCheckedChange={updateAcceptConditionResponses}
            />
          </label>
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
                        disabled={!acceptConditionResponses}
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
                          onChange={(event) =>
                            updateConditionAnswer(field.id, event.target.value)
                          }
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
              <label
                className="user-study-li-field user-study-li-open-question"
                key={field.id}
              >
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
              className="user-study-li-secondary-action"
              type="button"
              onClick={() => setConditionCompleted(true)}
            >
              Skip questionnaire
            </button>
            <button
              className="user-study-li-primary-action"
              type="submit"
              disabled={!acceptConditionResponses}
            >
              Save JSON and finish
            </button>
          </footer>
          {conditionSavedMessage ? (
            <p className="user-study-li-save-message">{conditionSavedMessage}</p>
          ) : null}
        </form>
      </div>
    )
  }

  if (conditionCompleted) {
    return (
      <div className="user-study-li-form-page user-study-li-session-page">
        <section className="user-study-li-session-card" aria-labelledby="session-complete-title">
          <p className="user-study-li-kicker">UserStudyLi</p>
          <h1 id="session-complete-title">Study session complete</h1>
          <p>Research ID: {researchId}</p>
          <button className="user-study-li-primary-action" type="button" onClick={startNewSession}>
            Start new session
          </button>
        </section>
      </div>
    )
  }

  return (
    <div className="app-container flex h-dvh flex-col overflow-hidden">
      <main className="flex min-h-0 flex-1 flex-col">
        <ExercisePage
          key={exerciseId}
          exerciseId={exerciseId}
          exerciseTitle={exercise.title}
          standalone
          workspaceId={`userstudy-Li-${researchId || 'no-session'}-${exerciseId}`}
          settingsOverrides={SETTINGS}
          showAnswerHighlight={false}
          hideAnimationTransport
          hiddenBlockTypes={HIDDEN_BLOCK_TYPES}
          trackingEnabled={false}
          workspaceCloudSyncEnabled={false}
          showDebugSolution={false}
          wideTaskPanel
          onPreviousExercise={
            exerciseIndex > 0 ? () => setExerciseIndex((index) => index - 1) : undefined
          }
          onNextExercise={
            exerciseIndex < STUDY_EXERCISES.length - 1
              ? () => setExerciseIndex((index) => index + 1)
              : () => setConditionStarted(true)
          }
          transformObjects={styleStudyPoints}
          toggleLabelsOnLeftClick
        />
      </main>
    </div>
  )
}
