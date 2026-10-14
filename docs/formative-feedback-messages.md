# GeoScratch formative feedback messages

Edit the live wording in `src/exercises/shared/feedbackMessages.js`. Preserve placeholders such as `{actual}`, `{expected}`, `{axes}`, `{name}`, `{position}`, and `{count}`: the checker fills these with the student's actual attempt. The diagnosis rules are in `src/exercises/shared/formativeFeedback.js`.

## Interface behaviour

- With User study mode on, Next requires the full exercise pass and Previous is disabled. The GeoScratch condition starts a 5-minute trial timer after the tutorial is completed or skipped, followed by 10-minute timers for rotation and distance. Timeout advances automatically, including to the condition questionnaire after the last exercise. With the setting off, there are no timers and exercise navigation is unrestricted. Turning the setting back on starts a fresh time allowance for the current exercise.
- The countdown appears in the 3D View heading and turns red when fewer than 10 seconds remain. Countdown wording: “Time remaining: {minutes}:{seconds}” (`src/pages/userStudyLi/ExerciseCountdown.jsx`). Timeout wording: “Time is up for {exercise name}. You have moved to the next question.” (`src/pages/UserStudyLiPage.jsx`). After automatic advancement, this appears as a floating notification for 5 seconds without shifting the page layout.
- Scalar blocks accept only finite values greater than 0. Zero and negative entries are rejected, retaining the previous valid value. Tooltip: “Enter a positive scalar greater than 0.” Edit that tooltip in `src/components/BlocksCanvas/blocks/linalgPrimitives/scalar.js`.
- **Check** shows feedback for that step, including an explanation when the step is correct.
- **More help** expands the explanation or expected values. Clicking it again collapses the explanation.
- Editing the workspace clears submitted feedback, so the student checks their new attempt again.
- When several attempts exist, the checker chooses the candidate satisfying the most checks for that step.
- Existing pass criteria are preserved. Feedback reports construction requirements, rather than claiming that every other mathematical approach is invalid.
- The sphere tutorial retains its existing hints through the shared interface fallback.

## When messages appear

| Message IDs | Situation |
| --- | --- |
| check, complete, moreHelp | Interface buttons. |
| incomplete, genericValues | Compatibility fallback for exercises without a diagnostic, including the sphere tutorial. |
| missing | No candidate block of the required type exists for this step. |
| input, inputHelp | A required socket is empty, has an unsupported block type, or has unreadable vector coordinates. |
| coordinate, coordinateHelp | One or more vector/point components differ from the exercise values. Only differing axes are named. |
| side, sideHelp | The cube's scalar side length differs from 2; sideHelp also explains a missing/incorrect side-length input. |
| save, saveHelp | Cube and corner point checks pass, but no recognised saved complex object exists. |
| buildBeforeSave | Cube or corner point checks do not yet pass when checking the save step. |
| pipeline, pipelineHelp | No pipeline has the required complex object connected. Also used before diagnosing transforms in that pipeline. |
| order, orderHelp | A pipeline position contains the wrong transformation type. |
| translation, originHelp, backHelp | Translation components differ from the specified first or third translation. |
| axis, axisHelp | The second transformation is a rotation whose axis is not Y. |
| angle, angleHelp | The second transformation rotates around Y, but its angle differs from positive 90 degrees. |
| extra, extraHelp | A recognised pipeline contains more than three transformations; shown on the final translation step. |
| planePending | Plane block inputs match the stated values but the rendered-plane check has not passed. |
| qPlane, qPlaneHelp | The selected Show Point on Object block is not connected to the exercise plane. |
| qPending | The selected Q block is connected to the exercise plane, but the rendered-point check has not passed. |
| operation, operationHelp | The selected Vector Arithmetic block uses an operation other than subtraction. |
| reversed, reversedHelp | Subtraction has the exercise Q in u and P in v. The explanation acknowledges the same distance magnitude can result. |
| differenceInputs, differenceHelp | Subtraction does not connect the required P in u and exercise Q in v. |
| qUnavailable | The normal direction matches but there is no computed Q from the recognised exercise Q block to compare its origin with. |
| normalOrigin, normalOriginHelp | The normal direction matches and its connected Point differs from the student's computed Q. normalOriginHelp also explains a missing Point origin. Uses the existing two-decimal-coordinate tolerance. |
| projectionReversed, projectionHelp | Projection has the required normal in u and the required P - Q construction in v. |
| projectionInputs, projectionHelp | Projection inputs otherwise fail the required displacement/normal checks. |
| magnitude, magnitudeHelp | The selected Vector Magnitude does not contain the required projection construction. |
| distancePending | The selected magnitude has the required construction, but no computed distance is available. |
| distanceValue, distanceHelp | A distance exists but the distance step fails despite a structurally valid magnitude candidate. Expected distance is derived from the given geometry. |
| cubeSuccess, pointSuccess, saveSuccess | Corresponding construction steps pass. |
| pipelineSuccess, originSuccess, rotationSuccess, backSuccess | Corresponding pipeline steps pass. Extra steps override backSuccess with extra-step feedback. |
| planeSuccess, pSuccess, qSuccess, differenceSuccess, normalSuccess, projectionSuccess, distanceSuccess | Corresponding distance exercise steps pass. Q may be any valid displayed point on the exercise plane. |

