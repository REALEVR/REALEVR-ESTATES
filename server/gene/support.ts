/**
 * GENE Platform — Team 4: tier-1 support macros + escalation routing.
 *
 * OWNERSHIP BOUNDARY (read before editing either file): the `gene_escalations`
 * collection is written/owned by Team 2's `./whatsapp.ts` (its escalation
 * intake + WhatsApp human-handoff flow), and is also written to by Team 1's
 * `./chat.ts` whenever the bot escalates a low-confidence reply or an
 * explicit human-handoff request — see the `GeneEscalation` shape exported
 * from `./chat.ts`, which this file imports rather than redefining. This
 * module is READ-ONLY against that collection: it surfaces open escalations
 * to a tier-1 agent and lets them log how they resolved one, but it never
 * changes `status` on an escalation record itself. Marking an escalation
 * `resolved`/`assigned` is Team 2's `whatsapp.ts`'s job — do not duplicate
 * that write path here, to avoid two modules racing to write the same row.
 *
 * Persistence: shared JSON-file collection store (see ./store.ts).
 * Collections owned by this file: `gene_support_macros`, `gene_resolution_log`.
 * Collection read (not owned) by this file: `gene_escalations`.
 */
import type { Express, Request, Response, RequestHandler } from 'express'
import { readCollection, writeCollection, nextId, nowIso } from './store'
import type { GeneEscalation } from './chat'

const MACROS_COLLECTION = 'gene_support_macros'
const RESOLUTION_LOG_COLLECTION = 'gene_resolution_log'
const ESCALATIONS_COLLECTION = 'gene_escalations'

export interface GeneSupportMacro {
    id: number
    title: string
    body: string
    tags: string[]
    createdAt: string
}

export interface GeneResolutionLogEntry {
    id: number
    escalationId: number
    macroUsedId?: number
    resolvedBy: string
    resolutionSummary: string
    createdAt: string
}

// Starter macros — real, usable tier-1 answers for a real-estate platform,
// seeded on first read so the endpoint is useful immediately rather than
// returning an empty list until someone manually populates it.
const STARTER_MACROS: Array<Omit<GeneSupportMacro, 'id' | 'createdAt'>> = [
    {
        title: 'How to schedule a viewing',
        body:
            "To schedule a viewing: open the property listing and click \"Book a Viewing\" (or \"Schedule Tour\"). " +
            'Pick a date/time that works for you and submit the request — the listing agent will confirm by email ' +
            'or in-app notification, usually within one business day. If you need a same-day viewing, mention that ' +
            'in the request notes and we will do our best to accommodate it. You can also take the virtual 360° ' +
            'tour first (no booking required) to narrow down which properties are worth an in-person visit.',
        tags: ['viewing', 'booking', 'scheduling'],
    },
    {
        title: 'Refund policy for virtual tour payments',
        body:
            'Virtual tour access payments are refundable within 24 hours of purchase if the tour failed to load or ' +
            'was materially different from the listed property (e.g. wrong unit, tour taken down). To request a ' +
            'refund, share the transaction ID and property listing link with support, and briefly describe the ' +
            "issue. Refunds are not issued simply because a buyer changed their mind after viewing a tour that " +
            'loaded correctly and matched the listing — that is treated as a completed service. Approved refunds ' +
            'are returned to the original payment method and typically post within 5-10 business days.',
        tags: ['refund', 'payments', 'virtual-tour', 'billing'],
    },
    {
        title: 'How to list a property as an agent',
        body:
            'Agents list a property by creating/upgrading to an agent account, then using "Add Property" from the ' +
            'agent dashboard. You will need: property address, category, price, bedrooms/bathrooms, square meters, ' +
            'at least one high-quality photo, and (recommended) a 360° virtual tour upload for higher engagement. ' +
            'New listings go live immediately but may be reviewed for accuracy; listings with mismatched or missing ' +
            'details can be flagged and temporarily hidden until corrected. You can edit price/availability at any ' +
            'time from "My Properties."',
        tags: ['agent', 'listing', 'onboarding'],
    },
    {
        title: 'Property showing as unavailable but should be active',
        body:
            'If a listing shows "unavailable" but the agent believes it should be active, first check "My Properties" ' +
            '-> the listing -> confirm the availability toggle is on. If it is already on and the public page still ' +
            'shows unavailable, this is usually a caching delay (can take a few minutes) — ask the agent to hard-refresh. ' +
            'If it persists past 30 minutes, escalate to engineering with the property ID and a screenshot.',
        tags: ['listing', 'availability', 'bug', 'agent'],
    },
]

function seedMacrosIfEmpty(): GeneSupportMacro[] {
    const rows = readCollection<GeneSupportMacro>(MACROS_COLLECTION)
    if (rows.length > 0) return rows
    const now = nowIso()
    const seeded: GeneSupportMacro[] = STARTER_MACROS.map((m, i) => ({
        id: i + 1,
        ...m,
        createdAt: now,
    }))
    writeCollection(MACROS_COLLECTION, seeded)
    return seeded
}

