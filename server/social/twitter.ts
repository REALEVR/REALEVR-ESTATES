import { createHmac, randomBytes } from 'crypto'
import type { PostResult } from './types'

// X (Twitter) API v2 requires OAuth 1.0a user-context signing for posting tweets.
// There is no official SDK dependency here - this is a small, self-contained
// implementation of the signing algorithm so we don't pull in an extra package.

function rfc3986Encode(str: string): string {
    return encodeURIComponent(str).replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

function buildOAuthHeader(method: string, url: string, credentials: {
    apiKey: string
    apiSecret: string
    accessToken: string
    accessTokenSecret: string
}): string {
    const oauthParams: Record<string, string> = {
        oauth_consumer_key: credentials.apiKey,
        oauth_nonce: randomBytes(16).toString('hex'),
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
        oauth_token: credentials.accessToken,
        oauth_version: '1.0',
    }

    // POST /2/tweets takes a JSON body, so only the oauth_* params (no query/body
    // params) are included in the signature base per the OAuth1.0a spec.
    const paramString = Object.keys(oauthParams)
        .sort()
        .map((k) => `${rfc3986Encode(k)}=${rfc3986Encode(oauthParams[k])}`)
        .join('&')

    const baseString = `${method.toUpperCase()}&${rfc3986Encode(url)}&${rfc3986Encode(paramString)}`
    const signingKey = `${rfc3986Encode(credentials.apiSecret)}&${rfc3986Encode(credentials.accessTokenSecret)}`
    const signature = createHmac('sha1', signingKey).update(baseString).digest('base64')

    const headerParams: Record<string, string> = { ...oauthParams, oauth_signature: signature }
    return 'OAuth ' + Object.keys(headerParams)
        .sort()
        .map((k) => `${rfc3986Encode(k)}="${rfc3986Encode(headerParams[k])}"`)
        .join(', ')
}

/**
 * Posts a tweet via X API v2. Requires TWITTER_API_KEY, TWITTER_API_SECRET,
 * TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET from a Developer Portal app
 * with write access (posting requires at least the paid Basic tier as of 2023+).
 */
export async function postToTwitter(text: string): Promise<PostResult> {
    const apiKey = process.env.TWITTER_API_KEY
    const apiSecret = process.env.TWITTER_API_SECRET
    const accessToken = process.env.TWITTER_ACCESS_TOKEN
    const accessTokenSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET

    if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
        return { platform: 'twitter', status: 'skipped', detail: 'TWITTER_API_KEY / TWITTER_API_SECRET / TWITTER_ACCESS_TOKEN / TWITTER_ACCESS_TOKEN_SECRET not configured' }
    }

    const url = 'https://api.twitter.com/2/tweets'
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: buildOAuthHeader('POST', url, { apiKey, apiSecret, accessToken, accessTokenSecret }),
            },
            body: JSON.stringify({ text: text.slice(0, 280) }),
        })
        const data: any = await res.json()

        if (!res.ok) {
            return { platform: 'twitter', status: 'failed', detail: data?.detail || data?.title || `HTTP ${res.status}` }
        }

        return { platform: 'twitter', status: 'posted', detail: 'Posted to X', postId: data?.data?.id }
    } catch (error: any) {
        return { platform: 'twitter', status: 'failed', detail: error.message || 'Unknown error' }
    }
}
