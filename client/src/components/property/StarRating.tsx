import { useRef, useState, type KeyboardEvent } from 'react'
import { Star } from 'lucide-react'

const MAX_STARS = 5
const STARS = Array.from({ length: MAX_STARS }, (_, i) => i + 1)
const FILLED = 'fill-[#FFB400] text-[#FFB400]'
const EMPTY = 'text-gray-300'

interface StarRatingProps {
    value: number
    onChange?: (value: number) => void
    size?: number
    readOnly?: boolean
    /** Accessible name for the input group, e.g. "Your rating". */
    label?: string
}

const starLabel = (n: number) => `${n} star${n === 1 ? '' : 's'}`

/**
 * Read-only: a single labelled image ("Rated 4 out of 5"), not five disabled
 * buttons, so screen readers announce one meaningful value instead of five
 * unnamed controls.
 *
 * Interactive: a WAI-ARIA radio group. Each star is a named radio, only the
 * selected star (or the first, when nothing is selected) is in the tab order,
 * and arrow / Home / End keys move and select — the same model as a native
 * <input type="radio"> group.
 */
export default function StarRating({
    value,
    onChange,
    size = 20,
    readOnly = false,
    label = 'Rating',
}: StarRatingProps) {
    const [hovered, setHovered] = useState<number | null>(null)
    const buttons = useRef<(HTMLButtonElement | null)[]>([])

    if (readOnly) {
        return (
            <span
                role="img"
                aria-label={`Rated ${value} out of ${MAX_STARS}`}
                className="flex items-center gap-1"
            >
                {STARS.map((star) => (
                    <Star key={star} size={size} aria-hidden="true" className={star <= value ? FILLED : EMPTY} />
                ))}
            </span>
        )
    }

    const display = hovered ?? value
    const tabStop = value >= 1 ? value : 1

    const select = (star: number) => {
        onChange?.(star)
        buttons.current[star - 1]?.focus()
    }

    const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, star: number) => {
        const target: Record<string, number> = {
            ArrowRight: Math.min(star + 1, MAX_STARS),
            ArrowUp: Math.min(star + 1, MAX_STARS),
            ArrowLeft: Math.max(star - 1, 1),
            ArrowDown: Math.max(star - 1, 1),
            Home: 1,
            End: MAX_STARS,
        }
        if (!(event.key in target)) return
        event.preventDefault()
        select(target[event.key])
    }

    return (
        <div
            role="radiogroup"
            aria-label={label}
            className="flex items-center gap-1"
            onMouseLeave={() => setHovered(null)}
        >
            {STARS.map((star) => (
                <button
                    type="button"
                    role="radio"
                    key={star}
                    ref={(el) => { buttons.current[star - 1] = el }}
                    aria-checked={star === value}
                    aria-label={starLabel(star)}
                    tabIndex={star === tabStop ? 0 : -1}
                    className="cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB400] focus-visible:ring-offset-1"
                    onMouseEnter={() => setHovered(star)}
                    onClick={() => select(star)}
                    onKeyDown={(event) => onKeyDown(event, star)}
                >
                    <Star size={size} aria-hidden="true" className={star <= display ? FILLED : EMPTY} />
                </button>
            ))}
        </div>
    )
}
