/**
 * GENE Platform — in-app messaging: real two-way conversations between a
 * prospective tenant/buyer and a listing's agent, and between an agent and
 * platform admins, plus a read-only view of WhatsApp conversations for
 * admins so nothing lives in two disconnected inboxes.
 *
 * This is distinct from two existing, older features that sound similar but
 * aren't the same thing:
 *  - server/gene/landlord-hub.ts's "Inbox" (GET /api/gene/landlord/inbox) is
 *    a read-only feed of interest *signals* (someone viewed/inquired about
 *    a property) plus a log of inbound WhatsApp texts — not a two-way
 *    conversation a landlord can reply into from the web.
 *  - server/gene/whatsapp-concierge.ts's message log
 *    (gene_whatsapp_messages) is WhatsApp-specific and already has its own
 *    send/receive path via the Cloud API. This module doesn't touch that
 *    persistence — the whatsapp-threads endpoint below only *reads* it, to
 *    surface it in the same inbox shape as everything else.
 *
 * Two conversation kinds:
 *  - 'tenant_agent': between whoever started it (any signed-in user) and a
 *    property's owner, optionally scoped to that property. Started with
 *    POST /messages/start.
 *  - 'agent_admin': one thread per agent, but "the admin side" isn't a
 *    single fixed second participant — any admin can read and reply to any
 *    agent's thread, the same shared-support-inbox pattern the escalations
 *    queue (server/gene/whatsapp.ts) already uses. Started with
 *    POST /messages/agent-admin/start.
 *
 * Persistence: shared JSON-file collection store (see ./store.ts).
 */
import type { Express, Request, Response, RequestHandler } from 'express'
import { readCollection, writeCollection, nextId, nowIso } from './store'
import { storage } from '../storage'

const CONVERSATIONS_COLLECTION = 'gene_conversations'
const MESSAGES_COLLECTION = 'gene_messages'
// Read-only source for the WhatsApp-threads endpoint — owned by
// whatsapp-concierge.ts, never written here.
const WHATSAPP_MESSAGE_COLLECTION = 'gene_whatsapp_messages'
const WHATSAPP_LINK_COLLECTION = 'gene_whatsapp_user_links'

export type ConversationKind = 'tenant_agent' | 'agent_admin'

export interface Conversation {
    id: number
    kind: ConversationKind
    propertyId?: number
    propertyTitle?: string
    /** For 'tenant_agent': [tenantId, agentId]. For 'agent_admin': [agentId]
     * only — see the file-top doc comment on why admin isn't a fixed second
     * participant. */
    participantIds: number[]
    participantNames: Record<number, string>
    createdAt: string
    updatedAt: string
    lastMessagePreview: string
}

export interface ConversationMessage {
    id: number
    conversationId: number
    senderId: number
    senderName: string
    body: string
    createdAt: string
}

function getAuthedUser(req: Request): { id: number; fullName?: string; username?: string; role?: string } | null {
    if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) return null
    return req.user as any
}

function displayName(user: { fullName?: string; username?: string }): string {
    return user.fullName || user.username || 'User'
}

/** True if `userId` may read/reply to this conversation — a participant on
 * a tenant_agent thread, or (participant OR any admin) on an agent_admin
 * thread. */
function canAccess(conversation: Conversation, userId: number, role?: string): boolean {
    if (conversation.participantIds.includes(userId)) return true
    if (conversation.kind === 'agent_admin' && role === 'admin') return true
    return false
}

function appendMessage(conversation: Conversation, senderId: number, senderName: string, body: string): ConversationMessage {
    const rows = readCollection<ConversationMessage>(MESSAGES_COLLECTION)
    const message: ConversationMessage = {
        id: nextId(rows),
        conversationId: conversation.id,
        senderId,
        senderName,
        body,
        createdAt: nowIso(),
    }
    rows.push(message)
    writeCollection(MESSAGES_COLLECTION, rows)

    const conversations = readCollection<Conversation>(CONVERSATIONS_COLLECTION)
    const idx = conversations.findIndex((c) => c.id === conversation.id)
    if (idx !== -1) {
        conversations[idx] = { ...conversations[idx], updatedAt: message.createdAt, lastMessagePreview: body.slice(0, 140) }
        writeCollection(CONVERSATIONS_COLLECTION, conversations)
    }
    return message
}

