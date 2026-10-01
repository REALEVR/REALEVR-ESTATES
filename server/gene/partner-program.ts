/**
 * The worldwide partner programme.
 *
 *  - Every country has a page (fee, what a partner must show, the laws) and is in the sitemap.
 *  - Partners apply once; the platform does the rest it safely can: it checks the details, works out the country's
 *    fee, tells the applicant how to pay, recognises the payment from the receipt (server/gene/payment-settings.ts),
 *    and keeps everyone informed. A person makes ONE decision per application (approve / refuse), because putting a
 *    company's name on a public page, and letting a "bank" run auctions, needs a human check that it is who it says.
 *  - Reaching organisations in a country needs contacts. Administrators add contacts ("leads"); each gets one
 *    invitation email in the right language with an unsubscribe link, sent automatically a few per hour. People who
 *    unsubscribe are never contacted again.
 *
 * Honest limits: nothing here can find a country's banks by itself or guarantee anyone reads an invitation. A bank
 * partner is approved by a person after the fee is confirmed.
 */
import type { Express, NextFunction, Request, Response } from 'express'
import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { nextId, nowIso, readCollection, writeCollection } from './store'
import { notifyAdminsEverywhere } from './admin-notify'
import { requireStrictAdmin } from './admin-guard'
import { createNotification } from '../models/Notification'
import { sendEmail } from '../email-service'
import { storage } from '../storage'
import { DynamoDBUtils, TABLES } from '../dynamodb'
import { getCanonicalBaseUrl } from '../sitemap'
import { paidEnough, payToText, referenceInText, registerPaymentMatcher, retryUnmatchedNotices } from './payment-settings'
import { AUCTION_FEE_RULES, FEE_TIERS, PARTNER_ROLES, partnerFeeUsd, programForAllCountries, roleInfo, type FeeOverrides, type PartnerRole } from '../../shared/partner-program'
import { WORLD_COUNTRIES, worldCountry, worldCountryByParam } from '../../shared/world'
import { inviteEmail } from '../../shared/partner-invite'

const C_APPS = 'gene_partner_apps'
const C_LISTINGS = 'gene_partner_listings'
const C_LEADS = 'gene_partner_leads'
const C_OPTOUT = 'gene_partner_optout'
const C_CONFIG = 'gene_partner_config'
const KINDS = [C_APPS, C_LISTINGS, C_LEADS, C_OPTOUT, C_CONFIG] as const
const APPROVAL_MONTHS = 12
const FREE_MAIL = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com', 'icloud.com', 'proton.me', 'protonmail.com', 'aol.com', 'mail.com', 'yandex.com', 'gmx.com'])

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AppStatus = 'received' | 'needs_info' | 'approved' | 'rejected'
export type PartnerFeeStatus = 'none' | 'unpaid' | 'submitted' | 'confirmed' | 'rejected'

export interface PartnerApp {
    id: number
    userId: number
    role: PartnerRole
    organisation: string
    country: string
    contactName: string
    email: string
    phone: string
    website: string
    registrationNumber: string
    licenceNumber: string
    authority: string
    message: string
    status: AppStatus
    statusNote?: string
    feeUsd: number
    feeStatus: PartnerFeeStatus
    feeReference?: string
    feeSubmittedAt?: string
    feeConfirmedAt?: string
    feeNote?: string
    publicListing: boolean
    signals: { domainMatchesWebsite: boolean; freeMail: boolean; hasRegistration: boolean; hasLicence: boolean }
    createdAt: string
    updatedAt: string
    decidedAt?: string
    decidedBy?: number
    activeUntil?: string
}

export interface PartnerListing {
    id: number
    title: string
    role: PartnerRole
    /** ISO codes, or empty for worldwide. */
    countries: string[]
    description: string
    status: 'open' | 'closed'
    createdAt: string
    updatedAt: string
}

export interface PartnerLead {
    id: number
    email: string
    organisation: string
    country: string
    role: PartnerRole
    status: 'pending' | 'invited' | 'failed' | 'unsubscribed'
    attempts: number
    createdAt: string
    invitedAt?: string
    updatedAt?: string
}

interface OptOut {
    id: number
    email: string
    at: string
}

interface Config {
    id: 1
    overrides: FeeOverrides
    autoInvite: boolean
    secret: string
    updatedAt?: string
}

// ---------------------------------------------------------------------------
// Persistence (local JSON first, mirrored to the database, restored if the disk is wiped)
// ---------------------------------------------------------------------------

const dbId = (kind: string, id: number) => `partner:${kind}:${id}`

