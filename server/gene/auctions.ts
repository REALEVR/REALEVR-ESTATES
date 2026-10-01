/**
 * Live bank-sale auctions.
 *
 * The person listing a bank sale (an agent for their own property, or an administrator) states the price to
 * start from, the seller (the bank), the closing date and the bank's provisions of sale. Bidders are then
 * vetted before they may bid, and an approved bidder pays a non-refundable commitment fee for the auction
 * (US$1,000, see shared/auction-rules.ts). Bids appear live to everyone watching, as anonymous aliases.
 *
 *   apply (ID, address and proof of funds)  ->  an administrator reviews  ->  approved
 *   approved -> register for an auction -> acknowledge the fee is non-refundable -> pay -> an administrator confirms
 *   confirmed -> may bid while the auction is live
 *
 * Honest limits, written where they matter:
 *  - There is no live card/bank gateway for a US$ 1,000 payment in this app, so the fee is confirmed BY HAND by an
 *    administrator once the money is seen (the same approach as server/gene/payments-core.ts). Nothing here
 *    pretends a payment happened.
 *  - Identity documents are kept on the server's own disk in a private folder (never under any public path)
 *    and are served only to signed-in administrators. They survive only as long as that disk does: if the disk is
 *    wiped, the bidder is asked to upload again (the administrator sees which files are missing).
 *  - Everything else (auctions, bidders, entries, bids) is kept in the shared JSON store and mirrored to the
 *    database, and restored from it at start-up if the local copy is gone.
 *  - A bid is recorded in one synchronous step (no awaiting between checking and saving), so two bids cannot
 *    both be accepted for the same price.
 */
import type { Express, NextFunction, Request, Response } from 'express'
import fs from 'fs'
import path from 'path'
import multer from 'multer'
import { randomBytes } from 'crypto'
import { nextId, nowIso, readCollection, writeCollection } from './store'
import { notifyAdminsEverywhere } from './admin-notify'
import { requireStrictAdmin } from './admin-guard'
import { createNotification } from '../models/Notification'
import { storage } from '../storage'
import { DynamoDBUtils, TABLES } from '../dynamodb'
import { AUCTION_RULES, type BidderStatus, type FeeStatus } from '../../shared/auction-rules'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuctionPhase = 'scheduled' | 'live' | 'ended' | 'cancelled'

export interface Auction {
    id: number
    propertyId: number
    title: string
    sellerName: string
    provisions: string
    currency: string
    startingPrice: number
    minIncrement: number
    startsAt: string
    /** The closing time the lister stated. */
    endsAt: string
    /** Where the closing time stands now (moves out when a bid arrives in the last minutes). */
    currentEndsAt: string
    settlementDays: number
    createdBy: number
    createdAt: string
    updatedAt: string
    cancelledAt?: string
    cancelReason?: string
    finalizedAt?: string
    winningBidId?: number
}

export interface BidderDocument {
    id: string
    kind: 'idDocument' | 'proofOfAddress' | 'proofOfFunds' | 'other'
    file: string // file name inside the bidder's private folder
    original: string
    mime: string
    size: number
    uploadedAt: string
}

export interface BidderApplication {
    fullName: string
    dateOfBirth: string
    nationality: string
    address: string
    phone: string
    email: string
    idType: string
    idNumber: string
    sourceOfFunds: string
    isPep: boolean
    pepDetails?: string
    representing: 'self' | 'company'
    companyName?: string
    consent: boolean
}

export interface Bidder {
    id: number
    userId: number
    status: BidderStatus
    application: BidderApplication
    documents: BidderDocument[]
    submittedAt: string
    reviewedAt?: string
    reviewedBy?: number
    /** Why it was refused, or what more is needed. Shown to the bidder. */
    decisionNote?: string
    approvedUntil?: string
    updatedAt: string
}

export interface AuctionEntry {
    id: number
    auctionId: number
    bidderId: number
    userId: number
    alias: string
    feeStatus: FeeStatus
    feeAcknowledgedAt?: string
    feeMethod?: string
    feeReference?: string
    feeSubmittedAt?: string
    feeConfirmedAt?: string
    feeConfirmedBy?: number
    feeNote?: string
    createdAt: string
}

export interface Bid {
    id: number
    auctionId: number
    entryId: number
    userId: number
    alias: string
    amount: number
    at: string
}

const C_AUCTIONS = 'gene_auctions'
const C_BIDDERS = 'gene_auction_bidders'
const C_ENTRIES = 'gene_auction_entries'
const C_BIDS = 'gene_auction_bids'
const KINDS = [C_AUCTIONS, C_BIDDERS, C_ENTRIES, C_BIDS] as const

const KYC_ROOT = path.join(process.cwd(), 'data', 'gene', 'kyc')
const APPROVAL_MONTHS = 12
const MAX_AUCTION_DAYS = 120
const MIN_BID_GAP_MS = 800

// ---------------------------------------------------------------------------
// Persistence: local JSON first, mirrored to the database, restored at start-up
// ---------------------------------------------------------------------------

const dbId = (kind: string, id: number) => `auction:${kind}:${id}`

function save<T extends { id: number }>(kind: (typeof KINDS)[number], row: T): void {
    const rows = readCollection<T>(kind)
    const i = rows.findIndex((r) => r.id === row.id)
    if (i >= 0) rows[i] = row
    else rows.push(row)
    writeCollection(kind, rows)
    DynamoDBUtils.putItem(TABLES.SETTINGS, { ...(row as unknown as Record<string, unknown>), id: dbId(kind, row.id), kind, rowId: row.id }).catch((err: unknown) =>
        console.error(`[auctions] could not mirror ${kind} #${row.id} to the database (kept locally):`, err)
    )
}