## Complete wording catalogue

This is the initial wording. After editing the live message file, update this catalogue if you need a matching review copy. Deeper explanations appear only after More help.

| Message ID | Exact template |
| --- | --- |
| check | Check |
| complete | Complete |
| moreHelp | More help |
| incomplete | This step is not complete yet. |
| genericValues | One of the values does not match the diagram. |
| missing | Add a {name} block for this step. |
| input | The {name} input is missing or uses a different block type. |
| inputHelp | Connect {expected} to this input. |
| coordinate | The {name} is currently {actual}. Check its {axes} coordinate(s). |
| coordinateHelp | For this step, {name} should be {expected}. |
| side | The cube’s side length is currently {actual}. Check it against the diagram. |
| sideHelp | Use a Scalar with value 2 for the side length. |
| save | The cube and corner point are correct. Save them together in My Blocks. |
| saveHelp | Open My Blocks, choose Make a Block, enter a name, and save. |
| buildBeforeSave | Complete the cube and corner point before saving the complex object. |
| pipeline | Connect the cube and corner point together to the Transform Pipeline input. |
| pipelineHelp | Use the block saved in the previous exercise, or an Object with Point containing the required cube and corner point. |
| order | Step {position} currently uses a different transformation type. |
| orderHelp | Use this order: translate to the origin, rotate around Y, then translate back. |
| translation | This translation is currently {actual}. Check its {axes} component(s). |
| originHelp | To move C = (1, 1, 1) to the origin, add (-1, -1, -1). Rotation then keeps the centre at the origin. |
| backHelp | After rotating, add (1, 1, 1) to return the centre to C. |
| axis | This rotation uses the {actual} axis. Compare it with the required Y axis. |
| axisHelp | Select Y. Rotation around Y keeps the Y coordinate fixed. |
| angle | This rotation uses {actual} degrees. Check the angle and its sign. |
| angleHelp | The specified transformation is a positive 90-degree rotation around Y. |
| extra | The pipeline contains {count} transformations; this exercise requires three. |
| extraHelp | Keep one translation to the origin, one Y rotation, and one translation back. |
| planePending | The plane inputs match the given values. Run the workspace to check the rendered plane. |
| qPlane | This Show Point on Object block is not connected to the required exercise plane. |
| qPlaneHelp | Connect the plane defined by A = (-5, 0, 2) and n = (0.5, 1, 0.5). Any point Q₁ on that plane is valid. |
| qPending | Run the workspace to display Q₁ on the plane, then click it to read its coordinates. |
| operation | This Vector Arithmetic block uses {actual}, rather than subtraction. |
| operationHelp | Choose subtraction and connect P as u and Q₁ as v to compute P − Q₁. |
| reversed | The subtraction inputs are reversed: this block computes Q₁ − P. |
| reversedHelp | For the requested construction, put P in u and Q₁ in v. Reversing the vector changes its direction, although its projection magnitude can still give the same distance. |
| differenceInputs | Check the subtraction inputs: u should be P and v should be the point Q₁ on the exercise plane. |
| differenceHelp | The displacement P − Q₁ points from Q₁ towards P. |
| qUnavailable | Display Q₁ on the exercise plane before checking the normal’s starting point. |
| normalOrigin | The normal starts at {actual}, which does not match the displayed Q₁ = {expected}. |
| normalOriginHelp | Copy your own Q₁ coordinates from the 3D view into the Point connected to the vector’s origin. Coordinates rounded to two decimal places are accepted. |
| projectionReversed | The projection inputs are swapped: the normal is in u and P − Q₁ is in v. |
| projectionHelp | Put P − Q₁ in u and n in v. Projecting onto the normal extracts the component perpendicular to the plane. |
| projectionInputs | This projection does not yet use P − Q₁ as u and the given normal as v. |
| magnitude | This Vector Magnitude block is not connected to the required projection. |
| magnitudeHelp | Connect the projection of P − Q₁ onto n to Vector Magnitude. Its length is the perpendicular distance. |
| distancePending | The required magnitude construction is connected. Run the workspace to update its distance. |
| distanceValue | The displayed distance is {actual}. Check the inputs used by the distance construction. |
| distanceHelp | With the given P and plane, the distance is \|(P − A) · n\| / \|n\| ≈ {expected}. |
| cubeSuccess | The cube has the required centre and side length. |
| pointSuccess | The corner point has the required coordinates. |
| saveSuccess | The complex object is saved in My Blocks. |
| pipelineSuccess | The required cube and corner point are connected to the pipeline. |
| originSuccess | The first translation moves C to the origin. |
| rotationSuccess | The second transformation rotates around Y by 90 degrees. |
| backSuccess | The third translation returns the centre to C. |
| planeSuccess | The plane uses the required defining point and normal. |
| pSuccess | P has the required coordinates. |
| qSuccess | Q₁ lies on the exercise plane. Other points on this plane are also valid. |
| differenceSuccess | The subtraction computes the displacement P − Q₁. |
| normalSuccess | The given normal starts at your displayed Q₁. |
| projectionSuccess | The projection extracts the displacement component along the normal. |
| distanceSuccess | The projection’s magnitude gives the perpendicular distance. |

