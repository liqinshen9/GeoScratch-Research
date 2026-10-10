# Local persistence and study data

The app has no backend client or remote participant tracking.

Research response collection is confined to `/userstudy-Li`. Its demographics,
condition, and post-study questionnaires preserve local JSON backups and download
JSON files for the researcher. These flows are implemented in
`src/pages/UserStudyLiPage.jsx` and `src/pages/userStudyLi/`.

Blockly workspace autosaves, app settings, and solved exercise markers stay in
localStorage for editor convenience. They are not uploaded.
