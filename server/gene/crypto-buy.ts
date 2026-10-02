/**
 * Buying a home with Bitcoin or another digital currency.
 *
 * What this does: shows the asking price in coin at the live rate, takes a purchase request (who, how they want to
 * pay, a note), keeps it with the rate that was shown, tells the administrators and the listing's owner, and emails
 * the buyer a reference and the rules that keep them safe from fraud.
 *
 * What it deliberately does not do: take the money. A home is not paid for by sending coin to a website. The
 * payment goes to an escrow or the seller's lawyer on written instructions, after the seller has agreed to accept
 * digital currency and the buyer's identity and source of funds are checked (the AML page says so). The platform
 * wallet used for tour passes is not involved. If the owner later wants reservation deposits taken here, that
 * needs finance and legal sign-off first (see btc-payments.ts).
 */
import type { Express, Request, Response } from 'express'
import { storage } from '../storage'
import { nextId, nowIso, readCollection, writeCollection } from './store'
import { notifyAdminsEverywhere } from './admin-notify'
import { requireStrictAdmin } from './admin-guard'
import { sendEmail } from '../email-service'
import { DynamoDBUtils, TABLES } from '../dynamodb'
import { createNotification } from '../models/Notification'
import { getRates, quotePrice } from './crypto-rates'
import { CRYPTO_ASSETS, CRYPTO_REQUEST_STATUSES, assetByCode, formatCoin, isCryptoSaleCategory, type CryptoQuote, type CryptoRequestStatus } from '../../shared/crypto-buy'

const C_REQ = 'gene_crypto_requests'
const C_SET = 'gene_crypto_settings'

export interface CryptoSettings {
    id: 1
    /** Show the button and take requests. */
    enabled: boolean
    /** Coins offered in the form. */
    assets: string[]
    /** Shown to buyers above the form, e.g. "Seller has agreed to Bitcoin on plots above 100M UGX". */
    note: string
    updatedAt: string
}

const DEFAULT_SETTINGS: CryptoSettings = { id: 1, enabled: true, assets: CRYPTO_ASSETS.map((a) => a.code), note: '', updatedAt: '' }

