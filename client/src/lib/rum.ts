/**
 * Sends one small speed report per visit (server/gene/rum.ts): first paint, main picture, layout shift, slowest tap, response
 * time, kilobytes loaded, and the connection type. Numbers only, no identifiers. One visit in four reports, so it adds
 * almost nothing to the page.
 */
const SAMPLE_RATE = 0.25

export function startSpeedReport(): void {
    try {
        if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return
        if (Math.random() > SAMPLE_RATE) return

        let lcp = 0
        let cls = 0
        let inp = 0
        const observe = (type: string, onEntries: (list: PerformanceEntryList) => void, extra: Record<string, unknown> = {}) => {
            try {
                const po = new PerformanceObserver((l) => onEntries(l.getEntries()))
                po.observe({ type, buffered: true, ...extra } as PerformanceObserverInit)
            } catch {
                /* this browser does not report that metric */
            }
        }
        observe('largest-contentful-paint', (es) => {
            const last = es[es.length - 1] as PerformanceEntry | undefined
            if (last) lcp = last.startTime
        })
        observe('layout-shift', (es) => {
            for (const e of es as any[]) if (!e.hadRecentInput) cls += e.value
        })
        observe(
            'event',
            (es) => {
                for (const e of es as any[]) if (e.interactionId && e.duration > inp) inp = e.duration
            },
            { durationThreshold: 40 }
        )

        let sent = false
        const send = () => {
            if (sent) return
            sent = true
            const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
            const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime
            const bytes = nav?.transferSize ?? 0
            const resourceBytes = (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).reduce((n, r) => n + (r.transferSize || 0), 0)
            const c = (navigator as any).connection
            const body = JSON.stringify({
                fcp,
                lcp: lcp || undefined,
                ttfb: nav?.responseStart,
                cls: Math.round(cls * 1000) / 1000,
                inp: inp || undefined,
                kb: Math.round((bytes + resourceBytes) / 1024),
                conn: c?.effectiveType,
                saveData: c?.saveData === true,
            })
            const blob = new Blob([body], { type: 'application/json' })
            if (!navigator.sendBeacon?.('/api/rum', blob)) {
                fetch('/api/rum', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {})
            }
        }
        document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && send())
        window.addEventListener('pagehide', send)
    } catch {
        /* measuring must never break the page */
    }
}