/** If the local files are gone (a redeploy on a fresh disk), bring the auctions back from the database. */
export async function restoreAuctionsFromDatabase(): Promise<void> {
    try {
        const items = (await DynamoDBUtils.scanTable(TABLES.SETTINGS, 'begins_with(#id, :p)', { ':p': 'auction:' }, { '#id': 'id' })) as unknown as Array<Record<string, any>>
        for (const kind of KINDS) {
            const have = readCollection<{ id: number }>(kind)
            const byId = new Map(have.map((r) => [r.id, r as Record<string, any>]))
            let changed = false
            for (const item of items.filter((x) => x.kind === kind)) {
                const { id: _dbKey, kind: _k, rowId, ...row } = item
                const current = byId.get(rowId)
                if (!current || String(current.updatedAt ?? current.at ?? '') < String(row.updatedAt ?? row.at ?? '')) {
                    byId.set(rowId, { ...row, id: rowId })
                    changed = true
                }
            }
            if (changed) writeCollection(kind, Array.from(byId.values()))
        }
    } catch (err) {
        console.warn('[auctions] could not restore from the database (using the local copy):', err)
    }
}

// ---------------------------------------------------------------------------
// Pure rules (unit-tested)
// ---------------------------------------------------------------------------

export function auctionPhase(a: Pick<Auction, 'startsAt' | 'currentEndsAt' | 'cancelledAt'>, nowMs = Date.now()): AuctionPhase {
    if (a.cancelledAt) return 'cancelled'
    if (nowMs < Date.parse(a.startsAt)) return 'scheduled'
    if (nowMs >= Date.parse(a.currentEndsAt)) return 'ended'
    return 'live'
}

export function highestBid(bids: Bid[]): Bid | null {
    let top: Bid | null = null
    for (const b of bids) if (!top || b.amount > top.amount || (b.amount === top.amount && b.id < top.id)) top = b
    return top
}

export function minNextBid(a: Pick<Auction, 'startingPrice' | 'minIncrement'>, bids: Bid[]): number {
    const top = highestBid(bids)
    return top ? top.amount + a.minIncrement : a.startingPrice
}

/** A sensible default step: about 1% of the starting price, rounded to a tidy number. */
export function defaultIncrement(startingPrice: number): number {
    const raw = Math.max(1, Math.round(startingPrice * AUCTION_RULES.defaultIncrementShare))
    if (raw < 100) return raw
    const magnitude = Math.pow(10, Math.floor(Math.log10(raw)) - 1)
    return Math.max(1, Math.round(raw / magnitude) * magnitude)
}

export function makeAlias(auctionId: number, entryId: number, taken: Set<string>): string {
    let n = (auctionId * 7919 + entryId * 104729) >>> 0
    for (let i = 0; i < 200; i++) {
        const alias = `Bidder ${(n % 46656).toString(36).toUpperCase().padStart(3, '0')}`
        if (!taken.has(alias)) return alias
        n = (n * 1103515245 + 12345) >>> 0
    }
    return `Bidder ${entryId}`
}

/** If a valid bid lands inside the soft-close window, the closing time moves out to the window after it. */
export function extendedEnd(a: Pick<Auction, 'currentEndsAt'>, bidAtMs: number): string {
    const window = AUCTION_RULES.softCloseMinutes * 60_000
    if (window <= 0) return a.currentEndsAt
    const end = Date.parse(a.currentEndsAt)
    return end - bidAtMs <= window ? new Date(bidAtMs + window).toISOString() : a.currentEndsAt
}

export interface BidCheck {
    ok: boolean
    status?: number
    message?: string
}

export function checkBid(input: {
    auction: Auction
    bids: Bid[]
    bidder: Bidder | undefined
    entry: AuctionEntry | undefined
    userId: number
    sellerUserIds: number[]
    amount: unknown
    nowMs: number
}): BidCheck {
    const { auction, bids, bidder, entry, userId, sellerUserIds, amount, nowMs } = input
    const phase = auctionPhase(auction, nowMs)
    if (phase === 'cancelled') return { ok: false, status: 409, message: 'This auction has been cancelled.' }
    if (phase === 'scheduled') return { ok: false, status: 409, message: 'This auction has not opened yet.' }
    if (phase === 'ended') return { ok: false, status: 409, message: 'This auction has closed.' }
    if (sellerUserIds.includes(userId)) return { ok: false, status: 403, message: 'You listed this property, so you cannot bid on it.' }
    if (!bidder || bidder.status !== 'approved' || (bidder.approvedUntil && Date.parse(bidder.approvedUntil) < nowMs)) {
        return { ok: false, status: 403, message: 'You must be approved as a bidder before you can bid.' }
    }
    if (!entry) return { ok: false, status: 403, message: 'Register for this auction first.' }
    if (entry.feeStatus !== 'confirmed') return { ok: false, status: 403, message: 'Your commitment fee has not been confirmed yet.' }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
        return { ok: false, status: 400, message: 'Enter the amount as a whole number.' }
    }
    const top = highestBid(bids)
    if (top && top.entryId === entry.id) return { ok: false, status: 409, message: 'You already have the highest bid.' }
    const min = minNextBid(auction, bids)
    if (amount < min) return { ok: false, status: 409, message: `Your bid must be at least ${auction.currency} ${min.toLocaleString()}.` }
    const ceiling = Math.max(top?.amount ?? 0, auction.startingPrice) * 10
    if (amount > ceiling) return { ok: false, status: 400, message: 'That amount is more than ten times the current price. Please check it.' }
    return { ok: true }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const rowsOf = {
    auctions: () => readCollection<Auction>(C_AUCTIONS),
    bidders: () => readCollection<Bidder>(C_BIDDERS),
    entries: () => readCollection<AuctionEntry>(C_ENTRIES),
    bids: () => readCollection<Bid>(C_BIDS),
}

