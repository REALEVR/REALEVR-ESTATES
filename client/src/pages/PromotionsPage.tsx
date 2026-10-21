import { useMemo, useState } from 'react'
import { Link } from 'wouter'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Rocket, Copy, Check } from 'lucide-react'
import type { Property } from '@shared/schema'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'
import { PageSeo } from '@/components/seo/PageSeo'
import { inferListingCountry, countryByCode } from '@shared/africa'
import { formatMoney } from '@shared/country-spots'
import type { CountrySpotInfo } from '@/hooks/useCountrySpots'

interface Payee {
    methodLabel: string
    accountName: string
    accountNumber: string
    instructions: string
}

interface Purchase {
    id: number
    countryCode: string
    countryName: string
    propertyId: number
    title: string
    planId: string
    days: number
    amountLocal: number
    currency: string
    reference: string
    status: 'awaiting_payment' | 'submitted' | 'active' | 'paused' | 'expired' | 'cancelled' | 'rejected'
    txnRef: string | null
    startsAt: string | null
    expiresAt: string | null
    note: string | null
    canSwapAt: string | null
    viewsGained: number
    payTo: Payee | null
    buyerUserId?: number
}

interface Mine {
    purchases: Purchase[]
    managedCountries: string[]
    userCountry: string | null
}

/** Calls the API and turns an error body into a readable message. */
async function call<T = any>(method: string, url: string, body?: unknown): Promise<T> {
    const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'include',
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.message || 'Something went wrong. Please try again.')
    return data as T
}

const STATUS_LABEL: Record<Purchase['status'], string> = {
    awaiting_payment: 'Waiting for your payment',
    submitted: 'Payment sent, waiting to be confirmed',
    active: 'Live',
    paused: 'Paused',
    expired: 'Ended',
    cancelled: 'Cancelled',
    rejected: 'Not confirmed',
}

const dateOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

