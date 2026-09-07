import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { Calendar } from '@/components/ui/calendar'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { format } from 'date-fns'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import PaymentModal from '@/components/payment/PaymentModal'
import { recordTourPayment } from '@/lib/iotect-verify-pay'
import { useStartConversation } from '@/hooks/useMessaging'
import type { User } from '@shared/schema'
import { Phone, User as UserIcon } from 'lucide-react'

interface BookingCalendarModalProps {
    isOpen: boolean
    onClose: () => void
    propertyId: number
    propertyTitle: string
    propertyCategory?: string // Add category to determine payment flow
    propertyPrice?: number // Daily rate for furnished properties
    propertyCurrency?: string // Currency for the property
    /** The listing's owner/host — passed in from PropertyDetails so that,
     * once a BnB deposit clears, we can put their contact details in front
     * of the payer immediately (on-screen dialog below) and again as a
     * message in the payer's inbox, instead of making them dig for it. */
    owner?: User | null
}

export default function BookingCalendarModal({
    isOpen,
    onClose,
    propertyId,
    propertyTitle,
    propertyCategory = 'rental',
    propertyPrice = 0,
    propertyCurrency = 'UGX',
    owner = null,
}: BookingCalendarModalProps) {
    const { toast } = useToast()
    const [, setLocation] = useLocation()
    const [date, setDate] = useState<Date | undefined>(new Date())
    const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | null>(null)
    const [numGuests, setNumGuests] = useState(1)
    const [numNights, setNumNights] = useState(1)
    const [notes, setNotes] = useState('')
    const [tab, setTab] = useState('calendar')
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
    const [isHostDetailsOpen, setIsHostDetailsOpen] = useState(false)
    const startConversation = useStartConversation()

    // For BnBs, calculate 20% deposit
    const isBnB = propertyCategory === 'BnB' || propertyCategory === 'furnished_houses'
    const totalAmount = isBnB ? propertyPrice * numNights : 15000 // 15,000 UGX viewing fee for rentals
    const depositAmount = isBnB ? Math.round(totalAmount * 0.2) : totalAmount

  

    const timeSlots = [
        '9:00 AM',
        '10:00 AM',
        '11:00 AM',
        '12:00 PM',
        '1:00 PM',
        '2:00 PM',
        '3:00 PM',
        '4:00 PM',
        '5:00 PM',
    ]

    const timeToDate = (timeString: string, baseDate: Date): Date => {
        const [hourMinute, period] = timeString.split(' ')
        let [hours, minutes] = hourMinute.split(':').map(Number)

        if (period === 'PM' && hours !== 12) hours += 12
        if (period === 'AM' && hours === 12) hours = 0

        const result = new Date(baseDate)
        result.setHours(hours, minutes, 0, 0)
        return result
    }

    const handleTimeSlotClick = (slot: string) => {
        setSelectedTimeSlot(slot)
    }

    const handleContinue = () => {
        if (!date) {
            toast({
                title: 'Please select a date',
                variant: 'destructive',
            })
            return
        }

        if (!selectedTimeSlot && !isBnB) {
            toast({
                title: 'Please select a time slot',
                variant: 'destructive',
            })
            return
        }

        if (isBnB) {
            setTab('details')
        } else {
            // For rentals, proceed to payment directly
            handleBookNow()
        }
    }

    const handleBookNow = () => {
        if (isBnB && numNights < 1) {
            toast({
                title: 'Please enter at least 1 night',
                variant: 'destructive',
            })
            return
        }

        // Show payment modal with appropriate details
        setIsPaymentModalOpen(true)
    }

    const handlePaymentSuccess = (response: any) => {
        setIsPaymentModalOpen(false)
        onClose()

        // Save transaction details to localStorage for reference
        const paymentInfo = {
            transactionId: response.transaction_id,
            amount: response.amount,
            propertyId,
            propertyTitle,
            date: new Date().toISOString(),
        }

        //add payments for the

        recordTourPayment({
            amount : paymentInfo.amount,
            currency : "UGX",
            propertyId : `${propertyId}`,
            transactionId : paymentInfo.transactionId
        })

        try {
            // Store the payment info in localStorage
            const payments = JSON.parse(localStorage.getItem('payments') || '[]')
            payments.push(paymentInfo)
            localStorage.setItem('payments', JSON.stringify(payments))
        } catch (error) {
            console.error('Error saving payment info', error)
        }

        if (isBnB) {
            // Soft-navigate (wouter) instead of a full page reload — a hard
            // window.location.href reload would blow away the on-screen host
            // details dialog opened right below before the payer ever sees it.
            setLocation(`${window.location.pathname}?booking=confirmed`)

            // Put the host's contact details in the payer's inbox: start (or
            // reuse) a conversation with the host and write their contact
            // info directly into the message body, so it's there in writing
            // the next time the payer opens their inbox — not just implied
            // by who the conversation is with.
            if (owner?.id) {
                const contactLines = [
                    `Host: ${owner.fullName || owner.username}`,
                    owner.phoneNumber ? `Phone: ${owner.phoneNumber}` : null,
                    owner.companyName ? `Company: ${owner.companyName}` : null,
                ].filter(Boolean)
                startConversation.mutate(
                    {
                        toUserId: owner.id,
                        propertyId,
                        message: `I've paid the ${depositAmount.toLocaleString()} ${propertyCurrency} deposit for ${propertyTitle} (${numNights} night${
                            numNights === 1 ? '' : 's'
                        }, ${numGuests} guest${numGuests === 1 ? '' : 's'}). Looking forward to hearing from you.\n\n${contactLines.join(
                            '\n'
                        )}${notes ? `\n\nNotes: ${notes}` : ''}`,
                    },
                    {
                        // Not being signed in (or the request failing) should
                        // never block the booking flow itself — the on-screen
                        // dialog below already shows the same host details.
                        onError: () => {},
                    }
                )
            }

            // On-screen prompt: show the host's details immediately, more
            // prominent than the toast below or scrolling down to the
            // OwnerContactDetails section.
            setIsHostDetailsOpen(true)
        }

        toast({
            title: isBnB ? 'Booking Confirmed!' : 'Viewing Booked!',
            description: isBnB
                ? `Your booking for ${propertyTitle} has been confirmed. You've paid a ${depositAmount.toLocaleString()} ${propertyCurrency} deposit (non-refundable). Transaction ID: ${
                      response.transaction_id
                  }`
                : `Your viewing for ${propertyTitle} has been scheduled on ${format(
                      date!,
                      'PPP'
                  )} at ${selectedTimeSlot}.`,
            duration: 5000,
        })
    }

    return (
        <>
            <Dialog open={isOpen} onOpenChange={onClose}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="text-xl">{isBnB ? 'Book Your Stay' : 'Schedule a Viewing'}</DialogTitle>
                        <DialogDescription>
                            {isBnB
                                ? 'Select your check-in date and duration'
                                : 'Select your preferred date and time to view this property'}
                        </DialogDescription>
                    </DialogHeader>

                    <Tabs value={tab} onValueChange={setTab} className="w-full">
                        <TabsList className="grid w-full grid-cols-2 mb-4">
                            <TabsTrigger value="calendar">{isBnB ? 'Check-in Date' : 'Select Date'}</TabsTrigger>
                            {isBnB && <TabsTrigger value="details">Booking Details</TabsTrigger>}
                            {!isBnB && <TabsTrigger value="time">Select Time</TabsTrigger>}
                        </TabsList>

                        <TabsContent value="calendar">
                            <div className="flex justify-center mb-4">
                                <Calendar
                                    mode="single"
                                    selected={date}
                                    onSelect={setDate}
                                    disabled={(date) => date < new Date()}
                                    className="rounded-md border mx-auto"
                                />
                            </div>

                            <DialogFooter>
                                <Button variant="outline" onClick={onClose}>
                                    Cancel
                                </Button>
                                <Button onClick={handleContinue}>{isBnB ? 'Continue' : 'Select Time'}</Button>
                            </DialogFooter>
                        </TabsContent>

                        {!isBnB && (
                            <TabsContent value="time">
                                <div className="grid grid-cols-3 gap-2 mb-4">
                                    {timeSlots.map((slot) => (
                                        <Button
                                            key={slot}
                                            variant={selectedTimeSlot === slot ? 'default' : 'outline'}
                                            className={
                                                selectedTimeSlot === slot ? 'bg-accent hover:bg-accent/90' : ''
                                            }
                                            onClick={() => handleTimeSlotClick(slot)}
                                        >
                                            {slot}
                                        </Button>
                                    ))}
                                </div>

                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setTab('calendar')}>
                                        Back
                                    </Button>
                                    <Button onClick={handleBookNow}>Book Viewing (15,000 {propertyCurrency})</Button>
                                </DialogFooter>
                            </TabsContent>
                        )}

                        {isBnB && (
                            <TabsContent value="details">
                                <div className="space-y-4 mb-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="nights">Number of Nights</Label>
                                            <Input
                                                id="nights"
                                                type="number"
                                                min="1"
                                                value={numNights}
                                                onChange={(e) => setNumNights(parseInt(e.target.value) || 1)}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="guests">Number of Guests</Label>
                                            <Input
                                                id="guests"
                                                type="number"
                                                min="1"
                                                value={numGuests}
                                                onChange={(e) => setNumGuests(parseInt(e.target.value) || 1)}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="notes">Special Requests</Label>
                                        <Input
                                            id="notes"
                                            placeholder="Any special requests or notes for the host"
                                            value={notes}
                                            onChange={(e) => setNotes(e.target.value)}
                                        />
                                    </div>

                                    <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                                        <div className="flex justify-between">
                                            <span>Price per night:</span>
                                            <span>
                                                {propertyPrice?.toLocaleString()} {propertyCurrency}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Number of nights:</span>
                                            <span>{numNights}</span>
                                        </div>
                                        <div className="flex justify-between font-medium">
                                            <span>Total:</span>
                                            <span>
                                                {totalAmount.toLocaleString()} {propertyCurrency}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-accent font-medium border-t pt-2">
                                            <span>Required deposit (20%):</span>
                                            <span>
                                                {depositAmount.toLocaleString()} {propertyCurrency}
                                            </span>
                                        </div>

                                        {/* Payment button directly under deposit amount */}
                                        <Button
                                            onClick={handleBookNow}
                                            className="w-full mt-3 bg-accent hover:bg-accent/90 text-accent-foreground"
                                        >
                                            Pay {depositAmount.toLocaleString()} {propertyCurrency} Deposit Now
                                        </Button>
                                    </div>

                                    <div className="mt-2 text-center text-sm text-gray-500">
                                        <p>After payment, you'll receive the owner's contact information</p>
                                        {/* Non-refundable disclosure, stated plainly before money moves —
                                            not buried in fine print after the fact. */}
                                        <p className="mt-1 font-medium text-gray-700">This deposit is non-refundable.</p>
                                    </div>
                                </div>

                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setTab('calendar')}>
                                        Back
                                    </Button>
                                    <Button variant="ghost" onClick={onClose}>
                                        Cancel
                                    </Button>
                                </DialogFooter>
                            </TabsContent>
                        )}
                    </Tabs>
                </DialogContent>
            </Dialog>

            {/* Payment Modal */}
            <PaymentModal
                isOpen={isPaymentModalOpen}
                onClose={() => setIsPaymentModalOpen(false)}
                propertyId={propertyId}
                propertyTitle={propertyTitle}
                paymentType={isBnB ? 'BnBBookingDeposit' : 'ViewingFee'}
                amount={depositAmount}
                currency={propertyCurrency}
                successCallback={handlePaymentSuccess}
            />

            {/* On-screen host-details prompt — shown the moment a BnB deposit
                clears, so the payer doesn't have to scroll down to the
                OwnerContactDetails section or dig through their inbox to
                find out who to coordinate with. The same details are also
                sent as a message above (startConversation), so they're not
                lost once this dialog is dismissed. */}
            {isBnB && (
                <Dialog open={isHostDetailsOpen} onOpenChange={setIsHostDetailsOpen}>
                    <DialogContent className="sm:max-w-[420px]">
                        <DialogHeader>
                            <DialogTitle className="text-xl">Booking confirmed — here's your host</DialogTitle>
                            <DialogDescription>
                                Your deposit for {propertyTitle} went through. Reach out to the host directly to
                                arrange check-in.
                            </DialogDescription>
                        </DialogHeader>

                        {owner ? (
                            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                                        <UserIcon className="h-5 w-5 text-accent" />
                                    </div>
                                    <div>
                                        <p className="font-medium">{owner.fullName || owner.username}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {owner.role === 'agent' ? 'Property Agent' : 'Property Host'}
                                        </p>
                                    </div>
                                </div>
                                {owner.phoneNumber && (
                                    <a
                                        href={`tel:${owner.phoneNumber}`}
                                        className="flex items-center gap-2 text-sm font-medium text-accent hover:underline"
                                    >
                                        <Phone className="h-4 w-4" />
                                        {owner.phoneNumber}
                                    </a>
                                )}
                                {owner.companyName && (
                                    <p className="text-sm text-muted-foreground">{owner.companyName}</p>
                                )}
                                <p className="text-xs text-muted-foreground pt-2 border-t">
                                    We've also sent these details to your inbox on this site.
                                </p>
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                We couldn't load the host's contact details right now — check your inbox on this
                                site, they've been sent there too.
                            </p>
                        )}

                        <DialogFooter>
                            <Button onClick={() => setIsHostDetailsOpen(false)}>Got it</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </>
    )
}
