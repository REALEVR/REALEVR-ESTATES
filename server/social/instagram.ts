import type { PostResult } from './types'

const GRAPH_VERSION = 'v21.0'

/**
 * Posts an image to an Instagram Business/Creator account via the Meta Graph API.
 * This is a two-step publish: create a media container, then publish it.
 * Requires INSTAGRAM_BUSINESS_ACCOUNT_ID and reuses FACEBOOK_PAGE_ACCESS_TOKEN
 * (the Instagram account must be linked to the same Facebook Page). Instagram's
 * API has no text-only post type, so an imageUrl is required.
 */
export async function postToInstagram(caption: string, imageUrl?: string): Promise<PostResult> {
    const igUserId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID
    const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN

    if (!igUserId || !accessToken) {
        return { platform: 'instagram', status: 'skipped', detail: 'INSTAGRAM_BUSINESS_ACCOUNT_ID / FACEBOOK_PAGE_ACCESS_TOKEN not configured' }
    }
    if (!imageUrl) {
        return { platform: 'instagram', status: 'skipped', detail: 'Instagram requires an image; none available for today\'s property' }
    }

    try {
        const createRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}/media`, {
            method: 'POST',
            body: new URLSearchParams({ image_url: imageUrl, caption, access_token: accessToken }),
        })
        const createData: any = await createRes.json()
        if (!createRes.ok || !createData.id) {
            return { platform: 'instagram', status: 'failed', detail: createData?.error?.message || 'Failed to create media container' }
        }

        const publishRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}/media_publish`, {
            method: 'POST',
            body: new URLSearchParams({ creation_id: createData.id, access_token: accessToken }),
        })
        const publishData: any = await publishRes.json()
        if (!publishRes.ok) {
            return { platform: 'instagram', status: 'failed', detail: publishData?.error?.message || 'Failed to publish media' }
        }

        return { platform: 'instagram', status: 'posted', detail: 'Posted to Instagram', postId: publishData.id }
    } catch (error: any) {
        return { platform: 'instagram', status: 'failed', detail: error.message || 'Unknown error' }
    }
}
