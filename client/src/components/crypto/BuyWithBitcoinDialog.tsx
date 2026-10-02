import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react'
import { Link } from 'wouter'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { useCryptoPrice } from '@/hooks/useCryptoPrice'
import { assetByCode, CRYPTO_ASSETS, formatCoin } from '@shared/crypto-buy'
import BitcoinMark from './BitcoinMark'

interface Props {
    open: boolean
    onClose: () => void
    propertyId: number
    propertyTitle: string
}

/**
 * Buy a home with Bitcoin (or another digital currency). Shows the price in coin at the live rate, takes the
 * buyer's details, and tells them honestly what happens next. No coin is sent from this window: payment goes to
 * an escrow or the seller's lawyer, on written instructions, after the seller has agreed (server/gene/crypto-buy.ts).
 */
export default function BuyWithBitcoinDialog({ open, onClose, propertyId, propertyTitle }: Props) {
    const { user } = useAuth()
    const { toast } = useToast()
    const { data, isLoading, isError } = useCryptoPrice(propertyId, open)
    const [asset, setAsset] = useState('BTC')
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [phone, setPhone] = useState('')
    const [country, setCountry] = useState('')
    const [note, setNote] = useState('')
    const [agree, setAgree] = useState(false)
    const [trap, setTrap] = useState('')
    const [sending, setSending] = useState(false)
    const [done, setDone] = useState<{ reference: string } | null>(null)

    useEffect(() => {
        if (!open || !user) return
        setName((v) => v || user.fullName || '')
        setEmail((v) => v || user.email || '')
        setPhone((v) => v || user.phoneNumber || '')
    }, [open, user])

    const offered = useMemo(() => CRYPTO_ASSETS.filter((a) => !data?.assets || data.assets.includes(a.code)), [data?.assets])
    useEffect(() => {
        if (offered.length && !offered.some((a) => a.code === asset)) setAsset(offered[0].code)
    }, [offered, asset])

    const q = data?.quote ?? null
    const isBank = data?.category === 'bank_sales'
    const amountFor = (code: string): number | null => {
        if (!q) return null
        if (code === 'BTC') return q.btc
        if (code === 'ETH') return q.eth
        if (code === 'USDT') return q.usdt
        if (code === 'USDC') return q.usdc
        return null
    }
    const headline = amountFor(asset) ?? (asset === 'OTHER' ? null : null)
    const time = q ? new Date(q.asOf).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''

    const submit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (sending) return
        setSending(true)
        try {
            const res = await fetch('/api/crypto/requests', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ propertyId, asset, name, email, phone, country, note, confirmedSeller: agree, website: trap }),
            })
            const body = await res.json().catch(() => null)
            if (!res.ok) throw new Error(body?.message || 'Could not send your request.')
            setDone({ reference: body.reference })
        } catch (err: any) {
            toast({ title: "Couldn't send your request", description: err?.message, variant: 'destructive' })
        } finally {
            setSending(false)
        }
    }

    const close = () => {
        onClose()
        // Let the closing animation finish before the form resets.
        setTimeout(() => {
            setDone(null)
            setAgree(false)
            setNote('')
        }, 250)
    }

    return (
        <Dialog open={open} onOpenChange={(o) => !o && close()}>
            <DialogContent className="max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto rounded-2xl p-0 sm:rounded-2xl">
                <div className="border-b border-border px-5 pb-4 pt-5">
                    <DialogHeader className="space-y-1 text-left">
                        <DialogTitle className="flex items-center gap-2.5 font-display text-xl">
                            <BitcoinMark size={28} />
                            Buy with Bitcoin
                        </DialogTitle>
                        <DialogDescription className="line-clamp-2">{propertyTitle}</DialogDescription>
                    </DialogHeader>
                </div>

                {done ? (
                    <div className="space-y-4 px-5 pb-6 pt-5 text-sm">
                        <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-4 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
                            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                            <div>
                                <p className="font-semibold">Request received</p>
                                <p>
                                    Your reference is <strong>{done.reference}</strong>. We have emailed you the next steps.
                                </p>
                            </div>
                        </div>
                        <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
                            <li>We check that the seller will accept digital currency for this property.</li>
                            <li>We verify your identity and where the funds come from.</li>
                            <li>You receive written payment instructions for an escrow or the seller's lawyer.</li>
                        </ol>
                        <p className="flex items-start gap-2 rounded-xl border border-border p-3 text-muted-foreground">
                            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                            <span>{data?.safety || 'Do not send any coin until you have written instructions from RealEVR Estates or the escrow lawyer.'}</span>
                        </p>
                        <Button className="w-full" onClick={close}>
                            Done
                        </Button>
                    </div>
                ) : (
                    <form onSubmit={submit} className="space-y-5 px-5 pb-6 pt-4">
                        {isLoading ? (
                            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Reading the live price…
                            </div>
                        ) : isError || !data?.eligible ? (
                            <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
                                Buying this property with digital currency is not available right now. You can still message the agent from the property page.
                            </p>
                        ) : (
                            <>
                                <div className="rounded-2xl bg-muted/60 p-4">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Asking price</p>
                                    <p className="font-display text-lg font-semibold">
                                        {data.currency} {data.price?.toLocaleString()}
                                    </p>
                                    {q ? (
                                        <>
                                            <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">About</p>
                                            <p className="font-display text-2xl font-bold tabular-nums" aria-live="polite">
                                                {headline != null ? formatCoin(headline, asset as any) : 'Agreed with you in writing'}
                                            </p>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                1 BTC = US${Math.round(q.btcUsd).toLocaleString()} · read at {time}. The price in coin moves with the market; the figure that counts is the one agreed in writing.
                                            </p>
                                            {q.stale && (
                                                <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                                                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                                    Live prices could not be reached just now, so this is an earlier reading.
                                                </p>
                                            )}
                                        </>
                                    ) : (
                                        <p className="mt-2 text-sm text-muted-foreground">We can't read the live rate right now. Send your request and we will confirm the amount in coin.</p>
                                    )}
                                </div>

                                {isBank && (
                                    <p className="rounded-xl border border-border p-3 text-xs text-muted-foreground">
                                        This is a bank sale. The bank decides how it sells, so it must agree to accept digital currency before anything else happens. You can still register to bid in the usual way.
                                    </p>
                                )}
                                {data.note && <p className="rounded-xl border border-border p-3 text-sm">{data.note}</p>}

                                <fieldset>
                                    <legend className="mb-2 text-sm font-medium">Pay with</legend>
                                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Digital currency">
                                        {offered.map((a) => {
                                            const on = a.code === asset
                                            return (
                                                <button
                                                    key={a.code}
                                                    type="button"
                                                    role="radio"
                                                    aria-checked={on}
                                                    onClick={() => setAsset(a.code)}
                                                    className={`rounded-full border px-3.5 py-2 text-sm font-medium transition ${on ? 'border-foreground bg-foreground text-background' : 'border-border bg-background hover:border-foreground/50'}`}
                                                >
                                                    {a.short}
                                                </button>
                                            )
                                        })}
                                    </div>
                                    {asset === 'OTHER' && <p className="mt-2 text-xs text-muted-foreground">Tell us which currency in the note below. We will confirm whether the seller and the escrow can take it.</p>}
                                </fieldset>

                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="cb-name">Your name</Label>
                                        <Input id="cb-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={120} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="cb-country">Country</Label>
                                        <Input id="cb-country" value={country} onChange={(e) => setCountry(e.target.value)} autoComplete="country-name" maxLength={60} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="cb-email">Email</Label>
                                        <Input id="cb-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required maxLength={160} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="cb-phone">Phone / WhatsApp</Label>
                                        <Input id="cb-phone" type="tel" inputMode="tel" placeholder="+256…" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" required maxLength={40} />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="cb-note">Anything we should know? (optional)</Label>
                                    <Textarea id="cb-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1500} />
                                </div>
                                {/* Only bots fill this in. */}
                                <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" value={trap} onChange={(e) => setTrap(e.target.value)} className="absolute -left-[9999px] h-0 w-0 opacity-0" name="website" />

                                <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug">
                                    <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-foreground" />
                                    <span>
                                        I understand the seller must agree to accept digital currency, that I will be asked to prove who I am and where the funds come from (
                                        <Link href="/aml-sanctions" className="underline" onClick={close}>
                                            read why
                                        </Link>
                                        ), and that I must only pay on written instructions.
                                    </span>
                                </label>

                                <Button type="submit" className="h-12 w-full gap-2 rounded-full text-base" disabled={sending || !agree}>
                                    {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <BitcoinMark size={22} />}
                                    {sending ? 'Sending…' : 'Send my request'}
                                </Button>
                                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                    <span>{data.safety}</span>
                                </p>
                            </>
                        )}
                    </form>
                )}
            </DialogContent>
        </Dialog>
    )
}
