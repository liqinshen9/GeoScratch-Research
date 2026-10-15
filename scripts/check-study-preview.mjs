// Fresh local developer preview. This check must never contact Firebase.
import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const firebaseRequests = [], errors = [], downloads = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('download', (download) => downloads.push(download.suggestedFilename()))
  await page.route(/https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com\//, (route) => {
    firebaseRequests.push(route.request().url())
    return route.abort()
  })
  await page.goto('http://localhost:5173/settings')
  const toggle = page.getByRole('checkbox', { name: 'User study mode', exact: true })
  await toggle.check()
  await toggle.uncheck()
  await page.goto('http://localhost:5173/userstudy-Li')
  await page.getByRole('button', { name: 'Start new session', exact: true }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: /Condition 2: Lecture slides/ }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: 'Previous', exact: true }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: 'Continue to questionnaire', exact: true }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: 'Skip tutorial', exact: true }).click()
  await page.waitForFunction(async () => Boolean((await import('/src/store/useWorkspaceStore.js')).default.getState().workspace))
  await page.evaluate(async () => {
    const ws = (await import('/src/store/useWorkspaceStore.js')).default.getState().workspace
    const point = ws.newBlock('linalg_point')
    point.initSvg(); point.render(); point.setFieldValue('7', 'X'); point.dispose(false)
  })
  await page.getByRole('button', { name: 'Next preview step', exact: true }).click()
  await page.getByRole('button', { name: 'Previous preview step', exact: true }).click()
  await page.getByRole('button', { name: 'Next preview step', exact: true }).click()
  await page.getByRole('button', { name: 'Next preview step', exact: true }).click()
  await page.getByRole('button', { name: 'Next preview step', exact: true }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: 'Submit session', exact: true }).click()
  await page.getByRole('heading', { name: 'Study session complete', exact: true }).waitFor()
  const result = await page.evaluate(async () => ({
    mode: (await import('/src/store/useSettingsStore.js')).default.getState().settings.userStudyMode,
    questionnaires: (await import('/src/study/session/questionnaireDrafts.js')).readSessionQuestionnaires(
      [...document.querySelectorAll('p')].find((item) => item.textContent.startsWith('Research ID: ')).textContent.slice(13)),
    savedKeys: Object.keys(localStorage).filter((key) => key.startsWith('userstudyLi.')),
    activeSession: await (await import('/src/study/session/studyRecoveryStore.js')).readActiveStudySession(),
  }))
  if (result.mode || result.questionnaires.length || result.savedKeys.length || result.activeSession
    || firebaseRequests.length || downloads.length || errors.length
    || await page.getByRole('timer').count() || await page.getByRole('button', { name: 'Download study data (ZIP)' }).count()) {
    throw new Error(JSON.stringify({ result, firebaseRequests, downloads, errors }))
  }
  console.log('Developer preview passed: real settings toggle, free Previous/Next, block edits, full questionnaire flow, zero Firebase requests, no saved answers/session reference, no timer, and no ZIP downloads.')
} finally { await browser.close() }
