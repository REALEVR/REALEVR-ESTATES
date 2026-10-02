/**
 * The owner's WhatsApp assistant: talk to the platform from your phone, and have it tell you what needs you.
 *
 * What it does
 *  - Answers from the owner's number(s) only (ADMIN_WHATSAPP_NUMBERS), and only when the webhook is proven genuine
 *    (see webhook-auth.ts). A forged webhook can never act as the owner.
 *  - Understands short commands (STATUS, PENDING, SHOW P12, APPROVE P12, ...) and voice notes (transcribed with the
 *    same speech providers as Kevin). Anything else is answered by the AI from a live snapshot of the platform, read-only.
 *  - Every change asks "reply YES" first (and "YES <pin>" when OWNER_WHATSAPP_PIN is set). Nothing is done on a guess.
 *  - Sends a morning digest and, when autopilot is switched on, handles the routine partner applications by itself.
 *
 * What it will not do from WhatsApp, on purpose: approve bidders (ID documents must be looked at), pay out money,
 * delete anything, or send anything to the public except a reply you wrote to one person. Those stay on the dashboard,
 * and the assistant tells you when one is waiting.
 */
import cron from 'node-cron'
import { nextId, nowIso, readCollection, writeCollection } from './store'
import { storage } from '../storage'
import { sendWhatsAppMessage } from './whatsapp'
import { DynamoDBUtils, TABLES } from '../dynamodb'

const C_SETTINGS = 'gene_owner_assistant'
const C_LOG = 'gene_owner_log'

export interface OwnerSettings {
    id: 1
    digest: { enabled: boolean; /** Hour in East Africa Time (UTC+3). */ hour: number }
    autopilot: { partners: boolean }
    lastDigestOn?: string
    /** When the owner last wrote to us. WhatsApp only lets free-form messages through for 24 hours after this. */
    lastOwnerMessageAt?: string
    updatedAt: string
}

const DEFAULTS: OwnerSettings = { id: 1, digest: { enabled: true, hour: 7 }, autopilot: { partners: false }, updatedAt: '' }

export function getOwnerSettings(): OwnerSettings {
    const row = readCollection<OwnerSettings>(C_SETTINGS)[0]
    return { ...DEFAULTS, ...(row ?? {}), digest: { ...DEFAULTS.digest, ...(row?.digest ?? {}) }, autopilot: { ...DEFAULTS.autopilot, ...(row?.autopilot ?? {}) }, id: 1 }
}

function saveOwnerSettings(s: OwnerSettings) {
    s.updatedAt = nowIso()
    writeCollection(C_SETTINGS, [s])
    DynamoDBUtils.putItem(TABLES.SETTINGS, { ...(s as unknown as Record<string, unknown>), id: 'ownerassist:settings', kind: C_SETTINGS, rowId: 1 }).catch((err: unknown) =>
        console.error('[owner-assistant] could not mirror settings to the database (kept locally):', err)
    )
}

export async function restoreOwnerAssistant(): Promise<void> {
    try {
        if (readCollection<OwnerSettings>(C_SETTINGS).length) return
        const item = (await DynamoDBUtils.getItem(TABLES.SETTINGS, { id: 'ownerassist:settings' })) as unknown as Record<string, any> | undefined
        if (item) {
            const { id: _i, kind: _k, rowId: _r, ...rest } = item
            writeCollection(C_SETTINGS, [{ ...DEFAULTS, ...rest, id: 1 }])
        }
    } catch (err) {
        console.warn('[owner-assistant] could not restore settings from the database:', err)
    }
}

// ---------------------------------------------------------------------------
// Who is the owner
// ---------------------------------------------------------------------------

const digits = (s: string) => s.replace(/\D/g, '')

async function ownerNumbers(): Promise<string[]> {
    const { getAdminWhatsappNumbers } = await import('./admin-notify')
    return getAdminWhatsappNumbers().map(digits)
}

export async function isOwnerNumber(phone: string): Promise<boolean> {
    return (await ownerNumbers()).includes(digits(phone))
}

