// Fresh labelled test session only; never opens an existing participant browser.
import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on('pageerror', (error) => console.error('Browser error:', error.message))
  await page.goto('http://localhost:5173/userstudy-Li')
  await page.evaluate(async () => (await import('/src/store/useSettingsStore.js')).default.getState().updateSetting('userStudyMode', true))
  await page.getByRole('button', { name: 'Start new session', exact: true }).click()
  const researchId = await page.locator('input[readonly]').inputValue()
  console.log(`Interaction verification session: ${researchId}`)
  await page.locator('.user-study-li-detail input').first().fill('INTERACTION SETUP TEST — no participant data')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('heading', { name: 'Choose the study order', exact: true }).waitFor()
  await page.getByRole('button', { name: /Condition 1: GeoScratch/ }).click()
  await page.getByRole('button', { name: 'Skip tutorial', exact: true }).click()
  await page.locator('.exercise-step-check[data-step-key="cube"]').waitFor()
  await page.evaluate(async () => {
    const { default: store } = await import('/src/store/useWorkspaceStore.js')
    const Blockly = await import('/node_modules/.vite/deps/blockly_core.js')
    const ws = store.getState().workspace
    const make = (type) => { const block = ws.newBlock(type); block.initSvg(); block.render(); return block }
    const cube = make('geo_cube'), point = make('linalg_point'), scalar = make('scalar')
    await new Promise((resolve) => setTimeout(resolve, 50))
    point.setFieldValue('7', 'X')
    cube.getInput('CENTRE').connection.connect(point.outputConnection)
    await new Promise((resolve) => setTimeout(resolve, 50))
    point.unplug()
    Blockly.Events.fire(new Blockly.Events.BlockDrag(scalar, true, [scalar]))
    await new Promise((resolve) => setTimeout(resolve, 50))
    scalar.outputConnection.distanceFrom = () => 5
    ws.connectionChecker.canConnectWithReason(scalar.outputConnection, cube.getInput('CENTRE').connection, true, 5)
    Blockly.Events.fire(new Blockly.Events.BlockDrag(scalar, false, [scalar]))
    await new Promise((resolve) => setTimeout(resolve, 50))
    cube.getInput('CENTRE').connection.connect(point.outputConnection)
    await new Promise((resolve) => setTimeout(resolve, 50))
    cube.dispose(false)
  })
  await page.locator('.exercise-step-check[data-step-key="cube"]').click()
  for (const selector of ['.editor-body-3d canvas', '.blocks-col--workspace', '.blocks-col--toolbox']) {
    const box = await page.locator(selector).first().boundingBox()
    await page.mouse.click(box.x + 12, box.y + 70)
  }
  await page.waitForFunction(async (id) => {
    const api = await import('/src/study/firebase/studyFirebase.js')
    const remote = await api.recoverFirebaseStudy(id)
    const events = await api.readFirebaseStudyInteractions(remote.firebaseSession)
    const areas = events.filter((event) => event.type === 'click').map((event) => event.target?.area)
    return ['block_create', 'block_delete', 'block_field_change', 'block_connect', 'block_disconnect', 'connection_warning', 'workspace_snapshot', 'step_check', 'scene_object_click']
      .every((type) => events.some((event) => event.type === type)) && ['3d-view', 'block-workspace', 'block-toolbox'].every((area) => areas.includes(area))
  }, researchId, { timeout: 60000, polling: 1500 })
  const checked = await page.evaluate(async (id) => {
    const api = await import('/src/study/firebase/studyFirebase.js')
    const remote = await api.recoverFirebaseStudy(id)
    const events = await api.readFirebaseStudyInteractions(remote.firebaseSession)
    const deleted = events.find((event) => event.type === 'block_delete' && event.state?.inputs?.CENTRE)
    if (!deleted || deleted.state.inputs.CENTRE.block.fields.X !== 7) throw new Error('Deleted nested block state was not preserved.')
    const warning = events.find((event) => event.type === 'connection_warning')
    if (!warning.message || warning.connectionAccepted !== false) throw new Error('Connection warning was not preserved.')
    const reference = await (await import('/src/study/session/studyRecoveryStore.js')).readStudyBackup(id)
    if ('snapshot' in reference) throw new Error('Results were written to browser storage.')
    const recovered = (await import('/src/study/session/recoveredSession.js')).recoveredSession(remote, id)
    const archive = (await import('/src/study/session/sessionExport.js')).buildSessionFiles({ ...recovered, interactionLog: events })
    if (!archive.files.some((file) => file.data.interactions?.some((event) => event.eventId === deleted.eventId))) throw new Error('Nested deletion history was missing from the export.')
    const areas = events.filter((event) => event.type === 'click').map((event) => event.target?.area)
    if (!['3d-view', 'block-workspace', 'block-toolbox'].every((area) => areas.includes(area))) throw new Error('Click area classification was incomplete.')
    return { count: events.length, session: remote.firebaseSession }
  }, researchId)
  // The trial is intentionally incomplete. Use its real study timeout instead
  // of bypassing participant navigation restrictions.
  await page.waitForFunction(async (id) => Boolean((await (await import('/src/study/firebase/studyFirebase.js')).recoverFirebaseStudy(id)).snapshot?.activeGeoResult), researchId)
  await page.evaluate(async (id) => {
    const api = await import('/src/study/firebase/studyFirebase.js')
    const remote = await api.recoverFirebaseStudy(id)
    remote.snapshot.activeGeoResult.startedAt = new Date(Date.now() - 301000).toISOString()
    await api.saveFirebaseStudyRecovery(remote.firebaseSession, remote.snapshot)
  }, researchId)
  await page.reload()
  await page.getByRole('heading', { name: 'Rotate a cube and its corner point', exact: true }).waitFor()
  // Expire the current exercise from its cloud checkpoint and restore from Firebase.
  await page.waitForFunction(async (id) => {
    const remote = await (await import('/src/study/firebase/studyFirebase.js')).recoverFirebaseStudy(id)
    return remote.snapshot?.exerciseIndex === 1 && remote.snapshot?.activeGeoResult?.exerciseId === 'cube-point-pivot-rotation'
  }, researchId, { timeout: 30000, polling: 1500 })
  await page.evaluate(async (id) => {
    const api = await import('/src/study/firebase/studyFirebase.js')
    const remote = await api.recoverFirebaseStudy(id)
    const snapshot = remote.snapshot
    snapshot.userStudyMode = true
    snapshot.activeGeoResult.startedAt = new Date(Date.now() - 601000).toISOString()
    await api.saveFirebaseStudyRecovery(remote.firebaseSession, snapshot)
  }, researchId)
  await page.reload()
  await page.waitForFunction(() => document.querySelector('[data-exercise-id="point-plane-distance"]'), null, { timeout: 15000 }).catch(async (error) => {
    console.log(await page.evaluate(async (id) => {
      const api = await import('/src/study/firebase/studyFirebase.js')
      const remote = await api.recoverFirebaseStudy(id)
      return { text: document.body.innerText.slice(0, 600), studyMode: (await import('/src/store/useSettingsStore.js')).default.getState().settings.userStudyMode,
        checkpoint: { phase: remote.snapshot?.phase, exerciseIndex: remote.snapshot?.exerciseIndex, tutorialPhase: remote.snapshot?.tutorialPhase,
          startedAt: remote.snapshot?.activeGeoResult?.startedAt, studyMode: remote.snapshot?.userStudyMode } }
    }, researchId))
    throw error
  })
  await page.waitForFunction(async (session) => {
    const events = await (await import('/src/study/firebase/studyFirebase.js')).readFirebaseStudyInteractions(session)
    return events.some((event) => event.type === 'exercise_timeout' && event.exerciseId === 'cube-point-pivot-rotation' && event.result?.timedOut && event.snapshot)
  }, checked.session, { timeout: 30000, polling: 1500 })
  console.log(`Direct Firestore interaction check passed (${researchId}): ${checked.count}+ events, nested deletion, edits, connections, actual rejection warning, all click areas, cloud refresh, and timeout snapshot.`)
} finally { await browser.close() }
