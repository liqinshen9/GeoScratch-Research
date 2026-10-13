# User study interaction tracking

Tracking runs only while `UserStudyLiPage` is mounted and a research session has started. Mouse activity, visibility and evaluation events are recorded only on GeoScratch exercise/tutorial screens (`phase = geoscratch`). Lecture screens record submitted answers and exercise start/completion times, with no mouse activity. Questionnaire screens record deliberate submissions, not mouse activity. Other tabs and applications are not tracked.

## Events recorded

| Event | Recorded information |
| --- | --- |
| `click` | Left/middle clicks, coordinates, button, click count, modifier keys, target element. Keyboard/programmatic activation is distinguished using the event's click count. |
| `context_menu` | Right-click/context-menu request, coordinates, target. |
| `drag_start` | Source element, starting coordinates, mouse button. Starts after movement reaches 5 pixels while a mouse button is held. |
| `drag_end` | Source and release target, starting/ending coordinates, duration, movement distance, cancellation reason. This detects a mouse gesture; it does not assert that a block was successfully moved or connected. |
| `wheel` | Every wheel input, its target, coordinates, x/y/z deltas, delta units, Ctrl modifier (potential zoom). Wheel input does not necessarily scroll. |
| `scroll` | Actual scroll position of the scrolling element, event count, start time and duration. Consecutive scroll events are grouped until 200 ms of inactivity. Programmatic scrolling also generates this event; it is not labelled as definitely caused by the mouse. |
| `screen_enter`, `screen_leave` | GeoScratch phase, condition, exercise and elapsed screen duration. Duration includes time while the tab is hidden. |
| `visibility_change` | Whether the study document is visible or hidden, while in GeoScratch. |
| `answer_submit` | Exact lecture submission, attempt represented as a separate record, submission timestamp, automatic correctness where available. Written answers are not automatically graded. |
| `questionnaire_submit` | Questionnaire type. Questionnaire content remains in the existing questionnaire payload. |
| `exercise_evaluation` | GeoScratch exercise ID, correctness, pass state, and per-step states when the evaluation changes. This includes initial states and is not necessarily a deliberate submission. |

Each event has a unique ID, stream ID, sequence number, UTC timestamp, elapsed time from tracker start, research ID, study order and condition/phase/exercise context. GeoScratch activity records also include viewport dimensions; lecture submissions do not. Sequence numbers apply within a stream. Timestamps are browser-generated; there is no Firebase receipt timestamp yet.

## Lecture exercise timing

Each lecture exercise starts when its screen opens. Its JSON includes `startedAt`, `completedAt`, and `durationMs`. Completion is the click on **Next** (exercise 1) or **Continue to questionnaire** (exercise 2), so duration includes reading the slides and time after the last submission. Each submission also has `elapsedMs`, the time since that exercise opened. Repeated submissions retain their own latencies and timestamps. Exercises without a recorded completion have null completion time and duration rather than being reported as completed.

Start times save immediately in `userstudyLi.lectureExerciseTiming.<researchId>`. Durations use the browser's monotonic clock to avoid wall-clock adjustments. They include time while the tab is hidden; no lecture mouse or visibility tracking is added.

## Element identification

Click/drag/scroll targets include their app area, HTML/SVG tag, element ID, explicit tracking ID if present, role, name, input type, accessible label, selector and CSS classes. Button children resolve to the containing button. Text labels are capped at 200 characters. Blockly blocks are resolved against the active workspace for their block ID and type when possible.

Areas distinguish the block toolbox, block palette, block workspace, 3D view, exercise instructions, tutorial guide, lecture slides, cube diagrams, written answer area, answer options, questionnaires and navigation. Other elements use `study-page`. Icon controls without labels may have only a selector, role, ID or classes. Selectors describe the DOM at event time and may change as the UI changes.

3D canvas interactions identify the canvas/view, not a specific 3D object. Mouse coordinates alone do not identify a rendered object. Future raycast/selection instrumentation can add object identities. DOM clicks record panel-opening controls, but do not independently prove a panel opened successfully. Panel state and Blockly connection events can be added as semantic events later.

Ordinary mouse movement is not stored. Movement during a pressed gesture is used only to determine drag threshold and total distance; a full cursor trajectory is not stored. Typed text, field values, keystrokes, full DOM snapshots and IP addresses are not collected by this tracker. Deliberately submitted lecture answers are recorded in full.

## Saving and exporting

Records are buffered and written to append-only localStorage batches every second or after 100 events. Pending records are flushed on screen changes, answer submissions, tab hiding, window blur, page hiding and cleanup. Existing batches are never overwritten by later attempts or sessions. Records use keys beginning `userstudyLi.interactions.<researchId>.`.

Questionnaires autosave their latest answers as local drafts. Demographic and condition questionnaires use **Next**, which saves/submits the answers before continuing; the final questionnaire uses **Submit session**. There is no Skip questionnaire button. Navigating away without submission still retains drafts with status `not-submitted` and a null submission timestamp. Partial answers and unanswered fields remain in the export.

On session completion, one ZIP contains a folder named by research ID and nine numbered JSON files in the selected condition order. Each questionnaire has its own file; each lecture exercise has all of its timestamped submissions in one file; each GeoScratch exercise has its own chronological event list. Tutorial events are included at the start of the GeoScratch trial file. Files explicitly identify condition number and condition name. Questionnaire exports retain one `responses` list containing question IDs, wording, answers and optional details; they omit duplicate answer maps, raw draft copies and `route`. Tracking events omit repeated session metadata carried by the enclosing file.

For lecture-first, the order is: demographics, lecture exercise 1, lecture exercise 2, condition 1 questionnaire, GeoScratch trial, GeoScratch exercise 1, GeoScratch exercise 2, condition 2 questionnaire, post-study questionnaire. GeoScratch-first reverses the condition groups. Revisited exercise events stay in that exercise's file and remain chronological by timestamp and event sequence.

**Settings > General > User study mode** controls automatic downloading: on downloads the ZIP once at completion; off disables automatic downloads for development. The setting persists per browser and defaults to off. It does not change the route or study sequence.

Local draft saving and tracking backups remain enabled in either mode. The ordered file payloads are saved at `userstudyLi.sessionExport.<researchId>`. The completion page's **Download study data (ZIP)** works in either mode. Individual questionnaire submissions do not trigger separate downloads. Extracting the ZIP produces the requested research-ID folder; the app does not silently write a folder to the participant's disk.

This is local browser storage, not a Firebase integration. No Firebase package, project configuration or cloud upload has been added. Browser storage can be cleared or fill up; failures produce a warning in the exercise/completion views and pending in-memory events remain available for export. Sudden process termination can lose the unflushed buffer. Central storage will require Firebase configuration and a retry queue that acknowledges uploads and reuses event IDs.

The study's separate consent form explains the tracking; the session start page does not repeat that notice. Retention and participant consent follow the study's existing procedure.
