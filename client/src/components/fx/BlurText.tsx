/**
 * Words that come out of a blur one after another, like breath on glass clearing.
 * Adapted from "BlurText" in React Bits (https://github.com/DavidHDev/react-bits, © David Haz, MIT + Commons Clause),
 * using framer-motion. The whole phrase stays readable text for screen readers, and with motion off it is plain text.
 */
import { motion } from 'framer-motion'
import { useFxMode } from './fxMode'

export default function BlurText({ text, className = '', wordClassName = '', delay = 0.08, startAt = 0 }: { text: string; className?: string; wordClassName?: string; delay?: number; startAt?: number }) {
    const mode = useFxMode()
    if (mode === 'off') return <span className={className}>{text}</span>
    const words = text.split(' ')
    return (
        <span className={className}>
            {/* The phrase as plain text for screen readers and search engines; the animated words are decoration. */}
            <span className="sr-only">{text}</span>
            {words.map((w, i) => (
                <motion.span
                    key={`${w}-${i}`}
                    aria-hidden="true"
                    className={`inline-block will-change-transform ${wordClassName}`}
                    initial={{ opacity: 0, y: 22, filter: mode === 'full' ? 'blur(12px)' : 'blur(0px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    transition={{ duration: 0.75, delay: startAt + i * delay, ease: [0.22, 1, 0.36, 1] }}
                    style={{ marginRight: i < words.length - 1 ? '0.26em' : 0 }}
                >
                    {w}
                </motion.span>
            ))}
        </span>
    )
}
