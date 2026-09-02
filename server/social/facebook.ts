import type { PostResult } from './types'

const GRAPH_VERSION = 'v21.0'

/**
 * Posts to a Facebook Page's feed via the Meta Graph API.
 * Requires FACEBOOK_PAGE_ID and a long-lived FACEBOOK_PAGE_ACCESS_TOKEN
 * (generated in the Meta Developer console - never a personal password).
 */
export async function postToFacebook(message: string, imageUrl?: string): Promise<PostResult> {
    const pageId = process.env.FACEBOOK_PAGE_ID
    const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN

    if (!pageId || !accessToken) {
        return { platform: 'facebook', status: 'skipped', detail: 'FACEBOOK_PAGE_ID / FACEBOOK_PAGE_ACCESS_TOKEN not configured' }
    }

    try {
        const endpoint = imageUrl
            ? `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/photos`
            : `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/feed`

        const body = new URLSearchParams({ access_token: accessToken })
        if (imageUrl) {
            body.set('url', imageUrl)
            body.set('caption', message)
        } else {
            body.set('message', message)
        }

        const res = await fetch(endpoint, { method: 'POST', body })
        const data: any = await res.json()

        if (!res.ok) {
            return { platform: 'facebook', status: 'failed', detail: data?.error?.message || `HTTP ${res.status}` }
        }

        return { platform: 'facebook', status: 'posted', detail: 'Posted to Facebook Page', postId: data.post_id || data.id }
    } catch (error: any) {
        return { platform: 'facebook', status: 'failed', detail: error.message || 'Unknown error' }
    }
}
