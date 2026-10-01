import { setFxEnabled, useFxMode } from './fxMode'

/** The footer switch for animations. Always available, so nobody has to dig through system settings to calm the site down. */
export default function FxSwitch() {
    const mode = useFxMode()
    const on = mode !== 'off'
    return (
        <button type="button" onClick={() => setFxEnabled(!on)} aria-pressed={on} className="hover:text-accent hover:underline" title="Turn the site's animations on or off">
            Animations: {on ? (mode === 'lite' ? 'light' : 'on') : 'off'}
        </button>
    )
}
