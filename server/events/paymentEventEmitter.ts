import EventEmitter from 'eventemitter3'

export type PaymentEventType =
    | 'payment.initiated'
    | 'payment.processing'
    | 'payment.completed'
    | 'payment.failed'
    | 'payment.refunded'
    | 'gateway.fallback'
    | 'gateway.both_failed'

const emitter = new EventEmitter()

export const paymentEventEmitter = {
    emit(event: PaymentEventType, data?: any): boolean {
        console.log(`[PaymentEvent] ${event}:`, data)
        return emitter.emit(event, data)
    },
    on(event: PaymentEventType, listener: (data: any) => void): void {
        emitter.on(event, listener)
    },
    off(event: PaymentEventType, listener: (data: any) => void): void {
        emitter.off(event, listener)
    },
}
