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
| `tutorial_start` | Participant chooses Follow me; source is `welcome`. |
| `tutorial_skip` | Participant skips the tutorial; source distinguishes `welcome` from `in-tutorial`. |
| `tutorial_complete` | Participant chooses Start trial exercise at the end of the tutorial. |
| `block_create`, `block_delete` | IDs/types of created or deleted blocks and their serialized state, including descendants. |
| `block_field_change` | Field name, block ID/type, previous value and new value (for example DEGREES: 30 → 90). Dropdowns such as rotation axis are included. |
| `block_change` | Other committed block changes: mutation, comment, collapse/expand, enabled state and inline layout. |
| `block_move` | Old/new parent, socket name, position and Blockly move reasons. |
| `block_connect`, `block_disconnect` | Exact child block, parent block/type and input socket. Blockly uses an absent input name for next/previous statement links. |
| `block_drag_start`, `block_drag_result` | Blockly drag ID, dragged block IDs, actual connections before/after drop, new/removed connections, connected/unconnected outcome and whether a warning appeared. |
| `connection_warning` | The actual incompatible-block warning text when shown, dragged/target block IDs and types, socket/type constraints and drag ID when available. No warning is invented for compatible blocks that merely compute a wrong answer. |
| `blockly_event` | Block selection/clicks, toolbox-category selection, workspace viewport changes and variable create/delete/rename events. |
| `workspace_undo`, `workspace_redo` | Operation and whether the serialized workspace changed; followed by a snapshot. |
| `workspace_snapshot` | Complete Blockly JSON state, block positions/connections/fields, viewport and saved custom-block definitions. Recorded initially, at exit/page hiding, on snapshot requests and after undo/redo. |
| `scene_object_click`, `scene_context_menu` | Raycast object identity/type, geometry type, source block ID, labels, point coordinates where present, world position and hit position. Empty-space selection has a null object. |
| `labels_toggle` | Label visibility keys and new visible/hidden state. |
| `camera_control_start`, `camera_control_end` | Camera position, orientation, zoom and OrbitControls target at control start/end, not a continuous camera replay. |
| `panel_state` | Actual toolbox category, palette/trash open states and Make a Block dialog state after React changes them. |
| `custom_block_saved`, `custom_block_updated`, `custom_block_deleted` | Saved My Blocks definitions and names, with before/after state for edits. |

Each event has a unique ID, stream ID, sequence number, UTC timestamp, elapsed time from tracker start, research ID, study order and condition/phase/exercise context. GeoScratch activity records also include viewport dimensions; lecture submissions do not. Sequence numbers apply within a stream. Timestamps are browser-generated; there is no Firebase receipt timestamp yet.

## GeoScratch exercise files and tutorial outcomes

The trial file (`geoscratch_trial.json`) contains tutorial/welcome events followed by the trial exercise for creating the cube-and-corner-point object. Its `tutorial` summary explicitly reports `skipped`, `skipped-after-start`, `completed`, `started`, or `not-recorded`, with start/skip/completion timestamps and skip source. Exercise 1 tracks rotating the cube and corner point; Exercise 2 tracks the point-to-plane distance exercise. Tutorial skipping has its own semantic event in addition to any captured mouse click, including cancellation of the welcome dialog.

Post-study usability Section A includes `tutorialEffectiveness`: “The tutorial animation helped me learn how to use GeoScratch to complete the exercises.” It uses the existing 1–5 agreement scale plus “Not applicable — I did not use the tutorial”. The answer is autosaved and included in the post-study JSON.

## Lecture exercise timing

Each lecture exercise starts when its screen opens. Its JSON includes `startedAt`, `completedAt`, and `durationMs`. Completion is the click on **Next** (exercise 1) or **Continue to questionnaire** (exercise 2), so duration includes reading the slides and time after the last submission. Each submission also has `elapsedMs`, the time since that exercise opened. Repeated submissions retain their own latencies and timestamps. Exercises without a recorded completion have null completion time and duration rather than being reported as completed.

Start times save immediately in `userstudyLi.lectureExerciseTiming.<researchId>`. Durations use the browser's monotonic clock to avoid wall-clock adjustments. They include time while the tab is hidden; no lecture mouse or visibility tracking is added.

## Element identification

Click/drag/scroll targets include their app area, HTML/SVG tag, element ID, explicit tracking ID if present, role, name, input type, accessible label, selector and CSS classes. Button children resolve to the containing button. Text labels are capped at 200 characters. Blockly blocks are resolved against the active workspace for their block ID and type when possible.

Areas distinguish the block toolbox, block palette, block workspace, 3D view, exercise instructions, tutorial guide, lecture slides, cube diagrams, written answer area, answer options, questionnaires and navigation. Other elements use `study-page`. Icon controls without labels may have only a selector, role, ID or classes. Selectors describe the DOM at event time and may change as the UI changes.

Raw mouse events still identify the canvas/view. Separate scene-picking events identify the actual raycast object and its source block. UUIDs identify the rendered object at that moment; source block IDs link objects across scene rebuilds. Raw clicks on panel controls are supplemented by `panel_state`. Generic pointer drags are supplemented by Blockly connection events and an actual graph check after drop.

