import { nanoid } from 'nanoid'
import { DynamoDBUtils, TABLES } from '../dynamodb'
import type { AuditLog } from '../../shared/schemas/payment'

export const AuditLogModel = {
    async create(data: Omit<AuditLog, 'id' | 'timestamp'>): Promise<AuditLog> {
        const log: AuditLog = {
            id: nanoid(),
            timestamp: new Date().toISOString(),
            ...data,
        }
        await DynamoDBUtils.putItem(TABLES.AUDIT_LOGS, log as unknown as Record<string, unknown>)
        return log
    },

    async getAll(limit = 100): Promise<AuditLog[]> {
        const items = await DynamoDBUtils.scanTable(TABLES.AUDIT_LOGS)
        return (items as AuditLog[])
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, limit)
    },

    async getByBookingId(bookingId: string): Promise<AuditLog[]> {
        const items = await DynamoDBUtils.scanTable(
            TABLES.AUDIT_LOGS,
            'bookingId = :bid',
            { ':bid': bookingId },
        )
        return (items as AuditLog[]).sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        )
    },
}
