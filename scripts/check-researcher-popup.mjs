// Opens the real Google sign-in flow without entering any credentials.
import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage()
  await page.goto('http://localhost:5173/study-results')
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('button', { name: 'Researcher sign-in', exact: true }).click(),
  ])
  await popup.waitForURL((url) => url.hostname === 'accounts.google.com', { timeout: 30000 })
  console.log('Researcher Google sign-in flow opened successfully; no credentials entered.')
} finally { await browser.close() }
