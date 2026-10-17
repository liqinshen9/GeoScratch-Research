# Firebase setup for GeoScratch

The Firebase SDK and study screens connect to `geoscratch-50162`. All questionnaire
answers (including drafts), lecture answers/timings, and compact GeoScratch results
are saved in Firestore. Detailed interactions for the trial and both GeoScratch
exercises write directly to Firestore, without browser history or an offline queue.
Only session references and authentication identity are kept on the device.

Recording applies only when **Settings → User study mode** is on. With the toggle
off, the study is a developer preview: no Firebase requests, questionnaire drafts,
answer history, interaction logs, session recovery references, timers, or ZIP
downloads are created. Previous/Next preview controls allow browsing without
submitting answers. The separate researcher results page remains available for
authorized retrieval of existing participant data.

## Console setup

1. Open the existing GeoScratch project. Go to **Settings → Project settings →
   General → Your apps**. Add a Web app (`</>`) called GeoScratch if one does not
   exist. Hosting is not required. Copy the `firebaseConfig` object.
2. Create `.env.local` using `.env.example`. Copy `apiKey`, `authDomain`,
   `projectId`, and `appId` into the corresponding values. Restart the development
   server after changing them. These web identifiers are public configuration;
   never put an Admin SDK service-account private key in this application.
3. Open **Databases & Storage → Firestore → Create database**. Choose **Standard
   edition**, the `(default)` database, and **production mode**. Suggested region
   for participants in New Zealand: `australia-southeast1` (Sydney), subject to
   your study's data-location requirements. The database location is permanent.
4. Open **Security → Authentication → Get started → Sign-in method**. Enable
   **Anonymous** for participants and **Google** for researchers. Add `localhost`
   to Authentication's authorized domains for local development.
5. In **Firestore → Rules**, replace the initial rules with `firestore.rules`
   from this repository and click **Publish**. These rules allow each authenticated
   participant to access only their own sessions. Other browser clients cannot
   read those answers. Authorized researchers can retrieve results by research ID.
   Researcher authorization is read-only. Do not use public test-mode rules.

The console menus may differ slightly by layout. Firebase Hosting, Analytics,
Cloud Storage, and Realtime Database are not needed for these records.

## Planned records

Path: `studyParticipants/{anonymousUid}/sessions/{randomSessionId}/records/{stageId}`.
The parent session contains the research ID, study order, schema version, and
server creation time. Random session IDs avoid overwriting a repeated study.

| Stage | Saved data |
| --- | --- |
| demographics | All questionnaire answers, draft/submitted status, dates |
| lecture-exercise-1, lecture-exercise-2 | Answers, correctness, attempts, duration |
| condition-1, condition-2 | Questionnaire answers and which condition was completed |
| geoscratch-trial, geoscratch-exercise-1, geoscratch-exercise-2 | Duration, pass status, completion/timeout status, Check counts per step, More help counts per step and exercise |
| post-study | Submitted questionnaire answers |

Detailed events are under `sessions/{sessionId}/interactions/{eventId}`. Each has
research/session/exercise IDs, a timestamp, stream/sequence, type, and complete
JSON in `dataJson`. Oversized events use `payloadChunks` referencing bounded JSON
parts in `interactionPayloads/{eventId}-{index}`. The manifest is written last.
History includes creation/deletion (including nested block state), field old/new
values, connections/disconnections, actual rejection warning messages, UI click
areas and picked 3D objects, step checks/completions, evaluations/feedback, and
workspace snapshots after changes and at exit/timeout. Snapshots use Blockly's
nested JSON and include My Blocks definitions. Type-compatible connections are
distinguished from mathematical correctness, which is recorded in evaluations
with the corresponding workspace revision. Tutorial activity is excluded.
The separate `recovery/current` document is the latest cloud resume checkpoint.

Authentication now persists in IndexedDB so refresh retains the participant's
identity. IndexedDB `geoscratch-study-recovery` now holds only the active ID and
Firebase session references, never answers or snapshots. Refresh reads answers
and workspace state from Firebase and requires internet. There is no retained
in-memory interaction history; only promises for writes awaiting acknowledgment.
An interaction write failure is visible and prevents unconfirmed manual advancement.
Closing/refreshing offline cannot recover unacknowledged events. Summary/checkpoint
writes retain their existing retry mechanism while the current page stays open.

The participant route `/userstudy-Li` automatically restores the active session
before showing a start screen. Refresh keeps the same research ID, answers,
workspace, counters, and timer deadline. Only an intentional new session generates
a new ID. Participants have no research-ID lookup or researcher sign-in controls.

Questionnaire Next, lecture Next/Continue, study-order selection, and exercise Next
wait for Firebase acknowledgment of the stage records and checkpoint before
advancing. GeoScratch Next also waits for outstanding interaction writes.
If offline or the save is unconfirmed after 12 seconds, the page stays on its
current stage, preserves the answers, and asks the participant to retry Next.
Countdown expiry still follows the required automatic timeout navigation, with
its final workspace captured synchronously before advancing and sent to Firestore.

Researchers use the separate route `/study-results`: press **Researcher sign-in**,
sign in with an authorized Google account, enter the ID, and recover a read-only
view with a ZIP download. The researcher page does not expose local participant
backups as a shortcut around researcher authentication. Another computer can
retrieve only data already uploaded; changes
made entirely offline must first upload from the original device. Clearing browser
site data also removes device-only changes.

