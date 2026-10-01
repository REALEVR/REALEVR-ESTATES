/**
 * Everything that makes the whole site feel like liquid glass while you move around it, mounted once in App.tsx.
 * Ideas adapted from React Bits (https://github.com/DavidHDev/react-bits, © David Haz, MIT + Commons Clause):
 * FadeContent / AnimatedContent (scroll reveals), ClickSpark (press droplets), Magnet (magnetic buttons),
 * GlareHover (glare on listing photos), BlobCursor (the liquid cursor), GradualBlur (the soft edge above the bottom
 * bar). They are re-built here without gsap or WebGL so they stay light on cheap phones, and every one of them
 * switches itself off when data-fx is "off" (reduced motion or the footer switch) and the heavier ones in "lite".
 */
import { useEffect, useRef } from 'react'
import { useLocation } from 'wouter'
import './fx.css'
import { hasFinePointer, startFx, useFxMode } from './fxMode'

const INTERACTIVE = 'a[href], button, [role="button"], input, select, textarea, label, summary, [data-magnet]'

// ---- reveal on scroll ------------------------------------------------------------------------------
const REVEAL_SELECTOR = 'main section > *, main .grid > *, main [data-reveal], main article'
const SKIP_INSIDE = '[data-no-reveal], [role="dialog"], .kevin-panel, header, nav, .fx-pre, .fx-in, [data-radix-popper-content-wrapper]'

