// Uses the existing Firebase project login. Tokens never leave this process.
import { spawnSync } from 'node:child_process'
const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', 'pnpm dlx firebase-tools login:list --json'], { encoding: 'utf8', windowsHide: true })
if (result.status !== 0) throw new Error('Firebase project login is unavailable.')
const login = JSON.parse(result.stdout.slice(result.stdout.indexOf('{'))).result?.[0]
if (!login?.user?.email_verified || !login.tokens?.access_token) throw new Error('A verified Firebase project login is required.')
const email = login.user.email
const response = await fetch(`https://firestore.googleapis.com/v1/projects/geoscratch-50162/databases/(default)/documents/studyResearcherEmails/${encodeURIComponent(email)}`, {
  method: 'PATCH', headers: { Authorization: `Bearer ${login.tokens.access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ fields: { enabled: { booleanValue: true } } }),
})
if (!response.ok) throw new Error(`Researcher authorization failed: HTTP ${response.status}`)
console.log(`Researcher recovery enabled for the existing Firebase project account: ${email}`)
const configUrl = 'https://identitytoolkit.googleapis.com/admin/v2/projects/geoscratch-50162/config'
const authorization = { Authorization: `Bearer ${login.tokens.access_token}`, 'Content-Type': 'application/json' }
const configResponse = await fetch(configUrl, { headers: authorization })
if (!configResponse.ok) throw new Error(`Authentication configuration check failed: HTTP ${configResponse.status}`)
const config = await configResponse.json()
if (!config.authorizedDomains?.includes('localhost')) {
  const domainResponse = await fetch(`${configUrl}?updateMask=authorizedDomains`, {
    method: 'PATCH', headers: authorization,
    body: JSON.stringify({ authorizedDomains: [...(config.authorizedDomains ?? []), 'localhost'] }),
  })
  if (!domainResponse.ok) throw new Error(`Localhost researcher sign-in configuration failed: HTTP ${domainResponse.status}`)
}
console.log('Localhost is authorized for researcher Google sign-in.')
