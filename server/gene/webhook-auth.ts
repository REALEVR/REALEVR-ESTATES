/**
 * Proof that an inbound WhatsApp webhook really came from the provider, not from someone typing a web request.
 * The owner's WhatsApp assistant can approve things, so it only listens to webhooks that pass this.
 *
 *  - Meta Cloud API signs every delivery: header X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(raw body, app secret).
 *    The app secret is WHATSAPP_APP_SECRET (Meta app dashboard > App settings > Basic).
 *  - Infobip does not sign; its webhook URL carries a secret we choose, ?key=<INFOBIP_WEBHOOK_SECRET>.
 */
import crypto from 'node:crypto'

function safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a)
    const bb = Buffer.from(b)
    return ab.length === bb.length && crypto.timingSafeEqual(ab, bb)
}

export function verifyMetaSignature(rawBody: Buffer | string | undefined, header: string | string[] | undefined, appSecret: string | undefined): boolean {
    if (!appSecret || !rawBody) return false
    const given = Array.isArray(header) ? header[0] : header
    if (!given || !given.startsWith('sha256=')) return false
    const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')
    return safeEqual(given.slice('sha256='.length), expected)
}

export function verifyInfobipKey(query: unknown, headers: Record<string, unknown>, secret: string | undefined): boolean {
    if (!secret) return false
    const fromQuery = typeof (query as { key?: unknown })?.key === 'string' ? ((query as { key: string }).key as string) : ''
    const fromHeader = typeof headers['x-webhook-key'] === 'string' ? (headers['x-webhook-key'] as string) : ''
    return (!!fromQuery && safeEqual(fromQuery, secret)) || (!!fromHeader && safeEqual(fromHeader, secret))
}
