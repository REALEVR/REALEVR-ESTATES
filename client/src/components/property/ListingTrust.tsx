import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Flag, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'

interface TrustFacts {
    owner: { joined: string | null; listings: number; withTours: number; emailVerified: boolean } | null
}

const REASONS: { value: string; label: string }[] = [
    { value: 'scam', label: 'Looks like a scam' },
    { value: 'already_rented', label: 'Already rented or sold' },
    { value: 'wrong_info', label: 'Wrong price, place or details' },
    { value: 'fake_photos', label: 'Photos are not of this property' },
    { value: 'other', label: 'Something else' },
]

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function joinedLabel(joined: string | null): string | null {
    if (!joined) return null
    const date = new Date(`${joined}-01T00:00:00Z`)
    if (Number.isNaN(date.getTime())) return null
    return `Joined ${date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })}`
}

function ReportListing({ propertyId, propertyTitle }: { propertyId: number; propertyTitle: string }) {
    const { toast } = useToast()
    const [open, setOpen] = useState(false)
    const [reason, setReason] = useState('')
    const [details, setDetails] = useState('')
    const [contact, setContact] = useState('')
    const [website, setWebsite] = useState('') // hidden field: only bots fill it in
    const [sending, setSending] = useState(false)
    const [error, setError] = useState('')

    const send = async () => {
        setError('')
        if (!reason) {
            setError('Choose what is wrong with this listing.')
            return
        }
        setSending(true)
        try {
            const res = await fetch(`/api/properties/${propertyId}/report`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason, details, contact, website }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data?.message || 'Could not send your report.')
            toast({ title: 'Report sent', description: data?.message || 'Thank you. Our team will look at this listing.' })
            setOpen(false)
            setReason('')
            setDetails('')
            setContact('')
        } catch (err: any) {
            setError(err?.message || 'Could not send your report.')
        } finally {
            setSending(false)
        }
    }

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                data-testid="report-listing"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
                <Flag className="h-4 w-4" aria-hidden="true" />
                Report this listing
            </button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Report this listing</DialogTitle>
                        <DialogDescription>
                            Tell us what is wrong with “{propertyTitle}”. Our team reads every report. You do not need an account.
                        </DialogDescription>
                    </DialogHeader>

                    <RadioGroup value={reason} onValueChange={setReason} className="gap-2" aria-label="What is wrong">
                        {REASONS.map((r) => (
                            <div key={r.value} className="flex min-h-11 items-center gap-3 rounded-md border border-border px-3">
                                <RadioGroupItem value={r.value} id={`report-${r.value}`} />
                                <Label htmlFor={`report-${r.value}`} className="flex-1 cursor-pointer py-2.5 font-normal">
                                    {r.label}
                                </Label>
                            </div>
                        ))}
                    </RadioGroup>

                    <Textarea
                        value={details}
                        onChange={(e) => setDetails(e.target.value.slice(0, 500))}
                        placeholder="What happened? (optional, 500 characters)"
                        aria-label="Details"
                        rows={3}
                    />
                    <Input
                        value={contact}
                        onChange={(e) => setContact(e.target.value.slice(0, 80))}
                        placeholder="Phone or email if we may contact you (optional)"
                        aria-label="How we can reach you"
                    />
                    {/* Bots fill every field; people never see this one. */}
                    <input
                        type="text"
                        name="website"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        tabIndex={-1}
                        autoComplete="off"
                        aria-hidden="true"
                        className="absolute -left-[9999px] h-0 w-0 opacity-0"
                    />

                    {error && (
                        <p role="alert" className="text-sm text-destructive">
                            {error}
                        </p>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="button" onClick={send} disabled={sending}>
                            {sending ? 'Sending…' : 'Send report'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}

/**
 * Facts a visitor can check, plus a visible way to report the listing. Only what is stored is shown: RealEVR does not check ID
 * documents or phone numbers yet, so there is no "verified" badge for either, and the card says so.
 */
export default function ListingTrust({ propertyId, propertyTitle }: { propertyId: number; propertyTitle: string }) {
    const { data } = useQuery<TrustFacts>({
        queryKey: [`/api/properties/${propertyId}/trust`],
        staleTime: 5 * 60_000,
    })
    const owner = data?.owner ?? null
    const facts: string[] = []
    if (owner) {
        const joined = joinedLabel(owner.joined)
        if (joined) facts.push(joined)
        facts.push(plural(owner.listings, 'listing', 'listings'))
        if (owner.withTours > 0) facts.push(`${plural(owner.withTours, 'tour', 'tours')} you can walk through`)
        facts.push(owner.emailVerified ? 'Email confirmed' : 'Email not confirmed')
    }

    return (
        <section aria-label="About this listing's manager" className="mb-8 rounded-xl border border-border bg-card p-4">
            <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-foreground">What you can check</h3>
                    {facts.length > 0 ? (
                        <p className="mt-1 text-sm text-muted-foreground" data-testid="trust-facts">
                            {facts.join(' · ')}
                        </p>
                    ) : (
                        <p className="mt-1 text-sm text-muted-foreground">We have no account details to show for this listing.</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                        RealEVR does not check ID documents or phone numbers yet, so neither is shown as verified. Meet in person and see
                        the home before you pay anything.
                    </p>
                    <div className="mt-1">
                        <ReportListing propertyId={propertyId} propertyTitle={propertyTitle} />
                    </div>
                </div>
            </div>
        </section>
    )
}
