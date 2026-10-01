import { useSyncExternalStore } from 'react'

/**
 * How much motion this visitor gets.
 *
 *  full: everything (liquid-glass refraction, page sweeps, cursor, ambient light)
 *  lite: phones and computers that are short of memory or on data-saver: the cheap effects only (reveals, press feedback)
 *  off:  the visitor asked for no motion (system setting or the switch in the footer): nothing moves
 *
 * Reading the device is a best guess (`navigator.deviceMemory` and `connection.saveData` are only in Chromium), so
 * anything we cannot read counts as capable, and the footer switch always wins. The mode is also written to
 * <html data-fx="..."> so plain CSS can adapt.
 */
export type FxMode = 'full' | 'lite' | 'off'

const KEY = 'realevr_fx'
const listeners = new Set<() => void>()
let current: FxMode = 'full'
let started = false

function readStored(): 'on' | 'off' | null {
    try {
        const v = localStorage.getItem(KEY)
        return v === 'on' || v === 'off' ? v : null
    } catch {
        return null
    }
}

export function detectFxMode(): FxMode {
    if (typeof window === 'undefined') return 'off'
    const stored = readStored()
    if (stored === 'off') return 'off'
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced && stored !== 'on') return 'off'
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string } }
    const weak = (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) || (navigator.hardwareConcurrency !== undefined && navigator.hardwareConcurrency <= 2)
    const saver = nav.connection?.saveData === true || nav.connection?.effectiveType === '2g' || nav.connection?.effectiveType === 'slow-2g'
    return weak || saver ? 'lite' : 'full'
}

function apply(mode: FxMode) {
    current = mode
    document.documentElement.dataset.fx = mode
    listeners.forEach((l) => l())
}

export function startFx(): void {
    if (started || typeof window === 'undefined') return
    started = true
    apply(detectFxMode())
    window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => apply(detectFxMode()))
}

/** The footer switch: motion on (even over a "reduce motion" system default is not forced) or off. */
export function setFxEnabled(on: boolean): void {
    try {
        localStorage.setItem(KEY, on ? 'on' : 'off')
    } catch {
        /* the choice just won't be remembered */
    }
    apply(detectFxMode())
}

export const getFxMode = (): FxMode => current

export function useFxMode(): FxMode {
    return useSyncExternalStore(
        (cb) => {
            listeners.add(cb)
            return () => listeners.delete(cb)
        },
        () => current,
        () => 'off' as FxMode,
    )
}

/** A fine pointer that can hover (a mouse or trackpad), where cursor effects make sense. */
export const hasFinePointer = (): boolean => typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches

// Decide before the first render, so nothing is ever mounted for a mode that is about to change.
startFx()
