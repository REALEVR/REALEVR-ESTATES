import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'
import { useLocation } from 'wouter'
import { useStartConversation } from '@/hooks/useMessaging'

interface MessageAgentModalProps {
    isOpen: boolean
    onClose: () => void
    propertyId: number
    propertyTitle: string
    ownerId: number
}

/**
 * "Message Agent" entry point on a property page — starts (or continues) a
 * real in-app conversation with the listing's owner, backed by
 * server/gene/messaging.ts. Pre-booking questions are exactly the use case
 * this closes a gap on: the existing OwnerContactDetails component only
 * reveals contact info *after* a booking deposit, so before this there was
 * no way to ask an agent anything without leaving the platform.
 */
export default function MessageAgentModal({ isOpen, onClose, propertyId, propertyTitle, ownerId }: MessageAgentModalProps) {
    const { user } = useAuth()
    const [, setLocation] = useLocation()
    const { toast } = useToast()
    const startConversation = useStartConversation()
    const [message, setMessage] = useState('')

    const handleSend = async () => {
        if (!user) {
            onClose()
            setLocation('/auth')
            return
        }
        const text = message.trim()
        if (!text) return
        try {
            await startConversation.mutateAsync({ toUserId: ownerId, propertyId, message: text })
            toast({ title: 'Message sent', description: 'The agent will reply here — check Messages in your dashboard.' })
            setMessage('')
            onClose()
        } catch (err: any) {
            toast({ title: "Couldn't send message", description: err?.message, variant: 'destructive' })
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Message the agent</DialogTitle>
                    <DialogDescription>About "{propertyTitle}" — replies show up in your Messages.</DialogDescription>
                </DialogHeader>
                <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Hi, is this property still available? I'd like to know more about…"
                    className="min-h-[100px]"
                    autoFocus
                />
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={handleSend} disabled={!message.trim() || startConversation.isPending}>
                        {startConversation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Send
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