function CopyButton({ value, label }: { value: string; label: string }) {
    const [done, setDone] = useState(false)
    return (
        <button
            type="button"
            aria-label={`Copy ${label}`}
            onClick={() => {
                navigator.clipboard?.writeText(value).then(() => {
                    setDone(true)
                    setTimeout(() => setDone(false), 1500)
                })
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted"
        >
            {done ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        </button>
    )
}

export default function PromotionsPage() {
    const { user, isLoading: authLoading } = useAuth()
    const { toast } = useToast()
    const qc = useQueryClient()
    const mine = useQuery<Mine>({ queryKey: ['/api/country-spots/mine'], enabled: !!user })
    const countries = useQuery<{ countries: CountrySpotInfo[] }>({ queryKey: ['/api/country-spots/countries'] })
    const listings = useQuery<Property[]>({ queryKey: ['/api/properties'] })

    const [country, setCountry] = useState<string>('')
    const [propertyId, setPropertyId] = useState<string>('')
    const [planId, setPlanId] = useState<string>('month')
    const [txn, setTxn] = useState<Record<number, string>>({})
    const [swapTo, setSwapTo] = useState<Record<number, string>>({})
    const [applyAbout, setApplyAbout] = useState('')

    const refresh = () => {
        qc.invalidateQueries({ queryKey: ['/api/country-spots/mine'] })
        qc.invalidateQueries({ queryKey: ['/api/country-spots/countries'] })
        qc.invalidateQueries({ queryKey: ['/api/country-spots/active'] })
    }
    const act = useMutation({
        mutationFn: ({ method, url, body }: { method: string; url: string; body?: unknown }) => call(method, url, body),
        onSuccess: (_d, v) => {
            refresh()
            if (v.url.endsWith('/manager-application')) toast({ title: 'Application sent', description: 'An administrator will look at it and message you.' })
        },
        onError: (e: Error) => toast({ title: 'Could not do that', description: e.message, variant: 'destructive' }),
    })

    const open = countries.data?.countries ?? []
    const activeCountry = country || (mine.data?.userCountry && open.some((c) => c.code === mine.data!.userCountry) ? mine.data.userCountry : open[0]?.code) || ''
    const info = open.find((c) => c.code === activeCountry)
    const myHomes = useMemo(
        () => (listings.data ?? []).filter((p) => user && p.ownerId === user.id && inferListingCountry(p) === activeCountry),
        [listings.data, user, activeCountry],
    )
    const usedIds = new Set((mine.data?.purchases ?? []).filter((p) => ['awaiting_payment', 'submitted', 'active', 'paused'].includes(p.status)).map((p) => p.propertyId))
    const freeHomes = myHomes.filter((p) => !usedIds.has(p.id))
    const userCountryName = mine.data?.userCountry ? countryByCode(mine.data.userCountry)?.name : null

    if (authLoading) return <Loader2 className="mx-auto my-24 h-6 w-6 animate-spin text-muted-foreground" />
    if (!user) {
        return (
            <div className="container mx-auto max-w-xl px-6 py-16 text-center">
                <h1 className="font-display text-2xl font-semibold">Promote your listing in your country</h1>
                <p className="mt-2 text-muted-foreground">Sign in with the phone number you use in your country, then pick a listing and a plan.</p>
            </div>
        )
    }

    const buy = async () => {
        const res = await act.mutateAsync({ method: 'POST', url: '/api/country-spots/purchase', body: { country: activeCountry, planId, propertyId: Number(propertyId) } }).catch(() => null)
        if (res) setPropertyId('')
    }

    return (
        <div className="container mx-auto max-w-3xl px-4 py-8 md:py-12">
            <PageSeo title="Promote your listing in your country | RealEVR" description="Take a promoted spot for your listing in your own country, paid in your own money." canonicalPath="/promotions" />
            <h1 className="flex items-center gap-2 font-display text-3xl font-bold">
                <Rocket className="h-7 w-7 text-accent" aria-hidden="true" /> Promotions
            </h1>
            <p className="mt-1 text-muted-foreground">
                Each country has a few promoted spots at the top of its pages. They are for owners in that country, paid in that country&apos;s own money, and you look after
                your spot here.
            </p>

            {/* Buy */}
            <section className="mt-8 rounded-2xl border border-border p-4 md:p-6" aria-label="Take a spot">
                <h2 className="font-display text-xl font-semibold">Take a spot</h2>
                {countries.isLoading || mine.isLoading ? (
                    <Loader2 className="mt-4 h-5 w-5 animate-spin text-muted-foreground" />
                ) : open.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">Spots are not open in any country yet. We open a country as soon as it has someone to receive its payments.</p>
                ) : (
                    <div className="mt-4 space-y-4">
                        <label className="block text-sm font-medium">
                            Country
                            <select value={activeCountry} onChange={(e) => { setCountry(e.target.value); setPropertyId('') }} className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2.5 text-base">
                                {open.map((c) => (
                                    <option key={c.code} value={c.code}>
                                        {c.name} — {c.free} of {c.total} free
                                    </option>
                                ))}
                            </select>
                        </label>
                        {userCountryName && mine.data?.userCountry !== activeCountry && (
                            <p className="text-sm text-muted-foreground">Your account has a {userCountryName} phone number, so you can only take spots in {userCountryName}.</p>
                        )}
                        {info && info.free === 0 ? (
                            <p className="rounded-lg bg-muted p-3 text-sm">All {info.total} spots in {info.name} are taken.{info.nextFreeAt ? ` The next one frees up on ${dateOf(info.nextFreeAt)}.` : ''}</p>
                        ) : (
                            <>
                                <label className="block text-sm font-medium">
                                    Your listing in {info?.name}
                                    <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2.5 text-base">
                                        <option value="">Choose a listing</option>
                                        {freeHomes.map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.title}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                {freeHomes.length === 0 && (
                                    <p className="text-sm text-muted-foreground">
                                        You have no listing in {info?.name} without a spot. <Link href="/list-your-property" className="font-semibold underline underline-offset-4">List one</Link>, it is free.
                                    </p>
                                )}
                                <fieldset>
                                    <legend className="text-sm font-medium">How long</legend>
                                    <div className="mt-1 grid grid-cols-3 gap-2">
                                        {info?.plans.map((pl) => (
                                            <label key={pl.id} className={`cursor-pointer rounded-xl border p-3 text-center text-sm ${planId === pl.id ? 'border-foreground bg-muted' : 'border-border'}`}>
                                                <input type="radio" name="plan" value={pl.id} checked={planId === pl.id} onChange={() => setPlanId(pl.id)} className="sr-only" />
                                                <span className="block font-semibold">{pl.label}</span>
                                                <span className="block text-muted-foreground">{formatMoney(pl.currency, pl.amountLocal)}</span>
                                            </label>
                                        ))}
                                    </div>
                                </fieldset>
                                <Button onClick={buy} disabled={!propertyId || act.isPending} className="h-12 w-full rounded-full text-base">
                                    {act.isPending ? 'Please wait…' : 'Get payment details'}
                                </Button>
                            </>
                        )}
                    </div>
                )}
            </section>

            {/* Mine */}
            <section className="mt-8" aria-label="Your promotions">
                <h2 className="font-display text-xl font-semibold">Your promotions</h2>
                {mine.isLoading ? (
                    <Loader2 className="mt-4 h-5 w-5 animate-spin text-muted-foreground" />
                ) : (mine.data?.purchases ?? []).length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">Nothing yet. A spot you take will appear here, with its payment details and how many people looked at your listing.</p>
                ) : (
                    <ul className="mt-3 space-y-4">
                        {mine.data!.purchases.map((p) => (
                            <li key={p.id} className="rounded-2xl border border-border p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <Link href={`/property/${p.propertyId}`} className="block truncate font-semibold underline-offset-4 hover:underline">{p.title}</Link>
                                        <p className="text-sm text-muted-foreground">
                                            {p.countryName} · {p.days} days · {formatMoney(p.currency, p.amountLocal)}
                                        </p>
                                    </div>
                                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${p.status === 'active' ? 'bg-green-100 text-green-800' : p.status === 'paused' || p.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-muted text-foreground'}`}>
                                        {STATUS_LABEL[p.status]}
                                    </span>
                                </div>

                                {(p.status === 'awaiting_payment' || p.status === 'submitted') && p.payTo && (
                                    <div className="mt-3 space-y-2 rounded-xl bg-muted p-3 text-sm">
                                        <p>
                                            Pay <strong>{formatMoney(p.currency, p.amountLocal)}</strong> by <strong>{p.payTo.methodLabel || 'the account below'}</strong>:
                                        </p>
                                        <div className="flex items-center justify-between gap-2"><span>Number: <strong>{p.payTo.accountNumber}</strong></span><CopyButton value={p.payTo.accountNumber} label="number" /></div>
                                        <p>Account name: <strong>{p.payTo.accountName}</strong>. Check this name before you confirm the payment.</p>
                                        <div className="flex items-center justify-between gap-2"><span>Put this in the note: <strong>{p.reference}</strong></span><CopyButton value={p.reference} label="reference" /></div>
                                        {p.payTo.instructions && <p className="text-muted-foreground">{p.payTo.instructions}</p>}
                                    </div>
                                )}
                                {p.status === 'awaiting_payment' && (
                                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                        <Input value={txn[p.id] ?? ''} onChange={(e) => setTxn({ ...txn, [p.id]: e.target.value })} placeholder="Transaction id from your receipt" aria-label="Transaction id" />
                                        <Button disabled={act.isPending} onClick={() => act.mutate({ method: 'POST', url: `/api/country-spots/purchases/${p.id}/submit`, body: { txnRef: txn[p.id] ?? '' } })}>I have paid</Button>
                                        <Button variant="outline" disabled={act.isPending} onClick={() => act.mutate({ method: 'POST', url: `/api/country-spots/purchases/${p.id}/cancel` })}>Cancel</Button>
                                    </div>
                                )}
                                {p.status === 'submitted' && <p className="mt-3 text-sm text-muted-foreground">Transaction {p.txnRef}. It turns on as soon as the payment is seen, usually within a few hours.</p>}

                                {(p.status === 'active' || p.status === 'paused') && (
                                    <div className="mt-3 space-y-3 text-sm">
                                        <p className="text-muted-foreground">
                                            {dateOf(p.startsAt)} to {dateOf(p.expiresAt)} · <strong className="text-foreground">{p.viewsGained}</strong> {p.viewsGained === 1 ? 'view' : 'views'} since it began
                                        </p>
                                        {p.note && <p className="rounded-lg bg-red-50 p-2 text-red-800">{p.note}</p>}
                                        {p.status === 'active' && (
                                            <div className="flex flex-col gap-2 sm:flex-row">
                                                <select value={swapTo[p.id] ?? ''} onChange={(e) => setSwapTo({ ...swapTo, [p.id]: e.target.value })} aria-label="Move the spot to another listing" className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-base">
                                                    <option value="">Move to another of my listings…</option>
                                                    {(listings.data ?? []).filter((x) => x.ownerId === user.id && x.id !== p.propertyId && inferListingCountry(x) === p.countryCode && !usedIds.has(x.id)).map((x) => (
                                                        <option key={x.id} value={x.id}>{x.title}</option>
                                                    ))}
                                                </select>
                                                <Button variant="outline" disabled={!swapTo[p.id] || act.isPending} onClick={() => act.mutate({ method: 'POST', url: `/api/country-spots/purchases/${p.id}/swap`, body: { propertyId: Number(swapTo[p.id]) } })}>Move</Button>
                                            </div>
                                        )}
                                    </div>
                                )}
                                {p.note && p.status !== 'active' && p.status !== 'paused' && <p className="mt-3 text-sm text-muted-foreground">{p.note}</p>}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* Manage a country */}
            {(mine.data?.managedCountries ?? []).map((code) => (
                <ManagerPanel key={code} code={code} onChange={refresh} />
            ))}

            {mine.data?.userCountry && !(mine.data.managedCountries ?? []).includes(mine.data.userCountry) && (
                <section className="mt-10 rounded-2xl border border-dashed border-border p-4 md:p-6" aria-label="Manage your country">
                    <h2 className="font-display text-lg font-semibold">Look after {userCountryName}&apos;s spots</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        A country manager confirms payments made in their country and keeps the promoted listings honest. Managers are chosen by RealEVR. Tell us why it should be you.
                    </p>
                    <Textarea value={applyAbout} onChange={(e) => setApplyAbout(e.target.value.slice(0, 800))} rows={3} className="mt-3" placeholder="Who you are, where you work, why you" aria-label="About you" />
                    <Button className="mt-3" variant="outline" disabled={act.isPending || applyAbout.trim().length < 10} onClick={() => act.mutate({ method: 'POST', url: '/api/country-spots/manager-application', body: { country: mine.data!.userCountry, about: applyAbout } })}>
                        Apply
                    </Button>
                </section>
            )}
        </div>
    )
}

function ManagerPanel({ code, onChange }: { code: string; onChange: () => void }) {
    const { toast } = useToast()
    const data = useQuery<CountrySpotInfo & { purchases: Purchase[] }>({ queryKey: [`/api/country-spots/manage/${code}`] })
    const qc = useQueryClient()
    const [reason, setReason] = useState<Record<number, string>>({})
    const run = async (id: number, action: string, body?: unknown) => {
        try {
            await call('POST', `/api/country-spots/purchases/${id}/${action}`, body)
            await qc.invalidateQueries({ queryKey: [`/api/country-spots/manage/${code}`] })
            onChange()
        } catch (e) {
            toast({ title: 'Could not do that', description: (e as Error).message, variant: 'destructive' })
        }
    }
    const rows = data.data?.purchases ?? []
    return (
        <section className="mt-10 rounded-2xl border border-border p-4 md:p-6" aria-label={`Manage ${countryByCode(code)?.name}`}>
            <h2 className="font-display text-xl font-semibold">You manage {countryByCode(code)?.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
                {data.data ? `${data.data.free} of ${data.data.total} spots free. ` : ''}Confirm a payment only when you have seen the money arrive. Pause a spot that breaks the rules, and say why.
            </p>
            {data.isLoading ? (
                <Loader2 className="mt-4 h-5 w-5 animate-spin text-muted-foreground" />
            ) : rows.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">No requests yet.</p>
            ) : (
                <ul className="mt-3 space-y-3">
                    {rows.map((p) => (
                        <li key={p.id} className="rounded-xl border border-border p-3 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-semibold">{p.title}</span>
                                <span className="text-muted-foreground">{STATUS_LABEL[p.status]}</span>
                            </div>
                            <p className="text-muted-foreground">
                                {formatMoney(p.currency, p.amountLocal)} · reference {p.reference}{p.txnRef ? ` · transaction ${p.txnRef}` : ''}
                            </p>
                            {(p.status === 'awaiting_payment' || p.status === 'submitted') && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                    <Button size="sm" onClick={() => run(p.id, 'confirm')}>I saw the payment</Button>
                                    <Button size="sm" variant="outline" onClick={() => run(p.id, 'reject', { note: reason[p.id] })}>Not received</Button>
                                </div>
                            )}
                            {p.status === 'active' && (
                                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                    <Input value={reason[p.id] ?? ''} onChange={(e) => setReason({ ...reason, [p.id]: e.target.value })} placeholder="Why pause it?" aria-label="Reason" />
                                    <Button size="sm" variant="outline" onClick={() => run(p.id, 'pause', { note: reason[p.id] })}>Pause</Button>
                                </div>
                            )}
                            {p.status === 'paused' && (
                                <div className="mt-2"><Button size="sm" variant="outline" onClick={() => run(p.id, 'resume')}>Turn back on</Button></div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    )
}
