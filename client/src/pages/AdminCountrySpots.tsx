import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Rocket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'

interface Payee {
    methodLabel: string
    accountName: string
    accountNumber: string
    instructions: string
}

interface CountryRow {
    code: string
    name: string
    currency: string
    enabled: boolean
    spots: number
    perUsd: number
    payee: Payee
    planUsd: Record<string, number>
    managerUserIds: number[]
    tokenSet: boolean
    open: boolean
}

interface Application {
    id: number
    countryCode: string
    userId: number
    about: string
    user: { id: number; name: string; email: string; phone?: string } | null
}

interface Overview {
    countries: CountryRow[]
    applications: Application[]
    pending: number
    plans: Array<{ id: string; label: string; days: number; usd: number }>
}

async function call<T = any>(method: string, url: string, body?: unknown): Promise<T> {
    const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'include' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.message || 'Something went wrong.')
    return data as T
}

/**
 * Admin > Country spots. Open a country by saying how many spots it has, the local-money rate, and where its money goes.
 * Only administrators change the payee or rate, so a country manager can confirm payments but never redirect them.
 */
export default function AdminCountrySpots() {
    const { toast } = useToast()
    const qc = useQueryClient()
    const { data, isLoading } = useQuery<Overview>({ queryKey: ['/api/admin/country-spots'] })
    const [filter, setFilter] = useState('')
    const [openCode, setOpenCode] = useState<string | null>(null)

    const reload = () => qc.invalidateQueries({ queryKey: ['/api/admin/country-spots'] })
    const fail = (e: Error) => toast({ title: 'Could not save', description: e.message, variant: 'destructive' })

    if (isLoading || !data) return <Loader2 className="mx-auto my-24 h-6 w-6 animate-spin text-muted-foreground" />
    const rows = data.countries.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()) || c.code.toLowerCase() === filter.toLowerCase())
    const opened = data.countries.filter((c) => c.open)

    return (
        <div className="container mx-auto max-w-4xl px-4 py-8">
            <h1 className="flex items-center gap-2 text-3xl font-bold">
                <Rocket className="h-7 w-7 text-accent" aria-hidden="true" /> Country spots
            </h1>
            <p className="mt-1 text-muted-foreground">
                {opened.length} {opened.length === 1 ? 'country' : 'countries'} open for sale · {data.pending} {data.pending === 1 ? 'payment' : 'payments'} waiting to be confirmed.
            </p>

            {data.applications.length > 0 && (
                <Card className="mt-6">
                    <CardHeader>
                        <CardTitle className="text-base">Country manager applications</CardTitle>
                        <CardDescription>Managers see and confirm payments for their country. Appoint only people you trust.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {data.applications.map((a) => {
                            const country = data.countries.find((c) => c.code === a.countryCode)
                            return (
                                <div key={a.id} className="rounded-lg border border-border p-3 text-sm">
                                    <p className="font-semibold">
                                        {a.user?.name ?? `User #${a.userId}`} · {country?.name} · account #{a.userId}
                                    </p>
                                    <p className="text-muted-foreground">{a.user?.email} {a.user?.phone ? `· ${a.user.phone}` : ''}</p>
                                    <p className="mt-1">{a.about}</p>
                                    <div className="mt-2 flex gap-2">
                                        <Button
                                            size="sm"
                                            onClick={() => call('PUT', `/api/admin/country-spots/${a.countryCode}`, { managerUserIds: [...(country?.managerUserIds ?? []), a.userId] }).then(reload).catch(fail)}
                                        >
                                            Make manager
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={() => call('POST', `/api/admin/country-spots/applications/${a.id}/decline`).then(reload).catch(fail)}>
                                            Decline
                                        </Button>
                                    </div>
                                </div>
                            )
                        })}
                    </CardContent>
                </Card>
            )}

            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a country" aria-label="Find a country" className="mt-6" />
            <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
                {rows.map((c) => (
                    <li key={c.code}>
                        <button type="button" onClick={() => setOpenCode(openCode === c.code ? null : c.code)} className="flex min-h-12 w-full items-center justify-between px-4 py-2 text-left hover:bg-muted" aria-expanded={openCode === c.code}>
                            <span className="font-medium">{c.name}</span>
                            <span className={`text-xs font-semibold ${c.open ? 'text-green-700' : 'text-muted-foreground'}`}>{c.open ? `Open · ${c.spots} spots` : c.enabled ? 'Needs a payee' : 'Closed'}</span>
                        </button>
                        {openCode === c.code && <CountryEditor key={c.code} row={c} plans={data.plans} onSaved={reload} />}
                    </li>
                ))}
            </ul>
        </div>
    )
}

