import { useId } from 'react'

// Procedural "aesthetic" artwork so the feed is full on first visit without
// shipping anyone's photos. Everything is deterministic from the seed.

export type ArtKind = 'galaxy' | 'quote' | 'sunset' | 'pattern' | 'polaroid' | 'moon'
export type ArtSpec = { kind: ArtKind; seed: number; text?: string; h: number }

const W = 300

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = <T,>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)]

const NEBULA = ['#ff5fa2', '#7b5cff', '#27d3c3', '#ffb86b', '#5aa9ff', '#c86bff']
const PASTELS = ['#ffd6e0', '#e2d4ff', '#cdeffd', '#d7f5dd', '#fff1c9', '#ffe0cc']
const SKIES = [
  ['#2b1055', '#c7417b', '#ffb56b'],
  ['#1b2a6b', '#8f6ad8', '#ffc0cb'],
  ['#0f2027', '#e96443', '#ffd194'],
  ['#3a1c71', '#d76d77', '#ffaf7b'],
  ['#42275a', '#734b6d', '#f7bb97'],
]

function Stars({ r, n, h }: { r: () => number; n: number; h: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <circle key={i} cx={r() * W} cy={r() * h} r={0.3 + r() * 1.1} fill="#fff" opacity={0.3 + r() * 0.7} />
      ))}
    </>
  )
}

function Galaxy({ spec, id }: { spec: ArtSpec; id: string }) {
  const r = rng(spec.seed)
  const { h } = spec
  const clouds = Array.from({ length: 5 }, () => ({
    x: r() * W, y: r() * h, rad: 90 + r() * 130, c: pick(r, NEBULA),
  }))
  const shape = Math.floor(r() * 3)
  const cx = W / 2, cy = h / 2
  return (
    <>
      <defs>
        {clouds.map((c, i) => (
          <radialGradient key={i} id={`${id}-${i}`}>
            <stop offset="0" stopColor={c.c} stopOpacity="0.85" />
            <stop offset="1" stopColor={c.c} stopOpacity="0" />
          </radialGradient>
        ))}
      </defs>
      <rect width={W} height={h} fill="#0b0620" />
      {clouds.map((c, i) => <circle key={i} cx={c.x} cy={c.y} r={c.rad} fill={`url(#${id}-${i})`} />)}
      <Stars r={r} n={110} h={h} />
      {shape === 0 && (
        <polygon points={`${cx},${cy - 62} ${cx + 58},${cy + 40} ${cx - 58},${cy + 40}`} fill="none" stroke="#fff" strokeWidth="2.5" />
      )}
      {shape === 1 && <circle cx={cx} cy={cy} r="52" fill="none" stroke="#fff" strokeWidth="2.5" />}
      {spec.text && (
        <text x={cx} y={shape === 2 ? cy + 6 : cy + 78} textAnchor="middle" fill="#fff" fontSize="15"
          letterSpacing="5" fontFamily="Helvetica Neue, Helvetica, Arial, sans-serif" fontWeight="700">
          {spec.text.toUpperCase()}
        </text>
      )}
    </>
  )
}

function wrap(text: string, max: number) {
  const lines: string[] = []
  let cur = ''
  for (const w of text.split(' ')) {
    if (cur && (cur + ' ' + w).length > max) { lines.push(cur); cur = w } else cur = cur ? cur + ' ' + w : w
  }
  if (cur) lines.push(cur)
  return lines
}

function Quote({ spec, id }: { spec: ArtSpec; id: string }) {
  const r = rng(spec.seed)
  const { h } = spec
  const style = Math.floor(r() * 3)
  const raw = spec.text ?? 'stay weird'
  const text = style === 0 ? raw.toUpperCase() : raw
  const lines = wrap(text, style === 0 ? 11 : 14)
  const longest = Math.max(...lines.map((l) => l.length))
  const widthFactor = style === 0 ? 0.78 : style === 1 ? 0.5 : 0.62
  const size = Math.min(40, 236 / (longest * widthFactor))
  const lh = size * 1.3
  const y0 = h / 2 - ((lines.length - 1) * lh) / 2 + size * 0.35
  const [a, b] = [pick(r, PASTELS), pick(r, PASTELS)]
  const fonts = [
    { fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif', fontWeight: 700, letterSpacing: size * 0.12 },
    { fontFamily: 'Georgia, Times New Roman, serif', fontStyle: 'italic' as const },
    { fontFamily: 'Courier New, Courier, monospace' },
  ]
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} />
        </linearGradient>
      </defs>
      <rect width={W} height={h} fill={style === 0 ? '#111' : style === 1 ? `url(#${id})` : '#fbfaf6'} />
      {lines.map((l, i) => (
        <text key={i} x={W / 2} y={y0 + i * lh} textAnchor="middle" fontSize={size}
          fill={style === 0 ? '#fff' : '#2a2530'} {...fonts[style]}>{l}</text>
      ))}
      {style === 2 && <line x1={W / 2 - 20} x2={W / 2 + 20} y1={y0 + lines.length * lh - size * 0.5} y2={y0 + lines.length * lh - size * 0.5} stroke="#2a2530" />}
    </>
  )
}

function ridge(r: () => number, base: number, amp: number, h: number) {
  const pts = [`0,${h}`]
  for (let x = 0; x <= W; x += 30) pts.push(`${x},${base - r() * amp}`)
  pts.push(`${W},${h}`)
  return pts.join(' ')
}

