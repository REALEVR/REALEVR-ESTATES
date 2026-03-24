import { z } from 'zod'

// ─── Payment ──────────────────────────────────────────────────────────────────

export const PaymentStatusSchema = z.enum(['pending', 'completed', 'failed', 'refunded'])
export const PaymentMethodSchema = z.enum(['flutterwave', 'stripe', 'bank_transfer', 'iotec'])
export const PaymentTypeSchema = z.enum(['deposit', 'rent', 'full', 'subscription'])

export const PaymentSchema = z.object({
    id: z.string(),
    bookingId: z.string().optional(),
    amount: z.number(),
    currency: z.string().default('UGX'),
    type: PaymentTypeSchema,
    status: PaymentStatusSchema,
    method: PaymentMethodSchema,
    transactionId: z.string(),
    userId: z.string().optional(),
    propertyId: z.string().optional(),
    createdAt: z.string(),
    completedAt: z.string().optional(),
    refundedAt: z.string().optional(),
    metadata: z.record(z.unknown()).default({}),
})

export type Payment = z.infer<typeof PaymentSchema>
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>
export type PaymentType = z.infer<typeof PaymentTypeSchema>

// ─── Booking ──────────────────────────────────────────────────────────────────

export const EscrowStatusSchema = z.enum(['pending', 'held', 'released', 'forfeited'])

export const BookingSchema = z.object({
    id: z.string(),
    propertyId: z.string(),
    tenantId: z.string(),
    landlordId: z.string().optional(),
    startDate: z.string(),
    endDate: z.string().optional(),
    totalAmount: z.number(),
    currency: z.string().default('UGX'),
    status: z.enum(['pending', 'confirmed', 'cancelled', 'completed']).default('pending'),
    depositPaid: z.boolean().default(false),
    escrowStatus: EscrowStatusSchema.default('pending'),
    escrowAmount: z.number().default(0),
    escrowReleasedAt: z.string().optional(),
    paymentHistory: z.array(z.string()).default([]),
    createdAt: z.string(),
    updatedAt: z.string(),
})

export type Booking = z.infer<typeof BookingSchema>
export type EscrowStatus = z.infer<typeof EscrowStatusSchema>

// ─── Audit Log ────────────────────────────────────────────────────────────────

export const AuditLogSchema = z.object({
    id: z.string(),
    action: z.string(),
    bookingId: z.string().optional(),
    paymentId: z.string().optional(),
    userId: z.string(),
    changes: z.record(z.unknown()).default({}),
    timestamp: z.string(),
    status: z.enum(['success', 'failed']),
    errorMessage: z.string().optional(),
})

export type AuditLog = z.infer<typeof AuditLogSchema>

// ─── Notification ─────────────────────────────────────────────────────────────

export const NotificationTypeSchema = z.enum(['payment', 'booking', 'property', 'system'])

export const NotificationSchema = z.object({
    id: z.string(),
    userId: z.string(),
    title: z.string(),
    message: z.string(),
    type: NotificationTypeSchema,
    read: z.boolean().default(false),
    createdAt: z.string(),
    link: z.string().optional(),
    metadata: z.record(z.unknown()).default({}),
})

export type Notification = z.infer<typeof NotificationSchema>
export type NotificationType = z.infer<typeof NotificationTypeSchema>
