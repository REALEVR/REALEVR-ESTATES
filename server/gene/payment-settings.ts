/**
 * Where RealEVR's fees are paid, and how a payment is recognised without a person having to look.
 *
 * 1. Payment details. An administrator sets the payee (name, method, account number or merchant code, extra
 *    instructions) in Admin > Payments. They are shown only to signed-in people who actually owe a fee
 *    (an auction bidder, a bank partner), never on a public page, and never kept in the code.
 *
 * 2. Automatic recognition. There is no card or mobile-money gateway to call, so money arriving is
 *    recognised from the notice the payee's phone/bank sends ("You have received ..."). The notice reaches the
 *    server in one of two ways: a phone app that forwards SMS to POST /api/payments/inbound (fully automatic),
 *    or an administrator pasting the text into Admin > Payments. The server reads the amount, then asks every
 *    registered "matcher" (auction fees, partner fees) whether someone submitted a reference found in that
 *    text and owes about that much. Only a clear, single match confirms anything; everything else stays
 *    for a person. Each notice can confirm at most one payment.
 *
 * Honest limits: this proves "a message that looks like a receipt and contains the payer's reference arrived",
 * not that the money is in the account; anyone holding the forwarding token could post a forged notice, so the
 * token is stored only as a hash, shown once, and can be rotated. Local-currency amounts are only trusted once an
 * administrator has set the exchange rate. Notices are kept 90 days then deleted.
 */
import type { Express, Request, Response } from 'express'
import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { nextId, nowIso, readCollection, writeCollection } from './store'
import { requireStrictAdmin } from './admin-guard'
import { DynamoDBUtils, TABLES } from '../dynamodb'

const C_SETTINGS = 'gene_payment_settings'
const C_NOTICES = 'gene_payment_notices'
const NOTICE_KEEP_DAYS = 90
const RETRY_WINDOW_DAYS = 14
const MIN_AUTO_REFERENCE_LENGTH = 8
/** A payment may be a little short of the fee (bank or mobile-money charges): up to this much is accepted. */
const SHORTFALL_TOLERANCE = 0.03

export interface PaymentSettings {
    id: 1
    /** How to pay, in words: "MTN MoMo virtual card (Mastercard)". */
    methodLabel: string
    /** The name the payer must see before they confirm the payment. */
    accountName: string
    /** Wallet number, merchant code, card or bank account number. Shown only inside signed-in accounts. */
    accountNumber: string
    /** Anything else the payer needs to know (reference to use, cut-off times, local-currency note). */
    instructions: string
    /** Local currency units per 1 US dollar, used to read local-currency receipts. 0 = not set, so only dollar receipts are trusted. */
    ugxPerUsd: number
    /** Confirm payments automatically when a notice clearly matches. */
    autoConfirm: boolean
    /** SHA-256 of the forwarding token (the token itself is shown once). */
    tokenHash: string
    updatedAt: string
    updatedBy?: number
}

export interface PaymentNotice {
    id: number
    at: string
    source: 'forwarder' | 'admin'
    text: string
    textHash: string
    txnId?: string
    amount?: number
    currency?: string
    usd?: number | null
    status: 'matched' | 'unmatched' | 'duplicate' | 'ignored'
    matchedTo?: string
    note?: string
}

const DEFAULT_SETTINGS: PaymentSettings = {
    id: 1,
    methodLabel: 'MTN MoMo virtual card (Mastercard)',
    accountName: 'Eugene Olupot',
    accountNumber: '',
    instructions: '',
    ugxPerUsd: 0,
    autoConfirm: true,
    tokenHash: '',
    updatedAt: '',
}

// ---------------------------------------------------------------------------
// Settings storage (local JSON first, mirrored to the database)
// ---------------------------------------------------------------------------

export function getPaymentSettings(): PaymentSettings {
    const row = readCollection<PaymentSettings>(C_SETTINGS)[0]
    return { ...DEFAULT_SETTINGS, ...(row ?? {}), id: 1 }
}

function savePaymentSettings(s: PaymentSettings): void {
    writeCollection(C_SETTINGS, [s])
    DynamoDBUtils.putItem(TABLES.SETTINGS, { ...(s as unknown as Record<string, unknown>), id: 'paysettings:1', kind: C_SETTINGS }).catch((err: unknown) =>
        console.error('[payments] could not mirror the payment settings to the database (kept locally):', err)
    )
}

