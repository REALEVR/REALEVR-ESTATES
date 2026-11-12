import EmptyState from '@/components/ui/empty-state'
import { WHATSAPP_NUMBERS, whatsAppLink } from '@/lib/siteLinks'

export const LISTINGS_UNAVAILABLE_WHATSAPP_MESSAGE =
    "Hello, the listings on RealEVR Estates aren't loading for me. Can you help me find a place?"

/**
 * Shown when a listings request fails. A bare red "Error loading properties" left renters on a dead end - no way to retry
 * and no way to reach a person - so a server outage cost every viewing-pass sale in that window. This keeps them one tap
 * from a retry or a human agent on WhatsApp (which works even when the listings API is down).
 */
export default function ListingsUnavailable({ onRetry, className = '' }: { onRetry?: () => void; className?: string }) {
    const agent = WHATSAPP_NUMBERS[0]
    const actions = [
        ...(onRetry ? [{ label: 'Try again', onClick: onRetry }] : []),
        {
            label: 'WhatsApp an agent',
            onClick: () => {
                window.open(whatsAppLink(agent.number, LISTINGS_UNAVAILABLE_WHATSAPP_MESSAGE), '_blank', 'noopener,noreferrer')
            },
        },
    ]
    return (
        <div role="alert" className={className}>
            <EmptyState title="Listings are taking a moment" actions={actions} askKevin={false}>
                We couldn't load homes just now. Try again in a minute, or message an agent and we'll find you a place.
            </EmptyState>
        </div>
    )
}