Ordinary mouse movement is not stored. Movement during a pressed gesture is used only to determine drag threshold and total distance; a full cursor trajectory is not stored. Committed Blockly field values, comments, mutations and variable names are recorded, including programmatic changes that emit Blockly events. `recordUndo` and event groups are retained; the logger does not assert that every emitted change was typed by the participant. Raw keystrokes, uncommitted or rejected field text, full DOM snapshots and IP addresses are not collected. Deliberately submitted lecture answers are recorded in full.

## Final workspace and reconstruction

Each GeoScratch exercise file includes `finalWorkspace`, the latest complete snapshot for that exercise (or null if none was captured). It contains `capturedAt`, capture reason, `format: blockly-json`, serialized `state`, workspace viewport and `customBlocks`. The full latest snapshot is placed here once; its timeline event keeps the capture reason but omits the duplicate state. Earlier snapshots remain in the chronological events. Tutorial snapshots stay within the trial timeline and do not replace the final trial arrangement.

Blockly JSON preserves nested inputs, statement chains, field values, block IDs, positions and extra state. Restore it with Blockly's workspace serialization loader in an editor with the same block definitions and saved custom blocks registered. Undo/redo and initial snapshots provide checkpoints in addition to the change timeline. This is sufficient to inspect the final arrangement; an automatic replay/viewer UI is not included.

## Saving and exporting

Records are buffered and written to append-only localStorage batches every second or after 100 events. Pending records are flushed on screen changes, answer submissions, tab hiding, window blur, page hiding and cleanup. Existing batches are never overwritten by later attempts or sessions. Records use keys beginning `userstudyLi.interactions.<researchId>.`.

Questionnaires autosave their latest answers as local drafts. Demographic and condition questionnaires use **Next**, which saves/submits the answers before continuing; the final questionnaire uses **Submit session**. There is no Skip questionnaire button. Navigating away without submission still retains drafts with status `not-submitted` and a null submission timestamp. Partial answers and unanswered fields remain in the export.

On session completion, one ZIP contains a folder named by research ID and nine numbered JSON files in the selected condition order. Each questionnaire has its own file; each lecture exercise has all of its timestamped submissions in one file; each GeoScratch exercise has its own chronological event list. Tutorial events are included at the start of the GeoScratch trial file. Files explicitly identify condition number and condition name. Questionnaire exports retain one `responses` list containing question IDs, wording, answers and optional details; they omit duplicate answer maps, raw draft copies and `route`. Tracking events omit repeated session metadata carried by the enclosing file.

For lecture-first, the order is: demographics, lecture exercise 1, lecture exercise 2, condition 1 questionnaire, GeoScratch trial, GeoScratch exercise 1, GeoScratch exercise 2, condition 2 questionnaire, post-study questionnaire. GeoScratch-first reverses the condition groups. Revisited exercise events stay in that exercise's file and remain chronological by timestamp and event sequence.

**Settings > General > User study mode** controls automatic downloading: on downloads the ZIP once at completion; off disables automatic downloads for development. The setting persists per browser and defaults to off. It does not change the route or study sequence.

Local draft saving and tracking backups remain enabled in either mode. The ordered file payloads are saved at `userstudyLi.sessionExport.<researchId>`. The completion page's **Download study data (ZIP)** works in either mode. Individual questionnaire submissions do not trigger separate downloads. Extracting the ZIP produces the requested research-ID folder; the app does not silently write a folder to the participant's disk.

This is local browser storage, not a Firebase integration. No Firebase package, project configuration or cloud upload has been added. Browser storage can be cleared or fill up; failures produce a warning in the exercise/completion views and pending in-memory events remain available for export. Automatic ZIP download is still attempted in user study mode if the final local backup fails. Sudden process termination can lose the unflushed buffer. Central storage will require Firebase configuration and a retry queue that acknowledges uploads and reuses event IDs.

The study's separate consent form explains the tracking; the session start page does not repeat that notice. Retention and participant consent follow the study's existing procedure.

## Recovering unfinished sessions

Open `/study-recovery.html` on the original study origin (same domain and port) in the participant's original browser profile. The standalone page reads storage without starting a study, mounting the app, writing records, or clearing anything. Download **all saved study data** first: the JSON preserves exact original storage strings, including malformed entries. Individual session downloads collect questionnaire drafts and legacy submitted copies, lecture submissions/timings, interaction records, saved workspace XML, custom blocks, and any completed archive. Sessions are listed by their earliest recorded timestamp so an earlier unknown research ID can be identified. Distinct draft and submitted answers are retained; sessions are never automatically merged. Missing timestamps stay null, and records that never reached storage cannot be reconstructed.

Questionnaire backup copies no longer duplicate the entire interaction log or lecture submissions. These records are stored separately. Full/unavailable storage cannot throw out of questionnaire autosave or submission and block navigation: failed questionnaire writes remain in memory for the current tab's final ZIP, with a visible warning to finish and download before closing/refreshing. This fallback is not durable across a refresh. Existing saved sessions and legacy backups are left intact.
