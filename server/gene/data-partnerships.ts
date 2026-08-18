/**
 * GENE Platform — regulatory / government data-sharing agreement tracker.
 *
 * NOTE ON PACE (read before treating this as a launch blocker): per the
 * product plan, formal data-sharing agreements with land registries, city
 * councils, and other regulatory bodies are realistically the SLOWEST-MOVING
 * track in the whole GENE effort — these are institutional relationships
 * that move on the other party's legal/procurement timeline, not ours.
 * Launch should NOT block on any row here reaching 'agreement_signed' or
 * 'live'. This module exists so the team has one durable place to log where
 * each conversation stands, not to gate anything else.
 *
 * Persistence: shared JSON-file collection store (see ./store.ts), collection
 * name `gene_data_agreements`. No DynamoDB, no new deps.
 */
import type { Express, Request, Response, RequestHandler } from 'express'
import { readCollection, writeCollection, nextId, nowIso } from './store'
import { SUPPORTED_COUNTRIES, type SupportedCountry } from './types'

const COLLECTION = 'gene_data_agreements'

export type DataAgreementStatus = 'not_started' | 'in_discussion' | 'agreement_signed' | 'live'

export interface DataAgreementRecord {
    id: number
    country: SupportedCountry
    institution: string
    dataType: string
    status: DataAgreementStatus
    contactName?: string
    contactEmail?: string
    tosUrl?: string
    complianceNotes?: string
    createdAt: string
    updatedAt: string
}

const VALID_STATUSES: DataAgreementStatus[] = ['not_started', 'in_discussion', 'agreement_signed', 'live']

function isSupportedCountry(value: unknown): value is SupportedCountry {
    return typeof value === 'string' && (SUPPORTED_COUNTRIES as readonly string[]).includes(value)
}

export function registerDataPartnershipsRoutes(app: Express, adminMiddleware: RequestHandler): void {
    // Public read — this is just a status tracker, nothing sensitive.
    app.get('/api/gene/data-partnerships', (req: Request, res: Response) => {
        try {
            const rows = readCollection<DataAgreementRecord>(COLLECTION)
            const country = typeof req.query.country === 'string' ? req.query.country : undefined
            const filtered = country ? rows.filter((r) => r.country === country) : rows
            res.json(filtered)
        } catch (error: any) {
            console.error('[gene/data-partnerships] list failed:', error)
            res.status(500).json({ message: 'Failed to load data agreements' })
        }
    })

    app.post('/api/gene/data-partnerships', adminMiddleware, (req: Request, res: Response) => {
        try {
            const { country, institution, dataType, status, contactName, contactEmail, tosUrl, complianceNotes } =
                req.body ?? {}

            if (!isSupportedCountry(country)) {
                return res.status(400).json({
                    message: `country must be one of: ${SUPPORTED_COUNTRIES.join(', ')}`,
                })
            }
            if (typeof institution !== 'string' || !institution.trim()) {
                return res.status(400).json({ message: 'institution is required' })
            }
            if (typeof dataType !== 'string' || !dataType.trim()) {
                return res.status(400).json({ message: 'dataType is required' })
            }
            const resolvedStatus: DataAgreementStatus = VALID_STATUSES.includes(status) ? status : 'not_started'

            const rows = readCollection<DataAgreementRecord>(COLLECTION)
            const now = nowIso()
            const record: DataAgreementRecord = {
                id: nextId(rows),
                country,
                institution: institution.trim(),
                dataType: dataType.trim(),
                status: resolvedStatus,
                contactName: typeof contactName === 'string' ? contactName : undefined,
                contactEmail: typeof contactEmail === 'string' ? contactEmail : undefined,
                tosUrl: typeof tosUrl === 'string' ? tosUrl : undefined,
                complianceNotes: typeof complianceNotes === 'string' ? complianceNotes : undefined,
                createdAt: now,
                updatedAt: now,
            }
            rows.push(record)
            writeCollection(COLLECTION, rows)
            res.status(201).json(record)
        } catch (error: any) {
            console.error('[gene/data-partnerships] create failed:', error)
            res.status(500).json({ message: 'Failed to create data agreement' })
        }
    })

    app.patch('/api/gene/data-partnerships/:id', adminMiddleware, (req: Request, res: Response) => {
        try {
            const id = Number(req.params.id)
            if (Number.isNaN(id)) {
                return res.status(400).json({ message: 'Invalid id' })
            }

            const rows = readCollection<DataAgreementRecord>(COLLECTION)
            const idx = rows.findIndex((r) => r.id === id)
            if (idx === -1) {
                return res.status(404).json({ message: 'Data agreement not found' })
            }

            const { status, contactName, contactEmail, tosUrl, complianceNotes, institution, dataType } =
                req.body ?? {}

            if (status !== undefined) {
                if (!VALID_STATUSES.includes(status)) {
                    return res.status(400).json({ message: `status must be one of: ${VALID_STATUSES.join(', ')}` })
                }
                rows[idx].status = status
            }
            if (contactName !== undefined) rows[idx].contactName = contactName
            if (contactEmail !== undefined) rows[idx].contactEmail = contactEmail
            if (tosUrl !== undefined) rows[idx].tosUrl = tosUrl
            if (complianceNotes !== undefined) rows[idx].complianceNotes = complianceNotes
            if (typeof institution === 'string' && institution.trim()) rows[idx].institution = institution.trim()
            if (typeof dataType === 'string' && dataType.trim()) rows[idx].dataType = dataType.trim()
            rows[idx].updatedAt = nowIso()

            writeCollection(COLLECTION, rows)
            res.json(rows[idx])
        } catch (error: any) {
            console.error('[gene/data-partnerships] update failed:', error)
            res.status(500).json({ message: 'Failed to update data agreement' })
        }
    })
}
