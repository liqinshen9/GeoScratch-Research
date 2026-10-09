import { TUTORIAL_SPHERES, tutorialProgress } from './tutorialProgress'

export function MouseHeadPicture({ className = '' }) {
  return <svg className={className} viewBox="0 0 300 280" role="img" aria-label="A mouse head made from three spheres">
    <defs><radialGradient id="tutorial-sphere" cx="32%" cy="25%" r="75%"><stop offset="0" stopColor="#68758b" /><stop offset="0.65" stopColor="#273449" /><stop offset="1" stopColor="#121c2e" /></radialGradient></defs>
    <ellipse cx="150" cy="246" rx="78" ry="9" fill="#cbd5e1" opacity="0.45" />
    <circle cx="74" cy="83" r="38" fill="url(#tutorial-sphere)" />
    <circle cx="226" cy="83" r="38" fill="url(#tutorial-sphere)" />
    <circle cx="150" cy="159" r="76" fill="url(#tutorial-sphere)" />
  </svg>
}
function Givens() {
  return <div className="exercise-given-values tutorial-goal">
    <p>Build this head using three spheres.</p>
    <MouseHeadPicture />
    <table><thead><tr><th>Sphere</th><th>Radius</th><th>Centre (x, y, z)</th></tr></thead>
      <tbody>{TUTORIAL_SPHERES.map((sphere) => <tr key={sphere.key}><th>{sphere.name}</th><td data-tutorial-radius={sphere.key}>{sphere.radius}</td><td data-tutorial-centre={sphere.key}>({sphere.centre.join(', ')})</td></tr>)}</tbody>
    </table>
    <p>Watch the guide, then try it yourself. You can skip at any time.</p>
  </div>
}
function Steps() { return null }
function evaluate({ workspace }) {
  const progress = tutorialProgress(workspace)
  return { passed: progress.stage === 'done', correct: progress.stage === 'done', incorrect: false,
    steps: {}, answer: { type: 'scaleAndRotation' } }
}
function decorateObjects(objects) {
  for (const object of objects) {
    if (object.userData?.geoType !== 'geo_sphere') continue
    object.material.color.set('#273449')
    object.userData.labels = []
  }
  return objects
}
export default {
  id: 'session-sphere-tutorial', title: 'Make a Mickey Mouse head', kind: 'tutorial',
  Givens, Steps, evaluate, decorateObjects, hideAnswerCard: true,
  settingsOverrides: { showLabels: false, showGrid: true, showBox: true, showAxes: true,
    showAxisScaleLabels: true, showAxisToggleButton: false, showAxisGizmo: true, sphereShowGridlines: false, solidOpacity: 1,
    haloEnabled: false, objectHighlightEnabled: false, objectsReceiveShadows: false,
    primitivesCastShadows: false, pointShadowsEnabled: false, cameraShadowsEnabled: false },
}
