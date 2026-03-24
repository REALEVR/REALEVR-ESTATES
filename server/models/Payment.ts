import { nanoid } from 'nanoid'
import { DynamoDBUtils, TABLES } from '../dynamodb'
import type { Payment } from '../../shared/schemas/payment'

export const PaymentModel = {
    async create(data: Omit<Payment, 'id' | 'createdAt'>): Promise<Payment> {
        const payment: Payment = {
            id: nanoid(),
            createdAt: new Date().toISOString(),
            ...data,
        }
        await DynamoDBUtils.putItem(TABLES.PAYMENTS, payment as unknown as Record<string, unknown>)
        return payment
    },

    async getById(id: string): Promise<Payment | null> {
        const item = await DynamoDBUtils.getItem(TABLES.PAYMENTS, { id })
        return (item as Payment) ?? null
    },

    async getByTransactionId(transactionId: string): Promise<Payment | null> {
        const items = await DynamoDBUtils.scanTable(
            TABLES.PAYMENTS,
            'transactionId = :tid',
            { ':tid': transactionId },
        )
        return items.length > 0 ? (items[0] as Payment) : null
    },

    async getByBookingId(bookingId: string): Promise<Payment[]> {
        const items = await DynamoDBUtils.scanTable(
            TABLES.PAYMENTS,
            'bookingId = :bid',
            { ':bid': bookingId },
        )
        return items as Payment[]
    },

    async update(id: string, updates: Partial<Payment>): Promise<void> {
        const setExpressions: string[] = []
        const exprNames: Record<string, string> = {}
        const exprValues: Record<string, unknown> = {}

        for (const [key, value] of Object.entries(updates)) {
            const nameKey = `#${key}`
            const valueKey = `:${key}`
            setExpressions.push(`${nameKey} = ${valueKey}`)
            exprNames[nameKey] = key
            exprValues[valueKey] = value
        }

        if (setExpressions.length === 0) return

        await DynamoDBUtils.updateItem(
            TABLES.PAYMENTS,
            { id },
            `SET ${setExpressions.join(', ')}`,
            exprValues,
            exprNames,
        )
    },
}
