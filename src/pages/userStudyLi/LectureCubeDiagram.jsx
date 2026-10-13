export default function LectureCubeDiagram({ target = false }) {
  const project = ([x, y, z]) => [130 + x * 52 - z * 30, 205 - y * 55 + z * 20]
  const vertices = [[0, 0, 0], [2, 0, 0], [2, 2, 0], [0, 2, 0], [0, 0, 2], [2, 0, 2], [2, 2, 2], [0, 2, 2]]
  const polygon = (indices) => indices.map((index) => project(vertices[index]).join(',')).join(' ')
  const p = project(target ? [2, 2, 2] : [0, 2, 2])
  const c = project([1, 1, 1])
  const origin = project([0, 0, 0])

  return <svg viewBox="0 0 330 295" role="img" aria-label={`${target ? 'Target' : 'Initial'} cube: centre C = (1, 1, 1), corner P = ${target ? '(2, 2, 2)' : '(0, 2, 2)'}`}>
    <rect width="330" height="295" fill="#f8fafc" />
    <polygon points={polygon([0, 1, 2, 3])} fill="#e4cce9" stroke="#475569" strokeDasharray="4 3" />
    <polygon points={polygon([1, 5, 6, 2])} fill="#9256a0" stroke="#334155" />
    <polygon points={polygon([3, 2, 6, 7])} fill="#c99ad3" stroke="#334155" />
    <polygon points={polygon([4, 5, 6, 7])} fill="#af70bc" fillOpacity="0.8" stroke="#334155" />
    {[[3, 0, 0], [0, 3, 0], [0, 0, 3]].map((end, index) => {
      const tip = project(end)
      return <g key={index}>
        <line x1={origin[0]} y1={origin[1]} x2={tip[0]} y2={tip[1]} stroke="#475569" />
        <text x={tip[0] + 5} y={tip[1]} fontSize="14" fill="#111827">{['X', 'Y', 'Z'][index]}</text>
      </g>
    })}
    <circle cx={c[0]} cy={c[1]} r="4" fill="#334155" />
    <text x={c[0] + 8} y={c[1] + 19} fontSize="14" fill="#111827">C (1, 1, 1)</text>
    <circle cx={p[0]} cy={p[1]} r="7" fill="#2563eb" stroke="white" strokeWidth="2" />
    <text x={p[0] - 24} y={p[1] - 15} fontSize="14" fill="#1d4ed8">P {target ? '(2, 2, 2)' : '(0, 2, 2)'}</text>
  </svg>
}
