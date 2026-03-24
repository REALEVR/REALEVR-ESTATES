export interface Payment {
    id: string
    bookingId: string
    userId: string
    amount: number
    currency: string
    type: 'deposit' | 'rent' | 'full' | 'subscription' | 'tour'
    status: 'pending' | 'completed' | 'failed' | 'refunded'
    gateway: 'flutterwave' | 'iotech' | 'hybrid'
    primaryGateway: 'flutterwave' | 'iotech'
    fallbackAttempted?: boolean
    transactionIds: {
        flutterwave?: string
        iotech?: string
    }
    createdAt: string
    completedAt?: string
    refundedAt?: string
    metadata: {
        userAgent?: string
        ipAddress?: string
        deviceType?: string
        gatewaySwitchReason?: string
        propertyId?: string | number
        propertyTitle?: string
    }
}

export interface AuditLog {
    id: string
    paymentId?: string
    userId?: string
    action: string
    gateway?: 'flutterwave' | 'iotech'
    details: Record<string, any>
    ipAddress?: string
    createdAt: string
}

export interface PaymentInitResponse {
    success: boolean
    paymentUrl?: string
    transactionRef: string
    gateway: 'flutterwave' | 'iotech'
    error?: string
}

export interface RefundResponse {
    success: boolean
    refundId?: string
    error?: string
}

export interface TransactionStatus {
    status: 'pending' | 'completed' | 'failed'
    amount: number
    currency: string
    gateway: 'flutterwave' | 'iotech'
    transactionId: string
}
