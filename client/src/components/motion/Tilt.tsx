/**
 * A surface that leans toward the pointer, with a soft light glare that
 * follows it, so cards read as solid objects sitting in space instead of flat
 * rectangles. All the actual look lives in the `.tilt` rules in index.css; this
 * only feeds them the pointer position as CSS variables.
 *
 * Deliberately conservative:
 *  - Only for a real mouse/trackpad ((hover: hover) and (pointer: fine)). On a
 *    phone there is no hover, so the card gets a small press-in from CSS
 *    instead, and none of this code runs.
 *  - Nothing at all when the visitor asked their device for reduced motion.
 *  - No re-render per mouse move: one rAF-throttled write of four CSS
 *    variables on the element itself.
 */
import { forwardRef, useCallback, useEffect, useRef } from 'react'
import type { HTMLAttributes, PointerEvent as ReactPointerEvent } from 'react'

interface TiltProps extends HTMLAttributes<HTMLDivElement> {
  /** Maximum lean in degrees. Cards are wide, so keep this small. */
  max?: number
}

const canTilt = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches

const Tilt = forwardRef<HTMLDivElement, TiltProps>(function Tilt(
  { max = 6, className = '', onPointerMove, onPointerLeave, children, ...rest },
  forwardedRef,
) {
  const local = useRef<HTMLDivElement | null>(null)
  const frame = useRef<number | null>(null)

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      local.current = node
      if (typeof forwardedRef === 'function') forwardedRef(node)
      else if (forwardedRef) forwardedRef.current = node
    },
    [forwardedRef],
  )

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    },
    [],
  )

  const handleMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    onPointerMove?.(e)
    if (e.pointerType !== 'mouse' || !canTilt()) return
    const el = local.current
    if (!el) return
    const { clientX, clientY } = e
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) return
      const x = (clientX - r.left) / r.width // 0..1
      const y = (clientY - r.top) / r.height
      el.classList.add('is-tilting')
      el.style.setProperty('--tilt-ry', `${((x - 0.5) * 2 * max).toFixed(2)}deg`)
      el.style.setProperty('--tilt-rx', `${((0.5 - y) * 2 * max).toFixed(2)}deg`)
      el.style.setProperty('--tilt-gx', `${(x * 100).toFixed(1)}%`)
      el.style.setProperty('--tilt-gy', `${(y * 100).toFixed(1)}%`)
    })
  }

  const handleLeave = (e: ReactPointerEvent<HTMLDivElement>) => {
    onPointerLeave?.(e)
    const el = local.current
    if (!el) return
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    el.classList.remove('is-tilting')
    el.style.removeProperty('--tilt-rx')
    el.style.removeProperty('--tilt-ry')
  }

  return (
    <div
      ref={setRefs}
      className={`tilt ${className}`}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      {...rest}
    >
      {children}
    </div>
  )
})

export default Tilt