function CountryEditor({ row, plans, onSaved }: { row: CountryRow; plans: Overview['plans']; onSaved: () => void }) {
    const { toast } = useToast()
    const [enabled, setEnabled] = useState(row.enabled)
    const [spots, setSpots] = useState(String(row.spots))
    const [perUsd, setPerUsd] = useState(row.perUsd ? String(row.perUsd) : '')
    const [payee, setPayee] = useState<Payee>(row.payee)
    const [planUsd, setPlanUsd] = useState<Record<string, string>>(Object.fromEntries(plans.map((p) => [p.id, row.planUsd?.[p.id] ? String(row.planUsd[p.id]) : ''])))
    const [managers, setManagers] = useState(row.managerUserIds.join(', '))
    const [token, setToken] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    const save = async () => {
        setSaving(true)
        try {
            await call('PUT', `/api/admin/country-spots/${row.code}`, {
                enabled,
                spots: Number(spots),
                perUsd: perUsd === '' ? 0 : Number(perUsd),
                payee,
                planUsd,
                managerUserIds: managers.split(/[\s,]+/).filter(Boolean).map(Number),
            })
            toast({ title: `${row.name} saved` })
            onSaved()
        } catch (e) {
            toast({ title: 'Could not save', description: (e as Error).message, variant: 'destructive' })
        } finally {
            setSaving(false)
        }
    }

    const field = (label: string, value: string, set: (v: string) => void, extra?: string) => (
        <label className="block text-sm font-medium">
            {label}
            <Input value={value} onChange={(e) => set(e.target.value)} className="mt-1" />
            {extra && <span className="mt-1 block text-xs font-normal text-muted-foreground">{extra}</span>}
        </label>
    )

    return (
        <div className="space-y-4 bg-muted/40 px-4 py-4">
            <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-5 w-5" /> Sell spots in {row.name}
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
                {field('Number of spots', spots, setSpots)}
                {field(`${row.currency} per US dollar`, perUsd, setPerUsd, 'Leave empty to charge in US dollars. Prices are rounded up to 3 figures.')}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
                {plans.map((p) => field(`${p.label}: US$ (default ${p.usd})`, planUsd[p.id] ?? '', (v) => setPlanUsd({ ...planUsd, [p.id]: v })))}
            </div>
            <fieldset className="space-y-3 rounded-lg border border-border p-3">
                <legend className="px-1 text-sm font-semibold">Where the money goes</legend>
                {field('Method (shown to payers)', payee.methodLabel, (v) => setPayee({ ...payee, methodLabel: v }), 'e.g. M-Pesa, MTN MoMo, bank transfer')}
                <div className="grid gap-3 sm:grid-cols-2">
                    {field('Account name', payee.accountName, (v) => setPayee({ ...payee, accountName: v }), 'Payers are told to check this name before they confirm.')}
                    {field('Number or account', payee.accountNumber, (v) => setPayee({ ...payee, accountNumber: v }))}
                </div>
                <label className="block text-sm font-medium">
                    Anything else payers should know
                    <Textarea value={payee.instructions} onChange={(e) => setPayee({ ...payee, instructions: e.target.value })} rows={2} className="mt-1" />
                </label>
            </fieldset>
            {field('Country managers (account numbers, comma separated)', managers, setManagers, 'A manager confirms payments and pauses spots in this country. They cannot change the payee or the rate.')}

            <div className="flex flex-wrap items-center gap-2">
                <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
                <Button
                    variant="outline"
                    onClick={() => call('POST', `/api/admin/country-spots/${row.code}/token`).then((r) => setToken(r.token)).catch((e) => toast({ title: 'Could not make a token', description: e.message, variant: 'destructive' }))}
                >
                    {row.tokenSet ? 'Replace the forwarding token' : 'Make a forwarding token'}
                </Button>
            </div>
            {token && (
                <p className="break-all rounded-lg bg-background p-3 text-sm">
                    Copy this now, it is not shown again. Have the payee&apos;s phone forward each received-money message to{' '}
                    <strong>{window.location.origin}/api/country-spots/inbound/{row.code}</strong> with the header <code>x-payment-token: {token}</code>. A receipt that
                    carries a spot&apos;s reference and the full price switches that spot on by itself. Without it, the country manager confirms by hand.
                </p>
            )}
        </div>
    )
}
