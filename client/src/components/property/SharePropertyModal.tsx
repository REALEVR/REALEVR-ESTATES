import { useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'
import { logPropertyShare } from '@/hooks/useRewards'
import { Share2, Gift, MessageCircle } from 'lucide-react'

interface SharePropertyModalProps {
    isOpen: boolean
    onClose: () => void
    propertyId: number
    propertyTitle: string
}

export default function SharePropertyModal({ isOpen, onClose, propertyId, propertyTitle }: SharePropertyModalProps) {
    const [email, setEmail] = useState('')
    const [name, setName] = useState('')
    const [isCopied, setIsCopied] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [whatsappNumber, setWhatsappNumber] = useState('')
    const [isSharingWhatsapp, setIsSharingWhatsapp] = useState(false)
    const { toast } = useToast()
    const { user } = useAuth()

    // Generate a unique trackable link with user email embedded
    const generateTrackableLink = () => {
        const baseUrl = window.location.origin
        const randomId = Math.random().toString(36).substring(2, 15)
        return `${baseUrl}/property/${propertyId}?ref=${randomId}&src=share&user=${encodeURIComponent(email)}`
    }

    const trackableLink = generateTrackableLink()
    const nativeShareSupported = typeof navigator !== 'undefined' && !!(navigator as any).share

    // Real points-earning share logging — see server/gene/referral-rewards.ts.
    // Signed-out visitors can still share; they just don't earn points (the
    // endpoint requires auth), so we skip the call and say so instead.
    const recordShare = async (channel: string) => {
        if (!user) return
        const result = await logPropertyShare(propertyId, channel)
        if (result?.counted) {
            toast({
                title: '+1 point earned!',
                description: `You now have ${result.balance?.totalPoints ?? '?'} points. Keep sharing to redeem for mobile money.`,
            })
        }
    }

    // "Share to a different number" is the mechanic behind the 100-shares
    // reward (see referral-rewards.ts): each distinct WhatsApp number only
    // counts once, ever, so this is the one channel that actually tracks
    // "100 times to different numbers" rather than a per-property cooldown.
    const handleWhatsappShare = () => {
        const digits = whatsappNumber.replace(/[^0-9+]/g, '')
        if (!digits || digits.replace(/\D/g, '').length < 9) {
            toast({
                title: 'Enter a valid number',
                description: 'Please enter the WhatsApp number you want to share this property with.',
                variant: 'destructive',
            })
            return
        }
        setIsSharingWhatsapp(true)
        const text = encodeURIComponent(`Check out ${propertyTitle} on RealEVR Estates: ${trackableLink}`)
        window.open(`https://wa.me/${digits.replace(/\D/g, '')}?text=${text}`, '_blank', 'noopener,noreferrer')

        if (user) {
            logPropertyShare(propertyId, 'whatsapp', digits)
                .then((result) => {
                    if (result?.counted) {
                        toast({
                            title: '+1 point earned!',
                            description: `${result.balance?.uniqueWhatsappRecipients ?? '?'} of 100 numbers shared to. Keep going to unlock your payout.`,
                        })
                    } else if (result?.message) {
                        toast({ title: 'Already shared to this number', description: result.message })
                    }
                })
                .finally(() => setIsSharingWhatsapp(false))
        } else {
            setIsSharingWhatsapp(false)
        }
        setWhatsappNumber('')
    }

    const handleNativeShare = async () => {
        try {
            await (navigator as any).share({ title: propertyTitle, text: `Check out ${propertyTitle} on RealEVR Estates`, url: trackableLink })
            await recordShare('native_share')
        } catch {
            // User cancelled the native share sheet — not an error.
        }
    }

    const handleCopyLink = () => {
        navigator.clipboard.writeText(trackableLink)
        setIsCopied(true)
        toast({
            title: 'Link Copied',
            description: 'The shareable link has been copied to your clipboard.',
        })
        void recordShare('copy_link')

        setTimeout(() => {
            setIsCopied(false)
        }, 3000)
    }

    const handleEmailShare = (e: React.FormEvent) => {
        e.preventDefault()

        if (!email || !name) {
            toast({
                title: 'Missing Information',
                description: 'Please provide both your name and email.',
                variant: 'destructive',
            })
            return
        }

        setIsSubmitting(true)

        // Track the share in the database
        setTimeout(() => {
            setIsSubmitting(false)

            // Log share data (in a real implementation, you would send this to your API)
            console.log({
                shareId: Math.random().toString(36).substring(2, 15),
                propertyId,
                sharedBy: {
                    name,
                    email,
                },
                shareUrl: trackableLink,
                timestamp: new Date().toISOString(),
            })

            toast({
                title: 'Link Shared Successfully',
                description: 'Your customized share link has been created. You can now share it with others.',
            })

            setEmail('')
            setName('')
        }, 1000)
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Share This Property</DialogTitle>
                    <DialogDescription>
                        Share this property with friends or clients. We'll track who views the property through your
                        unique link.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4">
                    {user && (
                        <div className="mb-4 flex items-center gap-2 rounded-lg bg-secondary p-3 text-sm text-foreground">
                            <Gift className="h-4 w-4 flex-shrink-0 text-primary" />
                            Share to 100 different WhatsApp numbers to claim 1,000 UGX — redeemable to mobile
                            money from your dashboard's Rewards tab.
                        </div>
                    )}

                    {user && (
                        <div className="mb-6">
                            <Label htmlFor="whatsappNumber" className="block mb-2">
                                Share via WhatsApp to a number
                            </Label>
                            <div className="flex space-x-2">
                                <Input
                                    id="whatsappNumber"
                                    value={whatsappNumber}
                                    onChange={(e) => setWhatsappNumber(e.target.value)}
                                    placeholder="e.g. 0772123456"
                                />
                                <Button onClick={handleWhatsappShare} disabled={isSharingWhatsapp} variant="outline">
                                    <MessageCircle className="mr-2 h-4 w-4" />
                                    Send
                                </Button>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                Only counts toward your 100 once per distinct number — sharing to the same number
                                twice earns nothing further.
                            </p>
                        </div>
                    )}

                    {nativeShareSupported && (
                        <Button onClick={handleNativeShare} className="mb-4 w-full">
                            <Share2 className="mr-2 h-4 w-4" />
                            Share now
                        </Button>
                    )}

                    <div className="mb-6">
                        <Label className="block mb-2">Your Unique Sharing Link</Label>
                        <div className="flex space-x-2">
                            <Input value={trackableLink} readOnly className="flex-1" />
                            <Button onClick={handleCopyLink} variant="outline">
                                {isCopied ? 'Copied!' : 'Copy'}
                            </Button>
                        </div>
                        <p className="text-sm text-gray-500 mt-2">
                            This link is unique to you. When someone views the property through this link, we'll track
                            it.
                        </p>
                    </div>

                    <form onSubmit={handleEmailShare} className="space-y-4">
                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="name">Your Name</Label>
                                <Input
                                    id="name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Enter your name"
                                />
                            </div>

                            <div>
                                <Label htmlFor="email">Your Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Enter your email"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    We use your email to create your customized share link and to notify you when
                                    someone views the property through your link.
                                </p>
                            </div>
                        </div>

                        <DialogFooter className="pt-2">
                            <Button type="button" variant="outline" onClick={onClose} className="mr-2">
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isSubmitting || !email || !name}>
                                {isSubmitting ? 'Processing...' : 'Create Custom Link'}
                            </Button>
                        </DialogFooter>
                    </form>
                </div>
            </DialogContent>
        </Dialog>
    )
}
