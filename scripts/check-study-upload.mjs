// Starts a fresh development-mode test session, containing no participant data.
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto('http://localhost:5173/userstudy-Li')
  await page.getByRole('button', { name: 'Start new session', exact: true }).click()
  const researchId = await page.locator('input[readonly]').inputValue()
  // Label the session clearly; all demographics choices are left unanswered.
  await page.locator('.user-study-li-detail input').first().fill('SETUP TEST — no participant data')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.locator('.user-study-li-cloud-status.is-saved').filter({ hasText: '1 study records' }).waitFor({ timeout: 30000 })
  console.log('Demographics saved before study-order selection.')
  await page.getByRole('button', { name: /Condition 1: GeoScratch/ }).click()
  await page.getByRole('button', { name: 'Skip tutorial', exact: true }).click()
  const check = page.locator('.exercise-step-check[data-step-key="cube"]')
  await check.click()
  await check.click()
  const help = page.getByRole('button', { name: 'More help', exact: true }).first()
  if (await help.count()) await help.click()
  await page.getByRole('button', { name: 'Next exercise', exact: true }).click()
  await page.locator('.user-study-li-cloud-status.is-saved').filter({ hasText: '2 study records' }).waitFor({ timeout: 30000 })
  await mkdir('artifacts', { recursive: true })
  await page.screenshot({ path: 'artifacts/firebase-study-upload.png', fullPage: true })
  console.log(`Browser study upload passed. Test research ID: ${researchId}`)
  console.log(await page.locator('.user-study-li-cloud-status').textContent())
} finally { await browser.close() }
