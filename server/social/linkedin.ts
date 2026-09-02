import type { PostResult } from './types'

/**
 * Posts a text update to a LinkedIn organization page via the LinkedIn REST API.
 * Requires LINKEDIN_ACCESS_TOKEN (OAuth 2.0, "w_organization_social" scope) and
 * LINKEDIN_ORGANIZATION_URN (e.g. "urn:li:organization:12345678"). Posting on
 * behalf of an organization requires LinkedIn's Marketing Developer Platform
 * access, approved through the LinkedIn Developer Portal.
 */
export async function postToLinkedIn(text: string): Promise<PostResult> {
    const accessToken = process.env.LINKEDIN_ACCESS_TOKEN
    const orgUrn = process.env.LINKEDIN_ORGANIZATION_URN

    if (!accessToken || !orgUrn) {
        return { platform: 'linkedin', status: 'skipped', detail: 'LINKEDIN_ACCESS_TOKEN / LINKEDIN_ORGANIZATION_URN not configured' }
    }

    try {
        const res = await fetch('https://api.linkedin.com/rest/posts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
                'LinkedIn-Version': '202405',
                'X-Restli-Protocol-Version': '2.0.0',
            },
            body: JSON.stringify({
                author: orgUrn,
                commentary: text,
                visibility: 'PUBLIC',
                distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
                lifecycleState: 'PUBLISHED',
                isReshareDisabledByAuthor: false,
            }),
        })

        if (!res.ok) {
            const data: any = await res.json().catch(() => ({}))
            return { platform: 'linkedin', status: 'failed', detail: data?.message || `HTTP ${res.status}` }
        }

        const postId = res.headers.get('x-restli-id') || undefined
        return { platform: 'linkedin', status: 'posted', detail: 'Posted to LinkedIn', postId }
    } catch (error: any) {
        return { platform: 'linkedin', status: 'failed', detail: error.message || 'Unknown error' }
    }
}