const asUserId = (req: Request): number | null => {
    const u = req.user as { id?: number } | undefined
    return req.isAuthenticated?.() && u && typeof u.id === 'number' ? u.id : null
}
const roleOf = (req: Request): string => ((req.user as { role?: string } | undefined)?.role ?? '') as string

async function tell(userId: number, title: string, message: string, link?: string) {
    try {
        await createNotification({ userId: String(userId), title, message, type: 'system', link })
    } catch (err) {
        console.error('[auctions] could not notify user', userId, err)
    }
}

const money = (currency: string, n: number) => `${currency} ${n.toLocaleString()}`

function feeInstructions(entry: AuctionEntry): { reference: string; payTo: string } {
    return {
        reference: `AUC-${entry.auctionId}-${entry.id}`,
        payTo:
            (process.env.AUCTION_FEE_PAY_TO || '').trim() ||
            'Message RealEVR on WhatsApp (+256 771 891 323) from inside your account to receive the payment details. Never pay into any other account.',
    }
}

function publicBids(bids: Bid[], limit = 50) {
    return bids
        .slice()
        .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : b.id - a.id))
        .slice(0, limit)
        .map((b) => ({ id: b.id, alias: b.alias, amount: b.amount, at: b.at }))
}

function buildView(a: Auction, userId: number | null, nowMs = Date.now()) {
    const bids = rowsOf.bids().filter((b) => b.auctionId === a.id)
    const top = highestBid(bids)
    const phase = auctionPhase(a, nowMs)
    const view: Record<string, unknown> = {
        id: a.id,
        propertyId: a.propertyId,
        title: a.title,
        sellerName: a.sellerName,
        provisions: a.provisions,
        currency: a.currency,
        startingPrice: a.startingPrice,
        minIncrement: a.minIncrement,
        startsAt: a.startsAt,
        endsAt: a.endsAt,
        currentEndsAt: a.currentEndsAt,
        extended: a.currentEndsAt !== a.endsAt,
        settlementDays: a.settlementDays,
        phase,
        currentBid: top?.amount ?? null,
        bidCount: bids.length,
        bidderCount: new Set(bids.map((b) => b.entryId)).size,
        minNextBid: minNextBid(a, bids),
        bids: publicBids(bids),
        serverTime: new Date(nowMs).toISOString(),
        commitmentFeeUsd: AUCTION_RULES.commitmentFeeUsd,
        softCloseMinutes: AUCTION_RULES.softCloseMinutes,
        ...(phase === 'ended' || phase === 'cancelled' ? { winningBid: a.winningBidId ? publicBids(bids.filter((b) => b.id === a.winningBidId))[0] ?? null : null } : {}),
    }
    if (userId !== null) {
        const bidder = rowsOf.bidders().find((b) => b.userId === userId)
        const entry = bidder ? rowsOf.entries().find((e) => e.auctionId === a.id && e.bidderId === bidder.id) : undefined
        view.me = {
            bidderStatus: bidder?.status ?? 'none',
            decisionNote: bidder && (bidder.status === 'rejected' || bidder.status === 'applied' || bidder.status === 'suspended') ? bidder.decisionNote ?? null : null,
            approvedUntil: bidder?.approvedUntil ?? null,
            entry: entry
                ? { id: entry.id, alias: entry.alias, feeStatus: entry.feeStatus, feeNote: entry.feeNote ?? null, ...feeInstructions(entry) }
                : null,
            isHighestBidder: !!entry && !!top && top.entryId === entry.id,
            canBid: phase === 'live' && bidder?.status === 'approved' && entry?.feeStatus === 'confirmed',
        }
    }
    return view
}

// ---------------------------------------------------------------------------
// Ending an auction
// ---------------------------------------------------------------------------

export async function finalizeDueAuctions(nowMs = Date.now()): Promise<number> {
    let done = 0
    for (const a of rowsOf.auctions()) {
        if (a.finalizedAt || a.cancelledAt || nowMs < Date.parse(a.currentEndsAt)) continue
        const bids = rowsOf.bids().filter((b) => b.auctionId === a.id)
        const top = highestBid(bids)
        a.finalizedAt = new Date(nowMs).toISOString()
        a.winningBidId = top?.id
        a.updatedAt = a.finalizedAt
        save(C_AUCTIONS, a)
        done++
        try {
            await storage.updateProperty(a.propertyId, { auctionStatus: 'ended', ...(top ? { currentBid: top.amount } : {}) } as any)
        } catch (err) {
            console.error('[auctions] could not mark the property as ended:', err)
        }
        const winnerEntry = top ? rowsOf.entries().find((e) => e.id === top.entryId) : undefined
        const summary = top
            ? `${a.title}: the auction closed at ${money(a.currency, top.amount)} after ${bids.length} bid${bids.length === 1 ? '' : 's'}. Winner: ${top.alias}.`
            : `${a.title}: the auction closed with no bids.`
        notifyAdminsEverywhere({
            title: top ? 'Auction closed with a winner' : 'Auction closed with no bids',
            message: summary,
            whatsappMessage: `🔨 ${summary}`,
            link: '/admin/auctions',
        }).catch(() => {})
        if (winnerEntry) {
            await tell(winnerEntry.userId, 'You won the auction', `You won "${a.title}" with ${money(a.currency, top!.amount)}. The seller's provisions apply: complete within ${a.settlementDays} days. We will contact you.`, `/property/${a.propertyId}`)
        }
        const losers = new Set(bids.map((b) => b.userId))
        if (winnerEntry) losers.delete(winnerEntry.userId)
        for (const uid of Array.from(losers)) await tell(uid, 'Auction closed', `"${a.title}" has closed. Your bid was not the highest.`, `/property/${a.propertyId}`)
        try {
            const property = await storage.getProperty(a.propertyId)
            const owner = (property as any)?.ownerId
            if (typeof owner === 'number') await tell(owner, 'Your auction has closed', summary, '/admin/auctions')
        } catch {
            /* the seller notice is a courtesy */
        }
    }
    return done
}

