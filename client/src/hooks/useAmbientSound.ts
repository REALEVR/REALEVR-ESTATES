/**
 * React view onto client/src/lib/ambientSound.ts's module-level singleton —
 * see that file's doc comment for why it isn't plain React state.
 */
import { useSyncExternalStore } from 'react'
import {
    isAmbientEnabled,
    isAmbientPlaying,
    doesAmbientNeedGesture,
    subscribeAmbient,
    toggleAmbient,
} from '@/lib/ambientSound'

export function useAmbientSound() {
    const enabled = useSyncExternalStore(subscribeAmbient, isAmbientEnabled)
    const playing = useSyncExternalStore(subscribeAmbient, isAmbientPlaying)
    const needsGesture = useSyncExternalStore(subscribeAmbient, doesAmbientNeedGesture)
    return { enabled, playing, needsGesture, toggle: toggleAmbient }
}