## Tutorial: My Blocks after toggling labels

Tutorial and exercise interaction logs are no longer collected or exported. Study browser persistence is currently paused. Opening the study page clears old study records and study workspace copies from browser storage; settings and unrelated saved work are preserved. New answers, timings, study workspaces, and My Blocks remain in the active tab only and can be used during the session. The ZIP download contains the questionnaires, lecture answers and timings, and the small tutorial completion/skip summary.

Edit these titles and descriptions in `COPY` in `src/pages/userStudyLi/SessionTutorial.jsx`. The arrow and highlight follow the current action. The guide advances when the student opens My Blocks, opens the naming dialog, edits a nonempty name, and successfully saves the current workspace. Closing the palette or cancelling the dialog returns to the appropriate earlier action. A matching item saved earlier can be reused when watching the tutorial again.

| Situation | Title | Exact description |
| --- | --- | --- |
| Labels have been tried; My Blocks is closed | Open My Blocks | Click My Blocks in the Toolbox. You can save the blocks you built and reuse them later. |
| My Blocks is open; current workspace has not been saved | Make a reusable block | Click Make a Block to save the current workspace, including your three spheres, as one saved item in My Blocks. |
| Naming dialog is open; student has not edited a nonempty name | Name your block | Enter a name you will recognise later, such as “Mouse head”, in Block name. Your saved item will use the name you enter. |
| Student has entered a nonempty name | Save your block | Click Save to store your named block in My Blocks. If a name is already used, choose a different name. |
| My Block is saved successfully | Tutorial complete | You’ve practised dragging, connecting, editing, and saving blocks. You’re ready for the trial exercise. |

After saving successfully, the tutorial goes directly to Tutorial complete, with no saved-item confirmation screen or Continue button. Saved My Blocks entries appear as one named block, such as `micki`, in both the palette and workspace. The original construction is stored inside the block and recreated when it runs. Existing saved workspaces also use this named appearance without changing their stored source XML.

## Browser backup failures

Failed browser backups must not block navigation to the post-study questionnaire. Timing entries and lecture answers remain in the active tab and can be included in the ZIP. These messages describe backup failures, not interaction logging.

Browser study backups are currently disabled, so these fallback messages do not appear in the current memory-only study flow. They remain available if persistence is enabled later. The starting page says: “Study data stays in this tab for now. Download the study ZIP before closing or refreshing.”

| Situation | Exact message | Editable source |
| --- | --- | --- |
| Lecture timing backup fails | Lecture timings are kept in this tab because browser backup is unavailable. Finish and download the study ZIP before closing or refreshing. | `src/study/session/useLectureExerciseTiming.js` |
| Lecture answer backup fails | Your lecture answer is kept in this tab because browser backup is unavailable. Finish and download the study ZIP before closing or refreshing. | `src/pages/UserStudyLiPage.jsx` |
| Research ID backup fails when starting a session | Browser backup is unavailable. Keep this tab open, finish the study, and download the study ZIP before closing or refreshing. | `src/pages/UserStudyLiPage.jsx` |