export interface CryptoRequest {
    id: number
    reference: string
    propertyId: number
    propertyTitle: string
    category: string
    price: number
    currency: string
    asset: string
    name: string
    email: string
    phone: string
    country: string
    note: string
    /** What the price was worth in coin when the buyer asked (for the record, not binding). */
    quote: CryptoQuote | null
    userId?: number
    status: CryptoRequestStatus
    adminNote?: string
    createdAt: string
    updatedAt: string
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 160
const esc = (s: string) => s.replace(/[<>&"]/g, '')

const hits = new Map<string, number[]>()
function tooMany(key: string, limit: number, windowMs = 3_600_000): boolean {
    const now = Date.now()
    const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
    list.push(now)
    hits.set(key, list)
    return list.length > limit
}

export function getCryptoSettings(): CryptoSettings {
    const row = readCollection<CryptoSettings>(C_SET)[0]
    const merged = { ...DEFAULT_SETTINGS, ...(row ?? {}), id: 1 as const }
    const assets = (merged.assets || []).filter((c) => assetByCode(c))
    return { ...merged, assets: assets.length ? assets : DEFAULT_SETTINGS.assets }
}

function mirror(id: string, kind: string, row: object, rowId: number) {
    DynamoDBUtils.putItem(TABLES.SETTINGS, { ...(row as Record<string, unknown>), id, kind, rowId }).catch((err: unknown) =>
        console.error('[crypto-buy] could not mirror to the database (kept locally):', err)
    )
}
function saveSettings(s: CryptoSettings) {
    writeCollection(C_SET, [s])
    mirror('cryptobuy:settings', C_SET, s, 1)
}
function saveRequest(r: CryptoRequest) {
    const all = readCollection<CryptoRequest>(C_REQ)
    const i = all.findIndex((x) => x.id === r.id)
    if (i >= 0) all[i] = r
    else all.push(r)
    writeCollection(C_REQ, all)
    mirror(`cryptobuy:request:${r.id}`, C_REQ, r, r.id)
}

export async function restoreCryptoBuy(): Promise<void> {
    try {
        const items = (await DynamoDBUtils.scanTable(TABLES.SETTINGS, 'begins_with(#id, :p)', { ':p': 'cryptobuy:' }, { '#id': 'id' })) as unknown as Array<Record<string, any>>
        for (const kind of [C_SET, C_REQ]) {
            const byId = new Map(readCollection<{ id: number }>(kind).map((r) => [r.id, r as Record<string, any>]))
            let changed = false
            for (const item of items.filter((x) => x.kind === kind)) {
                const { id: _k, kind: _kind, rowId, ...row } = item
                const current = byId.get(rowId)
                if (!current || String(current.updatedAt ?? '') < String(row.updatedAt ?? '')) {
                    byId.set(rowId, { ...row, id: rowId })
                    changed = true
                }
            }
            if (changed) writeCollection(kind, Array.from(byId.values()))
        }
    } catch (err) {
        console.warn('[crypto-buy] could not restore from the database (using the local copy):', err)
    }
}

const SAFETY = 'Never send coin to an address you were given in a chat, a call or an unsigned message. Real payment instructions come in writing from RealEVR Estates or the escrow lawyer, and we will never ask you to pay a personal wallet.'

/** Used by the admin page and the owner's WhatsApp assistant. Returns null when there is no such request. */
export function setCryptoRequestStatus(id: number, status: string, adminNote?: string): CryptoRequest | null {
    const r = readCollection<CryptoRequest>(C_REQ).find((x) => x.id === id)
    if (!r) return null
    if ((CRYPTO_REQUEST_STATUSES as readonly string[]).includes(status)) r.status = status as CryptoRequestStatus
    if (typeof adminNote === 'string') r.adminNote = adminNote.trim().slice(0, 600)
    r.updatedAt = nowIso()
    saveRequest(r)
    return r
}

export function registerCryptoBuyRoutes(app: Express): void {
    // The price of a listing in coin. Public, no sign-in. Never shows an amount it could not work out.
    app.get('/api/crypto/property/:id', async (req: Request, res: Response) => {
        try {
            const property = await storage.getProperty(Number(req.params.id))
            const settings = getCryptoSettings()
            if (!property || !isCryptoSaleCategory(property.category) || property.isAvailable === false) {
                return res.json({ eligible: false })
            }
            const got = await getRates()
            const quote = got ? quotePrice(property.price, property.currency || 'UGX', got) : null
            res.set('Cache-Control', 'no-store').json({
                eligible: settings.enabled,
                propertyId: property.id,
                title: property.title,
                category: property.category,
                price: property.price,
                currency: property.currency || 'UGX',
                assets: settings.assets,
                note: settings.note,
                quote,
                safety: SAFETY,
            })
        } catch (err) {
            console.error('[crypto-buy] price lookup failed:', err)
            res.status(500).json({ message: 'Could not work out the price in coin just now. Please try again.' })
        }
    })

    app.post('/api/crypto/requests', async (req: Request, res: Response) => {
        try {
            const b = req.body ?? {}
            // A hidden field only bots fill in: pretend it worked.
            if (str(b.website, 50)) return res.status(201).json({ reference: 'CB-0' })
            const settings = getCryptoSettings()
            if (!settings.enabled) return res.status(503).json({ message: 'Buying with digital currency is switched off at the moment.' })

            const property = await storage.getProperty(Number(b.propertyId))
            if (!property || !isCryptoSaleCategory(property.category)) return res.status(404).json({ message: 'That property is not for sale.' })
            if (property.isAvailable === false) return res.status(409).json({ message: 'That property is no longer available.' })

            const name = str(b.name, 120)
            const email = str(b.email, 160).toLowerCase()
            const phone = str(b.phone, 40)
            const asset = str(b.asset, 10).toUpperCase()
            if (name.length < 2) return res.status(400).json({ message: 'Enter your name.' })
            if (!isEmail(email)) return res.status(400).json({ message: 'Enter an email address we can reply to.' })
            if (phone.replace(/\D/g, '').length < 7) return res.status(400).json({ message: 'Enter a phone or WhatsApp number, with the country code.' })
            if (!settings.assets.includes(asset)) return res.status(400).json({ message: 'Choose which digital currency you would like to pay with.' })
            if (b.confirmedSeller !== true) return res.status(400).json({ message: 'Please tick the box to confirm you understand the next steps.' })

            // Counted only once the form is valid, so mistyping never locks anyone out.
            if (tooMany(req.ip || 'x', 6)) return res.status(429).json({ message: 'Too many requests from this connection. Please try again in an hour.' })

            const currency = property.currency || 'UGX'
            const got = await getRates()
            const quote = got ? quotePrice(property.price, currency, got) : null

            const all = readCollection<CryptoRequest>(C_REQ)
            const id = nextId(all)
            const now = nowIso()
            const r: CryptoRequest = {
                id,
                reference: `CB-${new Date().getUTCFullYear()}-${String(id).padStart(5, '0')}`,
                propertyId: property.id,
                propertyTitle: property.title,
                category: property.category,
                price: property.price,
                currency,
                asset,
                name,
                email,
                phone,
                country: str(b.country, 60),
                note: str(b.note, 1500),
                quote,
                userId: (req.user as { id?: number } | undefined)?.id,
                status: 'new',
                createdAt: now,
                updatedAt: now,
            }
            saveRequest(r)

            const coin = quote && asset === 'BTC' ? formatCoin(quote.btc, 'BTC') : quote && asset === 'ETH' && quote.eth ? formatCoin(quote.eth, 'ETH') : quote && (asset === 'USDT' || asset === 'USDC') ? formatCoin(quote.usd, asset) : null
            const priceLine = `${currency} ${property.price.toLocaleString()}${coin ? ` (about ${coin} at today's rate)` : ''}`

            notifyAdminsEverywhere({
                title: `Crypto purchase request ${r.reference}`,
                message: `${name} (${phone}, ${email}) wants to buy "${property.title}" for ${priceLine} using ${assetByCode(asset)?.short ?? asset}. Check the seller will accept digital currency, then reply with escrow instructions. Admin > Crypto buyers.`,
                link: '/admin/crypto-buyers',
                data: { requestId: id, propertyId: property.id },
            }).catch(() => {})

            if (property.ownerId) {
                createNotification({
                    userId: String(property.ownerId),
                    title: 'A buyer wants to pay with digital currency',
                    message: `Someone asked to buy "${property.title}" with ${assetByCode(asset)?.short ?? asset}. Our team will check with you before anything is agreed.`,
                    type: 'system',
                    link: `/property/${property.id}`,
                }).catch(() => {})
            }

            const html =
                `<p>Hello ${esc(name)},</p>` +
                `<p>We received your request to buy <strong>${esc(property.title)}</strong> with <strong>${esc(assetByCode(asset)?.short ?? asset)}</strong>. Your reference is <strong>${r.reference}</strong>.</p>` +
                `<p>Asking price: <strong>${esc(priceLine)}</strong>. The coin amount moves with the market; the figure that counts is the one agreed in writing.</p>` +
                `<p><strong>What happens next</strong></p><ol>` +
                `<li>We check that the seller will accept digital currency for this property.</li>` +
                `<li>We verify your identity and where the funds come from (a legal requirement for large purchases).</li>` +
                `<li>We send you written payment instructions for an escrow or the seller's lawyer. The sale and the title transfer are documented in ${esc(currency)}.</li></ol>` +
                `<p><strong>${esc(SAFETY)}</strong></p><p>— RealEVR Estates</p>`
            sendEmail({
                to: email,
                subject: `We received your request to buy with ${assetByCode(asset)?.name ?? 'digital currency'} (${r.reference})`,
                html,
                text: `We received your request to buy "${property.title}" with ${assetByCode(asset)?.short ?? asset}. Reference ${r.reference}. Next: we check the seller accepts digital currency, verify your identity and source of funds, then send written escrow instructions. ${SAFETY}`,
            }).catch(() => {})

            res.status(201).json({ reference: r.reference, safety: SAFETY })
        } catch (err) {
            console.error('[crypto-buy] request failed:', err)
            res.status(500).json({ message: 'Could not send your request. Please try again.' })
        }
    })

    app.get('/api/admin/crypto-buy', requireStrictAdmin, async (_req: Request, res: Response) => {
        const got = await getRates().catch(() => null)
        const requests = readCollection<CryptoRequest>(C_REQ).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        res.set('Cache-Control', 'no-store').json({
            settings: getCryptoSettings(),
            assets: CRYPTO_ASSETS.map((a) => ({ code: a.code, name: a.short })),
            statuses: CRYPTO_REQUEST_STATUSES,
            rate: got ? { btcUsd: got.rates.btcUsd, ethUsd: got.rates.ethUsd, asOf: new Date(got.rates.at).toISOString(), stale: got.stale } : null,
            requests,
        })
    })

    app.put('/api/admin/crypto-buy/settings', requireStrictAdmin, (req: Request, res: Response) => {
        const b = req.body ?? {}
        const cur = getCryptoSettings()
        const assets = Array.isArray(b.assets) ? b.assets.map((c: unknown) => String(c).toUpperCase()).filter((c: string) => assetByCode(c)) : cur.assets
        if (!assets.length) return res.status(400).json({ message: 'Keep at least one digital currency on offer.' })
        const next: CryptoSettings = { id: 1, enabled: typeof b.enabled === 'boolean' ? b.enabled : cur.enabled, assets, note: typeof b.note === 'string' ? b.note.trim().slice(0, 400) : cur.note, updatedAt: nowIso() }
        saveSettings(next)
        res.json(next)
    })

    app.patch('/api/admin/crypto-buy/requests/:id', requireStrictAdmin, (req: Request, res: Response) => {
        const r = readCollection<CryptoRequest>(C_REQ).find((x) => x.id === Number(req.params.id))
        if (!r) return res.status(404).json({ message: 'No such request.' })
        if ((CRYPTO_REQUEST_STATUSES as readonly string[]).includes(req.body?.status)) r.status = req.body.status
        if (typeof req.body?.adminNote === 'string') r.adminNote = req.body.adminNote.trim().slice(0, 600)
        r.updatedAt = nowIso()
        saveRequest(r)
        res.json(r)
    })

    restoreCryptoBuy().catch(() => {})
}
