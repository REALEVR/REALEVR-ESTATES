import { useEffect, useId, useRef, useState } from 'react'

/**
 * The front page's motion graphic: a "tour orbit". A gold view-cone sweeps round a ring the way a 360 tour turns as you look
 * about, and the city pins on the ring light up as the cone passes over them. The rings draw themselves in on arrival.
 *
 * Pure SVG moved with CSS (transform and opacity only), so there is no script loop. It stops moving when it scrolls out of
 * view, and shows one still frame for visitors who asked for reduced motion (see Hero.css).
 */

const SWEEP_SECONDS = 10

/** Where each city sits on the ring, in degrees clockwise from the top. */
const CITIES = [
  { name: 'Nairobi', angle: 86 },
  { name: 'Kigali', angle: 140 },
  { name: 'Dar es Salaam', angle: 192 },
  { name: 'Lagos', angle: 240 },
  { name: 'Accra', angle: 286 },
  { name: 'Kampala', angle: 334 },
]

const CENTRE = 200
const PIN_RADIUS = 138

const polar = (angle: number, radius: number) => {
  const a = (angle * Math.PI) / 180
  return { x: CENTRE + radius * Math.sin(a), y: CENTRE - radius * Math.cos(a) }
}

/** The view-cone: a wedge from the centre, `spread` degrees wide, pointing straight up (it is turned by CSS). */
function conePath(radius: number, spread: number) {
  const left = polar(-spread / 2, radius)
  const right = polar(spread / 2, radius)
  return `M ${CENTRE} ${CENTRE} L ${left.x.toFixed(2)} ${left.y.toFixed(2)} A ${radius} ${radius} 0 0 1 ${right.x.toFixed(2)} ${right.y.toFixed(2)} Z`
}

const TICKS = Array.from({ length: 72 }, (_, i) => {
  const long = i % 6 === 0
  const a = polar(i * 5, 188)
  const b = polar(i * 5, long ? 178 : 183)
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, long }
})

export default function HeroTourOrbit({ className = '', labels = true }: { className?: string; labels?: boolean }) {
  const id = useId().replace(/:/g, '')
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const node = ref.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '120px 0px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className={`tour-orbit ${visible ? '' : 'is-paused'} ${className}`} aria-hidden="true">
      <svg viewBox="0 0 400 400" className="h-full w-full overflow-visible" focusable="false">
        <defs>
          <linearGradient id={`${id}-cone`} x1="200" y1="200" x2="200" y2="52" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="hsl(var(--accent-light))" stopOpacity="0" />
            <stop offset="0.55" stopColor="hsl(var(--accent-light))" stopOpacity="0.28" />
            <stop offset="1" stopColor="hsl(var(--accent-light))" stopOpacity="0.62" />
          </linearGradient>
          <radialGradient id={`${id}-glow`} cx="200" cy="200" r="190" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="0.6" stopColor="#fff" stopOpacity="0.16" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx={CENTRE} cy={CENTRE} r="190" fill={`url(#${id}-glow)`} />

        {/* Tick ring, turning slowly the other way. */}
        <g className="orbit-spin orbit-spin-reverse" style={{ transformOrigin: '200px 200px' }}>
          {TICKS.map((t, i) => (
            <line
              key={i}
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              stroke="hsl(var(--accent-light))"
              strokeWidth={t.long ? 1.8 : 1}
              strokeOpacity={t.long ? 0.95 : 0.55}
              strokeLinecap="round"
            />
          ))}
        </g>

        {/* Rings that draw themselves in. */}
        <circle className="orbit-draw" pathLength={1} cx={CENTRE} cy={CENTRE} r="170" fill="none" stroke="hsl(var(--accent-light))" strokeOpacity="0.8" strokeWidth="1.4" />
        <circle
          className="orbit-spin orbit-spin-slow"
          style={{ transformOrigin: '200px 200px' }}
          cx={CENTRE}
          cy={CENTRE}
          r="154"
          fill="none"
          stroke="hsl(var(--accent-light))"
          strokeOpacity="0.55"
          strokeWidth="1.2"
          strokeDasharray="2 9"
          strokeLinecap="round"
        />
        <circle className="orbit-draw orbit-draw-late" pathLength={1} cx={CENTRE} cy={CENTRE} r="104" fill="none" stroke="#fff" strokeOpacity="0.85" strokeWidth="1.2" />

        {/* The view-cone: what "looking around" does. */}
        <g className="orbit-sweep" style={{ transformOrigin: '200px 200px', animationDuration: `${SWEEP_SECONDS}s` }}>
          <path d={conePath(160, 46)} fill={`url(#${id}-cone)`} />
          <line x1={CENTRE} y1={CENTRE} x2={CENTRE} y2={CENTRE - 160} stroke="hsl(var(--accent-light))" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.95" />
        </g>

        {/* City pins: each one lights up as the cone passes over it. */}
        {CITIES.map((c, i) => {
          const p = polar(c.angle, PIN_RADIUS)
          const delay = (c.angle / 360) * SWEEP_SECONDS
          const label = polar(c.angle, PIN_RADIUS + 20)
          const anchor = label.x > CENTRE + 6 ? 'start' : label.x < CENTRE - 6 ? 'end' : 'middle'
          return (
            <g key={c.name}>
              <circle
                className="orbit-ping"
                cx={p.x}
                cy={p.y}
                r="5"
                fill="none"
                stroke="hsl(var(--accent-light))"
                strokeWidth="1.6"
                style={{ transformOrigin: `${p.x}px ${p.y}px`, animationDuration: `${SWEEP_SECONDS}s`, animationDelay: `${delay}s` }}
              />
              <circle
                className="orbit-pin"
                cx={p.x}
                cy={p.y}
                r="4.5"
                fill="#fff"
                stroke="hsl(var(--accent))"
                strokeWidth="2.2"
                style={{ transformOrigin: `${p.x}px ${p.y}px`, animationDuration: `${SWEEP_SECONDS}s`, animationDelay: `${delay}s` }}
              />
              {labels && (
                <text
                  x={label.x}
                  y={label.y + 3.5}
                  textAnchor={anchor}
                  className="orbit-label"
                  style={{ animationDelay: `${0.8 + i * 0.12}s` }}
                >
                  {c.name}
                </text>
              )}
            </g>
          )
        })}

        {/* The home at the centre, gently breathing. */}
        <g className="orbit-home" style={{ transformOrigin: '200px 200px' }}>
          <circle cx={CENTRE} cy={CENTRE} r="40" fill="#fff" fillOpacity="0.96" stroke="hsl(var(--accent-light))" strokeWidth="2" />
          <path
            d="M 200 178 L 222 197 L 217 197 L 217 219 L 206 219 L 206 205 L 194 205 L 194 219 L 183 219 L 183 197 L 178 197 Z"
            fill="hsl(var(--accent))"
          />
          <text x={CENTRE} y="238" textAnchor="middle" className="orbit-360">
            360°
          </text>
        </g>
      </svg>
    </div>
  )
}
