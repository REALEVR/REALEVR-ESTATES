import EventEmitter from 'events'
import { createNotification } from '../models/Notification'
import type { NotificationType } from '../../shared/schemas/notification'

export interface NotificationEventPayload {
    userId: string
    title: string
    message: string
    type: NotificationType
    data?: Record<string, any>
    link?: string
}

class NotificationEmitter extends EventEmitter {
    async notify(payload: NotificationEventPayload): Promise<void> {
        try {
            await createNotification({
                userId: payload.userId,
                title: payload.title,
                message: payload.message,
                type: payload.type,
                data: payload.data,
                link: payload.link,
            })
        } catch (err) {
            console.error('[NotificationEmitter] Failed to persist notification:', err)
        }
        super.emit('notification', payload)
    }
}

export const notificationEmitter = new NotificationEmitter()

// Convenience helpers
export function emitBookingConfirmed(userId: string, propertyTitle: string, bookingId: string) {
    notificationEmitter.notify({
        userId,
        title: 'Booking Confirmed',
        message: `Your booking for "${propertyTitle}" has been confirmed.`,
        type: 'booking',
        link: `/bookings/${bookingId}`,
        data: { bookingId },
    })
}

export function emitBookingCancelled(userId: string, propertyTitle: string, bookingId: string) {
    notificationEmitter.notify({
        userId,
        title: 'Booking Cancelled',
        message: `Your booking for "${propertyTitle}" has been cancelled.`,
        type: 'booking',
        link: `/bookings/${bookingId}`,
        data: { bookingId },
    })
}

export function emitPaymentReceived(userId: string, amount: number, currency = 'UGX') {
    notificationEmitter.notify({
        userId,
        title: 'Payment Received',
        message: `Your payment of ${currency} ${amount.toLocaleString()} has been received.`,
        type: 'payment',
        link: '/profile',
        data: { amount, currency },
    })
}

export function emitPaymentFailed(userId: string, amount: number, currency = 'UGX') {
    notificationEmitter.notify({
        userId,
        title: 'Payment Failed',
        message: `Your payment of ${currency} ${amount.toLocaleString()} could not be processed.`,
        type: 'payment',
        link: '/profile',
        data: { amount, currency },
    })
}

export function emitPropertyListed(userId: string, propertyTitle: string, propertyId: string) {
    notificationEmitter.notify({
        userId,
        title: 'Property Listed',
        message: `Your property "${propertyTitle}" is now live on the marketplace.`,
        type: 'property',
        link: `/properties/${propertyId}`,
        data: { propertyId },
    })
}

export function emitPropertyStatusChanged(userId: string, propertyTitle: string, propertyId: string, status: string) {
    notificationEmitter.notify({
        userId,
        title: 'Property Status Updated',
        message: `The status of "${propertyTitle}" has been updated to "${status}".`,
        type: 'property',
        link: `/properties/${propertyId}`,
        data: { propertyId, status },
    })
}

export function emitViewingScheduled(userId: string, propertyTitle: string, date: string) {
    notificationEmitter.notify({
        userId,
        title: 'Viewing Scheduled',
        message: `A viewing for "${propertyTitle}" has been scheduled on ${date}.`,
        type: 'viewing',
        data: { propertyTitle, date },
    })
}

export function emitViewingCompleted(userId: string, propertyTitle: string) {
    notificationEmitter.notify({
        userId,
        title: 'Viewing Completed',
        message: `Your viewing of "${propertyTitle}" is now complete. Let us know what you think!`,
        type: 'viewing',
        data: { propertyTitle },
    })
}