export function registerMessagingRoutes(app: Express, requireStrictAdmin: RequestHandler): void {
    // POST /api/gene/messages/start — [AUTH] start (or continue) a
    // tenant<->agent conversation about a property. `toUserId` is the
    // property's owner; if a conversation between this pair for this
    // property already exists, the message is appended to it instead of
    // creating a duplicate thread.
    app.post('/api/gene/messages/start', async (req: Request, res: Response) => {
        const me = getAuthedUser(req)
        if (!me) return res.status(401).json({ message: 'Sign in first.' })

        try {
            const { toUserId, propertyId, message } = req.body ?? {}
            const targetId = Number(toUserId)
            const text = typeof message === 'string' ? message.trim() : ''
            if (!Number.isFinite(targetId) || !text) {
                return res.status(400).json({ message: 'toUserId and a non-empty message are required.' })
            }
            if (targetId === me.id) {
                return res.status(400).json({ message: "You can't message yourself." })
            }

            const target = await storage.getUser(targetId)
            if (!target) return res.status(404).json({ message: 'That user was not found.' })

            let property: Awaited<ReturnType<typeof storage.getProperty>> | undefined
            const propId = propertyId !== undefined ? Number(propertyId) : undefined
            if (propId !== undefined && Number.isFinite(propId)) {
                property = await storage.getProperty(propId)
            }

            const conversations = readCollection<Conversation>(CONVERSATIONS_COLLECTION)
            const participantIds = [me.id, targetId].sort((a, b) => a - b)
            let conversation = conversations.find(
                (c) =>
                    c.kind === 'tenant_agent' &&
                    c.propertyId === propId &&
                    c.participantIds.length === 2 &&
                    c.participantIds[0] === participantIds[0] &&
                    c.participantIds[1] === participantIds[1]
            )

            if (!conversation) {
                conversation = {
                    id: nextId(conversations),
                    kind: 'tenant_agent',
                    propertyId: propId,
                    propertyTitle: property?.title,
                    participantIds,
                    participantNames: { [me.id]: displayName(me), [targetId]: displayName(target) },
                    createdAt: nowIso(),
                    updatedAt: nowIso(),
                    lastMessagePreview: '',
                }
                conversations.push(conversation)
                writeCollection(CONVERSATIONS_COLLECTION, conversations)
            }

            const sent = appendMessage(conversation, me.id, displayName(me), text)
            res.json({ conversation, message: sent })
        } catch (err: any) {
            console.error('[gene/messaging] start failed:', err)
            res.status(500).json({ message: 'Failed to start conversation.' })
        }
    })

    // POST /api/gene/messages/agent-admin/start — [AUTH, agent] one shared
    // support thread per agent; any admin can see and reply to it.
    app.post('/api/gene/messages/agent-admin/start', async (req: Request, res: Response) => {
        const me = getAuthedUser(req)
        if (!me) return res.status(401).json({ message: 'Sign in first.' })
        if (me.role !== 'agent' && me.role !== 'admin') {
            return res.status(403).json({ message: 'Only agents (or admins on their behalf) can start an admin support thread.' })
        }

        try {
            const { message, agentId } = req.body ?? {}
            const text = typeof message === 'string' ? message.trim() : ''
            if (!text) return res.status(400).json({ message: 'A non-empty message is required.' })

            // An admin can message a specific agent's thread on their behalf
            // (agentId in the body); an agent can only message their own.
            const ownerId = me.role === 'admin' && Number.isFinite(Number(agentId)) ? Number(agentId) : me.id

            const conversations = readCollection<Conversation>(CONVERSATIONS_COLLECTION)
            let conversation = conversations.find((c) => c.kind === 'agent_admin' && c.participantIds[0] === ownerId)

            if (!conversation) {
                const owner = me.role === 'admin' ? await storage.getUser(ownerId) : me
                conversation = {
                    id: nextId(conversations),
                    kind: 'agent_admin',
                    participantIds: [ownerId],
                    participantNames: { [ownerId]: owner ? displayName(owner) : `User #${ownerId}` },
                    createdAt: nowIso(),
                    updatedAt: nowIso(),
                    lastMessagePreview: '',
                }
                conversations.push(conversation)
                writeCollection(CONVERSATIONS_COLLECTION, conversations)
            }

            const sent = appendMessage(conversation, me.id, displayName(me), text)
            res.json({ conversation, message: sent })
        } catch (err: any) {
            console.error('[gene/messaging] agent-admin start failed:', err)
            res.status(500).json({ message: 'Failed to start conversation.' })
        }
    })

    // GET /api/gene/messages/conversations — [AUTH] every conversation the
    // caller can see: their own tenant_agent threads on either side, their
    // own agent_admin thread if they're an agent, or every agent_admin
    // thread if they're an admin.
    app.get('/api/gene/messages/conversations', (req: Request, res: Response) => {
        const me = getAuthedUser(req)
        if (!me) return res.status(401).json({ message: 'Sign in first.' })

        const conversations = readCollection<Conversation>(CONVERSATIONS_COLLECTION)
        const visible = conversations
            .filter((c) => canAccess(c, me.id, me.role))
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        res.json(visible)
    })

    // GET /api/gene/messages/conversations/:id/messages — [AUTH]
    app.get('/api/gene/messages/conversations/:id/messages', (req: Request, res: Response) => {
        const me = getAuthedUser(req)
        if (!me) return res.status(401).json({ message: 'Sign in first.' })

        const conversationId = Number(req.params.id)
        const conversations = readCollection<Conversation>(CONVERSATIONS_COLLECTION)
        const conversation = conversations.find((c) => c.id === conversationId)
        if (!conversation) return res.status(404).json({ message: 'Conversation not found.' })
        if (!canAccess(conversation, me.id, me.role)) return res.status(403).json({ message: 'Not your conversation.' })

        const messages = readCollection<ConversationMessage>(MESSAGES_COLLECTION)
            .filter((m) => m.conversationId === conversationId)
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        res.json({ conversation, messages })
    })

    // POST /api/gene/messages/conversations/:id/send — [AUTH]
    app.post('/api/gene/messages/conversations/:id/send', (req: Request, res: Response) => {
        const me = getAuthedUser(req)
        if (!me) return res.status(401).json({ message: 'Sign in first.' })

        try {
            const conversationId = Number(req.params.id)
            const text = typeof req.body?.message === 'string' ? req.body.message.trim() : ''
            if (!text) return res.status(400).json({ message: 'A non-empty message is required.' })

            const conversations = readCollection<Conversation>(CONVERSATIONS_COLLECTION)
            const conversation = conversations.find((c) => c.id === conversationId)
            if (!conversation) return res.status(404).json({ message: 'Conversation not found.' })
            if (!canAccess(conversation, me.id, me.role)) return res.status(403).json({ message: 'Not your conversation.' })

            const sent = appendMessage(conversation, me.id, displayName(me), text)
            res.json({ message: sent })
        } catch (err: any) {
            console.error('[gene/messaging] send failed:', err)
            res.status(500).json({ message: 'Failed to send message.' })
        }
    })

    // GET /api/gene/messages/whatsapp-threads — [strict admin only] a
    // read-only, per-phone rollup of server/gene/whatsapp-concierge.ts's
    // message log, shaped like a Conversation so the same inbox UI can
    // render it alongside in-app threads. Admin-only (not agent) because,
    // unlike a tenant_agent thread, a WhatsApp concierge conversation isn't
    // scoped to one agent's properties — it's the whole platform's inbound
    // line, same reasoning as the existing WhatsApp escalation inbox
    // (server/gene/whatsapp.ts) being admin-only.
    app.get('/api/gene/messages/whatsapp-threads', requireStrictAdmin, (_req: Request, res: Response) => {
        try {
            interface WhatsappMessageLog {
                id: number
                phone: string
                direction: 'inbound' | 'outbound'
                text: string
                userId?: number
                createdAt: string
            }
            interface WhatsappUserLink {
                userId: number
                userName: string
                phone: string
            }

            const messages = readCollection<WhatsappMessageLog>(WHATSAPP_MESSAGE_COLLECTION)
            const links = readCollection<WhatsappUserLink>(WHATSAPP_LINK_COLLECTION)
            const nameByPhone = new Map(links.map((l) => [l.phone, l.userName]))

            const byPhone = new Map<string, WhatsappMessageLog[]>()
            for (const m of messages) {
                const list = byPhone.get(m.phone) ?? []
                list.push(m)
                byPhone.set(m.phone, list)
            }

            const threads = Array.from(byPhone.entries())
                .map(([phone, msgs]) => {
                    const sorted = [...msgs].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                    const last = sorted[sorted.length - 1]
                    return {
                        phone,
                        name: nameByPhone.get(phone) ?? phone,
                        updatedAt: last?.createdAt ?? '',
                        lastMessagePreview: (last?.text ?? '').slice(0, 140),
                        messageCount: sorted.length,
                    }
                })
                .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

            res.json(threads)
        } catch (err: any) {
            console.error('[gene/messaging] whatsapp-threads failed:', err)
            res.status(500).json({ message: 'Failed to load WhatsApp threads.' })
        }
    })

    // GET /api/gene/messages/whatsapp-threads/:phone — [strict admin only]
    // full message history for one WhatsApp thread.
    app.get('/api/gene/messages/whatsapp-threads/:phone', requireStrictAdmin, (req: Request, res: Response) => {
        interface WhatsappMessageLog {
            id: number
            phone: string
            direction: 'inbound' | 'outbound'
            text: string
            createdAt: string
        }
        const messages = readCollection<WhatsappMessageLog>(WHATSAPP_MESSAGE_COLLECTION)
            .filter((m) => m.phone === req.params.phone)
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        res.json(messages)
    })
}
