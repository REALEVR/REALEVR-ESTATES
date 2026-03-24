import EventEmitter from 'events'
import type { WebSocket } from 'ws'

export interface PaymentFailedEvent {
    userId: string
    txRef: string
    gateway: string
    error: string
}

export const paymentEventEmitter = new EventEmitter()

export class PropertySocket {
    private userSockets: Map<string, WebSocket[]> = new Map()

    registerSocket(userId: string, ws: WebSocket): void {
        const existing = this.userSockets.get(userId) ?? []
        existing.push(ws)
        this.userSockets.set(userId, existing)

        ws.on('close', () => {
            const sockets = this.userSockets.get(userId) ?? []
            const updated = sockets.filter((s) => s !== ws)
            if (updated.length === 0) {
                this.userSockets.delete(userId)
            } else {
                this.userSockets.set(userId, updated)
            }
        })
    }

    broadcastToUser(userId: string, message: object): void {
        const sockets = this.userSockets.get(userId) ?? []
        const payload = JSON.stringify(message)
        for (const ws of sockets) {
            if (ws.readyState === ws.OPEN) {
                ws.send(payload)
            }
        }
    }

    setupPaymentListeners(): void {
        paymentEventEmitter.on('payment.failed', (data: PaymentFailedEvent) => {
            if (data.userId) {
                this.broadcastToUser(data.userId, {
                    type: 'property:payment_failed',
                    data: {
                        txRef: data.txRef,
                        gateway: data.gateway,
                        error: data.error,
                    },
                })
            }
        })
    }
}

export const propertySocket = new PropertySocket()
propertySocket.setupPaymentListeners()
