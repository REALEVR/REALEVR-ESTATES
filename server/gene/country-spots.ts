/**
 * Country spots: paid, promoted places on a country's own pages, bought in that country's money by people in that country.
 *
 * HOW IT WORKS
 *  1. An administrator opens a country: sets how many spots it has, the local-money rate, and who receives the money
 *     (method, account name, number). Until a country has a payee its spots cannot be bought; the page says "coming soon".
 *  2. A listing owner whose account phone belongs to that country, with a listing in that country, picks a plan. They get a
 *     reference and the payee's details, and pay by that country's own mobile money or bank.
 *  3. The spot switches on when the payment is seen: automatically (the payee's phone forwards its receipts to the
 *     country's own address and the reference + amount match), or by the country's manager / an administrator confirming.
 *  4. The owner manages the spot: change which of their listings fills it, see how many views it got, cancel before it is
 *     paid. The country's manager confirms or rejects payments and can pause a spot that breaks the rules.
 *
 * HONEST LIMITS
 *  - "Citizen" means: the account's phone has the country's dialling code. That shows where a person is reachable, not
 *    their passport. The listing must also be in the country.
 *  - Managers are appointed by an administrator, because a manager sees and confirms payments. Anyone can apply.
 *  - Only the administrator can change the payee or rate, so the money cannot be pointed somewhere else by a manager.
 *  - A receipt proves a message arrived, not that money is in the account; the forwarding token is stored hashed.
 *
 * Persistence: shared JSON store, mirrored to the database and restored at start-up (same pattern as auctions).
 */
import type { Express, Request, Response } from 'express'
import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { nextId, nowIso, readCollection, writeCollection } from './store'
import { requireStrictAdmin } from './admin-guard'
import { DynamoDBUtils, TABLES } from '../dynamodb'
import { createNotification } from '../models/Notification'
import { notifyAdminsEverywhere } from './admin-notify'
import { storage } from '../storage'
import { AFRICAN_COUNTRIES, countryByCode, inferListingCountry } from '../../shared/africa'
import { DEFAULT_SPOTS_PER_COUNTRY, MAX_SPOTS_PER_COUNTRY, SPOT_PLANS, formatMoney, localPrice, phoneBelongsToCountry, planById, spotCurrency, type PlanId } from '../../shared/country-spots'

const C_CONFIG = 'gene_country_spot_config'
const C_PURCHASES = 'gene_country_spot_purchases'
const C_APPLICATIONS = 'gene_country_spot_applications'
const KINDS = [C_CONFIG, C_PURCHASES, C_APPLICATIONS] as const

/** How long a spot is held for someone who has asked for it but not yet paid / not yet been confirmed. */
const HOLD_UNPAID_MS = 24 * 3600_000
const HOLD_SUBMITTED_MS = 7 * 86_400_000
/** A payment may be a little short of the price (mobile-money charges). */
const SHORTFALL_TOLERANCE = 0.03
const SWAP_COOLDOWN_MS = 24 * 3600_000
const MIN_REFERENCE_LENGTH = 8

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Payee {
    methodLabel: string
    accountName: string
    accountNumber: string
    instructions: string
}

export interface CountrySpotConfig {
    /** The country's dialling code as a number: unique per country, so it works as a row id. */
    id: number
    code: string
    enabled: boolean
    spots: number
    /** Local money per US dollar. 0 = quote and take US dollars. */
    perUsd: number
    payee: Payee
    /** Optional dollar price per plan for this country. */
    planUsd: Partial<Record<PlanId, number>>
    managerUserIds: number[]
    /** SHA-256 of the token the payee's phone uses to forward receipts for this country. */
    tokenHash: string
    updatedAt: string
}

export type PurchaseStatus = 'awaiting_payment' | 'submitted' | 'active' | 'paused' | 'expired' | 'cancelled' | 'rejected'

export interface SpotPurchase {
    id: number
    countryCode: string
    propertyId: number
    buyerUserId: number
    planId: PlanId
    days: number
    usd: number
    amountLocal: number
    currency: string
    reference: string
    status: PurchaseStatus
    /** The payer's own transaction id from their receipt. */
    txnRef?: string
    createdAt: string
    submittedAt?: string
    confirmedAt?: string
    confirmedBy?: string
    startsAt?: string
    expiresAt?: string
    note?: string
    viewsAtStart?: number
    lastSwapAt?: string
    /** Hash of the receipt text that confirmed this, so one receipt confirms at most one spot. */
    noticeHash?: string
    updatedAt: string
}