// ---------------------------------------------------------------------------
// Reading the platform
// ---------------------------------------------------------------------------

type Row = Record<string, any>
const rows = (name: string): Row[] => readCollection<Row>(name)
const hoursSince = (iso?: string) => (iso ? (Date.now() - Date.parse(iso)) / 3_600_000 : 0)

export interface Item {
    code: string
    kind: 'partner' | 'crypto' | 'data' | 'chat' | 'bidder' | 'payout' | 'tour'
    title: string
    detail: string
    since?: string
    /** Handled from WhatsApp, or only on the dashboard. */
    here: boolean
}

export function pendingItems(): Item[] {
    const out: Item[] = []
    for (const a of rows('gene_partner_apps')) {
        if (a.status !== 'received' && a.status !== 'needs_info') continue
        if (a.status === 'needs_info') continue
        const signals = a.signals ?? {}
        const feeNote = a.feeUsd > 0 ? (a.feeStatus === 'confirmed' ? `fee US$${a.feeUsd} confirmed` : `fee US$${a.feeUsd} ${a.feeStatus}`) : 'free role'
        out.push({
            code: `P${a.id}`,
            kind: 'partner',
            title: `${a.organisation} (${a.role}, ${a.country})`,
            detail: `${a.contactName}, ${a.email}, ${a.phone || 'no phone'}. ${feeNote}. Site matches email: ${signals.domainMatchesWebsite ? 'yes' : 'no'}; free mail: ${signals.freeMail ? 'yes' : 'no'}; registration: ${signals.hasRegistration ? 'yes' : 'no'}; licence: ${signals.hasLicence ? 'yes' : 'no'}.${a.message ? ` They wrote: "${String(a.message).slice(0, 200)}"` : ''}`,
            since: a.createdAt,
            here: a.role !== 'bank',
        })
    }
    for (const r of rows('gene_crypto_requests')) {
        if (r.status !== 'new') continue
        out.push({ code: `C${r.id}`, kind: 'crypto', title: `${r.name} wants "${r.propertyTitle}" with ${r.asset}`, detail: `${r.currency} ${Number(r.price).toLocaleString('en-US')}. ${r.phone}, ${r.email}${r.country ? `, ${r.country}` : ''}.${r.note ? ` Note: "${String(r.note).slice(0, 200)}"` : ''}`, since: r.createdAt, here: true })
    }
    for (const r of rows('gene_data_requests')) {
        if (r.status === 'completed' || r.status === 'refused') continue
        out.push({ code: `D${r.id}`, kind: 'data', title: `${r.reference}: ${r.type} from ${r.fullName}`, detail: `${r.email}. Status ${r.status}. Due ${String(r.dueAt).slice(0, 10)}.${r.details ? ` "${String(r.details).slice(0, 200)}"` : ''}`, since: r.createdAt, here: true })
    }
    for (const e of rows('gene_escalations')) {
        if (e.status === 'resolved') continue
        out.push({ code: `E${e.id}`, kind: 'chat', title: `A visitor asked for a person (${e.status})`, detail: `"${String(e.message).slice(0, 240)}"${e.customerPhone ? ` Phone ${e.customerPhone}.` : ''} Reason: ${e.reason}.`, since: e.createdAt, here: true })
    }
    for (const b of rows('gene_auction_bidders')) {
        if (b.status !== 'applied' && b.status !== 'under_review') continue
        out.push({ code: `B${b.id}`, kind: 'bidder', title: `Bidder to vet: ${b.application?.fullName ?? `#${b.id}`}`, detail: 'ID documents have to be looked at, so this one is for the dashboard (Admin > Auctions).', since: b.submittedAt, here: false })
    }
    for (const [name, tag] of [['gene_listing_payout_requests', 'L'], ['gene_payout_requests', 'S'], ['gene_recommendation_payouts', 'R']] as const) {
        for (const p of rows(name)) {
            if (!String(p.status ?? '').startsWith('pending')) continue
            out.push({ code: `W${tag}${p.id}`, kind: 'payout', title: `Payout waiting: ${p.amount ?? p.payoutAmount ?? ''} ${p.currency ?? p.payoutCurrency ?? ''}`.trim(), detail: 'Money is approved on the dashboard only.', since: p.createdAt ?? p.requestedAt, here: false })
        }
    }
    for (const t of rows('gene_tour_health')) {
        if (t.ok !== false) continue
        out.push({ code: `T${t.propertyId}`, kind: 'tour', title: `Tour not loading: ${t.title ?? `property ${t.propertyId}`}`, detail: `${t.reason ?? 'unknown reason'}. Since ${String(t.firstFailedAt ?? '').slice(0, 10)}.`, since: t.firstFailedAt, here: false })
    }
    return out.sort((a, b) => (a.since ?? '') < (b.since ?? '') ? -1 : 1)
}

function unmatchedPayments(): Row[] {
    return rows('gene_payment_notices').filter((n) => n.status === 'unmatched')
}

async function counts() {
    const [users, props] = await Promise.all([storage.getAllUsers().catch(() => [] as any[]), storage.getAllProperties().catch(() => [] as any[])])
    const day = Date.now() - 86_400_000
    return {
        users: users.length,
        newUsers24h: users.filter((u: any) => u.createdAt && Date.parse(u.createdAt) > day).length,
        properties: props.length,
        live: props.filter((p: any) => p.isAvailable !== false).length,
    }
}

export async function statusText(): Promise<string> {
    const c = await counts()
    const items = pendingItems()
    const by = (k: Item['kind']) => items.filter((i) => i.kind === k).length
    const tours = by('tour')
    const lines = [
        `📊 RealEVR status`,
        `People: ${c.users}${c.newUsers24h ? ` (+${c.newUsers24h} in 24h)` : ''}. Homes live: ${c.live} of ${c.properties}.`,
        items.length ? `Needs you: ${items.length - tours} item(s)${tours ? `, plus ${tours} tour(s) not loading` : ''}.` : '✅ Nothing is waiting for you.',
    ]
    if (by('partner')) lines.push(`• Partner applications: ${by('partner')}`)
    if (by('crypto')) lines.push(`• Bitcoin buyers: ${by('crypto')}`)
    if (by('data')) lines.push(`• Data requests: ${by('data')}`)
    if (by('chat')) lines.push(`• Visitors asking for a person: ${by('chat')}`)
    if (by('bidder')) lines.push(`• Bidders to vet (dashboard): ${by('bidder')}`)
    if (by('payout')) lines.push(`• Payouts (dashboard): ${by('payout')}`)
    const un = unmatchedPayments().length
    if (un) lines.push(`• Payment messages not matched to anyone: ${un}`)
    if (items.length) lines.push('', 'Send PENDING to see them.')
    return lines.join('\n')
}

function ago(iso?: string): string {
    const h = hoursSince(iso)
    if (!iso) return ''
    return h < 1 ? 'just now' : h < 24 ? `${Math.floor(h)}h ago` : `${Math.floor(h / 24)}d ago`
}

export function pendingText(items = pendingItems()): string {
    if (!items.length) return '✅ Nothing is waiting for you.'
    const lines = ['📋 Waiting for you', '']
    for (const i of items.slice(0, 25)) lines.push(`${i.code} ${i.title}${i.since ? ` · ${ago(i.since)}` : ''}${i.here ? '' : ' · dashboard'}`)
    if (items.length > 25) lines.push(`…and ${items.length - 25} more`)
    lines.push('', 'SHOW P12 for details · APPROVE P12 · REJECT P12 reason')
    return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export const HELP = [
    '👋 I am your RealEVR assistant. You can type or send a voice note.',
    '',
    'STATUS · PENDING · PAYMENTS',
    'SHOW P12 (details of any item in PENDING)',
    'APPROVE P12 · REJECT P12 <reason> · MORE P12 <what is missing>',
    'C3 CONTACTED / ESCROW / DONE / DECLINED (Bitcoin buyers)',
    'D5 VERIFYING / DONE / REFUSED (data requests)',
    'REPLY E8 <message> · RESOLVE E8 (visitors asking for a person)',
    'CHECK TOURS · AUTOPILOT ON/OFF · DIGEST ON/OFF/8',
    '',
    'Or just ask me anything about the platform.',
    'Changes ask you to reply YES first.',
].join('\n')

interface Pending {
    description: string
    run: () => Promise<string>
    expires: number
}
const confirmations = new Map<string, Pending>()
const CONFIRM_MS = 10 * 60_000

export function ownerPin(): string {
    return (process.env.OWNER_WHATSAPP_PIN || '').trim()
}

function askToConfirm(phone: string, description: string, run: () => Promise<string>): string {
    confirmations.set(digits(phone), { description, run, expires: Date.now() + CONFIRM_MS })
    const pin = ownerPin()
    return `${description}\n\nReply ${pin ? 'YES <your pin>' : 'YES'} to do it, or NO to cancel (valid 10 minutes).`
}

async function adminUserId(): Promise<number> {
    const users = await storage.getAllUsers().catch(() => [] as any[])
    return (users.find((u: any) => u.role === 'admin') as any)?.id ?? 0
}

function findItem(code: string): Item | undefined {
    return pendingItems().find((i) => i.code.toLowerCase() === code.toLowerCase())
}

const CODE = '([pcdeb]\\d+|t\\d+|w[lsr]\\d+)'

async function approvePartner(id: number): Promise<string> {
    const { decidePartnerApplication } = await import('./partner-program')
    const a = rows('gene_partner_apps').find((x) => x.id === id) as any
    if (!a) return `I can't find P${id}.`
    if (a.status === 'approved') return `P${id} is already approved.`
    const out = await decidePartnerApplication(a, { decision: 'approve', publicListing: true }, await adminUserId())
    return out.ok ? `✅ Approved ${a.organisation}. They have been told by email and in their account.` : `Could not approve: ${out.message}`
}

async function decidePartnerText(id: number, decision: 'reject' | 'request_more', note: string): Promise<string> {
    const { decidePartnerApplication } = await import('./partner-program')
    const a = rows('gene_partner_apps').find((x) => x.id === id) as any
    if (!a) return `I can't find P${id}.`
    const out = await decidePartnerApplication(a, { decision, note }, await adminUserId())
    return out.ok ? `✅ ${decision === 'reject' ? 'Refused' : 'Asked for more from'} ${a.organisation}. They have been told.` : `Could not do that: ${out.message}`
}

const CRYPTO_WORDS: Record<string, string> = { contacted: 'contacted', contact: 'contacted', escrow: 'escrow', done: 'completed', complete: 'completed', completed: 'completed', declined: 'declined', decline: 'declined', refused: 'declined' }
const DATA_WORDS: Record<string, string> = { verifying: 'verifying', verify: 'verifying', working: 'in_progress', progress: 'in_progress', done: 'completed', complete: 'completed', completed: 'completed', refused: 'refused', refuse: 'refused' }

export async function handleOwnerText(phone: string, raw: string): Promise<string> {
    const text = raw.trim()
    const t = text.toLowerCase().replace(/[.!]+$/, '')
    const settings = getOwnerSettings()
    settings.lastOwnerMessageAt = nowIso()
    saveOwnerSettings(settings)

    // Confirmation answers
    const key = digits(phone)
    const waiting = confirmations.get(key)
    const yes = /^(yes|y|confirm|ok|okay|do it)(\s+(\S+))?$/i.exec(t)
    if (yes || /^(no|n|cancel|stop)$/.test(t)) {
        if (!waiting || waiting.expires < Date.now()) {
            confirmations.delete(key)
            return yes ? 'There is nothing waiting for your yes. Send PENDING to see what needs you.' : 'Okay.'
        }
        if (!yes) {
            confirmations.delete(key)
            return 'Cancelled. Nothing was changed.'
        }
        const pin = ownerPin()
        if (pin && (yes[3] ?? '') !== pin) return 'Please reply YES followed by your pin, for example "YES 1234". Or NO to cancel.'
        confirmations.delete(key)
        try {
            return await waiting.run()
        } catch (err) {
            console.error('[owner-assistant] action failed:', err)
            return 'That did not work: something went wrong on the server. Nothing was half-done that I know of; check the dashboard.'
        }
    }

    if (/^(help|menu|\?|hi|hello|hey|start)$/.test(t)) return HELP
    if (/^(status|today|summary|overview|report|how are we doing|how is it going)$/.test(t)) return statusText()
    if (/^(pending|queue|todo|to do|what needs me|waiting|inbox)$/.test(t)) return pendingText()

    if (/^(payments?|money)$/.test(t)) {
        const un = unmatchedPayments()
        const items = pendingItems().filter((i) => i.kind === 'payout')
        const lines = [`💰 Payments`, un.length ? `${un.length} payment message(s) did not match anyone. Open Admin > Payments to match or ignore them.` : 'Every payment message has been matched or ignored.']
        if (items.length) lines.push(`${items.length} payout(s) are waiting for you on the dashboard.`)
        return lines.join('\n')
    }

    let m = new RegExp(`^(?:show|open|view|details?)\\s+${CODE}$`, 'i').exec(t) || new RegExp(`^${CODE}$`, 'i').exec(t)
    if (m) {
        const i = findItem(m[1])
        return i ? `${i.code} ${i.title}\n\n${i.detail}${i.here ? '' : '\n\nThis one is handled on the dashboard.'}` : `I can't find ${m[1].toUpperCase()}. Send PENDING for the list.`
    }

    m = /^approve\s+p(\d+)$/i.exec(t)
    if (m) {
        const id = Number(m[1])
        const i = findItem(`P${id}`)
        if (!i) return `I can't find P${id}. It may already be decided. Send PENDING.`
        if (!i.here) return `${i.title} is a bank partner, so approve it on the dashboard where you can read its licence documents.`
        return askToConfirm(phone, `Approve partner application P${id}?\n${i.title}\n${i.detail}`, () => approvePartner(id))
    }
    m = /^(?:reject|refuse|decline)\s+p(\d+)\s+(.{5,})$/i.exec(text)
    if (m) {
        const id = Number(m[1])
        const note = m[2].trim()
        if (!findItem(`P${id}`)) return `I can't find P${id}.`
        return askToConfirm(phone, `Refuse partner application P${id} and tell them: "${note}"?`, () => decidePartnerText(id, 'reject', note))
    }
    if (/^(?:reject|refuse|decline)\s+p\d+$/i.test(t)) return 'Add the reason, which the applicant will see. For example: REJECT P12 We could not verify your registration.'
    m = /^more\s+p(\d+)\s+(.{5,})$/i.exec(text)
    if (m) {
        const id = Number(m[1])
        const note = m[2].trim()
        if (!findItem(`P${id}`)) return `I can't find P${id}.`
        return askToConfirm(phone, `Ask the applicant of P${id} for more: "${note}"?`, () => decidePartnerText(id, 'request_more', note))
    }

    m = /^c(\d+)\s+(\w+)$/i.exec(t)
    if (m && CRYPTO_WORDS[m[2]]) {
        const id = Number(m[1])
        const status = CRYPTO_WORDS[m[2]]
        if (!findItem(`C${id}`) && !rows('gene_crypto_requests').find((r) => r.id === id)) return `I can't find C${id}.`
        return askToConfirm(phone, `Mark Bitcoin buyer request C${id} as "${status}"?`, async () => {
            const { setCryptoRequestStatus } = await import('./crypto-buy')
            return setCryptoRequestStatus(id, status) ? `✅ C${id} is now "${status}".` : `I can't find C${id}.`
        })
    }

    m = /^d(\d+)\s+(\w+)(?:\s+(.{3,}))?$/i.exec(text)
    if (m && DATA_WORDS[m[2].toLowerCase()]) {
        const id = Number(m[1])
        const status = DATA_WORDS[m[2].toLowerCase()]
        if (!rows('gene_data_requests').find((r) => r.id === id)) return `I can't find D${id}.`
        return askToConfirm(phone, `Mark data request D${id} as "${status}"?`, async () => {
            const { setDataRequestStatus } = await import('./data-requests')
            return setDataRequestStatus(id, status, m![3]) ? `✅ D${id} is now "${status}".` : `I can't find D${id}.`
        })
    }

    m = /^reply\s+e(\d+)\s+(.{2,})$/i.exec(text)
    if (m) {
        const id = Number(m[1])
        const message = m[2].trim()
        const e = rows('gene_escalations').find((x) => x.id === id)
        if (!e) return `I can't find E${id}.`
        if (!e.customerPhone) return `E${id} did not leave a phone number, so I can't message them. They are on the website chat only.`
        return askToConfirm(phone, `Send this to the visitor of E${id} (${e.customerPhone}) on WhatsApp?\n\n"${message}"`, async () => {
            const sent = await sendWhatsAppMessage(String(e.customerPhone), message)
            if (!sent.sent) return `I could not send it: ${sent.reason ?? 'WhatsApp is not available'}. Their number is ${e.customerPhone}.`
            const all = rows('gene_escalations')
            const row = all.find((x) => x.id === id)
            if (row) {
                row.status = 'in_progress'
                row.assignedTo = 'owner (WhatsApp)'
                row.assignedAt = nowIso()
                writeCollection('gene_escalations', all)
            }
            return `✅ Sent to ${e.customerPhone}. E${id} is marked in progress.`
        })
    }
    m = /^resolve\s+e(\d+)(?:\s+(.{2,}))?$/i.exec(text)
    if (m) {
        const id = Number(m[1])
        if (!rows('gene_escalations').find((x) => x.id === id)) return `I can't find E${id}.`
        return askToConfirm(phone, `Mark E${id} as resolved?`, async () => {
            const all = rows('gene_escalations')
            const row = all.find((x) => x.id === id)
            if (!row) return `I can't find E${id}.`
            row.status = 'resolved'
            row.resolvedAt = nowIso()
            if (m![2]) row.resolutionNote = m![2]
            writeCollection('gene_escalations', all)
            return `✅ E${id} is resolved.`
        })
    }

    if (/^(check tours?|tours?|tour health)$/.test(t)) {
        const failing = pendingItems().filter((i) => i.kind === 'tour')
        void import('./tour-health').then((m2) => m2.runTourHealth()).catch((err) => console.error('[owner-assistant] tour check failed:', err))
        return failing.length ? `🔎 Checking every tour now. Last known: ${failing.length} not loading (${failing.slice(0, 3).map((f) => f.title.replace('Tour not loading: ', '')).join(', ')}). I will message you if anything changed.` : '🔎 Checking every tour now. Last known: all loading. I will message you if anything changed.'
    }

    m = /^autopilot(?:\s+(on|off|status))?$/i.exec(t)
    if (m) {
        const s = getOwnerSettings()
        const word = (m[1] ?? 'status').toLowerCase()
        if (word === 'status') return `Autopilot for partner applications is ${s.autopilot.partners ? 'ON' : 'OFF'}.\nWhen on, I approve non-bank applications by myself only if the website matches the email domain, it is not a free mail address, and a registration or licence number is given. Banks and anything else always come to you.\nSend AUTOPILOT ON or AUTOPILOT OFF.`
        const on = word === 'on'
        return askToConfirm(phone, on ? 'Switch AUTOPILOT ON? I will approve clear-cut non-bank partner applications by myself and tell you each time.' : 'Switch AUTOPILOT OFF? Every application will come to you.', async () => {
            const cur = getOwnerSettings()
            cur.autopilot.partners = on
            saveOwnerSettings(cur)
            return `✅ Autopilot is ${on ? 'ON' : 'OFF'}.`
        })
    }

    m = /^digest(?:\s+(on|off|\d{1,2}))?$/i.exec(t)
    if (m) {
        const s = getOwnerSettings()
        const arg = (m[1] ?? '').toLowerCase()
        if (!arg) return `Your morning digest is ${s.digest.enabled ? `ON at ${String(s.digest.hour).padStart(2, '0')}:00 East Africa time` : 'OFF'}.\nSend DIGEST ON, DIGEST OFF, or DIGEST 8 to change the hour.`
        if (arg === 'on' || arg === 'off') {
            s.digest.enabled = arg === 'on'
            saveOwnerSettings(s)
            return `✅ Morning digest is ${arg.toUpperCase()}.`
        }
        const hour = Number(arg)
        if (hour < 0 || hour > 23) return 'Give an hour from 0 to 23, East Africa time.'
        s.digest.hour = hour
        s.digest.enabled = true
        saveOwnerSettings(s)
        return `✅ I will send the digest at ${String(hour).padStart(2, '0')}:00 East Africa time every day.`
    }

    // Anything else: a question. Read-only, from a live snapshot.
    return askAboutPlatform(text)
}

async function askAboutPlatform(question: string): Promise<string> {
    try {
        const { getAiReply } = await import('./ai-provider')
        const snap = `${await statusText()}\n\n${pendingText()}\n\nAutopilot: ${getOwnerSettings().autopilot.partners ? 'on' : 'off'}.`
        const ai = await getAiReply(
            [
                'You are the operations assistant of RealEVR Estates, a property platform, talking on WhatsApp to its owner.',
                'Answer in a few short plain sentences. No markdown headings. You can only read: you cannot change anything yourself.',
                'If the owner wants something done, tell them the exact command to send (for example APPROVE P12, C3 CONTACTED, CHECK TOURS, AUTOPILOT ON).',
                'Use only the snapshot below. If it does not contain the answer, say so; never invent numbers.',
                '',
                'Snapshot:',
                snap,
            ].join('\n'),
            question
        )
        if (ai?.reply) return ai.reply.slice(0, 1500)
    } catch (err) {
        console.error('[owner-assistant] AI answer failed:', err)
    }
    return `I did not understand that. Send HELP to see what I can do.\n\n${await statusText()}`
}

// ---------------------------------------------------------------------------
// Voice notes
// ---------------------------------------------------------------------------

export async function transcribeOwnerAudio(audio: Buffer, contentType: string): Promise<string | null> {
    const { hear } = await import('./speech-providers')
    const seconds = Math.min(60, Math.max(2, Math.round(audio.length / 3000)))
    const heard = await hear(audio, contentType || 'audio/ogg', undefined, seconds)
    return heard?.text?.trim() || null
}

export async function handleOwnerAudio(phone: string, audio: Buffer, contentType: string): Promise<void> {
    const said = await transcribeOwnerAudio(audio, contentType).catch((err) => {
        console.error('[owner-assistant] could not transcribe the voice note:', err)
        return null
    })
    if (!said) {
        await reply(phone, "🎙 I couldn't make out that voice note (or voice isn't set up yet: it needs ELEVENLABS_API_KEY or GROQ_API_KEY). Please type it.")
        return
    }
    const answer = await handleOwnerText(phone, said)
    await reply(phone, `🎙 I heard: “${said.slice(0, 300)}”\n\n${answer}`)
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

/** WhatsApp text messages top out near 4,096 characters; split on line breaks well below that. */
export function chunk(text: string, max = 3500): string[] {
    if (text.length <= max) return [text]
    const out: string[] = []
    let cur = ''
    for (const line of text.split('\n')) {
        if ((cur + '\n' + line).length > max && cur) {
            out.push(cur)
            cur = line
        } else cur = cur ? `${cur}\n${line}` : line
    }
    if (cur) out.push(cur)
    return out
}

async function reply(phone: string, text: string): Promise<void> {
    for (const part of chunk(text)) await sendWhatsAppMessage(phone, part)
}

/** Entry point for the webhook: a verified text message from an owner number. */
export async function ownerSays(phone: string, text: string): Promise<void> {
    let answer: string
    try {
        answer = await handleOwnerText(phone, text)
    } catch (err) {
        console.error('[owner-assistant] could not handle the message:', err)
        answer = 'Something went wrong on my side. Please try again, or use the dashboard.'
    }
    logOwner(phone, text, answer)
    await reply(phone, answer)
}

function logOwner(phone: string, said: string, answer: string) {
    const all = readCollection<Row>(C_LOG)
    all.push({ id: nextId(all as any), at: nowIso(), phoneEnd: digits(phone).slice(-4), said: said.slice(0, 300), answered: answer.slice(0, 300) })
    writeCollection(C_LOG, all.slice(-200))
}

// ---------------------------------------------------------------------------
// Digest and autopilot
// ---------------------------------------------------------------------------

/** East Africa Time is UTC+3 all year. */
export function eat(now = new Date()): { hour: number; date: string } {
    const t = new Date(now.getTime() + 3 * 3_600_000)
    return { hour: t.getUTCHours(), date: t.toISOString().slice(0, 10) }
}

export async function digestText(): Promise<string> {
    const items = pendingItems()
    const old = items.filter((i) => hoursSince(i.since) > 48 && i.kind !== 'tour')
    const lines = [`☀️ Good morning. Your RealEVR digest`, '', (await statusText()).split('\n').slice(1).join('\n')]
    if (old.length) lines.push('', `⏰ Waiting more than 2 days: ${old.slice(0, 5).map((i) => i.code).join(', ')}${old.length > 5 ? '…' : ''}`)
    const s = getOwnerSettings()
    lines.push('', `Autopilot ${s.autopilot.partners ? 'ON' : 'OFF'}. Reply to this message to keep WhatsApp open for tomorrow's alerts.`)
    return lines.join('\n')
}

export async function sendToOwners(text: string): Promise<void> {
    for (const n of await ownerNumbers()) await reply(n, text)
}

export interface AutopilotResult {
    approved: Array<{ id: number; organisation: string }>
    left: number
}

/** Approve the clear-cut, non-bank partner applications. Everything else stays for the owner. */
export async function runAutopilot(): Promise<AutopilotResult> {
    const out: AutopilotResult = { approved: [], left: 0 }
    if (!getOwnerSettings().autopilot.partners) return out
    const { decidePartnerApplication } = await import('./partner-program')
    const by = await adminUserId()
    for (const a of rows('gene_partner_apps') as any[]) {
        if (a.status !== 'received') continue
        const s = a.signals ?? {}
        const clear = a.role !== 'bank' && s.domainMatchesWebsite && !s.freeMail && (s.hasRegistration || s.hasLicence) && (a.feeStatus === 'none' || a.feeStatus === 'confirmed')
        if (!clear) {
            out.left++
            continue
        }
        const r = await decidePartnerApplication(a, { decision: 'approve', publicListing: true }, by)
        if (r.ok) out.approved.push({ id: a.id, organisation: a.organisation })
        else out.left++
    }
    return out
}

export async function tick(now = new Date()): Promise<void> {
    const ap = await runAutopilot().catch((err) => {
        console.error('[owner-assistant] autopilot failed:', err)
        return null
    })
    if (ap?.approved.length) {
        await sendToOwners(`🤖 Autopilot approved ${ap.approved.length} partner application(s):\n${ap.approved.map((a) => `• P${a.id} ${a.organisation}`).join('\n')}${ap.left ? `\n${ap.left} more need you (PENDING).` : ''}`)
    }
    const s = getOwnerSettings()
    const t = eat(now)
    if (s.digest.enabled && t.hour === s.digest.hour && s.lastDigestOn !== t.date) {
        s.lastDigestOn = t.date
        saveOwnerSettings(s)
        await sendToOwners(await digestText())
    }
}

let started = false
export function startOwnerAssistantService(): void {
    if (started) return
    started = true
    restoreOwnerAssistant().catch(() => {})
    cron.schedule('*/15 * * * *', () => {
        tick().catch((err) => console.error('[owner-assistant] tick failed:', err))
    })
}
