import { Bitcoin } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The Bitcoin symbol on its orange coin. Orange is Bitcoin's own colour, so it is the one colour used for it
 * everywhere; the rest of the button stays in the site's neutral palette.
 */
export default function BitcoinMark({ className, size = 20 }: { className?: string; size?: number }) {
    return (
        <span
            aria-hidden="true"
            className={cn('inline-grid shrink-0 place-items-center rounded-full bg-[#F7931A] text-white shadow-[inset_0_-2px_3px_rgba(0,0,0,0.18),0_1px_2px_rgba(247,147,26,0.45)]', className)}
            style={{ width: size, height: size }}
        >
            <Bitcoin style={{ width: size * 0.66, height: size * 0.66 }} strokeWidth={2.6} />
        </span>
    )
}