The existing Firebase project account `liqinshen9@gmail.com` is authorized via the
admin-managed document `studyResearcherEmails/liqinshen9@gmail.com` with
`enabled: true`. Other researcher accounts must be explicitly authorized in that
collection or `studyResearchers/{uid}`. Participants cannot grant their own access.
The collection-group index on `sessions.researchId` is deployed for lookup.

## Verified setup (15 October 2026, New Zealand time)

- The web configuration is in the ignored `.env.local` file.
- Firestore API is enabled and these rules are published.
- The default Standard edition database is in **nam5 (United States)**. The rules
  deployment provisioned the default database; the proposed Sydney location was
  not applied. No database has been deleted or replaced.
- Anonymous Authentication is enabled.
- A live `SETUP-TEST` session saved a sample demographics record and read it back.
  A second participant's read and write attempts and an unauthenticated read were
  rejected. The sample contains no participant answers.
- Verification can be repeated with `node scripts/check-firebase.mjs`; each run
  creates one labelled test session and two anonymous test accounts.
- The actual browser study flow saved demographics and a development trial to
  Firebase and displayed `Saved to Firebase · 2 study records` (test research ID
  `GYQHFG`). The test trial was intentionally unpassed, with repeated Check presses;
  it is test data, not a participant result. `node scripts/check-study-upload.mjs`
  repeats this check in a fresh headless Chrome session against localhost:5173.
- A browser test (research ID `QVHHV7`) edited demographics offline, refreshed and
  recovered it, recorded Check presses, refreshed again, then reconnected. The
  uploaded draft and three Check presses were verified in the original Firebase
  session, with no duplicate session. Repeat with `node scripts/check-study-recovery.mjs`.
- The extended browser test (`HQ7UQC`) also restored a Cube workspace and named
  My Block after refresh, then verified the pending result in the original cloud
  session. The full regression suite passed 509 tests; lint and build passed.
- The revised participant flow (`RWYUYV`) automatically resumed twice after
  refresh, preserved the original research ID, hid all recovery controls, blocked
  offline Next, and advanced only after the completed record reached Firebase.
  The full suite passed 511 tests; lint and build passed.
- The real researcher Google sign-in page opened successfully. Credentials were
  not entered during automated browser verification. Read-only researcher recovery
  and downloads have automated coverage with an authenticated-service mock.
- Live rules checks rejected another participant's reads, writes, and researcher
  research-ID lookup, plus unauthenticated reads.

Study-screen saves and compact exercise counters are connected. A session and
demographics draft are created before study-order selection. Every questionnaire
edit updates its draft; Next marks it submitted. Selecting an order updates the
same session.
Lecture records update on exercise entry, answer submission, and leaving each
exercise. GeoScratch records save on Next, Previous (development mode), or timeout;
the trial timer/duration starts after the tutorial is finished or skipped.

`result.steps` contains counters keyed by the instruction's stable step key.
`checkCount` includes repeated presses, including presses on a completed step.
`moreHelpCount` counts openings, not closing an expanded explanation. Zero counts
are included for unused steps. `passed` records the checker state when leaving,
`timedOut` marks expiry, and `completionReason` is next, previous, or timeout.
Development-mode results include `studyMode: false` and may be unpassed. Revisiting
an exercise replaces its result with the latest visit. No tutorial clicks are saved.

Acknowledged background saves stay quiet. In user study mode, a persistent
**Firebase upload not confirmed** warning shows the research ID when an upload
fails (including authentication, permissions, or quota errors), the browser goes
offline, or acknowledgment takes longer than 12 seconds. It includes **Retry
Firebase upload**, stays visible during retries, and clears only after Firebase
acknowledges the upload. Reconnecting alone does not clear it. A durable browser
backup still permits study progression while cloud uploads remain unconfirmed;
keep the original tab and browser data until recovery succeeds. Local backup
errors have a separate warning. Developer preview does not show upload warnings. The
latest acknowledged record for each stage is recoverable from Firebase. A new session
cannot be started from the completion screen while uploads are pending or failed.
ZIP downloads retrieve event history from Firestore; nested JSON histories are included
in each corresponding GeoScratch exercise file, while Firebase summary documents stay compact.
An internet connection is required for history downloads. Draft questionnaires
are sent with a draft status and are distinguishable from submitted responses.

Records are under **Firestore → Data → studyParticipants → participant UID →
sessions → session ID → records**. The session document has the research ID;
the top-level participant document shows `latestResearchId`, `latestSessionId`,
and `lastSavedAt` for the most recently uploaded session/checkpoint. The console's
document list still uses anonymous browser UIDs; select an entry to see its research
ID, then open **sessions** and the matching `latestSessionId` for its records.
One browser can have multiple sessions: the latest label does not replace their
individual research IDs. Older entries may still appear as missing documents until
that browser saves again. Publish the updated `firestore.rules` before using this
summary feature. Earlier trials from before this integration
are not automatically uploaded. Database region changes require a separate
decision before replacing the database.

Official references: [Web setup](https://firebase.google.com/docs/web/setup),
[Firestore setup](https://firebase.google.com/docs/firestore/quickstart),
[Anonymous authentication](https://firebase.google.com/docs/auth/web/anonymous-auth),
[Database locations](https://firebase.google.com/docs/firestore/locations).
