/**
 * Data-subject requests: access, correction, deletion, objection, portability, withdrawal of consent, "do not
 * sell/share", and complaints about data. Anyone, signed in or not, can ask. Each request gets a reference, an
 * acknowledgement email stating the deadline (30 days, shorter where the law says), and a notification to the
 * administrators. The work itself (finding and handing over or deleting data, checking who is asking) is done
 * by a person; this makes sure no request is lost or late-unnoticed.
 */
import type { Express, Request, Response } from 'express'
import { nextId, nowIso, readCollection, writeCollection } from './store'
import { notifyAdminsEverywhere } from './admin-notify'
import { requireStrictAdmin } from './admin-guard'
import { sendEmail } from '../email-service'
import { DynamoDBUtils, TABLES } from '../dynamodb'

const C_REQ = 'gene_data_requests'
const DEADLINE_DAYS = 30

export const REQUEST_TYPES = {
    access: 'Get a copy of my data',
    correct: 'Correct my data',
    delete: 'Delete my data / close my account',
    object: 'Stop or limit how my data is used',
    portability: 'Move my data to another service',
    withdraw_consent: 'Withdraw my consent',
    no_sale: 'Do not sell or share my data (California and similar laws)',
    complaint: 'Complain about how my data is handled',
} as const
export type RequestType = keyof typeof REQUEST_TYPES

export interface DataRequest {
    id: number
    reference: string
    type: RequestType
    fullName: string
    email: string
    country: string
    details: string
    userId?: number
    status: 'received' | 'verifying' | 'in_progress' | 'completed' | 'refused'
    note?: string
    createdAt: string
    dueAt: string
    updatedAt: string
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 160

const hits = new Map<string, number[]>()
function tooMany(key: string, limit: number): boolean {
    const now = Date.now()
    const list = (hits.get(key) ?? []).filter((t) => now - t < 3_600_000)
    list.push(now)
    hits.set(key, list)
    return list.length > limit
}

function save(r: DataRequest) {
    const all = readCollection<DataRequest>(C_REQ)
    const i = all.findIndex((x) => x.id === r.id)
    if (i >= 0) all[i] = r
    else all.push(r)
    writeCollection(C_REQ, all)
    DynamoDBUtils.putItem(TABLES.SETTINGS, { ...(r as unknown as Record<string, unknown>), id: `datarequest:${r.id}`, kind: C_REQ, rowId: r.id }).catch((err: unknown) =>
        console.error('[data-requests] could not mirror to the database (kept locally):', err)
    )
}

/** Used by the admin page and the owner's WhatsApp assistant. Returns null when there is no such request. */
export function setDataRequestStatus(id: number, status: string, note?: string): DataRequest | null {
    const r = readCollection<DataRequest>(C_REQ).find((x) => x.id === id)
    if (!r) return null
    if (['received', 'verifying', 'in_progress', 'completed', 'refused'].includes(status)) r.status = status as DataRequest['status']
    if (typeof note === 'string') r.note = note.trim().slice(0, 500)
    r.updatedAt = nowIso()
    save(r)
    return r
}

export function registerDataRequestRoutes(app: Express): void {
    app.post('/api/data-requests', async (req: Request, res: Response) => {
        if (tooMany(req.ip || 'x', 5)) return res.status(429).json({ message: 'Too many requests from this connection. Try again later, or write to privacy@realevr.com.' })
        const b = req.body ?? {}
        const type = str(b.type, 30) as RequestType
        const fullName = str(b.fullName, 120)
        const email = str(b.email, 160).toLowerCase()
        if (!(type in REQUEST_TYPES)) return res.status(400).json({ message: 'Choose what you want us to do.' })
        if (fullName.length < 2) return res.status(400).json({ message: 'Enter your name.' })
        if (!isEmail(email)) return res.status(400).json({ message: 'Enter the email address we should reply to.' })
        const details = str(b.details, 2000)
        if (type === 'complaint' && details.length < 10) return res.status(400).json({ message: 'Tell us what went wrong.' })
        const all = readCollection<DataRequest>(C_REQ)
        const id = nextId(all)
        const now = new Date()
        const r: DataRequest = {
            id,
            reference: `DR-${new Date().getUTCFullYear()}-${String(id).padStart(5, '0')}`,
            type,
            fullName,
            email,
            country: str(b.country, 60),
            details,
            userId: (req.user as { id?: number } | undefined)?.id,
            status: 'received',
            createdAt: now.toISOString(),
            dueAt: new Date(now.getTime() + DEADLINE_DAYS * 86_400_000).toISOString(),
            updatedAt: now.toISOString(),
        }
        save(r)
        const due = new Date(r.dueAt).toDateString()
        notifyAdminsEverywhere({
            title: `Data request ${r.reference}: ${REQUEST_TYPES[type]}`,
            message: `${fullName} <${email}>${r.country ? ` (${r.country})` : ''} asked: "${REQUEST_TYPES[type]}". Deadline ${due}. Verify who they are before handing over or deleting anything. See Admin > Data requests.`,
            link: '/admin/data-requests',
        }).catch(() => {})
        sendEmail({
            to: email,
            subject: `We received your request (${r.reference})`,
            html: `<p>Hello ${fullName.replace(/[<>&]/g, '')},</p><p>We received your request: <strong>${REQUEST_TYPES[type]}</strong>. Your reference is <strong>${r.reference}</strong>.</p><p>We will reply by <strong>${due}</strong> at the latest. We may ask you to prove who you are first, so that nobody else can get or delete your data.</p><p>— RealEVR Estates privacy team</p>`,
            text: `We received your request: ${REQUEST_TYPES[type]}. Reference ${r.reference}. We will reply by ${due} at the latest. We may ask you to prove who you are first.`,
        }).catch(() => {})
        res.status(201).json({ reference: r.reference, dueAt: r.dueAt })
    })

    app.get('/api/admin/data-requests', requireStrictAdmin, (_req: Request, res: Response) => {
        const list = readCollection<DataRequest>(C_REQ).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        res.set('Cache-Control', 'no-store').json({ types: REQUEST_TYPES, requests: list })
    })

    app.patch('/api/admin/data-requests/:id', requireStrictAdmin, (req: Request, res: Response) => {
        const r = readCollection<DataRequest>(C_REQ).find((x) => x.id === Number(req.params.id))
        if (!r) return res.status(404).json({ message: 'No such request.' })
        const status = req.body?.status
        if (['received', 'verifying', 'in_progress', 'completed', 'refused'].includes(status)) r.status = status
        if (typeof req.body?.note === 'string') r.note = req.body.note.trim().slice(0, 500)
        r.updatedAt = nowIso()
        save(r)
        res.json(r)
    })
}
