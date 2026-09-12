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
import { Share2, Gift } from 'lucide-react'

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
                            Earn points every time you share — 1,000 points = 10,000 UGX, redeemable to mobile
                            money from your agent's Rewards tab.
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