function useReveal(mode: string) {
    useEffect(() => {
        if (mode === 'off') return
        const io = new IntersectionObserver(
            (entries) => {
                const shown = entries.filter((e) => e.isIntersecting).sort((a, b) => (a.target.compareDocumentPosition(b.target) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
                shown.forEach((e, i) => {
                    const el = e.target as HTMLElement
                    io.unobserve(el)
                    el.style.setProperty('--fx-d', `${Math.min(i, 6) * 70}ms`)
                    el.classList.remove('fx-pre')
                    el.classList.add('fx-in')
                    const done = () => {
                        el.classList.remove('fx-in')
                        el.style.removeProperty('--fx-d')
                    }
                    el.addEventListener('transitionend', done, { once: true })
                    window.setTimeout(done, 1800)
                })
            },
            { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
        )

        const prepare = (root: ParentNode) => {
            const vh = window.innerHeight
            root.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach((el) => {
                if (el.dataset.fxSeen) return
                el.dataset.fxSeen = '1'
                if (el.closest(SKIP_INSIDE) && el.closest(SKIP_INSIDE) !== el) return
                const r = el.getBoundingClientRect()
                // Already on screen, or not laid out, or huge: leave it alone (nothing should ever flash away).
                if (r.width === 0 || r.height === 0 || r.top < vh * 0.92 || r.height > vh * 1.1) return
                const pos = getComputedStyle(el).position
                if (pos === 'fixed' || pos === 'sticky') return
                el.classList.add('fx-pre')
                io.observe(el)
                // Failsafe: whatever happens, nothing stays hidden.
                window.setTimeout(() => el.classList.remove('fx-pre'), 6000)
            })
        }

        let queued = false
        let alive = true
        const schedule = () => {
            if (queued) return
            queued = true
            requestAnimationFrame(() => {
                queued = false
                if (alive) prepare(document)
            })
        }
        schedule()
        const mo = new MutationObserver(schedule)
        mo.observe(document.getElementById('root') ?? document.body, { childList: true, subtree: true })
        return () => {
            alive = false
            mo.disconnect()
            io.disconnect()
            document.querySelectorAll('.fx-pre').forEach((el) => el.classList.remove('fx-pre'))
        }
    }, [mode])
}

// ---- scroll state + progress ------------------------------------------------------------------------
function useScrollChrome(bar: React.RefObject<HTMLDivElement>, mode: string) {
    useEffect(() => {
        if (mode === 'off') return
        let raf = 0
        const update = () => {
            raf = 0
            const y = window.scrollY
            document.documentElement.dataset.scrolled = y > 8 ? '1' : '0'
            const max = document.documentElement.scrollHeight - window.innerHeight
            if (bar.current) bar.current.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`
        }
        const onScroll = () => {
            if (!raf) raf = requestAnimationFrame(update)
        }
        update()
        window.addEventListener('scroll', onScroll, { passive: true })
        window.addEventListener('resize', onScroll, { passive: true })
        return () => {
            window.removeEventListener('scroll', onScroll)
            window.removeEventListener('resize', onScroll)
        }
    }, [bar, mode])
}

// ---- pointer effects: glare, magnet, liquid cursor, press droplets ---------------------------------
function usePointerFx(mode: string, beads: React.RefObject<HTMLDivElement>) {
    useEffect(() => {
        if (mode === 'off') return
        const fine = hasFinePointer()
        const cleanups: Array<() => void> = []

        // Press droplets (every device, "full" only): a ring and a few droplets where you tap.
        if (mode === 'full') {
            const onDown = (e: PointerEvent) => {
                const t = e.target as Element | null
                if (!t?.closest?.(INTERACTIVE) || (t.closest('input, textarea, select') ?? null)) return
                if (document.querySelectorAll('.fx-drop').length > 3) return
                const d = document.createElement('span')
                d.className = 'fx-drop'
                d.style.left = `${e.clientX}px`
                d.style.top = `${e.clientY}px`
                for (let i = 0; i < 6; i++) {
                    const a = (Math.PI * 2 * i) / 6 + Math.random() * 0.5
                    const dist = 16 + Math.random() * 12
                    const dot = document.createElement('i')
                    dot.style.setProperty('--dx', `${Math.cos(a) * dist}px`)
                    dot.style.setProperty('--dy', `${Math.sin(a) * dist}px`)
                    d.appendChild(dot)
                }
                document.body.appendChild(d)
                window.setTimeout(() => d.remove(), 700)
            }
            window.addEventListener('pointerdown', onDown, { passive: true })
            cleanups.push(() => window.removeEventListener('pointerdown', onDown))
        }

        if (fine) {
            // Glare on listing photos + the glass highlight's x position, and magnetic buttons.
            let magnet: HTMLElement | null = null
            const onMove = (e: PointerEvent) => {
                const t = e.target as Element | null
                const card = t?.closest?.('.property-card') as HTMLElement | null
                if (card) {
                    const r = card.getBoundingClientRect()
                    card.style.setProperty('--mx', `${e.clientX - r.left}px`)
                    card.style.setProperty('--my', `${e.clientY - r.top}px`)
                }
                const glass = t?.closest?.('.fx-liquid') as HTMLElement | null
                if (glass) {
                    const r = glass.getBoundingClientRect()
                    glass.style.setProperty('--sx', `${((e.clientX - r.left) / r.width) * 100}%`)
                }
                const m = t?.closest?.('[data-magnet]') as HTMLElement | null
                if (m) {
                    const r = m.getBoundingClientRect()
                    const dx = (e.clientX - (r.left + r.width / 2)) / r.width
                    const dy = (e.clientY - (r.top + r.height / 2)) / r.height
                    m.style.transform = `translate(${dx * 10}px, ${dy * 8}px)`
                    magnet = m
                } else if (magnet) {
                    magnet.style.transform = ''
                    magnet = null
                }
            }
            window.addEventListener('pointermove', onMove, { passive: true })
            cleanups.push(() => window.removeEventListener('pointermove', onMove))

            // The liquid cursor ("full" only): a glass bead that leads, and two droplets that lag behind it.
            const root = beads.current
            if (mode === 'full' && root) {
                const els = Array.from(root.children) as HTMLElement[]
                const pos = els.map(() => ({ x: -100, y: -100 }))
                const target = { x: -100, y: -100 }
                const ease = [0.32, 0.18, 0.1]
                let raf = 0
                let shown = false
                const tick = () => {
                    for (let i = 0; i < els.length; i++) {
                        pos[i].x += (target.x - pos[i].x) * ease[i]
                        pos[i].y += (target.y - pos[i].y) * ease[i]
                        els[i].style.transform = `translate3d(${pos[i].x}px, ${pos[i].y}px, 0)`
                    }
                    raf = requestAnimationFrame(tick)
                }
                const move = (e: PointerEvent) => {
                    target.x = e.clientX
                    target.y = e.clientY
                    if (!shown) {
                        shown = true
                        pos.forEach((p) => {
                            p.x = e.clientX
                            p.y = e.clientY
                        })
                        els.forEach((el) => el.classList.add('is-on'))
                        raf = requestAnimationFrame(tick)
                    }
                    els[0].classList.toggle('is-over', !!(e.target as Element | null)?.closest?.(INTERACTIVE))
                }
                const leave = () => {
                    shown = false
                    cancelAnimationFrame(raf)
                    els.forEach((el) => el.classList.remove('is-on'))
                }
                window.addEventListener('pointermove', move, { passive: true })
                document.documentElement.addEventListener('mouseleave', leave)
                cleanups.push(() => {
                    window.removeEventListener('pointermove', move)
                    document.documentElement.removeEventListener('mouseleave', leave)
                    cancelAnimationFrame(raf)
                    els.forEach((el) => el.classList.remove('is-on'))
                })
            }
        }
        return () => cleanups.forEach((c) => c())
    }, [mode, beads])
}

export default function FxRoot() {
    const mode = useFxMode()
    const [location] = useLocation()
    const bar = useRef<HTMLDivElement>(null)
    const beads = useRef<HTMLDivElement>(null)
    const first = useRef(true)

    useEffect(() => startFx(), [])
    useReveal(mode)
    useScrollChrome(bar, mode)
    usePointerFx(mode, beads)

    // Every navigation: the top bar's glass catches the light once.
    useEffect(() => {
        if (first.current) {
            first.current = false
            return
        }
        const header = document.querySelector('.fx-glass-bar')
        if (!header) return
        header.classList.remove('fx-sheen')
        void (header as HTMLElement).offsetWidth
        header.classList.add('fx-sheen')
        const t = window.setTimeout(() => header.classList.remove('fx-sheen'), 1100)
        return () => window.clearTimeout(t)
    }, [location])

    if (mode === 'off') return null
    return (
        <>
            <div className="fx-ambient" aria-hidden="true">
                <i />
                <i />
                <i />
            </div>
            <div ref={bar} className="fx-progress" aria-hidden="true" />
            <div className="fx-edge" aria-hidden="true" />
            <div ref={beads} aria-hidden="true">
                <span className="fx-bead fx-bead--lead" />
                <span className="fx-bead fx-bead--t1" />
                <span className="fx-bead fx-bead--t2" />
            </div>
        </>
    )
}
