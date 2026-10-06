import { useEffect, useRef } from 'react'

export type HudMode = 'idle' | 'listening' | 'thinking' | 'speaking'

const GOLD = '245,196,105'
const AMBER = '255,159,28'
const WHITE = '255,244,222'

/** How lively each state is: the sphere breathes when idle, ripples when he listens, pulses like speech when he talks. */
function targetEnergy(mode: HudMode, t: number): number {
  if (mode === 'listening') return 0.22 + 0.18 * Math.abs(Math.sin(t * 3.1) * Math.sin(t * 1.7 + 1))
  if (mode === 'speaking') return 0.3 + 0.38 * Math.abs(Math.sin(t * 7.3) * Math.sin(t * 2.9 + 0.5))
  if (mode === 'thinking') return 0.16
  return 0.06 + 0.03 * Math.sin(t * 1.2)
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/**
 * Kevin's core: a sphere of light points inside turning rings. Nothing here is a recording: the points are moved
 * every frame from the state he is in, so it looks alive while he listens, thinks and speaks. With "reduce motion"
 * on, one still frame is drawn and nothing moves.
 */
export function HudSphere({ mode }: { mode: HudMode }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const modeRef = useRef(mode)
  modeRef.current = mode

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const reduce = prefersReducedMotion()
    const N = 760
    const points = Array.from({ length: N }, (_, i) => {
      const y = 1 - (i / (N - 1)) * 2
      const r = Math.sqrt(1 - y * y)
      const theta = Math.PI * (3 - Math.sqrt(5)) * i
      return { x: Math.cos(theta) * r, y, z: Math.sin(theta) * r, seed: (i * 12.9898) % (Math.PI * 2) }
    })
    let w = 0
    let h = 0
    let dpr = 1
    let energy = 0.06
    let spin = 0.6
    let t = 0
    let raf = 0
    let last = performance.now()

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      dpr = Math.min(2, window.devicePixelRatio || 1)
      w = rect.width
      h = rect.height
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.max(1, Math.round(h * dpr))
      if (reduce) draw()
    }

    const draw = () => {
      const mode = modeRef.current
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const cx = w / 2
      const cy = h / 2
      const R = Math.min(w, h) * 0.27

      // The rings: a ticked outer ring, two arcs turning against each other, a thin inner ring, and a ring of bars that follow the voice.
      ctx.save()
      ctx.translate(cx, cy)
      ctx.lineCap = 'round'
      ctx.strokeStyle = `rgba(${GOLD},0.22)`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(0, 0, R * 1.62, 0, Math.PI * 2)
      ctx.stroke()
      for (let i = 0; i < 120; i++) {
        const a = (i / 120) * Math.PI * 2 + spin * 0.15
        const long = i % 10 === 0
        const r1 = R * 1.62
        const r2 = r1 + (long ? 9 : 4)
        ctx.strokeStyle = `rgba(${GOLD},${long ? 0.7 : 0.3})`
        ctx.beginPath()
        ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1)
        ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2)
        ctx.stroke()
      }
      ctx.strokeStyle = `rgba(${AMBER},0.7)`
      ctx.lineWidth = 2.2
      for (let k = 0; k < 3; k++) {
        const start = -spin * 0.5 + (k * Math.PI * 2) / 3
        ctx.beginPath()
        ctx.arc(0, 0, R * 1.46, start, start + 0.7 + energy * 1.1)
        ctx.stroke()
      }
      ctx.strokeStyle = `rgba(${GOLD},0.5)`
      ctx.lineWidth = 1.4
      for (let k = 0; k < 2; k++) {
        const start = spin * 0.8 + k * Math.PI
        ctx.beginPath()
        ctx.arc(0, 0, R * 1.32, start, start + 1.1)
        ctx.stroke()
      }
      ctx.strokeStyle = `rgba(${WHITE},0.18)`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(0, 0, R * 1.2, 0, Math.PI * 2)
      ctx.stroke()
      const bars = 72
      ctx.lineWidth = 2
      for (let i = 0; i < bars; i++) {
        const a = (i / bars) * Math.PI * 2
        const len = 3 + energy * R * 0.55 * (0.35 + 0.65 * Math.abs(Math.sin(i * 0.71 + t * 6 + Math.sin(i * 0.3 + t * 2))))
        ctx.strokeStyle = `rgba(${GOLD},${0.35 + Math.min(0.5, energy)})`
        ctx.beginPath()
        ctx.moveTo(Math.cos(a) * R * 1.1, Math.sin(a) * R * 1.1)
        ctx.lineTo(Math.cos(a) * (R * 1.1 + len), Math.sin(a) * (R * 1.1 + len))
        ctx.stroke()
      }
      ctx.restore()

      // The sphere itself: every point turned, rippled by the voice, and projected.
      const cosY = Math.cos(spin)
      const sinY = Math.sin(spin)
      const tilt = 0.38
      const cosX = Math.cos(tilt)
      const sinX = Math.sin(tilt)
      const scale = 1 + energy * 0.1
      for (const p of points) {
        let wave = Math.sin(t * 5 + p.seed * 3 + p.y * 4) * energy * 0.34
        if (mode === 'thinking') wave += 0.09 * Math.sin(p.y * 7 - t * 6)
        const rad = (1 + wave) * scale
        const x0 = p.x * rad
        const y0 = p.y * rad
        const z0 = p.z * rad
        const x1 = x0 * cosY + z0 * sinY
        const z1 = -x0 * sinY + z0 * cosY
        const y2 = y0 * cosX - z1 * sinX
        const z2 = y0 * sinX + z1 * cosX
        const f = 2.8 / (2.8 - z2)
        const depth = (z2 + 1.4) / 2.8
        const alpha = 0.22 + 0.78 * Math.sqrt(depth)
        const size = (1 + 2.2 * depth) * (1 + energy * 0.5)
        const front = depth > 0.72
        ctx.fillStyle = `rgba(${front ? WHITE : GOLD},${alpha.toFixed(3)})`
        ctx.beginPath()
        ctx.arc(cx + x1 * R * f, cy + y2 * R * f, size, 0, Math.PI * 2)
        ctx.fill()
      }

      // A soft glow at the heart that swells with the voice.
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * (0.9 + energy))
      g.addColorStop(0, `rgba(${AMBER},${0.26 + energy * 0.34})`)
      g.addColorStop(1, `rgba(${AMBER},0)`)
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(cx, cy, R * (0.9 + energy), 0, Math.PI * 2)
      ctx.fill()
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (document.hidden) {
        last = now
        return
      }
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      t += dt
      energy += (targetEnergy(modeRef.current, t) - energy) * Math.min(1, dt * 8)
      spin += dt * (modeRef.current === 'thinking' ? 1.5 : 0.22 + energy * 0.7)
      draw()
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    if (!reduce) raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={ref} aria-hidden="true" className="absolute inset-0 h-full w-full" />
}

