import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Loader2, Phone } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

/**
 * Both dashboards' Rent Pay tab need this: a RentRail payment is matched to
 * a landlord's dashboard (or notified to a tenant) purely by the account's
 * own phone number — see server/gene/rentrail.ts's findLandlordUserIdByPhone
 * doc comment. An account created before phone numbers became compulsory
 * (see AuthModal.tsx / auth-page.tsx) can still be missing one, so this is
 * the in-context way to add it without leaving the dashboard — there's no
 * reachable profile-edit page for agent/normal accounts (ProfilePage.tsx
 * redirects both roles straight back out to their own dashboard).
 *
 * `invalidateQueryKey` is whichever query this prompt's result should
 * refresh once the phone number is saved (e.g. the Rent Pay tab's own
 * payments query) — passed in rather than hardcoded so this stays reusable
 * for both AgentDashboard.tsx and UserDashboard.tsx.
 */
export default function AddPhoneNumberPrompt({
    description,
    invalidateQueryKey,
}: {
    description: string
    invalidateQueryKey: string
}) {
    const { toast } = useToast()
    const queryClient = useQueryClient()
    const [phoneNumber, setPhoneNumber] = useState('')

    const saveMutation = useMutation({
        mutationFn: async () => {
            const res = await apiRequest('PATCH', '/api/users/profile', { phoneNumber: phoneNumber.trim() })
            return res.json()
        },
        onSuccess: () => {
            toast({ title: 'Phone number saved' })
            queryClient.invalidateQueries({ queryKey: ['/api/user'] })
            queryClient.invalidateQueries({ queryKey: [invalidateQueryKey] })
        },
        onError: (error: any) => {
            toast({
                title: 'Could not save',
                description: error?.message?.replace(/^\d+:\s*/, '') || 'Something went wrong.',
                variant: 'destructive',
            })
        },
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (phoneNumber.replace(/\D/g, '').length < 7) {
            toast({ title: 'Enter a valid phone number', variant: 'destructive' })
            return
        }
        saveMutation.mutate()
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                    <Phone className="h-4 w-4" /> Add your phone number
                </CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
                    <Input
                        type="tel"
                        placeholder="07XXXXXXXX"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        className="sm:max-w-xs"
                    />
                    <Button type="submit" disabled={saveMutation.isPending}>
                        {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Save
                    </Button>
                </form>
            </CardContent>
        </Card>
    )
}
