/**
 * Liquid glass: a surface that bends and tints what is behind it, like a lens of water.
 *
 * Adapted from "GlassSurface" in React Bits (https://github.com/DavidHDev/react-bits, © David Haz, MIT + Commons
 * Clause). The idea and the SVG displacement-map technique are theirs; this version drops the fixed width/height
 * (it fills its parent), uses the site's colour tokens, falls back to a CSS frosted look when the browser cannot
 * refract (Safari and Firefox cannot use an SVG filter as a backdrop-filter) and when the device is in lite or off
 * mode, and avoids re-rendering on every resize.
 */
import { useEffect, useId, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from 'react'
import { useFxMode } from './fxMode'

interface Props {
    children?: ReactNode
    className?: string
    style?: CSSProperties
    as?: ElementType
    radius?: number
    /** How strongly the edge bends the background (negative = convex lens). */
    distortion?: number
    /** Blur inside the refraction, in px. */
    frost?: number
    [attr: string]: unknown
}

let refractionSupported: boolean | null = null
function canRefract(): boolean {
    if (refractionSupported !== null) return refractionSupported
    if (typeof document === 'undefined') return false
    const ua = navigator.userAgent
    const safari = /Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|SamsungBrowser/.test(ua)
    const firefox = /Firefox/.test(ua)
    const probe = document.createElement('div')
    probe.style.backdropFilter = 'url(#x)'
    refractionSupported = !safari && !firefox && probe.style.backdropFilter !== ''
    return refractionSupported
}

export default function LiquidGlass({ children, className = '', style, as: Tag = 'div', radius = 28, distortion = -110, frost = 9, ...rest }: Props) {
    const mode = useFxMode()
    const rawId = useId().replace(/:/g, '')
    const filterId = `lg-${rawId}`
    const box = useRef<HTMLElement>(null)
    const map = useRef<SVGFEImageElement>(null)
    const [size, setSize] = useState({ w: 0, h: 0 })
    const refract = mode === 'full' && canRefract()

    useEffect(() => {
        const el = box.current
        if (!el || !refract) return
        let raf = 0
        const ro = new ResizeObserver(() => {
            cancelAnimationFrame(raf)
            raf = requestAnimationFrame(() => {
                const r = el.getBoundingClientRect()
                setSize((s) => (Math.abs(s.w - r.width) < 1 && Math.abs(s.h - r.height) < 1 ? s : { w: Math.round(r.width), h: Math.round(r.height) }))
            })
        })
        ro.observe(el)
        return () => {
            ro.disconnect()
            cancelAnimationFrame(raf)
        }
    }, [refract])

    useEffect(() => {
        if (!refract || !size.w || !size.h || !map.current) return
        const edge = Math.min(size.w, size.h) * 0.035
        const svg = `<svg viewBox="0 0 ${size.w} ${size.h}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="r" x1="100%" y1="0%" x2="0%" y2="0%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="red"/></linearGradient><linearGradient id="b" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="blue"/></linearGradient></defs><rect width="${size.w}" height="${size.h}" fill="black"/><rect width="${size.w}" height="${size.h}" rx="${radius}" fill="url(#r)"/><rect width="${size.w}" height="${size.h}" rx="${radius}" fill="url(#b)" style="mix-blend-mode:difference"/><rect x="${edge}" y="${edge}" width="${size.w - edge * 2}" height="${size.h - edge * 2}" rx="${radius}" fill="hsl(0 0% 50% / .93)" style="filter:blur(${frost}px)"/></svg>`
        map.current.setAttribute('href', `data:image/svg+xml,${encodeURIComponent(svg)}`)
    }, [refract, size, radius, frost])

    const refracted: CSSProperties = refract ? { backdropFilter: `url(#${filterId}) saturate(1.5)`, WebkitBackdropFilter: `url(#${filterId}) saturate(1.5)` } : {}

    return (
        <Tag ref={box} className={`fx-liquid ${refract ? 'fx-liquid--refract' : ''} ${className}`} style={{ ...(mode === 'off' ? {} : { borderRadius: radius }), ...refracted, ...style }} {...rest}>
            {refract && (
                <svg className="pointer-events-none absolute h-0 w-0" aria-hidden="true" focusable="false">
                    <defs>
                        <filter id={filterId} colorInterpolationFilters="sRGB" x="0%" y="0%" width="100%" height="100%">
                            <feImage ref={map} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />
                            <feDisplacementMap in="SourceGraphic" in2="map" scale={distortion} xChannelSelector="R" yChannelSelector="G" result="dr" />
                            <feColorMatrix in="dr" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
                            <feDisplacementMap in="SourceGraphic" in2="map" scale={distortion + 10} xChannelSelector="R" yChannelSelector="G" result="dg" />
                            <feColorMatrix in="dg" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
                            <feDisplacementMap in="SourceGraphic" in2="map" scale={distortion + 20} xChannelSelector="R" yChannelSelector="G" result="db" />
                            <feColorMatrix in="db" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
                            <feBlend in="r" in2="g" mode="screen" result="rg" />
                            <feBlend in="rg" in2="b" mode="screen" result="out" />
                            <feGaussianBlur in="out" stdDeviation="0.6" />
                        </filter>
                    </defs>
                </svg>
            )}
            {children}
        </Tag>
    )
}