// ---------------------------------------------------------------------------
// Uploads (identity documents): private folder, images and PDF only
// ---------------------------------------------------------------------------

const EXT_BY_MIME: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' }

const kycUpload = multer({
    storage: multer.diskStorage({
        destination: (req, _file, cb) => {
            const dir = path.join(KYC_ROOT, String(asUserId(req as Request) ?? 'anon'))
            fs.mkdirSync(dir, { recursive: true })
            cb(null, dir)
        },
        filename: (_req, file, cb) => cb(null, `${Date.now()}-${randomBytes(6).toString('hex')}${EXT_BY_MIME[file.mimetype] ?? '.bin'}`),
    }),
    limits: { fileSize: 8 * 1024 * 1024, files: 6 },
    fileFilter: (_req, file, cb) => cb(null, file.mimetype in EXT_BY_MIME),
}).fields([
    { name: 'idDocument', maxCount: 1 },
    { name: 'proofOfAddress', maxCount: 1 },
    { name: 'proofOfFunds', maxCount: 2 },
    { name: 'other', maxCount: 2 },
])

const ID_TYPES = ['national_id', 'passport', 'driving_permit']
const FUND_SOURCES = ['savings', 'sale_of_property', 'business_income', 'employment_income', 'loan_or_mortgage', 'gift_or_inheritance', 'other']

export function validateApplication(body: Record<string, any>, nowMs = Date.now()): { ok: true; value: BidderApplication } | { ok: false; message: string } {
    const s = (v: unknown, min: number, max: number) => (typeof v === 'string' && v.trim().length >= min && v.trim().length <= max ? v.trim() : null)
    const fullName = s(body.fullName, 3, 120)
    const nationality = s(body.nationality, 2, 60)
    const address = s(body.address, 8, 300)
    const idNumber = s(body.idNumber, 4, 40)
    const email = s(body.email, 5, 160)
    const phone = typeof body.phone === 'string' ? body.phone.replace(/[^\d+]/g, '') : ''
    const dob = typeof body.dateOfBirth === 'string' ? Date.parse(body.dateOfBirth) : NaN
    if (!fullName) return { ok: false, message: 'Enter your full legal name.' }
    if (!Number.isFinite(dob) || dob > nowMs - 18 * 365.25 * 864e5 || dob < nowMs - 110 * 365.25 * 864e5) return { ok: false, message: 'You must be at least 18. Check your date of birth.' }
    if (!nationality) return { ok: false, message: 'Enter your nationality.' }
    if (!address) return { ok: false, message: 'Enter your full residential address.' }
    if (phone.replace(/\D/g, '').length < 7) return { ok: false, message: 'Enter a phone number we can reach you on (WhatsApp).' }
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, message: 'Enter a valid email address.' }
    if (!ID_TYPES.includes(body.idType)) return { ok: false, message: 'Choose the type of ID you are uploading.' }
    if (!idNumber) return { ok: false, message: 'Enter your ID number.' }
    if (!FUND_SOURCES.includes(body.sourceOfFunds)) return { ok: false, message: 'Tell us where the money will come from.' }
    const isPep = body.isPep === true || body.isPep === 'true'
    const pepDetails = s(body.pepDetails, 3, 300) ?? undefined
    if (isPep && !pepDetails) return { ok: false, message: 'Describe the public position you or your close family hold or have held.' }
    const representing = body.representing === 'company' ? 'company' : 'self'
    const companyName = s(body.companyName, 2, 160) ?? undefined
    if (representing === 'company' && !companyName) return { ok: false, message: 'Enter the company you are bidding for.' }
    if (!(body.consent === true || body.consent === 'true')) return { ok: false, message: 'You must agree to the verification and the privacy terms.' }
    return { ok: true, value: { fullName, dateOfBirth: new Date(dob).toISOString().slice(0, 10), nationality, address, phone, email, idType: body.idType, idNumber, sourceOfFunds: body.sourceOfFunds, isPep, pepDetails, representing, companyName, consent: true } }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const lastBidAt = new Map<number, number>()

