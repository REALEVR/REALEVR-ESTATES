import { storage } from '../storage'
import { generateDailyCaptions } from './content'
import { postToFacebook } from './facebook'
import { postToInstagram } from './instagram'
import { postToTwitter } from './twitter'
import { postToLinkedIn } from './linkedin'
import type { PostResult } from './types'
import type { Property } from '@shared/schema'

async function pickTodaysProperty(): Promise<Property | undefined> {
    const featured = await storage.getFeaturedProperties()
    if (featured.length > 0) return featured[Math.floor(Math.random() * featured.length)]

    const recent = await storage.getRecentlyAddedProperties(10)
    if (recent.length > 0) return recent[Math.floor(Math.random() * recent.length)]

    const all = await storage.getAllProperties()
    if (all.length > 0) return all[Math.floor(Math.random() * all.length)]

    return undefined
}

/**
 * Generates and publishes today's promotional post across every configured platform
 * (Facebook, Instagram, X, LinkedIn - WhatsApp Status is intentionally excluded, as
 * Meta exposes no public API for it). Each platform posting function independently
 * no-ops with status "skipped" when its credentials aren't set, so this is safe to
 * run before every platform is configured.
 */
export async function postDailyUpdate(): Promise<PostResult[]> {
    const property = await pickTodaysProperty()
    if (!property) {
        console.log('[Social] No properties available to post about today; skipping.')
        return []
    }

    console.log(`[Social] Generating daily post for property #${property.id}: ${property.title}`)
    const captions = await generateDailyCaptions(property)

    const results = await Promise.all([
        postToFacebook(captions.facebook, property.imageUrl),
        postToInstagram(captions.instagram, property.imageUrl),
        postToTwitter(captions.twitter),
        postToLinkedIn(captions.linkedin),
    ])

    results.forEach((r) => console.log(`[Social] ${r.platform}: ${r.status} - ${r.detail}`))

    await notifyAdmins(property, results)
    return results
}

async function notifyAdmins(property: Property, results: PostResult[]): Promise<void> {
    try {
        const posted = results.filter((r) => r.status === 'posted').map((r) => r.platform)
        const failed = results.filter((r) => r.status === 'failed')

        const title = failed.length > 0 ? 'Daily social post had failures' : 'Daily social post published'
        const message = `"${property.title}" — posted to: ${posted.join(', ') || 'none'}.${
            failed.length > 0 ? ` Failed: ${failed.map((f) => `${f.platform} (${f.detail})`).join('; ')}` : ''
        }`

        // Routed through gene/admin-notify.ts's notifyAdminsEverywhere — this
        // used to be an in-app notification only; now also reaches email and
        // both of the owner's WhatsApp numbers.
        const { notifyAdminsEverywhere } = await import('../gene/admin-notify')
        await notifyAdminsEverywhere({
            title,
            message,
            whatsappMessage: `${failed.length > 0 ? '⚠️' : '📣'} ${title}\n${message}`,
            link: '/admin/users',
        })
    } catch (error) {
        console.error('[Social] Failed to notify admins of post results:', error)
    }
}
