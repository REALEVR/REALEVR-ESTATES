/**
 * GENE Platform — Team 1: learning loop (chat interactions -> training signal).
 *
 * Turns `gene_conversations` (from `./chat`) and `gene_escalations` into a
 * human-labeled dataset (`gene_training_labels`) that a reviewer works
 * through via `GET /api/gene/learning/queue` and labels via
 * `POST /api/gene/learning/label`.
 *
 * IMPORTANT — SCOPE: this module only produces the labeled dataset and a
 * summary of it. It does NOT retrain, fine-tune, or swap any model, and it
 * does not change GENE's runtime behavior. Per the product plan, any actual
 * model retrain/prompt/behavior change derived from this data requires an
 * explicit human review gate (see `ApprovalGate` in `./types`) before it can
 * go live — that gate is intentionally out of scope for this file.
 */
import type { Express, RequestHandler } from 'express'
import { readCollection, writeCollection, nextId, nowIso } from './store'
import type { GeneConversation } from './chat'

const CONVERSATIONS_COLLECTION = 'gene_conversations'
const TRAINING_LABELS_COLLECTION = 'gene_training_labels'

export type TrainingLabel = 'resolved_correctly' | 'resolved_incorrectly' | 'needs_review'

const VALID_LABELS: TrainingLabel[] = ['resolved_correctly', 'resolved_incorrectly', 'needs_review']

export interface GeneTrainingLabelRow {
    id: number
    conversationSessionId: string
    label: TrainingLabel
    reviewerNote?: string
    createdAt: string
}

export function registerGeneLearningLoopRoutes(app: Express, adminMiddleware: RequestHandler): void {
    // POST /api/gene/learning/label — [ADMIN]
    // Body: { conversationSessionId, label, reviewerNote? }
    app.post('/api/gene/learning/label', adminMiddleware, async (req, res) => {
        try {
            const body = req.body ?? {}
            const conversationSessionId = typeof body.conversationSessionId === 'string' ? body.conversationSessionId.trim() : ''
            const label = body.label as TrainingLabel
            const reviewerNote = typeof body.reviewerNote === 'string' ? body.reviewerNote : undefined

            if (!conversationSessionId) {
                return res.status(400).json({ message: 'Field "conversationSessionId" is required.' })
            }
            if (!VALID_LABELS.includes(label)) {
                return res.status(400).json({ message: `Field "label" must be one of: ${VALID_LABELS.join(', ')}.` })
            }

            const rows = readCollection<GeneTrainingLabelRow>(TRAINING_LABELS_COLLECTION)
            const row: GeneTrainingLabelRow = {
                id: nextId(rows),
                conversationSessionId,
                label,
                reviewerNote,
                createdAt: nowIso(),
            }
            rows.push(row)
            writeCollection(TRAINING_LABELS_COLLECTION, rows)

            res.status(201).json(row)
        } catch (err) {
            console.error('[gene/learning-loop] POST /api/gene/learning/label failed:', err)
            res.status(500).json({ message: 'Failed to record label.' })
        }
    })

    // GET /api/gene/learning/queue — [ADMIN]
    // Unlabeled chat sessions (no matching gene_training_labels row yet).
    app.get('/api/gene/learning/queue', adminMiddleware, async (_req, res) => {
        try {
            const conversations = readCollection<GeneConversation>(CONVERSATIONS_COLLECTION)
            const labels = readCollection<GeneTrainingLabelRow>(TRAINING_LABELS_COLLECTION)
            const labeledSessionIds = new Set(labels.map((l) => l.conversationSessionId))

            const queue = conversations
                .filter((c) => !labeledSessionIds.has(c.sessionId))
                .map((c) => ({
                    sessionId: c.sessionId,
                    messageCount: c.messages.length,
                    createdAt: c.createdAt,
                    updatedAt: c.updatedAt,
                    lastMessagePreview: c.messages.length > 0 ? c.messages[c.messages.length - 1].text.slice(0, 200) : '',
                }))
                .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

            res.json(queue)
        } catch (err) {
            console.error('[gene/learning-loop] GET /api/gene/learning/queue failed:', err)
            res.status(500).json({ message: 'Failed to load review queue.' })
        }
    })

    // GET /api/gene/learning/eval-summary — [ADMIN]
    app.get('/api/gene/learning/eval-summary', adminMiddleware, async (_req, res) => {
        try {
            const labels = readCollection<GeneTrainingLabelRow>(TRAINING_LABELS_COLLECTION)
            const byLabel: Record<TrainingLabel, number> = {
                resolved_correctly: 0,
                resolved_incorrectly: 0,
                needs_review: 0,
            }
            for (const row of labels) {
                if (byLabel[row.label] !== undefined) byLabel[row.label] += 1
            }

            res.json({
                totalLabels: labels.length,
                byLabel,
                accuracyPct:
                    labels.length > 0 ? Math.round((byLabel.resolved_correctly / labels.length) * 10000) / 100 : null,
            })
        } catch (err) {
            console.error('[gene/learning-loop] GET /api/gene/learning/eval-summary failed:', err)
            res.status(500).json({ message: 'Failed to compute eval summary.' })
        }
    })
}