export interface ManagerApplication {
    id: number
    countryCode: string
    userId: number
    about: string
    status: 'open' | 'approved' | 'declined'
    createdAt: string
    updatedAt: string
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const dbId = (kind: string, id: number) => `cspot:${kind}:${id}`

function save<T extends { id: number }>(kind: (typeof KINDS)[number], row: T): void {
    const rows = readCollection<T>(kind)
    const i = rows.findIndex((r) => r.id === row.id)
    if (i >= 0) rows[i] = row
    else rows.push(row)
    writeCollection(kind, rows)
    DynamoDBUtils.putItem(TABLES.SETTINGS, { ...(row as unknown as Record<string, unknown>), id: dbId(kind, row.id), kind, rowId: row.id }).catch((err: unknown) =>
        console.error(`[country-spots] could not mirror ${kind} #${row.id} to the database (kept locally):`, err)
    )
}

export async function restoreCountrySpotsFromDatabase(): Promise<void> {
    try {
        const items = (await DynamoDBUtils.scanTable(TABLES.SETTINGS, 'begins_with(#id, :p)', { ':p': 'cspot:' }, { '#id': 'id' })) as unknown as Array<Record<string, any>>
        for (const kind of KINDS) {
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
        console.warn('[country-spots] could not restore from the database (using the local copy):', err)
    }
}

const configs = () => readCollection<CountrySpotConfig>(C_CONFIG)
const purchases = () => readCollection<SpotPurchase>(C_PURCHASES)
const applications = () => readCollection<ManagerApplication>(C_APPLICATIONS)

function blankConfig(code: string): CountrySpotConfig {
    const country = countryByCode(code)!
    return {
        id: Number(country.dial),
        code: country.code,
        enabled: false,
        spots: DEFAULT_SPOTS_PER_COUNTRY,
        perUsd: 0,
        payee: { methodLabel: '', accountName: '', accountNumber: '', instructions: '' },
        planUsd: {},
        managerUserIds: [],
        tokenHash: '',
        updatedAt: '',
    }
}

export function configFor(code: string): CountrySpotConfig | null {
    const c = countryByCode(code)
    if (!c) return null
    return configs().find((x) => x.code === c.code) ?? blankConfig(c.code)
}

/** A country can sell spots only when it is switched on and says where the money goes. */
export const isOpenForSale = (c: CountrySpotConfig): boolean => c.enabled && c.spots > 0 && !!c.payee.accountNumber.trim() && !!c.payee.accountName.trim()

// ---------------------------------------------------------------------------
// Pure rules (unit-tested)
// ---------------------------------------------------------------------------

export function planPrice(config: Pick<CountrySpotConfig, 'code' | 'perUsd' | 'planUsd'>, planId: PlanId) {
    const plan = planById(planId)!
    const usd = config.planUsd?.[planId] && config.planUsd[planId]! > 0 ? config.planUsd[planId]! : plan.usd
    return { plan, usd, currency: spotCurrency(config.code, config.perUsd), amountLocal: localPrice(usd, config.perUsd) }
}

/** Does this row currently use up one of the country's spots? Pending requests hold a spot for a while, then let go. */
export function holdsSpot(p: Pick<SpotPurchase, 'status' | 'createdAt' | 'submittedAt' | 'expiresAt'>, nowMs = Date.now()): boolean {
    if (p.status === 'active' || p.status === 'paused') return !p.expiresAt || Date.parse(p.expiresAt) > nowMs
    if (p.status === 'awaiting_payment') return nowMs - Date.parse(p.createdAt) < HOLD_UNPAID_MS
    if (p.status === 'submitted') return nowMs - Date.parse(p.submittedAt ?? p.createdAt) < HOLD_SUBMITTED_MS
    return false
}

/** When the next spot frees up, if none is free now (the earliest end among the rows that hold one). */
export function nextFreeAt(rows: SpotPurchase[], nowMs = Date.now()): string | null {
    const ends = rows
        .filter((r) => holdsSpot(r, nowMs))
        .map((r) =>
            r.status === 'awaiting_payment'
                ? Date.parse(r.createdAt) + HOLD_UNPAID_MS
                : r.status === 'submitted'
                  ? Date.parse(r.submittedAt ?? r.createdAt) + HOLD_SUBMITTED_MS
                  : r.expiresAt
                    ? Date.parse(r.expiresAt)
                    : Infinity
        )
        .filter((t) => Number.isFinite(t))
    return ends.length ? new Date(Math.min(...ends)).toISOString() : null
}

const squash = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
export const referenceInText = (text: string, reference: string): boolean => squash(reference).length >= MIN_REFERENCE_LENGTH && squash(text).includes(squash(reference))

/** Local abbreviations people see on receipts, beside the ISO code. */
const CURRENCY_ALIASES: Record<string, string[]> = {
    KES: ['KSH', 'KSHS'],
    TZS: ['TSH', 'TSHS'],
    UGX: ['USH', 'USHS', 'SHS'],
    GHS: ['GH₵', 'GHC', '₵'],
    NGN: ['₦'],
    RWF: ['FRW', 'RWF'],
    ZAR: ['R'],
    ZMW: ['ZK'],
    ETB: ['BIRR'],
    USD: ['US$', '$'],
}

/** The amount a receipt shows in `currency`, or null when it shows none in that money. */
export function amountInCurrency(text: string, currency: string): number | null {
    const t = text.replace(/\s+/g, ' ')
    const names = [currency, ...(CURRENCY_ALIASES[currency] ?? [])].map((n) => n.replace(/[$]/g, '\\$'))
    const alt = names.join('|')
    const before = new RegExp(`(?:^|[^A-Za-z])(?:${alt})\\s?([0-9][0-9,]*(?:\\.[0-9]+)?)`, 'gi')
    const after = new RegExp(`([0-9][0-9,]*(?:\\.[0-9]+)?)\\s?(?:${alt})(?![A-Za-z])`, 'gi')
    const found: Array<{ i: number; v: number }> = []
    for (const m of Array.from(t.matchAll(before))) found.push({ i: m.index ?? 0, v: Number(m[1].replace(/,/g, '')) })
    for (const m of Array.from(t.matchAll(after))) found.push({ i: m.index ?? 0, v: Number(m[1].replace(/,/g, '')) })
    found.sort((a, b) => a.i - b.i)
    // A "balance" or "fee" figure is not the payment.
    const real = found.find((f) => f.v > 0 && !/(balance|fee|charge|tax|commission|levy)\W{0,12}$/i.test(t.slice(Math.max(0, f.i - 20), f.i)))
    return real ? real.v : null
}

export const paidEnough = (paid: number | null, expected: number): boolean => paid != null && paid >= expected * (1 - SHORTFALL_TOLERANCE)

const GOT_MONEY = /\b(received|credited|credit|deposited|deposit|top.?up|topped|payment from|paid you)\b/i
const SENT_MONEY = /\byou (have )?(sent|paid|withdrew|transferred|purchased)\b/i
export const looksLikeReceipt = (text: string): boolean => GOT_MONEY.test(text) && !SENT_MONEY.test(text)

export interface Eligibility {
    ok: boolean
    reasons: string[]
}

export function checkEligibility(args: {
    config: CountrySpotConfig | null
    user: { id: number; role?: string; phoneNumber?: string | null; countryCode?: string | null } | null
    property: { id: number; ownerId?: number | null; country?: string | null; [k: string]: any } | null
    code: string
}): Eligibility {
    const reasons: string[] = []
    const { config, user, property, code } = args
    const country = countryByCode(code)
    if (!country || !config) return { ok: false, reasons: ['That country is not on the platform.'] }
    if (!isOpenForSale(config)) reasons.push(`Spots in ${country.name} are not open yet.`)
    if (!user) return { ok: false, reasons: ['Sign in first.', ...reasons] }
    const isAdmin = user.role === 'admin'
    if (!isAdmin && !phoneBelongsToCountry(user.phoneNumber, user.countryCode, code)) {
        reasons.push(`Spots in ${country.name} are for people with a ${country.name} phone number (+${country.dial}) on their account.`)
    }
    if (!property) {
        reasons.push('Choose one of your listings.')
    } else {
        if (!isAdmin && property.ownerId !== user.id) reasons.push('You can only promote your own listings.')
        if (inferListingCountry(property as any) !== country.code) reasons.push(`That listing is not in ${country.name}.`)
    }
    return { ok: reasons.length === 0, reasons }
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

const tokenHashOf = (t: string) => createHash('sha256').update(t).digest('hex')
const tokenOk = (given: string, hash: string): boolean => {
    if (!given || !hash) return false
    const a = Buffer.from(tokenHashOf(given))
    const b = Buffer.from(hash)
    return a.length === b.length && timingSafeEqual(a, b)
}

async function tell(userId: number, title: string, message: string, link = '/promotions') {
    try {
        await createNotification({ userId: String(userId), title, message, type: 'system', link })
    } catch (err) {
        console.error('[country-spots] could not notify user', userId, err)
    }
}

async function tellManagers(config: CountrySpotConfig, title: string, message: string) {
    for (const id of config.managerUserIds) await tell(id, title, message, '/promotions')
    notifyAdminsEverywhere({ title, message, link: '/admin/country-spots' }).catch(() => {})
}

const rowsUsingSpots = (code: string, nowMs = Date.now()) => purchases().filter((p) => p.countryCode === code && holdsSpot(p, nowMs))

export function spotsFree(config: CountrySpotConfig, nowMs = Date.now()): number {
    return Math.max(0, config.spots - rowsUsingSpots(config.code, nowMs).length)
}

/** Lazy tidy-up: rows whose time has run out are marked, so lists and counts are honest without a scheduler. */
export function sweep(nowMs = Date.now()): void {
    const rows = purchases()
    for (const p of rows) {
        let next: PurchaseStatus | null = null
        if ((p.status === 'active' || p.status === 'paused') && p.expiresAt && Date.parse(p.expiresAt) <= nowMs) next = 'expired'
        else if ((p.status === 'awaiting_payment' || p.status === 'submitted') && !holdsSpot(p, nowMs)) next = 'cancelled'
        if (next) {
            const row = { ...p, status: next, note: next === 'cancelled' ? 'Not paid in time, so the spot was released.' : p.note, updatedAt: nowIso() }
            save(C_PURCHASES, row)
            tell(p.buyerUserId, next === 'expired' ? 'Your country spot has ended' : 'Spot request released', next === 'expired' ? 'The promotion period is over. You can buy another spot any time.' : 'We did not see a payment in time, so the spot was released. You can ask again.').catch(() => {})
        }
    }
}

export async function activate(id: number, confirmedBy: string, noticeHash?: string): Promise<SpotPurchase> {
    const p = purchases().find((x) => x.id === id)
    if (!p) throw new Error('That spot request was not found.')
    if (p.status === 'active') return p
    if (p.status !== 'awaiting_payment' && p.status !== 'submitted') throw new Error('That request can no longer be confirmed.')
    // The money has arrived: a failed look-up of the listing's title or view count must never stop the spot switching on.
    const property = await storage.getProperty(p.propertyId).catch(() => undefined)
    const now = new Date()
    const row: SpotPurchase = {
        ...p,
        status: 'active',
        confirmedAt: now.toISOString(),
        confirmedBy,
        startsAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + p.days * 86_400_000).toISOString(),
        viewsAtStart: (property as any)?.viewCount ?? 0,
        noticeHash,
        note: undefined,
        updatedAt: nowIso(),
    }
    save(C_PURCHASES, row)
    await tell(p.buyerUserId, 'Your country spot is live', `${property?.title ?? 'Your listing'} is now promoted in ${countryByCode(p.countryCode)?.name} until ${row.expiresAt!.slice(0, 10)}.`)
    return row
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

const roundViews = async (p: SpotPurchase) => {
    const property = await storage.getProperty(p.propertyId).catch(() => undefined)
    const now = (property as any)?.viewCount ?? 0
    return { title: property?.title ?? 'Listing', imageUrl: property?.imageUrl ?? null, viewsGained: Math.max(0, now - (p.viewsAtStart ?? now)) }
}

async function ownerView(p: SpotPurchase) {
    const extra = await roundViews(p)
    const country = countryByCode(p.countryCode)
    const cfg = configFor(p.countryCode)
    return {
        id: p.id,
        countryCode: p.countryCode,
        countryName: country?.name ?? p.countryCode,
        propertyId: p.propertyId,
        planId: p.planId,
        days: p.days,
        amountLocal: p.amountLocal,
        currency: p.currency,
        reference: p.reference,
        status: p.status,
        txnRef: p.txnRef ?? null,
        startsAt: p.startsAt ?? null,
        expiresAt: p.expiresAt ?? null,
        note: p.note ?? null,
        canSwapAt: p.lastSwapAt ? new Date(Date.parse(p.lastSwapAt) + SWAP_COOLDOWN_MS).toISOString() : null,
        payTo: p.status === 'awaiting_payment' || p.status === 'submitted' ? cfg?.payee ?? null : null,
        ...extra,
    }
}

const userOf = (req: Request) => (req.isAuthenticated?.() && req.user ? (req.user as any) : null)
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

function isManagerOf(user: any, code: string): boolean {
    if (!user) return false
    if (user.role === 'admin') return true
    return !!configFor(code)?.managerUserIds.includes(user.id)
}

/** Public numbers for a country, shown on the buy screen and the country page. */
function publicCountry(code: string) {
    const c = configFor(code)!
    const country = countryByCode(code)!
    const open = isOpenForSale(c)
    const rows = purchases().filter((p) => p.countryCode === code)
    return {
        code,
        name: country.name,
        dial: country.dial,
        open,
        total: c.spots,
        free: open ? spotsFree(c) : 0,
        nextFreeAt: open && spotsFree(c) === 0 ? nextFreeAt(rows) : null,
        currency: spotCurrency(code, c.perUsd),
        plans: SPOT_PLANS.map((pl) => {
            const q = planPrice(c, pl.id)
            return { id: pl.id, label: pl.label, days: pl.days, amountLocal: q.amountLocal, currency: q.currency, usd: q.usd }
        }),
    }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const hits = new Map<string, number[]>()
function tooMany(key: string, limit: number): boolean {
    const now = Date.now()
    const list = (hits.get(key) ?? []).filter((t) => now - t < 60_000)
    list.push(now)
    hits.set(key, list)
    if (hits.size > 5000) hits.clear()
    return list.length > limit
}

export function registerCountrySpotRoutes(app: Express): void {
    // --- Public ------------------------------------------------------------

    /** Which listings hold a spot right now, in every country: a cheap list the cards use to show "Promoted". */
    app.get('/api/country-spots/active', (_req, res) => {
        sweep()
        const now = Date.now()
        const active = purchases().filter((p) => p.status === 'active' && p.expiresAt && Date.parse(p.expiresAt) > now)
        res.set('Cache-Control', 'public, max-age=60').json({ spots: active.map((p) => ({ propertyId: p.propertyId, countryCode: p.countryCode })) })
    })

    app.get('/api/country-spots/countries', (_req, res) => {
        sweep()
        res.json({ countries: AFRICAN_COUNTRIES.filter((c) => isOpenForSale(configFor(c.code)!)).map((c) => publicCountry(c.code)) })
    })

    app.get('/api/country-spots/country/:code', (req, res) => {
        const code = String(req.params.code).toUpperCase()
        if (!countryByCode(code)) return res.status(404).json({ message: 'That country is not on the platform.' })
        sweep()
        const now = Date.now()
        const active = purchases()
            .filter((p) => p.countryCode === code && p.status === 'active' && p.expiresAt && Date.parse(p.expiresAt) > now)
            .sort((a, b) => Date.parse(a.startsAt ?? a.createdAt) - Date.parse(b.startsAt ?? b.createdAt))
        res.json({ ...publicCountry(code), propertyIds: active.map((p) => p.propertyId) })
    })

    // --- Buyer -------------------------------------------------------------

    app.get('/api/country-spots/mine', async (req: Request, res: Response) => {
        const user = userOf(req)
        if (!user) return res.status(401).json({ message: 'Sign in first.' })
        sweep()
        const mine = purchases().filter((p) => p.buyerUserId === user.id).sort((a, b) => b.id - a.id)
        const managed = AFRICAN_COUNTRIES.filter((c) => isManagerOf(user, c.code)).map((c) => c.code)
        res.json({ purchases: await Promise.all(mine.map(ownerView)), managedCountries: managed, userCountry: AFRICAN_COUNTRIES.find((c) => phoneBelongsToCountry(user.phoneNumber, user.countryCode, c.code))?.code ?? null })
    })

    app.get('/api/country-spots/quote', async (req: Request, res: Response) => {
        const code = String(req.query.country ?? '').toUpperCase()
        const user = userOf(req)
        const property = req.query.propertyId ? await storage.getProperty(Number(req.query.propertyId)) : null
        const elig = checkEligibility({ config: configFor(code), user, property: property ?? null, code })
        res.json({ ...elig, country: countryByCode(code) ? publicCountry(code) : null })
    })

    app.post('/api/country-spots/purchase', async (req: Request, res: Response) => {
        const user = userOf(req)
        if (!user) return res.status(401).json({ message: 'Sign in first.' })
        if (tooMany(`buy:${user.id}`, 8)) return res.status(429).json({ message: 'Slow down for a minute.' })
        const code = str(req.body?.country, 4).toUpperCase()
        const plan = planById(req.body?.planId)
        const propertyId = Number(req.body?.propertyId)
        if (!plan) return res.status(400).json({ message: 'Choose a plan.' })
        sweep()
        const config = configFor(code)
        const property = Number.isFinite(propertyId) ? await storage.getProperty(propertyId) : undefined
        const elig = checkEligibility({ config, user, property: property ?? null, code })
        if (!elig.ok || !config || !property) return res.status(403).json({ message: elig.reasons[0] ?? 'Not allowed.', reasons: elig.reasons })
        if (purchases().some((p) => p.propertyId === property.id && holdsSpot(p))) return res.status(409).json({ message: 'That listing already has a spot or a pending request.' })
        if (spotsFree(config) <= 0) return res.status(409).json({ message: `All ${config.spots} spots in ${countryByCode(code)!.name} are taken right now.`, nextFreeAt: nextFreeAt(purchases().filter((p) => p.countryCode === code)) })
        const q = planPrice(config, plan.id)
        const rows = purchases()
        const row: SpotPurchase = {
            id: nextId(rows),
            countryCode: code,
            propertyId: property.id,
            buyerUserId: user.id,
            planId: plan.id,
            days: plan.days,
            usd: q.usd,
            amountLocal: q.amountLocal,
            currency: q.currency,
            reference: `CS${code}${randomBytes(4).toString('hex').toUpperCase()}`,
            status: 'awaiting_payment',
            createdAt: nowIso(),
            updatedAt: nowIso(),
        }
        save(C_PURCHASES, row)
        res.json({ purchase: await ownerView(row), instructions: `Pay ${formatMoney(row.currency, row.amountLocal)} to ${config.payee.methodLabel || 'the account below'} and put ${row.reference} in the payment note.` })
    })

    app.post('/api/country-spots/purchases/:id/submit', async (req: Request, res: Response) => {
        const user = userOf(req)
        if (!user) return res.status(401).json({ message: 'Sign in first.' })
        const p = purchases().find((x) => x.id === Number(req.params.id))
        if (!p || p.buyerUserId !== user.id) return res.status(404).json({ message: 'Not found.' })
        if (p.status !== 'awaiting_payment' && p.status !== 'submitted') return res.status(409).json({ message: 'This request is already closed.' })
        const txnRef = str(req.body?.txnRef, 40)
        if (txnRef.length < 6) return res.status(400).json({ message: 'Enter the transaction id from your payment receipt.' })
        const row = { ...p, status: 'submitted' as const, txnRef, submittedAt: nowIso(), updatedAt: nowIso() }
        save(C_PURCHASES, row)
        const cfg = configFor(p.countryCode)!
        tellManagers(cfg, 'Spot payment to confirm', `${countryByCode(p.countryCode)?.name}: reference ${p.reference}, transaction ${txnRef}, ${formatMoney(p.currency, p.amountLocal)}.`).catch(() => {})
        res.json({ purchase: await ownerView(row) })
    })

    app.post('/api/country-spots/purchases/:id/cancel', async (req: Request, res: Response) => {
        const user = userOf(req)
        if (!user) return res.status(401).json({ message: 'Sign in first.' })
        const p = purchases().find((x) => x.id === Number(req.params.id))
        if (!p || p.buyerUserId !== user.id) return res.status(404).json({ message: 'Not found.' })
        if (p.status !== 'awaiting_payment') return res.status(409).json({ message: 'Only a request you have not paid yet can be cancelled. If you have paid, ask the country manager.' })
        const row = { ...p, status: 'cancelled' as const, note: 'Cancelled by you.', updatedAt: nowIso() }
        save(C_PURCHASES, row)
        res.json({ purchase: await ownerView(row) })
    })

    /** Move the spot to another of the owner's listings in the same country (once a day). */
    app.post('/api/country-spots/purchases/:id/swap', async (req: Request, res: Response) => {
        const user = userOf(req)
        if (!user) return res.status(401).json({ message: 'Sign in first.' })
        const p = purchases().find((x) => x.id === Number(req.params.id))
        if (!p || p.buyerUserId !== user.id) return res.status(404).json({ message: 'Not found.' })
        if (p.status !== 'active') return res.status(409).json({ message: 'Only a live spot can be moved.' })
        if (p.lastSwapAt && Date.now() - Date.parse(p.lastSwapAt) < SWAP_COOLDOWN_MS) return res.status(429).json({ message: 'You can change the listing once a day.' })
        const property = await storage.getProperty(Number(req.body?.propertyId))
        const elig = checkEligibility({ config: configFor(p.countryCode), user, property: property ?? null, code: p.countryCode })
        if (!property || (!elig.ok && elig.reasons.some((r) => !/not open yet/.test(r)))) return res.status(403).json({ message: elig.reasons.find((r) => !/not open yet/.test(r)) ?? 'Choose one of your listings.' })
        if (purchases().some((x) => x.id !== p.id && x.propertyId === property.id && holdsSpot(x))) return res.status(409).json({ message: 'That listing already has a spot.' })
        const row = { ...p, propertyId: property.id, viewsAtStart: (property as any).viewCount ?? 0, lastSwapAt: nowIso(), updatedAt: nowIso() }
        save(C_PURCHASES, row)
        res.json({ purchase: await ownerView(row) })
    })

    app.post('/api/country-spots/manager-application', async (req: Request, res: Response) => {
        const user = userOf(req)
        if (!user) return res.status(401).json({ message: 'Sign in first.' })
        const code = str(req.body?.country, 4).toUpperCase()
        if (!countryByCode(code)) return res.status(400).json({ message: 'Choose a country.' })
        if (user.role !== 'admin' && !phoneBelongsToCountry(user.phoneNumber, user.countryCode, code)) return res.status(403).json({ message: `Managers must have a ${countryByCode(code)!.name} phone number on their account.` })
        const rows = applications()
        if (rows.some((a) => a.userId === user.id && a.countryCode === code && a.status === 'open')) return res.status(409).json({ message: 'You already have an application open for this country.' })
        const row: ManagerApplication = { id: nextId(rows), countryCode: code, userId: user.id, about: str(req.body?.about, 800), status: 'open', createdAt: nowIso(), updatedAt: nowIso() }
        save(C_APPLICATIONS, row)
        notifyAdminsEverywhere({ title: 'Country manager application', message: `${user.fullName ?? user.username ?? 'A user'} (#${user.id}) applied to manage spots in ${countryByCode(code)!.name}.`, link: '/admin/country-spots' }).catch(() => {})
        res.json({ ok: true })
    })

    // --- Country manager / administrator ------------------------------------

    app.get('/api/country-spots/manage/:code', async (req: Request, res: Response) => {
        const user = userOf(req)
        const code = String(req.params.code).toUpperCase()
        if (!isManagerOf(user, code)) return res.status(403).json({ message: 'You do not manage this country.' })
        sweep()
        const rows = purchases().filter((p) => p.countryCode === code).sort((a, b) => b.id - a.id).slice(0, 200)
        res.json({ ...publicCountry(code), purchases: await Promise.all(rows.map(async (p) => ({ ...(await ownerView(p)), buyerUserId: p.buyerUserId, payTo: null }))) })
    })

    const managerAction = (action: 'confirm' | 'reject' | 'pause' | 'resume') => async (req: Request, res: Response) => {
        const user = userOf(req)
        const p = purchases().find((x) => x.id === Number(req.params.id))
        if (!p) return res.status(404).json({ message: 'Not found.' })
        if (!isManagerOf(user, p.countryCode)) return res.status(403).json({ message: 'You do not manage this country.' })
        const note = str(req.body?.note, 300)
        try {
            if (action === 'confirm') {
                const row = await activate(p.id, `user:${user.id}`)
                return res.json({ purchase: await ownerView(row) })
            }
            if (action === 'reject') {
                if (p.status !== 'awaiting_payment' && p.status !== 'submitted') return res.status(409).json({ message: 'Only a request waiting for payment can be rejected.' })
                const row = { ...p, status: 'rejected' as const, note: note || 'The payment could not be matched.', updatedAt: nowIso() }
                save(C_PURCHASES, row)
                await tell(p.buyerUserId, 'Spot request not confirmed', row.note!)
                return res.json({ purchase: await ownerView(row) })
            }
            if (action === 'pause') {
                if (p.status !== 'active') return res.status(409).json({ message: 'Only a live spot can be paused.' })
                if (!note) return res.status(400).json({ message: 'Say why, so the owner knows what to fix.' })
                const row = { ...p, status: 'paused' as const, note, updatedAt: nowIso() }
                save(C_PURCHASES, row)
                await tell(p.buyerUserId, 'Your spot was paused', note)
                return res.json({ purchase: await ownerView(row) })
            }
            if (p.status !== 'paused') return res.status(409).json({ message: 'That spot is not paused.' })
            const row = { ...p, status: 'active' as const, note: undefined, updatedAt: nowIso() }
            save(C_PURCHASES, row)
            await tell(p.buyerUserId, 'Your spot is live again', 'The pause was lifted.')
            return res.json({ purchase: await ownerView(row) })
        } catch (err) {
            res.status(409).json({ message: (err as Error).message })
        }
    }
    app.post('/api/country-spots/purchases/:id/confirm', managerAction('confirm'))
    app.post('/api/country-spots/purchases/:id/reject', managerAction('reject'))
    app.post('/api/country-spots/purchases/:id/pause', managerAction('pause'))
    app.post('/api/country-spots/purchases/:id/resume', managerAction('resume'))

    /** The country payee's phone forwards each receipt here (token per country). A clear single match switches the spot on. */
    app.post('/api/country-spots/inbound/:code', async (req: Request, res: Response) => {
        if (tooMany(`in:${req.ip}`, 60)) return res.status(429).json({ message: 'Too many requests.' })
        const code = String(req.params.code).toUpperCase()
        const cfg = configFor(code)
        const given = str(req.get('x-payment-token') || req.query.token || req.body?.token, 200)
        if (!cfg || !tokenOk(given, cfg.tokenHash)) return res.status(401).json({ message: 'Not allowed.' })
        const text = str(req.body?.text ?? req.body?.message ?? req.body?.body ?? req.body?.sms, 2000)
        if (!text) return res.status(400).json({ message: 'No text.' })
        res.json({ status: await matchReceipt(cfg, text) })
    })

    // --- Administrator ------------------------------------------------------

    const adminView = (c: CountrySpotConfig) => ({ ...c, tokenHash: undefined, tokenSet: !!c.tokenHash, open: isOpenForSale(c), name: countryByCode(c.code)?.name, currency: countryByCode(c.code)?.currency })

    app.get('/api/admin/country-spots', requireStrictAdmin, async (_req, res) => {
        sweep()
        const apps = applications().filter((a) => a.status === 'open')
        const withUsers = await Promise.all(apps.map(async (a) => ({ ...a, user: await storage.getUser(a.userId).then((u) => (u ? { id: u.id, name: (u as any).fullName ?? u.username, email: u.email, phone: (u as any).phoneNumber } : null)) })))
        res.set('Cache-Control', 'no-store').json({
            countries: AFRICAN_COUNTRIES.map((c) => adminView(configFor(c.code)!)),
            applications: withUsers,
            pending: purchases().filter((p) => p.status === 'submitted').length,
            plans: SPOT_PLANS,
        })
    })

    app.put('/api/admin/country-spots/:code', requireStrictAdmin, async (req: Request, res: Response) => {
        const code = String(req.params.code).toUpperCase()
        const cur = configFor(code)
        if (!cur) return res.status(404).json({ message: 'Unknown country.' })
        const b = req.body ?? {}
        const spots = b.spots == null ? cur.spots : Math.round(Number(b.spots))
        const perUsd = b.perUsd == null || b.perUsd === '' ? cur.perUsd : Number(b.perUsd)
        if (!Number.isFinite(spots) || spots < 0 || spots > MAX_SPOTS_PER_COUNTRY) return res.status(400).json({ message: `Spots must be 0 to ${MAX_SPOTS_PER_COUNTRY}.` })
        if (!Number.isFinite(perUsd) || perUsd < 0 || perUsd > 1_000_000) return res.status(400).json({ message: 'The rate is local money per US dollar (0 to charge in US dollars).' })
        const planUsd: CountrySpotConfig['planUsd'] = { ...cur.planUsd }
        if (b.planUsd && typeof b.planUsd === 'object') {
            for (const pl of SPOT_PLANS) {
                const v = Number(b.planUsd[pl.id])
                if (b.planUsd[pl.id] === '' || b.planUsd[pl.id] == null) delete planUsd[pl.id]
                else if (Number.isFinite(v) && v > 0 && v < 10_000) planUsd[pl.id] = v
            }
        }
        let managers = cur.managerUserIds
        if (Array.isArray(b.managerUserIds)) {
            managers = Array.from(new Set<number>(b.managerUserIds.map(Number).filter((n: number) => Number.isInteger(n) && n > 0))).slice(0, 10)
            for (const id of managers) if (!(await storage.getUser(id))) return res.status(400).json({ message: `There is no account #${id}.` })
        }
        const next: CountrySpotConfig = {
            ...cur,
            enabled: typeof b.enabled === 'boolean' ? b.enabled : cur.enabled,
            spots,
            perUsd,
            planUsd,
            managerUserIds: managers,
            payee: b.payee
                ? {
                      methodLabel: str(b.payee.methodLabel, 80),
                      accountName: str(b.payee.accountName, 120),
                      accountNumber: str(b.payee.accountNumber, 120),
                      instructions: str(b.payee.instructions, 500),
                  }
                : cur.payee,
            updatedAt: nowIso(),
        }
        save(C_CONFIG, next)
        for (const id of managers.filter((m) => !cur.managerUserIds.includes(m))) {
            await tell(id, `You now manage spots in ${countryByCode(code)!.name}`, 'Open Promotions to confirm payments and look after the promoted listings.')
            for (const a of applications().filter((x) => x.userId === id && x.countryCode === code && x.status === 'open')) save(C_APPLICATIONS, { ...a, status: 'approved', updatedAt: nowIso() })
        }
        res.json({ country: adminView(next) })
    })

    app.post('/api/admin/country-spots/:code/token', requireStrictAdmin, (req: Request, res: Response) => {
        const code = String(req.params.code).toUpperCase()
        const cur = configFor(code)
        if (!cur) return res.status(404).json({ message: 'Unknown country.' })
        const token = randomBytes(24).toString('hex')
        save(C_CONFIG, { ...cur, tokenHash: tokenHashOf(token), updatedAt: nowIso() })
        res.json({ token, note: 'Copy it now. It is not shown again. The old token stops working.' })
    })

    app.post('/api/admin/country-spots/applications/:id/decline', requireStrictAdmin, (req: Request, res: Response) => {
        const a = applications().find((x) => x.id === Number(req.params.id))
        if (!a) return res.status(404).json({ message: 'Not found.' })
        save(C_APPLICATIONS, { ...a, status: 'declined', updatedAt: nowIso() })
        tell(a.userId, 'Country manager application', 'We are not able to take this application forward right now.').catch(() => {})
        res.json({ ok: true })
    })
}

/** Match one forwarded receipt to a single open request in this country. Returns what happened, in a word. */
export async function matchReceipt(cfg: CountrySpotConfig, rawText: string): Promise<'matched' | 'unmatched' | 'ignored' | 'duplicate'> {
    const text = rawText.replace(/\s+/g, ' ').trim()
    if (!looksLikeReceipt(text)) return 'ignored'
    const hash = createHash('sha256').update(squash(text)).digest('hex').slice(0, 32)
    if (purchases().some((p) => p.noticeHash === hash)) return 'duplicate'
    const open = purchases().filter((p) => p.countryCode === cfg.code && (p.status === 'awaiting_payment' || p.status === 'submitted') && referenceInText(text, p.reference))
    if (open.length !== 1) return 'unmatched'
    const p = open[0]
    if (!paidEnough(amountInCurrency(text, p.currency), p.amountLocal)) return 'unmatched'
    try {
        await activate(p.id, 'auto', hash)
        return 'matched'
    } catch (err) {
        console.error('[country-spots] could not confirm a matched receipt:', err)
        return 'unmatched'
    }
}

/** Start-up: bring the data back if the disk was wiped, then tidy expired rows every hour. */
export function startCountrySpotService(): void {
    restoreCountrySpotsFromDatabase()
        .then(() => sweep())
        .catch((err) => console.error('[country-spots] start-up failed:', err))
    setInterval(() => {
        try {
            sweep()
        } catch (err) {
            console.error('[country-spots] sweep failed:', err)
        }
    }, 3600_000).unref?.()
}
