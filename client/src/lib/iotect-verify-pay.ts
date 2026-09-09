type PaymentRecordData = {
    transactionId: string
    propertyId: string
    userId?: number
    amount: number
    currency: string
    timestamp?: string // optional, server can also set it
    // Set only for a BnB booking-deposit payment (BookingCalendarModal.tsx)
    // so the server can record the occupied date range for the booking
    // calendar (see server/gene/bnb-bookings.ts). ISO date strings
    // ("2026-09-20"); checkOut is the first day NOT booked.
    checkIn?: string
    checkOut?: string
    guests?: number
}

export async function recordTourPayment(data: PaymentRecordData) {
    try {
        const response = await fetch('/api/payment/iotect/record', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ...data,
                timestamp: new Date().toISOString(), // add timestamp client-side if you want
            }),
        })

        if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`Server responded with ${response.status}: ${errorText}`)
        }

        return await response.json() // if your server returns JSON
    } catch (error) {
        console.error('Failed to record payment:', error)
        throw error
    }
}

// Usage example:
// recordTourPayment({
//     transactionId: 'txn_12345',
//     propertyId: 'prop_67890',
//     userId: 'user_abc',
//     customerEmail: 'pius@example.com',
//     customerName: 'Pius Kalema',
//     amount: 100,
//     currency: 'USD',
// })
//     .then((res) => console.log('Payment recorded:', res))
//     .catch((err) => console.error(err))