export async function restorePaymentSettings(): Promise<void> {
    try {
        if (readCollection<PaymentSettings>(C_SETTINGS).length) return
        const item = (await DynamoDBUtils.getItem(TABLES.SETTINGS, { id: 'paysettings:1' })) as unknown as Record<string, any> | undefined
        if (item) {
            const { id: _id, kind: _k, ...rest } = item
            writeCollection(C_SETTINGS, [{ ...DEFAULT_SETTINGS, ...rest, id: 1 }])
        }
    } catch (err) {
        console.warn('[payments] could not restore the payment settings from the database:', err)
    }
}

/** The instructions a payer is shown. Settings first, then the older environment variable, then a safe message. */
export function payToText(s: PaymentSettings = getPaymentSettings()): string {
    const name = s.accountName.trim()
    const method = s.methodLabel.trim()
    if (s.accountNumber.trim()) {
        return [`Pay by ${method || 'the method below'}: ${s.accountNumber.trim()}`, name ? `Account name: ${name.toUpperCase()}. Check this name before you confirm the payment.` : '', s.instructions.trim()]
            .filter(Boolean)
            .join(' ')
    }
    const fromEnv = (process.env.AUCTION_FEE_PAY_TO || '').trim()
    if (fromEnv) return fromEnv
    return `${method || 'Mobile money'}${name ? `, account name ${name.toUpperCase()}` : ''}. The account number is given to you on WhatsApp (+256 771 891 323) from inside your account. Never pay into any other account.`
}

// ---------------------------------------------------------------------------
// Reading a receipt (pure, unit-tested)
// ---------------------------------------------------------------------------

const CURRENCY = '(?:USD|US\\$|UGX|USh|UShs|Ush|Shs|UGSh|\\$)'
const AMOUNT_AFTER = new RegExp(`(${CURRENCY})\\s?([0-9][0-9,]*(?:\\.[0-9]+)?)`, 'gi')
const AMOUNT_BEFORE = new RegExp(`([0-9][0-9,]*(?:\\.[0-9]+)?)\\s?(USD|UGX)\\b`, 'gi')
const NOT_THE_PAYMENT = /(balance|fee|charge|tax|commission|levy)\W{0,12}$/i
const GOT_MONEY = /\b(received|credited|credit|deposited|deposit|top.?up|topped|payment from|paid you)\b/i
const SENT_MONEY = /\byou (have )?(sent|paid|withdrew|transferred|purchased)\b/i

export function normalizeCurrency(raw: string): 'USD' | 'UGX' {
    return /^(us\$|usd|\$)$/i.test(raw) ? 'USD' : 'UGX'
}

export interface ReadNotice {
    looksLikeReceipt: boolean
    amount?: number
    currency?: 'USD' | 'UGX'
    txnId?: string
}