function save<T extends { id: number }>(kind: (typeof KINDS)[number], row: T): void {
    const rows = readCollection<T>(kind)
    const i = rows.findIndex((r) => r.id === row.id)
    if (i >= 0) rows[i] = row
    else rows.push(row)
    writeCollection(kind, rows)
    DynamoDBUtils.putItem(TABLES.SETTINGS, { ...(row as unknown as Record<string, unknown>), id: dbId(kind, row.id), kind, rowId: row.id }).catch((err: unknown) =>
        console.error(`[partners] could not mirror ${kind} #${row.id} to the database (kept locally):`, err)
    )
}

function remove(kind: (typeof KINDS)[number], id: number): void {
    writeCollection(
        kind,
        readCollection<{ id: number }>(kind).filter((r) => r.id !== id)
    )
    DynamoDBUtils.deleteItem?.(TABLES.SETTINGS, { id: dbId(kind, id) })?.catch?.(() => {})
}

export async function restorePartnerProgram(): Promise<void> {
    try {
        const items = (await DynamoDBUtils.scanTable(TABLES.SETTINGS, 'begins_with(#id, :p)', { ':p': 'partner:' }, { '#id': 'id' })) as unknown as Array<Record<string, any>>
        for (const kind of KINDS) {
            const have = readCollection<{ id: number }>(kind)
            const byId = new Map(have.map((r) => [r.id, r as Record<string, any>]))
            let changed = false
            for (const item of items.filter((x) => x.kind === kind)) {
                const { id: _k, kind: _kind, rowId, ...row } = item
                const current = byId.get(rowId)
                if (!current || String(current.updatedAt ?? current.at ?? current.createdAt ?? '') < String(row.updatedAt ?? row.at ?? row.createdAt ?? '')) {
                    byId.set(rowId, { ...row, id: rowId })
                    changed = true
                }
            }
            if (changed) writeCollection(kind, Array.from(byId.values()))
        }
    } catch (err) {
        console.warn('[partners] could not restore from the database (using the local copy):', err)
    }
}

const rows = {
    apps: () => readCollection<PartnerApp>(C_APPS),
    listings: () => readCollection<PartnerListing>(C_LISTINGS),
    leads: () => readCollection<PartnerLead>(C_LEADS),
    optout: () => readCollection<OptOut>(C_OPTOUT),
}