function currentActor(req: Request): string {
    const user = req.user as { username?: string; email?: string } | undefined
    return user?.username ?? user?.email ?? 'unknown-agent'
}

export function registerSupportRoutes(app: Express, adminMiddleware: RequestHandler): void {
    // GET /api/gene/support/macros?tag= [ADMIN] — list/search macros.
    // Gated behind adminMiddleware for simplicity in v1 (tier-1 staff are the
    // only intended consumers today); nothing here is sensitive if opened up later.
    app.get('/api/gene/support/macros', adminMiddleware, (req: Request, res: Response) => {
        try {
            const rows = seedMacrosIfEmpty()
            const tag = typeof req.query.tag === 'string' ? req.query.tag.toLowerCase() : undefined
            const filtered = tag ? rows.filter((m) => m.tags.some((t) => t.toLowerCase() === tag)) : rows
            res.json(filtered)
        } catch (error: any) {
            console.error('[gene/support] list macros failed:', error)
            res.status(500).json({ message: 'Failed to list support macros' })
        }
    })

    // POST /api/gene/support/macros [ADMIN] — create a macro.
    app.post('/api/gene/support/macros', adminMiddleware, (req: Request, res: Response) => {
        try {
            const { title, body, tags } = req.body ?? {}
            if (typeof title !== 'string' || !title.trim()) {
                return res.status(400).json({ message: 'title is required' })
            }
            if (typeof body !== 'string' || !body.trim()) {
                return res.status(400).json({ message: 'body is required' })
            }
            const normalizedTags =
                Array.isArray(tags) && tags.every((t) => typeof t === 'string') ? (tags as string[]) : []

            const rows = seedMacrosIfEmpty()
            const record: GeneSupportMacro = {
                id: nextId(rows),
                title: title.trim(),
                body,
                tags: normalizedTags,
                createdAt: nowIso(),
            }
            rows.push(record)
            writeCollection(MACROS_COLLECTION, rows)
            res.status(201).json(record)
        } catch (error: any) {
            console.error('[gene/support] create macro failed:', error)
            res.status(500).json({ message: 'Failed to create support macro' })
        }
    })

    // GET /api/gene/support/escalations [ADMIN] — thin read-through of the
    // shared `gene_escalations` collection, filtered to ones a tier-1 agent
    // should still be looking at (i.e. not yet resolved). This never writes
    // to that collection — see module header.
    app.get('/api/gene/support/escalations', adminMiddleware, (_req: Request, res: Response) => {
        try {
            const rows = readCollection<GeneEscalation>(ESCALATIONS_COLLECTION)
            const forTier1 = rows.filter((e) => e.status !== 'resolved')
            res.json(forTier1)
        } catch (error: any) {
            console.error('[gene/support] list escalations failed:', error)
            res.status(500).json({ message: 'Failed to list escalations' })
        }
    })

    // POST /api/gene/support/escalations/:id/log-resolution [ADMIN]
    // Records how an agent resolved an escalation. Deliberately does NOT
    // change the escalation's own `status` field — that write belongs to
    // Team 2's `./whatsapp.ts` resolve route. This is purely an audit log of
    // tier-1 activity.
    app.post('/api/gene/support/escalations/:id/log-resolution', adminMiddleware, (req: Request, res: Response) => {
        try {
            const escalationId = Number(req.params.id)
            if (Number.isNaN(escalationId)) {
                return res.status(400).json({ message: 'Invalid escalation id' })
            }

            const escalations = readCollection<GeneEscalation>(ESCALATIONS_COLLECTION)
            const escalationExists = escalations.some((e) => e.id === escalationId)
            if (!escalationExists) {
                return res.status(404).json({ message: 'Escalation not found' })
            }

            const { macroUsedId, resolutionSummary } = req.body ?? {}
            if (typeof resolutionSummary !== 'string' || !resolutionSummary.trim()) {
                return res.status(400).json({ message: 'resolutionSummary is required' })
            }
            let normalizedMacroUsedId: number | undefined
            if (macroUsedId !== undefined) {
                const parsed = Number(macroUsedId)
                if (Number.isNaN(parsed)) {
                    return res.status(400).json({ message: 'macroUsedId must be a number if provided' })
                }
                normalizedMacroUsedId = parsed
            }

            const rows = readCollection<GeneResolutionLogEntry>(RESOLUTION_LOG_COLLECTION)
            const record: GeneResolutionLogEntry = {
                id: nextId(rows),
                escalationId,
                macroUsedId: normalizedMacroUsedId,
                resolvedBy: currentActor(req),
                resolutionSummary: resolutionSummary.trim(),
                createdAt: nowIso(),
            }
            rows.push(record)
            writeCollection(RESOLUTION_LOG_COLLECTION, rows)
            res.status(201).json(record)
        } catch (error: any) {
            console.error('[gene/support] log resolution failed:', error)
            res.status(500).json({ message: 'Failed to log resolution' })
        }
    })
}
