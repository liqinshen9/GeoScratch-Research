// Starts a fresh development-mode test session, containing no participant data.
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto('http://localhost:5173/userstudy-Li')
  await page.evaluate(async () => (await import('/src/store/useSettingsStore.js')).default.getState().updateSetting('userStudyMode', true))
  await page.getByRole('button', { name: 'Start new session', exact: true }).click()
  const researchId = await page.locator('input[readonly]').inputValue()
  // Label the session clearly; all demographics choices are left unanswered.
  await page.locator('.user-study-li-detail input').first().fill('SETUP TEST — no participant data')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('heading', { name: 'Choose the study order', exact: true }).waitFor({ timeout: 30000 })
  console.log('Demographics saved before study-order selection.')
  await page.getByRole('button', { name: /Condition 1: GeoScratch/ }).click()
  await page.getByRole('button', { name: 'Skip tutorial', exact: true }).click()
  const check = page.locator('.exercise-step-check[data-step-key="cube"]')
  await check.click()
  await check.click()
  const help = page.getByRole('button', { name: 'More help', exact: true }).first()
  if (await help.count()) await help.click()
  await page.waitForFunction(async (id) => Boolean((await (await import('/src/study/firebase/studyFirebase.js')).recoverFirebaseStudy(id)).snapshot?.activeGeoResult), researchId)
  await page.evaluate(async (id) => {
    const api = await import('/src/study/firebase/studyFirebase.js')
    const remote = await api.recoverFirebaseStudy(id)
    remote.snapshot.activeGeoResult.startedAt = new Date(Date.now() - 301000).toISOString()
    await api.saveFirebaseStudyRecovery(remote.firebaseSession, remote.snapshot)
  }, researchId)
  await page.reload()
  await page.getByRole('heading', { name: 'Rotate a cube and its corner point', exact: true }).waitFor({ timeout: 30000 })
  const saved = await page.evaluate(async (id) => (await import('/src/study/firebase/studyFirebase.js')).recoverFirebaseStudy(id), researchId)
  if (!saved.records.some((record) => record.stageId === 'demographics') || !saved.records.some((record) => record.stageId === 'geoscratch-trial')) throw new Error('Study records did not upload.')
  await mkdir('artifacts', { recursive: true })
  await page.screenshot({ path: 'artifacts/firebase-study-upload.png', fullPage: true })
  console.log(`Browser study upload passed. Test research ID: ${researchId}`)
  if (await page.locator('.user-study-li-cloud-status').count()) throw new Error('Successful background saves should stay quiet.')
} finally { await browser.close() }