function Sunset({ spec, id }: { spec: ArtSpec; id: string }) {
  const r = rng(spec.seed)
  const { h } = spec
  const sky = pick(r, SKIES)
  const sunY = h * (0.45 + r() * 0.15)
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky[0]} /><stop offset="0.6" stopColor={sky[1]} /><stop offset="1" stopColor={sky[2]} />
        </linearGradient>
      </defs>
      <rect width={W} height={h} fill={`url(#${id})`} />
      <Stars r={r} n={30} h={h * 0.4} />
      <circle cx={W * (0.3 + r() * 0.4)} cy={sunY} r={34 + r() * 20} fill="#fff3d6" opacity="0.92" />
      <polygon points={ridge(r, h * 0.72, h * 0.16, h)} fill={sky[0]} opacity="0.55" />
      <polygon points={ridge(r, h * 0.84, h * 0.12, h)} fill="#140b24" />
    </>
  )
}

const MOTIFS: Record<string, (c: string) => JSX.Element> = {
  heart: (c) => <path d="M0 -3C-5 -11 -15 -2 0 10C15 -2 5 -11 0 -3Z" fill={c} />,
  cross: (c) => <path d="M-2 -9h4v7h7v4h-7v7h-4v-7h-7v-4h7z" fill={c} />,
  tri: (c) => <polygon points="0,-10 10,8 -10,8" fill="none" stroke={c} strokeWidth="2" />,
  moon: (c) => <path d="M3 -10A10 10 0 1 0 3 10A8 8 0 1 1 3 -10Z" fill={c} />,
  daisy: (c) => (
    <>
      {[0, 60, 120, 180, 240, 300].map((a) => <ellipse key={a} cx="0" cy="-7" rx="3.4" ry="5.5" fill={c} transform={`rotate(${a})`} />)}
      <circle r="3.2" fill="#ffc94d" />
    </>
  ),
}

function Pattern({ spec }: { spec: ArtSpec }) {
  const r = rng(spec.seed)
  const { h } = spec
  const dark = r() < 0.35
  const bg = dark ? '#131316' : pick(r, PASTELS)
  const fg = dark ? '#fff' : pick(r, ['#ff5c8a', '#7b5cff', '#2a2530', '#fff'])
  const motif = MOTIFS[pick(r, Object.keys(MOTIFS))]
  const step = 44
  const items: JSX.Element[] = []
  for (let row = 0, y = 20; y < h + step; y += step, row++)
    for (let x = row % 2 ? step / 2 : 0; x < W + step; x += step)
      items.push(<g key={`${x}-${y}`} transform={`translate(${x} ${y}) rotate(${(r() - 0.5) * 30})`}>{motif(fg)}</g>)
  return (<><rect width={W} height={h} fill={bg} />{items}</>)
}

function Polaroid({ spec, id }: { spec: ArtSpec; id: string }) {
  const r = rng(spec.seed)
  const { h } = spec
  const sky = pick(r, SKIES)
  const tilt = (r() - 0.5) * 10
  const pw = 200, ph = Math.min(h - 50, 250)
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky[0]} /><stop offset="0.65" stopColor={sky[1]} /><stop offset="1" stopColor={sky[2]} />
        </linearGradient>
      </defs>
      <rect width={W} height={h} fill={pick(r, ['#e9dcc9', '#d9c7b0', '#2b2b30', ...PASTELS])} />
      <g transform={`translate(${W / 2} ${h / 2}) rotate(${tilt})`}>
        <rect x={-pw / 2 + 3} y={-ph / 2 + 4} width={pw} height={ph} fill="#000" opacity="0.18" />
        <rect x={-pw / 2} y={-ph / 2} width={pw} height={ph} fill="#fdfcf8" />
        <rect x={-pw / 2 + 12} y={-ph / 2 + 12} width={pw - 24} height={ph - 62} fill={`url(#${id})`} />
        <circle cx={(r() - 0.5) * 80} cy={-ph / 2 + 12 + (ph - 62) * 0.6} r="20" fill="#fff3d6" opacity="0.9" />
        <text y={ph / 2 - 20} textAnchor="middle" fontSize="17" fill="#3a3540"
          fontFamily="Bradley Hand, Segoe Script, Comic Sans MS, cursive">{spec.text ?? "summer '12"}</text>
      </g>
    </>
  )
}

function Moon({ spec, id }: { spec: ArtSpec; id: string }) {
  const r = rng(spec.seed)
  const { h } = spec
  const cx = W / 2, cy = h * 0.42, rad = 46
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0a0f2c" /><stop offset="1" stopColor={pick(r, ['#2b2f6b', '#3b2460', '#16324a'])} />
        </linearGradient>
        <mask id={`${id}-m`}>
          <circle cx={cx} cy={cy} r={rad} fill="#fff" />
          <circle cx={cx + 22} cy={cy - 8} r={rad * 0.9} fill="#000" />
        </mask>
      </defs>
      <rect width={W} height={h} fill={`url(#${id})`} />
      <Stars r={r} n={70} h={h} />
      <circle cx={cx} cy={cy} r={rad} fill="#fdf3d0" mask={`url(#${id}-m)`} />
      {spec.text && (
        <text x={cx} y={h * 0.8} textAnchor="middle" fill="#fdf3d0" fontSize="13" letterSpacing="4"
          fontFamily="Georgia, serif" fontStyle="italic">{spec.text}</text>
      )}
    </>
  )
}

const RENDER = { galaxy: Galaxy, quote: Quote, sunset: Sunset, pattern: Pattern, polaroid: Polaroid, moon: Moon }

export function Art({ spec }: { spec: ArtSpec }) {
  const id = 'a' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const C = RENDER[spec.kind]
  return (
    <svg viewBox={`0 0 ${W} ${spec.h}`} role="img" aria-label={spec.text ?? spec.kind} preserveAspectRatio="xMidYMid slice">
      <C spec={spec} id={id} />
    </svg>
  )
}