function getConfig(): Config {
    const row = readCollection<Config>(C_CONFIG)[0]
    if (row?.secret) return { ...row, overrides: row.overrides ?? {}, autoInvite: row.autoInvite !== false }
    const fresh: Config = { id: 1, overrides: row?.overrides ?? {}, autoInvite: row?.autoInvite !== false, secret: randomBytes(24).toString('hex'), updatedAt: nowIso() }
    save(C_CONFIG, fresh)
    return fresh
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

export const normEmail = (e: string) => e.trim().toLowerCase()
export const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 160

export function hostOf(url: string): string {
    try {
        const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`)
        return u.hostname.replace(/^www\./, '').toLowerCase()
    } catch {
        return ''
    }
}

export function applicationSignals(a: Pick<PartnerApp, 'email' | 'website' | 'registrationNumber' | 'licenceNumber'>): PartnerApp['signals'] {
    const domain = normEmail(a.email).split('@')[1] ?? ''
    const host = hostOf(a.website)
    return {
        domainMatchesWebsite: Boolean(domain && host && (host === domain || host.endsWith(`.${domain}`) || domain.endsWith(`.${host}`))),
        freeMail: FREE_MAIL.has(domain),
        hasRegistration: a.registrationNumber.trim().length >= 3,
        hasLicence: a.licenceNumber.trim().length >= 3,
    }
}

/** One lead per line: "email, organisation, country (name or code), role (optional)". Returns the good rows and the bad lines. */
export function parseLeads(text: string): { good: Array<{ email: string; organisation: string; country: string; role: PartnerRole }>; bad: string[] } {
    const good: Array<{ email: string; organisation: string; country: string; role: PartnerRole }> = []
    const bad: string[] = []
    const seen = new Set<string>()
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim()
        if (!line) continue
        const parts = line.split(/[,;\t]/).map((p) => p.trim())
        const email = normEmail(parts[0] ?? '')
        const country = worldCountry(parts[2]) ?? worldCountryByParam(parts[2]?.replace(/\s+/g, '-'))
        const roleRaw = (parts[3] ?? 'bank').toLowerCase()
        const role = (PARTNER_ROLES.find((r) => r.id === roleRaw)?.id ?? 'bank') as PartnerRole
        if (!isEmail(email) || !country || !parts[1]) {
            bad.push(line.slice(0, 120))
            continue
        }
        const key = `${email}|${country.code}`
        if (seen.has(key)) continue
        seen.add(key)
        good.push({ email, organisation: parts[1].slice(0, 120), country: country.code, role })
    }
    return { good, bad }
}

function sign(email: string): string {
    return createHmac('sha256', getConfig().secret).update(normEmail(email)).digest('base64url').slice(0, 32)
}

export function unsubscribeUrl(email: string): string {
    return `${getCanonicalBaseUrl()}/api/partner-program/unsubscribe?e=${Buffer.from(normEmail(email)).toString('base64url')}&s=${sign(email)}`
}

function checkUnsubscribe(e: string, s: string): string | null {
    try {
        const email = Buffer.from(e, 'base64url').toString('utf8')
        const a = Buffer.from(sign(email))
        const b = Buffer.from(s)
        return isEmail(email) && a.length === b.length && timingSafeEqual(a, b) ? email : null
    } catch {
        return null
    }
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

const asUserId = (req: Request): number | null => {
    const id = (req.user as { id?: number } | undefined)?.id
    return typeof id === 'number' ? id : null
}
const needUser = (req: Request, res: Response, next: NextFunction) => (req.isAuthenticated?.() && asUserId(req) ? next() : res.status(401).json({ message: 'Please sign in.' }))
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

async function tell(userId: number, title: string, message: string, link?: string) {
    try {
        await createNotification({ userId: String(userId), title, message, type: 'system', link })
    } catch (err) {
        console.error('[partners] could not notify user', userId, err)
    }
}

const hits = new Map<string, number[]>()
function tooMany(key: string, limit: number, windowMs = 3_600_000): boolean {
    const now = Date.now()
    const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
    list.push(now)
    hits.set(key, list)
    return list.length > limit
}

function feeInstructions(a: PartnerApp) {
    return { reference: `PF-${a.id}`, payTo: payToText(), feeUsd: a.feeUsd }
}

const appView = (a: PartnerApp) => ({
    id: a.id,
    role: a.role,
    organisation: a.organisation,
    country: a.country,
    status: a.status,
    statusNote: a.statusNote ?? null,
    feeUsd: a.feeUsd,
    feeStatus: a.feeStatus,
    feeNote: a.feeNote ?? null,
    activeUntil: a.activeUntil ?? null,
    createdAt: a.createdAt,
    ...(a.feeStatus === 'unpaid' || a.feeStatus === 'rejected' || a.feeStatus === 'submitted' ? { pay: feeInstructions(a) } : {}),
})

// ---------------------------------------------------------------------------
// The built-in listings: one per kind of partner, open worldwide, plus whatever administrators add
// ---------------------------------------------------------------------------

function allListings(includeClosed = false) {
    const builtIn = PARTNER_ROLES.map((r) => ({
        id: -(PARTNER_ROLES.indexOf(r) + 1),
        title: r.title,
        role: r.id,
        countries: [] as string[],
        description: r.summary,
        requirements: r.requirements,
        youGet: r.youGet,
        paysFee: r.paysFee,
        status: 'open' as const,
        builtIn: true,
    }))
    const custom = rows
        .listings()
        .filter((l) => includeClosed || l.status === 'open')
        .map((l) => {
            const info = roleInfo(l.role)!
            return { id: l.id, title: l.title, role: l.role, countries: l.countries, description: l.description, requirements: info.requirements, youGet: info.youGet, paysFee: info.paysFee, status: l.status, builtIn: false }
        })
    return [...custom.sort((a, b) => b.id - a.id), ...builtIn]
}

function publicPartnersIn(code: string) {
    const now = Date.now()
    return rows
        .apps()
        .filter((a) => a.country === code && a.status === 'approved' && a.publicListing && (!a.activeUntil || Date.parse(a.activeUntil) > now))
        .map((a) => ({ organisation: a.organisation, role: a.role, website: a.website || null }))
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

const INVITES_PER_RUN = Math.max(1, Number(process.env.PARTNER_INVITES_PER_RUN) || 20)

export async function sendPendingInvites(max = INVITES_PER_RUN): Promise<{ sent: number; failed: number; skipped: number }> {
    const cfg = getConfig()
    const out = { sent: 0, failed: 0, skipped: 0 }
    if (!cfg.autoInvite && max === INVITES_PER_RUN) return out
    const optedOut = new Set(rows.optout().map((o) => o.email))
    const pending = rows
        .leads()
        .filter((l) => l.status === 'pending' || (l.status === 'failed' && l.attempts < 3))
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
        .slice(0, max)
    for (const lead of pending) {
        if (optedOut.has(lead.email)) {
            lead.status = 'unsubscribed'
            lead.updatedAt = nowIso()
            save(C_LEADS, lead)
            out.skipped++
            continue
        }
        const country = worldCountry(lead.country)
        if (!country) {
            out.skipped++
            continue
        }
        const base = getCanonicalBaseUrl()
        const slug = programForAllCountries(cfg.overrides).find((c) => c.code === country.code)!.slug
        const msg = inviteEmail({
            country: country.name,
            countryCode: country.code,
            organisation: lead.organisation,
            role: lead.role,
            feeUsd: lead.role === 'bank' ? partnerFeeUsd(country.code, cfg.overrides) : 0,
            link: `${base}/become-a-partner/${slug}`,
            unsubscribe: unsubscribeUrl(lead.email),
        })
        lead.attempts++
        const ok = await sendEmail({ to: lead.email, subject: msg.subject, html: msg.html, text: msg.text })
        lead.status = ok ? 'invited' : 'failed'
        lead.updatedAt = nowIso()
        if (ok) lead.invitedAt = nowIso()
        save(C_LEADS, lead)
        ok ? out.sent++ : out.failed++
    }
    return out
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerPartnerProgramRoutes(app: Express): void {
    // ---- Public: the programme, and one country's page --------------------------------------------
    app.get('/api/partner-program', (_req: Request, res: Response) => {
        const cfg = getConfig()
        res.set('Cache-Control', 'public, max-age=120').json({
            roles: PARTNER_ROLES,
            tiers: FEE_TIERS.map((t) => ({ ...t, annualUsd: cfg.overrides.tiers?.[String(t.tier) as '1'] ?? t.defaultAnnualUsd })),
            auctionRules: AUCTION_FEE_RULES,
            countries: programForAllCountries(cfg.overrides),
            listings: allListings(),
        })
    })

    app.get('/api/partner-program/country/:param', (req: Request, res: Response) => {
        const c = worldCountryByParam(req.params.param)
        if (!c) return res.status(404).json({ message: 'No such country.' })
        const cfg = getConfig()
        const program = programForAllCountries(cfg.overrides).find((x) => x.code === c.code)!
        res.set('Cache-Control', 'public, max-age=120').json({
            country: program,
            roles: PARTNER_ROLES,
            auctionRules: AUCTION_FEE_RULES,
            listings: allListings().filter((l) => l.countries.length === 0 || l.countries.includes(c.code)),
            partners: publicPartnersIn(c.code),
        })
    })

    // ---- Applying and paying -----------------------------------------------------------------------
    app.post('/api/partner-program/apply', needUser, async (req: Request, res: Response) => {
        const userId = asUserId(req)!
        const b = req.body ?? {}
        const role = roleInfo(str(b.role, 20))
        const country = worldCountry(str(b.country, 4))
        const organisation = str(b.organisation, 140)
        const contactName = str(b.contactName, 100)
        const email = normEmail(str(b.email, 160))
        const phone = str(b.phone, 40)
        const website = str(b.website, 200)
        if (!role) return res.status(400).json({ message: 'Choose what kind of partner you are.' })
        if (!country) return res.status(400).json({ message: 'Choose the country you want to partner in.' })
        if (organisation.length < 2) return res.status(400).json({ message: 'Enter your organisation\'s name.' })
        if (contactName.length < 2) return res.status(400).json({ message: 'Enter the contact person\'s name.' })
        if (!isEmail(email)) return res.status(400).json({ message: 'Enter a valid work email address.' })
        if (phone.replace(/\D/g, '').length < 7) return res.status(400).json({ message: 'Enter a phone or WhatsApp number with the country code.' })
        if (website && !hostOf(website)) return res.status(400).json({ message: 'That website address does not look right.' })
        if (b.consent !== true) return res.status(400).json({ message: 'Please confirm you accept the Partner Terms and that we may keep these details.' })
        const registrationNumber = str(b.registrationNumber, 80)
        const licenceNumber = str(b.licenceNumber, 80)
        const authority = str(b.authority, 1000)
        if (registrationNumber.length < 3) return res.status(400).json({ message: 'Enter your business registration number.' })
        if (role.id === 'bank') {
            if (licenceNumber.length < 3) return res.status(400).json({ message: 'Enter your banking or lending licence number.' })
            if (authority.length < 20) return res.status(400).json({ message: 'Say who signs for the bank and what authority you have to list and sell its properties.' })
        }
        if (role.id === 'professional' && licenceNumber.length < 3) return res.status(400).json({ message: 'Enter your professional licence or membership number.' })
        const feeUsd = role.paysFee ? partnerFeeUsd(country.code, getConfig().overrides) : 0
        if (feeUsd > 0 && b.feeAcknowledged !== true) return res.status(400).json({ message: `Confirm that you understand the partner fee for ${country.name} is US$${feeUsd.toLocaleString()} a year.` })

        const all = rows.apps()
        if (all.some((a) => a.userId === userId && a.role === role.id && a.country === country.code && (a.status === 'received' || a.status === 'needs_info' || a.status === 'approved')))
            return res.status(409).json({ message: 'You already have an application for this kind of partner in this country.' })
        if (tooMany(`apply:${userId}`, 8)) return res.status(429).json({ message: 'Too many applications. Try again later.' })
        const now = nowIso()
        const a: PartnerApp = {
            id: nextId(all),
            userId,
            role: role.id,
            organisation,
            country: country.code,
            contactName,
            email,
            phone,
            website,
            registrationNumber,
            licenceNumber,
            authority,
            message: str(b.message, 1500),
            status: 'received',
            feeUsd,
            feeStatus: feeUsd > 0 ? 'unpaid' : 'none',
            publicListing: true,
            signals: applicationSignals({ email, website, registrationNumber, licenceNumber }),
            createdAt: now,
            updatedAt: now,
        }
        save(C_APPS, a)
        const sig = a.signals
        const flags = [sig.domainMatchesWebsite ? 'email matches website' : 'email does NOT match website', sig.freeMail ? 'free-mail address' : 'work email', sig.hasRegistration ? 'registration given' : 'no registration', a.licenceNumber ? 'licence given' : 'no licence'].join(', ')
        notifyAdminsEverywhere({
            title: `New ${role.id} partner application: ${organisation} (${country.name})`,
            message: `${contactName} <${email}> applied as ${role.title} in ${country.name}. ${feeUsd ? `Fee US$${feeUsd} (not yet paid). ` : ''}Checks: ${flags}. Review it in Admin > Partners.`,
            whatsappMessage: `🤝 Partner application\n${organisation} (${country.name})\n${role.title}\n${flags}\nReview in Admin > Partners.`,
            link: '/admin/partners',
        }).catch(() => {})
        await tell(
            userId,
            'Partner application received',
            feeUsd > 0
                ? `We have your application for ${country.name}. To activate it, pay the US$${feeUsd.toLocaleString()} partner fee, then enter the payment reference on the Partner page. We confirm payments automatically; an administrator then reviews the application.`
                : `We have your application for ${country.name}. An administrator will review it, usually within a few working days.`,
            '/become-a-partner'
        )
        res.status(201).json(appView(a))
    })

    app.get('/api/partner-program/mine', needUser, (req: Request, res: Response) => {
        const userId = asUserId(req)!
        res.set('Cache-Control', 'no-store').json(rows.apps().filter((a) => a.userId === userId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(appView))
    })

    app.post('/api/partner-program/applications/:id/fee', needUser, (req: Request, res: Response) => {
        const userId = asUserId(req)!
        const a = rows.apps().find((x) => x.id === Number(req.params.id) && x.userId === userId)
        if (!a) return res.status(404).json({ message: 'No such application.' })
        if (a.feeStatus === 'none') return res.status(400).json({ message: 'This kind of partner has no fee.' })
        if (a.feeStatus === 'confirmed') return res.status(409).json({ message: 'Your fee is already confirmed.' })
        if (a.status === 'rejected') return res.status(409).json({ message: 'This application was not accepted.' })
        if (req.body?.acknowledged !== true) return res.status(400).json({ message: 'Confirm that you have paid the fee shown and understand it is non-refundable once your partnership is approved.' })
        const ref = str(req.body?.reference, 80)
        if (ref.length < 4) return res.status(400).json({ message: 'Enter the payment reference or transaction number you received.' })
        a.feeReference = ref
        a.feeSubmittedAt = nowIso()
        a.feeStatus = 'submitted'
        a.feeNote = undefined
        a.updatedAt = nowIso()
        save(C_APPS, a)
        notifyAdminsEverywhere({
            title: 'Partner fee awaiting confirmation',
            message: `${a.organisation} (${worldCountry(a.country)?.name}) says it paid US$${a.feeUsd} (reference ${ref}). It is confirmed automatically when the receipt arrives; otherwise confirm it in Admin > Partners.`,
            link: '/admin/partners',
        }).catch(() => {})
        retryUnmatchedNotices().catch(() => {})
        res.json(appView(a))
    })

    // ---- Leaving the invitation list -----------------------------------------------------------------
    app.get('/api/partner-program/unsubscribe', (req: Request, res: Response) => {
        const email = checkUnsubscribe(str(req.query.e, 300), str(req.query.s, 100))
        res.type('html')
        if (!email) return res.status(400).send('<!doctype html><meta charset="utf-8"><p style="font-family:sans-serif;max-width:32rem;margin:3rem auto">This link is not valid. Write to partners@realevr.com and we will remove you.</p>')
        if (!rows.optout().some((o) => o.email === email)) save(C_OPTOUT, { id: nextId(rows.optout()), email, at: nowIso() })
        for (const l of rows.leads().filter((x) => x.email === email && x.status !== 'unsubscribed')) {
            l.status = 'unsubscribed'
            l.updatedAt = nowIso()
            save(C_LEADS, l)
        }
        res.send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed</title><body style="font-family:sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem"><h1>You are unsubscribed</h1><p>We will not contact this address about the RealEVR Estates partner programme again.</p>')
    })

    // ---- Administrators ------------------------------------------------------------------------------
    app.get('/api/admin/partner-program', requireStrictAdmin, (_req: Request, res: Response) => {
        const cfg = getConfig()
        const apps = rows.apps()
        const leads = rows.leads()
        const program = programForAllCountries(cfg.overrides)
        const coverage = program.map((c) => ({
            code: c.code,
            name: c.name,
            continent: c.continent,
            feeUsd: c.feeUsd,
            contacts: leads.filter((l) => l.country === c.code).length,
            invited: leads.filter((l) => l.country === c.code && l.status === 'invited').length,
            applications: apps.filter((a) => a.country === c.code).length,
            partners: apps.filter((a) => a.country === c.code && a.status === 'approved').length,
        }))
        res.set('Cache-Control', 'no-store').json({
            config: { overrides: cfg.overrides, autoInvite: cfg.autoInvite },
            tiers: FEE_TIERS,
            applications: apps.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
            listings: rows.listings().sort((a, b) => b.id - a.id),
            leads: {
                pending: leads.filter((l) => l.status === 'pending').length,
                invited: leads.filter((l) => l.status === 'invited').length,
                failed: leads.filter((l) => l.status === 'failed').length,
                unsubscribed: leads.filter((l) => l.status === 'unsubscribed').length,
                recent: leads.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 100),
            },
            coverage,
            countriesTotal: coverage.length,
            countriesWithContacts: coverage.filter((c) => c.contacts > 0).length,
            countriesInvited: coverage.filter((c) => c.invited > 0).length,
            countriesWithPartners: coverage.filter((c) => c.partners > 0).length,
        })
    })

    app.put('/api/admin/partner-program/fees', requireStrictAdmin, (req: Request, res: Response) => {
        const cfg = getConfig()
        const clean = (v: unknown): number | undefined => (v === '' || v == null ? undefined : Number(v))
        const overrides: FeeOverrides = { tiers: {}, countries: {} }
        for (const [k, v] of Object.entries(req.body?.tiers ?? {})) {
            const n = clean(v)
            if (n === undefined) continue
            if (!['1', '2', '3', '4'].includes(k) || !Number.isFinite(n) || n < 0 || n > 100000) return res.status(400).json({ message: 'A tier fee must be a number from 0 to 100,000.' })
            overrides.tiers![k as '1'] = Math.round(n)
        }
        for (const [k, v] of Object.entries(req.body?.countries ?? {})) {
            const n = clean(v)
            if (n === undefined) continue
            if (!worldCountry(k) || !Number.isFinite(n) || n < 0 || n > 100000) return res.status(400).json({ message: `The fee for ${k} must be a number from 0 to 100,000.` })
            overrides.countries![k.toUpperCase()] = Math.round(n)
        }
        const next: Config = { ...cfg, overrides, autoInvite: typeof req.body?.autoInvite === 'boolean' ? req.body.autoInvite : cfg.autoInvite, updatedAt: nowIso() }
        save(C_CONFIG, next)
        res.json({ overrides: next.overrides, autoInvite: next.autoInvite })
    })

    app.post('/api/admin/partner-program/applications/:id/decision', requireStrictAdmin, async (req: Request, res: Response) => {
        const a = rows.apps().find((x) => x.id === Number(req.params.id))
        if (!a) return res.status(404).json({ message: 'No such application.' })
        const decision = req.body?.decision
        const note = str(req.body?.note, 400)
        if (decision === 'approve') {
            if (a.feeUsd > 0 && a.feeStatus !== 'confirmed' && req.body?.waiveFee !== true) return res.status(409).json({ message: 'The partner fee is not confirmed yet. Wait for the payment, or tick "waive the fee".' })
            a.status = 'approved'
            a.statusNote = undefined
            a.decidedAt = nowIso()
            a.decidedBy = asUserId(req)!
            a.publicListing = req.body?.publicListing !== false
            a.activeUntil = new Date(Date.now() + APPROVAL_MONTHS * 30 * 86_400_000).toISOString()
            if (a.feeUsd > 0 && a.feeStatus !== 'confirmed') a.feeNote = 'Fee waived by an administrator'
            if (a.role === 'bank') {
                // A bank partner has to be able to list properties and run auctions.
                const u = await storage.getUser(a.userId).catch(() => undefined)
                if (u && u.role === 'normal') await storage.updateUserRole(a.userId, 'agent').catch((err) => console.error('[partners] could not give the partner a listing role:', err))
            }
        } else if (decision === 'reject') {
            if (note.length < 5) return res.status(400).json({ message: 'Say why (the applicant sees this).' })
            a.status = 'rejected'
            a.statusNote = note
            a.decidedAt = nowIso()
            a.decidedBy = asUserId(req)!
            if (a.feeStatus === 'confirmed') a.feeNote = 'Application refused: the fee is refunded outside the platform. Contact support.'
        } else if (decision === 'request_more') {
            if (note.length < 5) return res.status(400).json({ message: 'Say what is missing.' })
            a.status = 'needs_info'
            a.statusNote = note
        } else {
            return res.status(400).json({ message: 'Decision must be approve, reject or request_more.' })
        }
        a.updatedAt = nowIso()
        save(C_APPS, a)
        const where = worldCountry(a.country)?.name ?? a.country
        const text =
            decision === 'approve'
                ? `Your partnership in ${where} is approved${a.role === 'bank' ? ' and you can now list bank sales and run auctions' : ''}.${a.publicListing ? ' You now appear on the Partners page.' : ''}`
                : decision === 'reject'
                  ? `We could not accept your application for ${where}: ${note}`
                  : `We need more from you for ${where}: ${note}`
        await tell(a.userId, decision === 'approve' ? 'Partnership approved' : decision === 'reject' ? 'Partner application not accepted' : 'More information needed', text, '/become-a-partner')
        sendEmail({ to: a.email, subject: decision === 'approve' ? 'Your RealEVR Estates partnership is approved' : 'Your RealEVR Estates partner application', html: `<p>${text}</p><p>— RealEVR Estates</p>`, text }).catch(() => {})
        res.json(a)
    })

    app.post('/api/admin/partner-program/applications/:id/fee', requireStrictAdmin, async (req: Request, res: Response) => {
        const a = rows.apps().find((x) => x.id === Number(req.params.id))
        if (!a || a.feeStatus === 'none') return res.status(404).json({ message: 'No such fee.' })
        const decision = req.body?.decision
        const note = str(req.body?.note, 300)
        if (decision === 'confirm') {
            a.feeStatus = 'confirmed'
            a.feeConfirmedAt = nowIso()
            a.feeNote = undefined
        } else if (decision === 'reject') {
            if (note.length < 5) return res.status(400).json({ message: 'Say why (for example, the payment was not found).' })
            a.feeStatus = 'rejected'
            a.feeNote = note
        } else return res.status(400).json({ message: 'Decision must be confirm or reject.' })
        a.updatedAt = nowIso()
        save(C_APPS, a)
        await tell(a.userId, decision === 'confirm' ? 'Partner fee confirmed' : 'Partner fee not confirmed', decision === 'confirm' ? 'Your fee is confirmed. An administrator will now review your application.' : `We could not confirm your payment: ${note}. You can submit the reference again.`, '/become-a-partner')
        res.json({ feeStatus: a.feeStatus })
    })

    app.post('/api/admin/partner-program/listings', requireStrictAdmin, (req: Request, res: Response) => {
        const role = roleInfo(str(req.body?.role, 20))
        const title = str(req.body?.title, 140)
        const description = str(req.body?.description, 1500)
        const codes: unknown = req.body?.countries
        const countries = Array.isArray(codes) ? codes.map((c) => String(c).toUpperCase()).filter((c) => worldCountry(c)) : []
        if (!role) return res.status(400).json({ message: 'Choose the kind of partner.' })
        if (title.length < 5) return res.status(400).json({ message: 'Give the listing a title.' })
        if (description.length < 20) return res.status(400).json({ message: 'Describe what you are looking for (at least a sentence).' })
        const all = rows.listings()
        const now = nowIso()
        const l: PartnerListing = { id: nextId(all), title, role: role.id, countries, description, status: 'open', createdAt: now, updatedAt: now }
        save(C_LISTINGS, l)
        res.status(201).json(l)
    })

    app.patch('/api/admin/partner-program/listings/:id', requireStrictAdmin, (req: Request, res: Response) => {
        const l = rows.listings().find((x) => x.id === Number(req.params.id))
        if (!l) return res.status(404).json({ message: 'No such listing.' })
        if (req.body?.status === 'open' || req.body?.status === 'closed') l.status = req.body.status
        l.updatedAt = nowIso()
        save(C_LISTINGS, l)
        res.json(l)
    })

    app.delete('/api/admin/partner-program/listings/:id', requireStrictAdmin, (req: Request, res: Response) => {
        if (!rows.listings().some((x) => x.id === Number(req.params.id))) return res.status(404).json({ message: 'No such listing.' })
        remove(C_LISTINGS, Number(req.params.id))
        res.json({ ok: true })
    })

    app.post('/api/admin/partner-program/leads', requireStrictAdmin, (req: Request, res: Response) => {
        const text = str(req.body?.text, 200_000)
        if (text.length < 5) return res.status(400).json({ message: 'Paste one contact per line: email, organisation, country, kind of partner.' })
        const { good, bad } = parseLeads(text)
        const optedOut = new Set(rows.optout().map((o) => o.email))
        const existing = new Set(rows.leads().map((l) => `${l.email}|${l.country}`))
        const all = rows.leads()
        let added = 0
        let skipped = 0
        let id = nextId(all)
        const toSave: PartnerLead[] = []
        for (const g of good) {
            if (optedOut.has(g.email) || existing.has(`${g.email}|${g.country}`)) {
                skipped++
                continue
            }
            toSave.push({ id: id++, ...g, status: 'pending', attempts: 0, createdAt: nowIso() })
            added++
        }
        if (toSave.length) {
            writeCollection(C_LEADS, [...all, ...toSave])
            // The mirror is per row; mirror in the background.
            for (const l of toSave) DynamoDBUtils.putItem(TABLES.SETTINGS, { ...(l as unknown as Record<string, unknown>), id: dbId(C_LEADS, l.id), kind: C_LEADS, rowId: l.id }).catch(() => {})
        }
        res.json({ added, skipped, bad })
    })

    app.delete('/api/admin/partner-program/leads/:id', requireStrictAdmin, (req: Request, res: Response) => {
        if (!rows.leads().some((x) => x.id === Number(req.params.id))) return res.status(404).json({ message: 'No such contact.' })
        remove(C_LEADS, Number(req.params.id))
        res.json({ ok: true })
    })

    app.post('/api/admin/partner-program/invite-now', requireStrictAdmin, async (_req: Request, res: Response) => {
        res.json(await sendPendingInvites(INVITES_PER_RUN))
    })
}

/** Start-up: restore from the database if needed and recognise partner-fee receipts. */
export function startPartnerProgramService(): void {
    registerPaymentMatcher('Partner fee', async (notice) => {
        const open = rows.apps().filter((a) => a.feeStatus === 'submitted' && a.feeReference && a.feeUsd > 0 && referenceInText(notice.text, a.feeReference) && paidEnough(notice.usd, a.feeUsd))
        if (open.length !== 1) return null
        const a = open[0]
        a.feeStatus = 'confirmed'
        a.feeConfirmedAt = nowIso()
        a.feeNote = `Confirmed automatically from payment notice #${notice.id}`
        a.updatedAt = nowIso()
        save(C_APPS, a)
        await tell(a.userId, 'Partner fee confirmed', 'Your payment arrived. An administrator will now review your application.', '/become-a-partner')
        notifyAdminsEverywhere({
            title: 'Partner fee confirmed automatically',
            message: `${a.organisation} (${worldCountry(a.country)?.name}): US$${a.feeUsd} matched to payment notice #${notice.id}. The application is ready to approve in Admin > Partners.`,
            link: '/admin/partners',
        }).catch(() => {})
        return `application #${a.id}`
    })
    restorePartnerProgram().catch(() => {})
}
