/**
 * GENE Platform — Team 4: draft-then-approve marketing content queue.
 *
 * SCOPE (read before extending): this module gets marketing content
 * (blog/social/email copy) from "drafted" to "approved and ready for a human
 * to actually publish." It deliberately does NOT integrate with any real
 * social-media, CMS, or email-sending API — actually posting/publishing
 * requires real platform credentials (Meta/X/LinkedIn app tokens, an ESP API
 * key, a CMS webhook, etc.) that this pass doesn't have. Once a draft is
 * `approved`, a human still has to go post/send it themselves; this module's
 * job ends at "queued and approved," per the "draft-then-approve queue
 * automation" deliverable.
 *
 * APPROVAL POLICY: content is customer-facing by definition (it goes out
 * under the brand's voice to real prospects/customers), so per the
 * platform-wide rule (see `ApprovalGate` in ./types) every draft is created
 * with `requiresHumanApproval: true` and `status: 'pending'`. There is no
 * auto-approve path in v1 — full autonomy here is something to earn later,
 * not default to at launch.
 *
 * Persistence: shared JSON-file collection store (see ./store.ts), collection
 * `gene_content_drafts`. No DynamoDB, no new deps.
 */
import type { Express, Request, Response, RequestHandler } from 'express'
import { readCollection, writeCollection, nextId, nowIso } from './store'
import type { ApprovalGate } from './types'

const COLLECTION = 'gene_content_drafts'

export type ContentChannel = 'blog' | 'social' | 'email'
const VALID_CHANNELS: ContentChannel[] = ['blog', 'social', 'email']

export interface GeneContentDraft {
    id: number
    title: string
    body: string
    channel: ContentChannel
    scheduledFor?: string
    approval: ApprovalGate
    createdAt: string
    updatedAt: string
    createdBy?: string
}

function currentActor(req: Request): string | undefined {
    const user = req.user as { username?: string; email?: string } | undefined
    return user?.username ?? user?.email
}

function isValidChannel(value: unknown): value is ContentChannel {
    return typeof value === 'string' && (VALID_CHANNELS as string[]).includes(value)
}

export function registerContentPromotionRoutes(app: Express, adminMiddleware: RequestHandler): void {
    // POST /api/gene/content/drafts [ADMIN] — create a draft. Always starts pending approval.
    app.post('/api/gene/content/drafts', adminMiddleware, (req: Request, res: Response) => {
        try {
            const { title, body, channel, scheduledFor } = req.body ?? {}

            if (typeof title !== 'string' || !title.trim()) {
                return res.status(400).json({ message: 'title is required' })
            }
            if (typeof body !== 'string' || !body.trim()) {
                return res.status(400).json({ message: 'body is required' })
            }
            if (!isValidChannel(channel)) {
                return res.status(400).json({ message: `channel must be one of: ${VALID_CHANNELS.join(', ')}` })
            }
            if (scheduledFor !== undefined && typeof scheduledFor !== 'string') {
                return res.status(400).json({ message: 'scheduledFor must be an ISO date string if provided' })
            }

            const rows = readCollection<GeneContentDraft>(COLLECTION)
            const now = nowIso()
            const record: GeneContentDraft = {
                id: nextId(rows),
                title: title.trim(),
                body,
                channel,
                scheduledFor,
                // Content is customer-facing — no auto-approve path in v1 (see module
                // header). Every draft lands here regardless of channel or author.
                approval: { requiresHumanApproval: true, status: 'pending' },
                createdAt: now,
                updatedAt: now,
                createdBy: currentActor(req),
            }
            rows.push(record)
            writeCollection(COLLECTION, rows)
            res.status(201).json(record)
        } catch (error: any) {
            console.error('[gene/content-promotion] create draft failed:', error)
            res.status(500).json({ message: 'Failed to create content draft' })
        }
    })

    // GET /api/gene/content/drafts?status= [ADMIN] — list, optional filter by approval.status.
    app.get('/api/gene/content/drafts', adminMiddleware, (req: Request, res: Response) => {
        try {
            const rows = readCollection<GeneContentDraft>(COLLECTION)
            const status = typeof req.query.status === 'string' ? req.query.status : undefined
            const filtered = status ? rows.filter((r) => r.approval.status === status) : rows
            res.json(filtered)
        } catch (error: any) {
            console.error('[gene/content-promotion] list drafts failed:', error)
            res.status(500).json({ message: 'Failed to list content drafts' })
        }
    })

    // POST /api/gene/content/drafts/:id/approve [ADMIN]
    app.post('/api/gene/content/drafts/:id/approve', adminMiddleware, (req: Request, res: Response) => {
        try {
            const id = Number(req.params.id)
            if (Number.isNaN(id)) {
                return res.status(400).json({ message: 'Invalid id' })
            }

            const rows = readCollection<GeneContentDraft>(COLLECTION)
            const idx = rows.findIndex((r) => r.id === id)
            if (idx === -1) {
                return res.status(404).json({ message: 'Content draft not found' })
            }

            rows[idx].approval = {
                requiresHumanApproval: true,
                status: 'approved',
                approvedBy: currentActor(req) ?? 'unknown-admin',
                approvedAt: nowIso(),
            }
            rows[idx].updatedAt = nowIso()
            writeCollection(COLLECTION, rows)
            // Approval means the draft is ready for a human to actually publish it
            // through the real channel (social/CMS/ESP) — this module does not do
            // that step itself. See module header.
            res.json(rows[idx])
        } catch (error: any) {
            console.error('[gene/content-promotion] approve draft failed:', error)
            res.status(500).json({ message: 'Failed to approve content draft' })
        }
    })

    // POST /api/gene/content/drafts/:id/reject [ADMIN]
    app.post('/api/gene/content/drafts/:id/reject', adminMiddleware, (req: Request, res: Response) => {
        try {
            const id = Number(req.params.id)
            if (Number.isNaN(id)) {
                return res.status(400).json({ message: 'Invalid id' })
            }

            const rows = readCollection<GeneContentDraft>(COLLECTION)
            const idx = rows.findIndex((r) => r.id === id)
            if (idx === -1) {
                return res.status(404).json({ message: 'Content draft not found' })
            }

            rows[idx].approval = { requiresHumanApproval: true, status: 'rejected' }
            rows[idx].updatedAt = nowIso()
            writeCollection(COLLECTION, rows)
            res.json(rows[idx])
        } catch (error: any) {
            console.error('[gene/content-promotion] reject draft failed:', error)
            res.status(500).json({ message: 'Failed to reject content draft' })
        }
    })
}