export function readPaymentNotice(text: string): ReadNotice {
    const t = text.replace(/\s+/g, ' ').trim()
    const looksLikeReceipt = GOT_MONEY.test(t) && !SENT_MONEY.test(t)
    const found: Array<{ index: number; amount: number; currency: 'USD' | 'UGX' }> = []
    for (const m of Array.from(t.matchAll(AMOUNT_AFTER))) found.push({ index: m.index ?? 0, amount: Number(m[2].replace(/,/g, '')), currency: normalizeCurrency(m[1]) })
    for (const m of Array.from(t.matchAll(AMOUNT_BEFORE))) found.push({ index: m.index ?? 0, amount: Number(m[1].replace(/,/g, '')), currency: normalizeCurrency(m[2]) })
    found.sort((a, b) => a.index - b.index)
    const first = found.find((f) => Number.isFinite(f.amount) && f.amount > 0 && !NOT_THE_PAYMENT.test(t.slice(Math.max(0, f.index - 20), f.index)))
    const tid = t.match(/(?:transaction\s*(?:id|no\.?|number)|txn\s*(?:id|no\.?)?|trans\.?\s*id|tid|ref(?:erence)?(?:\s*(?:no\.?|number|id))?)\s*[:.#-]?\s*([A-Za-z0-9]{6,24})/i)
    return { looksLikeReceipt, amount: first?.amount, currency: first?.currency, txnId: tid?.[1] }
}

/** The receipt's amount in US dollars, or null when it cannot be trusted (local currency with no rate set). */
export function usdOf(read: Pick<ReadNotice, 'amount' | 'currency'>, ugxPerUsd: number): number | null {
    if (read.amount == null || !read.currency) return null
    if (read.currency === 'USD') return read.amount
    return ugxPerUsd > 0 ? read.amount / ugxPerUsd : null
}

export function paidEnough(usd: number | null | undefined, expectedUsd: number): boolean {
    return usd != null && usd >= expectedUsd * (1 - SHORTFALL_TOLERANCE)
}

const squash = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')

/** True when a reference the payer typed appears in the receipt text (ignoring spaces, dashes and case). */
export function referenceInText(text: string, reference: string): boolean {
    const ref = squash(reference)
    if (ref.length < MIN_AUTO_REFERENCE_LENGTH) return false
    return squash(text).includes(ref)
}

// ---------------------------------------------------------------------------
// Matchers and notices
// ---------------------------------------------------------------------------

export interface NoticeForMatcher {
    id: number
    text: string
    usd: number | null
    settings: PaymentSettings
}

/** Returns a short description of what was confirmed, or null when it does not (clearly, singly) match. */
export type PaymentMatcher = (notice: NoticeForMatcher) => Promise<string | null> | string | null
const matchers: Array<{ name: string; run: PaymentMatcher }> = []

export function registerPaymentMatcher(name: string, run: PaymentMatcher): void {
    if (!matchers.some((m) => m.name === name)) matchers.push({ name, run })
}

const hashText = (t: string) => createHash('sha256').update(squash(t)).digest('hex').slice(0, 32)
const sha = (t: string) => createHash('sha256').update(t).digest('hex')

function purgeOld(rows: PaymentNotice[]): PaymentNotice[] {
    const cutoff = Date.now() - NOTICE_KEEP_DAYS * 86_400_000
    return rows.filter((r) => Date.parse(r.at) >= cutoff)
}

async function runMatchers(n: PaymentNotice, settings: PaymentSettings): Promise<string | null> {
    if (!settings.autoConfirm) return null
    for (const m of matchers) {
        try {
            const done = await m.run({ id: n.id, text: n.text, usd: n.usd ?? null, settings })
            if (done) return `${m.name}: ${done}`
        } catch (err) {
            console.error(`[payments] matcher ${m.name} failed:`, err)
        }
    }
    return null
}

export async function ingestPaymentNotice(rawText: string, source: PaymentNotice['source']): Promise<PaymentNotice> {
    const text = rawText.replace(/\s+/g, ' ').trim().slice(0, 1000)
    const settings = getPaymentSettings()
    const rows = purgeOld(readCollection<PaymentNotice>(C_NOTICES))
    const read = readPaymentNotice(text)
    const usd = usdOf(read, settings.ugxPerUsd)
    const h = hashText(text)
    const dup = rows.find((r) => r.status !== 'ignored' && (r.textHash === h || (read.txnId && r.txnId === read.txnId)))
    const notice: PaymentNotice = {
        id: nextId(rows),
        at: nowIso(),
        source,
        text,
        textHash: h,
        txnId: read.txnId,
        amount: read.amount,
        currency: read.currency,
        usd,
        status: dup ? 'duplicate' : read.looksLikeReceipt ? 'unmatched' : 'ignored',
        note: dup ? `Same as notice #${dup.id}` : read.looksLikeReceipt ? undefined : 'Not a money-received message',
    }
    // Saved before the matchers run (they quote the notice number), then updated with the outcome.
    rows.push(notice)
    writeCollection(C_NOTICES, rows)
    if (notice.status === 'unmatched') {
        const matched = await runMatchers(notice, settings)
        if (matched) {
            notice.status = 'matched'
            notice.matchedTo = matched
            const fresh = readCollection<PaymentNotice>(C_NOTICES)
            const row = fresh.find((r) => r.id === notice.id)
            if (row) {
                row.status = 'matched'
                row.matchedTo = matched
                writeCollection(C_NOTICES, fresh)
            }
        }
    }
    return notice
}

/** A payer has just submitted a reference: re-check recent receipts that nobody has claimed yet. */
export async function retryUnmatchedNotices(): Promise<void> {
    const settings = getPaymentSettings()
    if (!settings.autoConfirm) return
    const cutoff = Date.now() - RETRY_WINDOW_DAYS * 86_400_000
    const rows = readCollection<PaymentNotice>(C_NOTICES)
    for (const n of rows.filter((r) => r.status === 'unmatched' && Date.parse(r.at) >= cutoff)) {
        const matched = await runMatchers(n, settings)
        if (matched) {
            const fresh = readCollection<PaymentNotice>(C_NOTICES)
            const row = fresh.find((r) => r.id === n.id)
            if (row) {
                row.status = 'matched'
                row.matchedTo = matched
                writeCollection(C_NOTICES, fresh)
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const tokenOk = (given: string, hash: string): boolean => {
    if (!given || !hash) return false
    const a = Buffer.from(sha(given))
    const b = Buffer.from(hash)
    return a.length === b.length && timingSafeEqual(a, b)
}

const hits = new Map<string, number[]>()
function tooMany(key: string, limit = 60): boolean {
    const now = Date.now()
    const list = (hits.get(key) ?? []).filter((t) => now - t < 60_000)
    list.push(now)
    hits.set(key, list)
    return list.length > limit
}

const publicSettings = (s: PaymentSettings) => ({
    methodLabel: s.methodLabel,
    accountName: s.accountName,
    accountNumber: s.accountNumber,
    instructions: s.instructions,
    ugxPerUsd: s.ugxPerUsd,
    autoConfirm: s.autoConfirm,
    tokenSet: Boolean(s.tokenHash),
    updatedAt: s.updatedAt,
})

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export function registerPaymentSettingsRoutes(app: Express): void {
    // The phone that receives the money forwards each receipt here.
    app.post('/api/payments/inbound', async (req: Request, res: Response) => {
        if (tooMany(req.ip || 'x')) return res.status(429).json({ message: 'Too many requests.' })
        const settings = getPaymentSettings()
        const given = str(req.get('x-payment-token') || req.query.token || req.body?.token, 200)
        if (!tokenOk(given, settings.tokenHash)) return res.status(401).json({ message: 'Not allowed.' })
        const text = str(req.body?.text ?? req.body?.message ?? req.body?.body ?? req.body?.sms, 2000)
        if (!text) return res.status(400).json({ message: 'No text.' })
        const n = await ingestPaymentNotice(text, 'forwarder')
        res.json({ status: n.status })
    })

    app.get('/api/admin/payment-settings', requireStrictAdmin, (_req: Request, res: Response) => {
        const notices = readCollection<PaymentNotice>(C_NOTICES)
            .slice(-40)
            .reverse()
            .map(({ textHash: _h, ...n }) => n)
        res.set('Cache-Control', 'no-store').json({ settings: publicSettings(getPaymentSettings()), notices, preview: payToText() })
    })

    app.put('/api/admin/payment-settings', requireStrictAdmin, (req: Request, res: Response) => {
        const b = req.body ?? {}
        const s = getPaymentSettings()
        const rate = Number(b.ugxPerUsd)
        if (b.ugxPerUsd != null && b.ugxPerUsd !== '' && (!Number.isFinite(rate) || rate < 0 || rate > 100000)) return res.status(400).json({ message: 'The exchange rate must be a number (units per US dollar), or 0 to trust dollar receipts only.' })
        const next: PaymentSettings = {
            ...s,
            methodLabel: str(b.methodLabel, 80) || s.methodLabel,
            accountName: str(b.accountName, 120) || s.accountName,
            accountNumber: str(b.accountNumber, 120),
            instructions: str(b.instructions, 500),
            ugxPerUsd: b.ugxPerUsd == null || b.ugxPerUsd === '' ? s.ugxPerUsd : rate,
            autoConfirm: typeof b.autoConfirm === 'boolean' ? b.autoConfirm : s.autoConfirm,
            updatedAt: nowIso(),
            updatedBy: (req.user as { id?: number } | undefined)?.id,
        }
        savePaymentSettings(next)
        res.json({ settings: publicSettings(next), preview: payToText(next) })
    })

    app.post('/api/admin/payment-settings/token', requireStrictAdmin, (_req: Request, res: Response) => {
        const token = randomBytes(24).toString('hex')
        savePaymentSettings({ ...getPaymentSettings(), tokenHash: sha(token), updatedAt: nowIso() })
        res.json({ token, note: 'Copy it now. It is not shown again. The old token stops working.' })
    })

    app.post('/api/admin/payment-notices', requireStrictAdmin, async (req: Request, res: Response) => {
        const text = str(req.body?.text, 2000)
        if (text.length < 10) return res.status(400).json({ message: 'Paste the whole message you received.' })
        const n = await ingestPaymentNotice(text, 'admin')
        res.json({ status: n.status, matchedTo: n.matchedTo ?? null, note: n.note ?? null })
    })
}
