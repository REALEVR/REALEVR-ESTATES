import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'http'
import { paymentEventEmitter } from '../events/paymentEventEmitter.js'

interface SocketClient {
    ws: WebSocket
    userId?: string
    subscriptions: Set<string>
}

class PropertySocketServer {
    private wss: WebSocketServer | null = null
    private clients: Map<WebSocket, SocketClient> = new Map()

    initialize(server: Server): void {
        this.wss = new WebSocketServer({ server, path: '/ws' })

        this.wss.on('connection', (ws: WebSocket) => {
            const client: SocketClient = { ws, subscriptions: new Set() }
            this.clients.set(ws, client)

            console.log(`[WebSocket] New client connected. Total clients: ${this.clients.size}`)

            ws.on('message', (data: Buffer) => {
                try {
                    const message = JSON.parse(data.toString())
                    this.handleMessage(ws, message)
                } catch (err) {
                    console.error('[WebSocket] Invalid message:', err)
                }
            })

            ws.on('close', () => {
                this.clients.delete(ws)
                console.log(`[WebSocket] Client disconnected. Total clients: ${this.clients.size}`)
            })

            ws.on('error', (err) => {
                console.error('[WebSocket] Client error:', err)
                this.clients.delete(ws)
            })

            // Send welcome message
            this.sendToClient(ws, { type: 'connected', message: 'Connected to REALEVR Estates' })
        })

        // Listen to payment events and broadcast
        paymentEventEmitter.on('payment.completed', (data) => {
            this.broadcastToUser(data.userId, {
                type: 'property:payment_received',
                data: {
                    paymentId: data.paymentId,
                    txRef: data.txRef,
                    gateway: data.gateway,
                    amount: data.amount,
                },
            })
        })

        paymentEventEmitter.on('payment.failed', (data) => {
            if (data.userId) {
                this.broadcastToUser(data.userId, {
                    type: 'property:payment_failed',
                    data: {
                        txRef: data.txRef,
                        gateway: data.gateway,
                    },
                })
            }
        })

        paymentEventEmitter.on('gateway.fallback', (data) => {
            this.broadcastToAll({
                type: 'property:gateway_fallback',
                data: {
                    txRef: data.txRef,
                    from: data.from,
                    to: data.to,
                    reason: data.reason,
                },
            })
        })

        console.log('✅ WebSocket server initialized at /ws')
    }

    private handleMessage(ws: WebSocket, message: any): void {
        const client = this.clients.get(ws)
        if (!client) return

        switch (message.type) {
            case 'auth':
                client.userId = String(message.userId)
                this.sendToClient(ws, { type: 'auth:success', userId: message.userId })
                break

            case 'subscribe':
                if (message.channel) {
                    client.subscriptions.add(message.channel)
                    this.sendToClient(ws, { type: 'subscribed', channel: message.channel })
                }
                break

            case 'unsubscribe':
                if (message.channel) {
                    client.subscriptions.delete(message.channel)
                }
                break

            case 'ping':
                this.sendToClient(ws, { type: 'pong', timestamp: Date.now() })
                break

            default:
                console.log('[WebSocket] Unknown message type:', message.type)
        }
    }

    private sendToClient(ws: WebSocket, data: any): void {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(data))
        }
    }

    broadcastToUser(userId: string, data: any): void {
        this.clients.forEach((client) => {
            if (client.userId === userId) {
                this.sendToClient(client.ws, data)
            }
        })
    }

    broadcastToAll(data: any): void {
        this.clients.forEach((client) => {
            this.sendToClient(client.ws, data)
        })
    }

    broadcastPropertyUpdate(propertyId: number | string, eventType: string, data: any): void {
        const message = {
            type: eventType,
            propertyId: String(propertyId),
            data,
            timestamp: new Date().toISOString(),
        }

        this.clients.forEach((client) => {
            if (
                client.subscriptions.has(`property:${propertyId}`) ||
                client.subscriptions.has('properties:all')
            ) {
                this.sendToClient(client.ws, message)
            }
        })
    }

    getConnectedCount(): number {
        return this.clients.size
    }
}

export const propertySocketServer = new PropertySocketServer()