export function registerAuctionRoutes(app: Express): void {
    const needUser = (req: Request, res: Response, next: NextFunction) => {
        if (asUserId(req) === null) return res.status(401).json({ message: 'Sign in first.' })
        next()
    }

    // ---- Anyone watching ----------------------------------------------------------------------------
    app.get('/api/auctions', async (_req: Request, res: Response) => {
        await finalizeDueAuctions().catch(() => {})
        const now = Date.now()
        const list = rowsOf.auctions()
            .filter((a) => !a.cancelledAt)
            .map((a) => buildView(a, null, now))
            .map(({ bids: _b, provisions: _p, ...rest }) => rest)
        res.set('Cache-Control', 'no-store').json(list)
    })

    const viewHandler = async (req: Request, res: Response) => {
        await finalizeDueAuctions().catch(() => {})
        const byProperty = req.params.propertyId !== undefined
        const key = Number(byProperty ? req.params.propertyId : req.params.id)
        const all = rowsOf.auctions()
        // For a property: the live/upcoming auction, else the latest one.
        const a = byProperty
            ? all.filter((x) => x.propertyId === key && !x.cancelledAt).sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1))[0]
            : all.find((x) => x.id === key)
        if (!a) return res.status(404).json({ message: 'No auction here.' })
        res.set('Cache-Control', 'no-store').json(buildView(a, asUserId(req)))
    }
    app.get('/api/auctions/by-property/:propertyId', viewHandler)
    app.get('/api/auctions/:id', viewHandler)

    // ---- A bidder's own application ----------------------------------------------------------------
    app.get('/api/auction-bidder/me', needUser, (req: Request, res: Response) => {
        const b = rowsOf.bidders().find((x) => x.userId === asUserId(req))
        if (!b) return res.json({ status: 'none' })
        res.set('Cache-Control', 'no-store').json({
            status: b.status,
            decisionNote: b.decisionNote ?? null,
            approvedUntil: b.approvedUntil ?? null,
            submittedAt: b.submittedAt,
            application: b.application,
            documents: b.documents.map((d) => ({ id: d.id, kind: d.kind, original: d.original, uploadedAt: d.uploadedAt })),
        })
    })

    app.post('/api/auction-bidder/apply', needUser, (req: Request, res: Response) => {
        kycUpload(req, res, async (err: unknown) => {
            const userId = asUserId(req)!
            const files = (req.files ?? {}) as Record<string, Express.Multer.File[]>
            const cleanup = () => Object.values(files).flat().forEach((f) => fs.rm(f.path, { force: true }, () => {}))
            if (err) {
                cleanup()
                return res.status(400).json({ message: (err as { code?: string }).code === 'LIMIT_FILE_SIZE' ? 'Each file must be 8 MB or smaller.' : 'We could not read the files. Use JPG, PNG, WEBP or PDF files of 8 MB or less.' })
            }
            const existing = rowsOf.bidders().find((x) => x.userId === userId)
            if (existing && !['applied', 'rejected'].includes(existing.status)) {
                cleanup()
                return res.status(409).json({ message: existing.status === 'approved' ? 'You are already approved.' : existing.status === 'under_review' ? 'Your application is being reviewed.' : 'Your account is suspended. Contact us.' })
            }
            const parsed = validateApplication(req.body ?? {})
            if (!parsed.ok) {
                cleanup()
                return res.status(400).json({ message: parsed.message })
            }
            // Documents: new uploads replace the same kind; earlier ones are kept for kinds not re-sent.
            const documents = (existing?.documents ?? []).slice()
            const stamp = nowIso()
            for (const [field, list] of Object.entries(files)) {
                for (const f of list) {
                    if (field !== 'other' && field !== 'proofOfFunds') {
                        for (const old of documents.filter((d) => d.kind === field)) fs.rm(path.join(KYC_ROOT, String(userId), old.file), { force: true }, () => {})
                        for (let i = documents.length - 1; i >= 0; i--) if (documents[i].kind === field) documents.splice(i, 1)
                    }
                    documents.push({ id: randomBytes(5).toString('hex'), kind: field as BidderDocument['kind'], file: f.filename, original: path.basename(f.originalname).slice(0, 120), mime: f.mimetype, size: f.size, uploadedAt: stamp })
                }
            }
            const missing = (['idDocument', 'proofOfAddress', 'proofOfFunds'] as const).filter((k) => !documents.some((d) => d.kind === k))
            if (missing.length) {
                cleanup()
                return res.status(400).json({ message: 'Upload your ID, your proof of address and your proof of funds.' })
            }
            const rows = rowsOf.bidders()
            const bidder: Bidder = {
                id: existing?.id ?? nextId(rows),
                userId,
                status: 'under_review',
                application: parsed.value,
                documents,
                submittedAt: stamp,
                updatedAt: stamp,
            }
            save(C_BIDDERS, bidder)
            notifyAdminsEverywhere({
                title: 'New bidder application',
                message: `${parsed.value.fullName} (${parsed.value.email}) applied to bid in bank-sale auctions and is waiting for vetting.`,
                whatsappMessage: `🛡️ New bidder application\n${parsed.value.fullName} — ${parsed.value.email}\nReview it in Admin > Auctions.`,
                link: '/admin/auctions',
            }).catch(() => {})
            res.json({ status: bidder.status })
        })
    })

    // ---- Registering for one auction and paying the commitment fee ---------------------------------
    app.post('/api/auctions/:id/register', needUser, (req: Request, res: Response) => {
        const a = rowsOf.auctions().find((x) => x.id === Number(req.params.id))
        if (!a) return res.status(404).json({ message: 'No such auction.' })
        const phase = auctionPhase(a)
        if (phase === 'ended' || phase === 'cancelled') return res.status(409).json({ message: 'This auction is closed.' })
        const userId = asUserId(req)!
        const bidder = rowsOf.bidders().find((x) => x.userId === userId)
        if (!bidder || bidder.status !== 'approved') return res.status(403).json({ message: 'You must be an approved bidder first.' })
        const entries = rowsOf.entries()
        let entry = entries.find((e) => e.auctionId === a.id && e.bidderId === bidder.id)
        if (!entry) {
            entry = {
                id: nextId(entries),
                auctionId: a.id,
                bidderId: bidder.id,
                userId,
                alias: makeAlias(a.id, nextId(entries), new Set(entries.filter((e) => e.auctionId === a.id).map((e) => e.alias))),
                feeStatus: 'unpaid',
                createdAt: nowIso(),
            }
            save(C_ENTRIES, entry)
        }
        res.json(buildView(a, userId))
    })

    app.post('/api/auctions/:id/fee', needUser, (req: Request, res: Response) => {
        const a = rowsOf.auctions().find((x) => x.id === Number(req.params.id))
        const userId = asUserId(req)!
        const bidder = rowsOf.bidders().find((x) => x.userId === userId)
        const entry = a && bidder ? rowsOf.entries().find((e) => e.auctionId === a.id && e.bidderId === bidder.id) : undefined
        if (!a || !entry || !bidder) return res.status(404).json({ message: 'Register for this auction first.' })
        if (bidder.status !== 'approved') return res.status(403).json({ message: 'You must be an approved bidder.' })
        if (entry.feeStatus === 'confirmed') return res.status(409).json({ message: 'Your fee is already confirmed.' })
        const { acknowledged, reference, method } = req.body ?? {}
        if (acknowledged !== true) return res.status(400).json({ message: `Confirm that you understand the US$${AUCTION_RULES.commitmentFeeUsd.toLocaleString()} commitment fee is non-refundable.` })
        const ref = typeof reference === 'string' ? reference.trim().slice(0, 80) : ''
        if (ref.length < 4) return res.status(400).json({ message: 'Enter the payment reference or transaction number you received.' })
        entry.feeAcknowledgedAt = nowIso()
        entry.feeMethod = typeof method === 'string' ? method.trim().slice(0, 40) : undefined
        entry.feeReference = ref
        entry.feeSubmittedAt = nowIso()
        entry.feeStatus = 'submitted'
        entry.feeNote = undefined
        save(C_ENTRIES, entry)
        notifyAdminsEverywhere({
            title: 'Commitment fee awaiting confirmation',
            message: `${bidder.application.fullName} says they paid the US$${AUCTION_RULES.commitmentFeeUsd.toLocaleString()} commitment fee for "${a.title}" (reference ${ref}). Check the payment arrived, then confirm it.`,
            whatsappMessage: `💳 Commitment fee to confirm\n${bidder.application.fullName}\nAuction: ${a.title}\nRef: ${ref}\nConfirm in Admin > Auctions once the money is seen.`,
            link: '/admin/auctions',
        }).catch(() => {})
        res.json(buildView(a, userId))
    })

    // ---- Bidding -----------------------------------------------------------------------------------
    app.post('/api/auctions/:id/bids', needUser, async (req: Request, res: Response) => {
        const userId = asUserId(req)!
        const now = Date.now()
        if (now - (lastBidAt.get(userId) ?? 0) < MIN_BID_GAP_MS) return res.status(429).json({ message: 'Slow down a moment.' })
        lastBidAt.set(userId, now)
        // Everything that decides the bid is read, checked and written with no await in between.
        const a = rowsOf.auctions().find((x) => x.id === Number(req.params.id))
        if (!a) return res.status(404).json({ message: 'No such auction.' })
        let sellerIds: number[] = [a.createdBy]
        const property = await storage.getProperty(a.propertyId).catch(() => undefined)
        if (typeof (property as any)?.ownerId === 'number') sellerIds.push((property as any).ownerId)
        const t = Date.now()
        const fresh = rowsOf.auctions().find((x) => x.id === a.id)!
        const bids = rowsOf.bids().filter((b) => b.auctionId === fresh.id)
        const bidder = rowsOf.bidders().find((b) => b.userId === userId)
        const entry = bidder ? rowsOf.entries().find((e) => e.auctionId === fresh.id && e.bidderId === bidder.id) : undefined
        const amount = typeof req.body?.amount === 'string' && /^\d+$/.test(req.body.amount) ? Number(req.body.amount) : req.body?.amount
        const verdict = checkBid({ auction: fresh, bids, bidder, entry, userId, sellerUserIds: sellerIds, amount, nowMs: t })
        if (!verdict.ok) return res.status(verdict.status ?? 400).json({ message: verdict.message })
        const previousTop = highestBid(bids)
        const allBids = rowsOf.bids()
        const bid: Bid = { id: nextId(allBids), auctionId: fresh.id, entryId: entry!.id, userId, alias: entry!.alias, amount: amount as number, at: new Date(t).toISOString() }
        save(C_BIDS, bid)
        const newEnd = extendedEnd(fresh, t)
        if (newEnd !== fresh.currentEndsAt) {
            fresh.currentEndsAt = newEnd
            fresh.updatedAt = bid.at
            save(C_AUCTIONS, fresh)
        }
        storage.updateProperty(fresh.propertyId, { currentBid: bid.amount } as any).catch(() => {})
        if (previousTop && previousTop.userId !== userId) {
            void tell(previousTop.userId, 'You have been outbid', `Someone bid ${money(fresh.currency, bid.amount)} on "${fresh.title}". Bid again to stay in.`, `/property/${fresh.propertyId}`)
        }
        res.json({ accepted: true, bid: { id: bid.id, alias: bid.alias, amount: bid.amount, at: bid.at }, auction: buildView(fresh, userId, t) })
    })

    // ---- Creating and managing an auction: the lister (an agent for their own property) or an administrator
    const canManage = async (req: Request, propertyId: number): Promise<boolean> => {
        const role = roleOf(req)
        if (role === 'admin') return true
        if (role !== 'agent') return false
        const p = await storage.getProperty(propertyId).catch(() => undefined)
        return !!p && (p as any).ownerId === asUserId(req)
    }

    app.post('/api/auctions', needUser, async (req: Request, res: Response) => {
        const b = req.body ?? {}
        const propertyId = Number(b.propertyId)
        const property = Number.isInteger(propertyId) ? await storage.getProperty(propertyId).catch(() => undefined) : undefined
        if (!property) return res.status(404).json({ message: 'Choose a property.' })
        if (!(await canManage(req, propertyId))) return res.status(403).json({ message: 'Only the lister or an administrator can run an auction for this property.' })
        if ((property as any).category !== 'bank_sales') return res.status(400).json({ message: 'Auctions are for bank-sale listings.' })
        if (rowsOf.auctions().some((x) => x.propertyId === propertyId && !x.cancelledAt && !x.finalizedAt)) return res.status(409).json({ message: 'This property already has an auction running or scheduled.' })
        const starting = typeof b.startingPrice === 'number' ? b.startingPrice : Number(b.startingPrice)
        if (!Number.isInteger(starting) || starting <= 0) return res.status(400).json({ message: 'Enter the starting price as a whole number.' })
        const now = Date.now()
        const endsAt = Date.parse(b.endsAt)
        const startsAt = b.startsAt ? Date.parse(b.startsAt) : now
        if (!Number.isFinite(endsAt) || endsAt <= now + 60_000) return res.status(400).json({ message: 'The closing date and time must be in the future.' })
        if (endsAt > now + MAX_AUCTION_DAYS * 864e5) return res.status(400).json({ message: `An auction can run for at most ${MAX_AUCTION_DAYS} days.` })
        if (!Number.isFinite(startsAt) || startsAt >= endsAt) return res.status(400).json({ message: 'The opening time must be before the closing time.' })
        const sellerName = typeof b.sellerName === 'string' ? b.sellerName.trim() : (property as any).bankName ?? ''
        if (sellerName.length < 2) return res.status(400).json({ message: 'Enter the name of the bank or seller.' })
        const provisions = typeof b.provisions === 'string' ? b.provisions.trim() : ''
        if (provisions.length < 20 || provisions.length > 6000) return res.status(400).json({ message: "Enter the seller's provisions of sale (at least a few lines: payment, timing, taxes, title, viewing)." })
        const step = b.minIncrement === undefined || b.minIncrement === '' ? defaultIncrement(starting) : Number(b.minIncrement)
        if (!Number.isInteger(step) || step <= 0) return res.status(400).json({ message: 'The minimum step must be a whole number.' })
        const settle = b.settlementDays === undefined || b.settlementDays === '' ? AUCTION_RULES.defaultSettlementDays : Number(b.settlementDays)
        if (!Number.isInteger(settle) || settle < 1 || settle > 120) return res.status(400).json({ message: 'Settlement days must be between 1 and 120.' })
        const all = rowsOf.auctions()
        const stamp = nowIso()
        const auction: Auction = {
            id: nextId(all),
            propertyId,
            title: (property as any).title || `Property ${propertyId}`,
            sellerName,
            provisions,
            currency: (typeof b.currency === 'string' && b.currency.trim()) || (property as any).currency || 'UGX',
            startingPrice: starting,
            minIncrement: step,
            startsAt: new Date(startsAt).toISOString(),
            endsAt: new Date(endsAt).toISOString(),
            currentEndsAt: new Date(endsAt).toISOString(),
            settlementDays: settle,
            createdBy: asUserId(req)!,
            createdAt: stamp,
            updatedAt: stamp,
        }
        save(C_AUCTIONS, auction)
        storage.updateProperty(propertyId, { bankName: sellerName, startingBid: starting, bidIncrement: step, auctionStart: auction.startsAt, auctionEnd: auction.endsAt, auctionDate: auction.endsAt, auctionStatus: 'live' } as any).catch((e: unknown) => console.error('[auctions] could not copy the auction onto the property:', e))
        notifyAdminsEverywhere({
            title: 'Auction scheduled',
            message: `${auction.title}: starts at ${money(auction.currency, starting)}, closes ${auction.endsAt}. Seller: ${sellerName}.`,
            link: '/admin/auctions',
        }).catch(() => {})
        res.status(201).json(buildView(auction, asUserId(req)))
    })

    app.post('/api/auctions/:id/cancel', needUser, async (req: Request, res: Response) => {
        const a = rowsOf.auctions().find((x) => x.id === Number(req.params.id))
        if (!a) return res.status(404).json({ message: 'No such auction.' })
        if (!(await canManage(req, a.propertyId))) return res.status(403).json({ message: 'Not allowed.' })
        if (a.cancelledAt || a.finalizedAt) return res.status(409).json({ message: 'This auction is already over.' })
        if (rowsOf.bids().some((b) => b.auctionId === a.id)) return res.status(409).json({ message: 'Bids have been placed. Contact RealEVR to cancel.' })
        a.cancelledAt = nowIso()
        a.cancelReason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 300) : undefined
        a.updatedAt = a.cancelledAt
        save(C_AUCTIONS, a)
        storage.updateProperty(a.propertyId, { auctionStatus: 'cancelled' } as any).catch(() => {})
        res.json({ cancelled: true })
    })

    // ---- Administrators: vetting, fees, overview -----------------------------------------------------
    app.get('/api/admin/auctions', requireStrictAdmin, async (_req: Request, res: Response) => {
        await finalizeDueAuctions().catch(() => {})
        const now = Date.now()
        const entries = rowsOf.entries()
        const bidders = rowsOf.bidders()
        res.set('Cache-Control', 'no-store').json({
            auctions: rowsOf.auctions().map((a) => ({ ...buildView(a, null, now), entries: entries.filter((e) => e.auctionId === a.id).length, cancelledAt: a.cancelledAt ?? null })),
            pendingBidders: bidders.filter((b) => b.status === 'under_review').length,
            pendingFees: entries.filter((e) => e.feeStatus === 'submitted').length,
        })
    })

    app.get('/api/admin/auction-bidders', requireStrictAdmin, (req: Request, res: Response) => {
        const status = typeof req.query.status === 'string' ? req.query.status : ''
        const list = rowsOf.bidders()
            .filter((b) => !status || b.status === status)
            .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))
            .map((b) => ({
                id: b.id,
                userId: b.userId,
                status: b.status,
                submittedAt: b.submittedAt,
                reviewedAt: b.reviewedAt ?? null,
                decisionNote: b.decisionNote ?? null,
                approvedUntil: b.approvedUntil ?? null,
                application: b.application,
                documents: b.documents.map((d) => ({ id: d.id, kind: d.kind, original: d.original, size: d.size, present: fs.existsSync(path.join(KYC_ROOT, String(b.userId), d.file)) })),
            }))
        res.set('Cache-Control', 'no-store').json(list)
    })

    app.get('/api/admin/auction-bidders/:id/documents/:docId', requireStrictAdmin, (req: Request, res: Response) => {
        const b = rowsOf.bidders().find((x) => x.id === Number(req.params.id))
        const d = b?.documents.find((x) => x.id === req.params.docId)
        if (!b || !d) return res.status(404).json({ message: 'No such document.' })
        const file = path.join(KYC_ROOT, String(b.userId), path.basename(d.file))
        if (!file.startsWith(KYC_ROOT) || !fs.existsSync(file)) return res.status(410).json({ message: 'This file is no longer on the server. Ask the bidder to upload it again.' })
        res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Type': d.mime, 'Content-Disposition': `inline; filename="${d.kind}${EXT_BY_MIME[d.mime] ?? ''}"` })
        fs.createReadStream(file).pipe(res)
    })

    app.post('/api/admin/auction-bidders/:id/decision', requireStrictAdmin, async (req: Request, res: Response) => {
        const b = rowsOf.bidders().find((x) => x.id === Number(req.params.id))
        if (!b) return res.status(404).json({ message: 'No such bidder.' })
        const decision = req.body?.decision
        const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) : ''
        const stamp = nowIso()
        if (decision === 'approve') {
            b.status = 'approved'
            b.approvedUntil = new Date(Date.now() + APPROVAL_MONTHS * 30.4 * 864e5).toISOString()
            b.decisionNote = undefined
        } else if (decision === 'reject') {
            if (note.length < 5) return res.status(400).json({ message: 'Give a short reason.' })
            b.status = 'rejected'
            b.decisionNote = note
            b.approvedUntil = undefined
        } else if (decision === 'request_more') {
            if (note.length < 5) return res.status(400).json({ message: 'Say what more you need.' })
            b.status = 'applied'
            b.decisionNote = note
        } else if (decision === 'suspend') {
            b.status = 'suspended'
            b.decisionNote = note || undefined
        } else {
            return res.status(400).json({ message: 'Decision must be approve, reject, request_more or suspend.' })
        }
        b.reviewedAt = stamp
        b.reviewedBy = asUserId(req)!
        b.updatedAt = stamp
        save(C_BIDDERS, b)
        const text =
            decision === 'approve'
                ? `You are approved to bid. Next, open an auction, register for it and pay the US$${AUCTION_RULES.commitmentFeeUsd.toLocaleString()} commitment fee.`
                : decision === 'request_more'
                  ? `We need a little more to finish vetting you: ${note}`
                  : decision === 'reject'
                    ? `We could not approve your bidder application. ${note}`
                    : 'Your bidder account has been suspended. Contact us.'
        await tell(b.userId, decision === 'approve' ? 'You are approved to bid' : 'About your bidder application', text, '/bank-sales')
        res.json({ status: b.status })
    })

    app.get('/api/admin/auction-entries', requireStrictAdmin, (req: Request, res: Response) => {
        const status = typeof req.query.feeStatus === 'string' ? req.query.feeStatus : ''
        const bidders = new Map(rowsOf.bidders().map((b) => [b.id, b]))
        const auctions = new Map(rowsOf.auctions().map((a) => [a.id, a]))
        const list = rowsOf.entries()
            .filter((e) => !status || e.feeStatus === status)
            .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
            .map((e) => ({ ...e, bidderName: bidders.get(e.bidderId)?.application.fullName ?? '', auctionTitle: auctions.get(e.auctionId)?.title ?? '', reference: feeInstructions(e).reference }))
        res.set('Cache-Control', 'no-store').json(list)
    })

    app.post('/api/admin/auction-entries/:id/fee', requireStrictAdmin, async (req: Request, res: Response) => {
        const e = rowsOf.entries().find((x) => x.id === Number(req.params.id))
        if (!e) return res.status(404).json({ message: 'No such entry.' })
        const decision = req.body?.decision
        const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 300) : ''
        if (decision === 'confirm') {
            e.feeStatus = 'confirmed'
            e.feeConfirmedAt = nowIso()
            e.feeConfirmedBy = asUserId(req)!
            e.feeNote = undefined
        } else if (decision === 'reject') {
            if (note.length < 5) return res.status(400).json({ message: 'Say why (for example, the payment was not found).' })
            e.feeStatus = 'rejected'
            e.feeNote = note
        } else {
            return res.status(400).json({ message: 'Decision must be confirm or reject.' })
        }
        save(C_ENTRIES, e)
        await tell(e.userId, decision === 'confirm' ? 'Commitment fee confirmed' : 'Commitment fee not confirmed', decision === 'confirm' ? 'Your fee is confirmed. You can bid when the auction is live.' : `We could not confirm your payment: ${note}. You can submit the reference again.`, '/bank-sales')
        res.json({ feeStatus: e.feeStatus })
    })
}

/** Start-up: restore from the database if needed, close anything already due, and keep closing. */
export function startAuctionService(): void {
    restoreAuctionsFromDatabase()
        .then(() => finalizeDueAuctions())
        .catch((err) => console.error('[auctions] start-up failed:', err))
}