/** A thin line that moves like a voice when he listens or speaks, and rests when he does not. */
export function HudWave({ mode }: { mode: HudMode }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const modeRef = useRef(mode)
  modeRef.current = mode

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const reduce = prefersReducedMotion()
    let w = 0
    let h = 0
    let dpr = 1
    let amp = 0.04
    let t = 0
    let raf = 0
    let last = performance.now()

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.lineWidth = 1.6
      ctx.strokeStyle = `rgba(${GOLD},0.9)`
      ctx.beginPath()
      for (let x = 0; x <= w; x += 2) {
        const u = x / w
        const env = Math.sin(u * Math.PI) ** 1.4
        const y = h / 2 + Math.sin(u * 22 + t * 9) * Math.sin(u * 5 - t * 2.3) * amp * h * 0.5 * env
        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      dpr = Math.min(2, window.devicePixelRatio || 1)
      w = rect.width
      h = rect.height
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.max(1, Math.round(h * dpr))
      if (reduce) draw()
    }
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (document.hidden) {
        last = now
        return
      }
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      t += dt
      amp += (targetEnergy(modeRef.current, t) * 2 - amp) * Math.min(1, dt * 8)
      draw()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    if (!reduce) raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={ref} aria-hidden="true" className="block h-10 w-full" />
}
