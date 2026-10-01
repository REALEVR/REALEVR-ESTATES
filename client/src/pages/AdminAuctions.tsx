import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { Check, FileText, Gavel, Loader2, RefreshCw, ShieldCheck, Wallet, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { auctionFetch, eat, money } from "@/lib/auctionApi";

/**
 * Run the bank-sale auctions (server/gene/auctions.ts): schedule an auction (the lister states the price,
 * closing date and the bank's provisions), vet bidders (administrators only), confirm commitment fees by hand
 * once the money is seen, and watch every auction.
 */

type Tab = "auctions" | "vetting" | "fees";

export default function AdminAuctions() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState<Tab>("auctions");
  const [counts, setCounts] = useState({ pendingBidders: 0, pendingFees: 0 });

  const tabBtn = (id: Tab, label: string, n?: number) => (
    <Button key={id} variant={tab === id ? "default" : "outline"} size="sm" onClick={() => setTab(id)} aria-pressed={tab === id}>
      {label}
      {!!n && <span className="ml-1.5 rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">{n}</span>}
    </Button>
  );

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-3xl font-bold"><Gavel className="h-7 w-7 text-accent" /> Auctions</h1>
      <p className="mt-1 text-muted-foreground">Schedule bank-sale auctions, vet bidders and confirm commitment fees.</p>
      <div className="my-5 flex flex-wrap gap-2">
        {tabBtn("auctions", "Auctions")}
        {isAdmin && tabBtn("vetting", "Bidder vetting", counts.pendingBidders)}
        {isAdmin && tabBtn("fees", "Commitment fees", counts.pendingFees)}
      </div>
      {tab === "auctions" && <AuctionsTab isAdmin={isAdmin} onCounts={setCounts} />}
      {tab === "vetting" && isAdmin && <VettingTab />}
      {tab === "fees" && isAdmin && <FeesTab />}
    </div>
  );
}

function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const { toast } = useToast();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fn());
    } catch (err: any) {
      toast({ title: "Couldn't load", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    load();
  }, [load]);
  return { data, loading, reload: load };
}

const Spinner = () => <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

// ---------------------------------------------------------------------------

function AuctionsTab({ isAdmin, onCounts }: { isAdmin: boolean; onCounts: (c: { pendingBidders: number; pendingFees: number }) => void }) {
  const { data, loading, reload } = useLoad<any>(async () => {
    const r = await auctionFetch<any>("GET", isAdmin ? "/api/admin/auctions" : "/api/auctions");
    if (isAdmin) onCounts({ pendingBidders: r.pendingBidders, pendingFees: r.pendingFees });
    return isAdmin ? r.auctions : r;
  }, [isAdmin]);
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);

  const cancel = async (id: number) => {
    const reason = window.prompt("Why is this auction being cancelled? (optional)") ?? "";
    try {
      await auctionFetch("POST", `/api/auctions/${id}/cancel`, { reason });
      toast({ title: "Auction cancelled" });
      reload();
    } catch (err: any) {
      toast({ title: "Couldn't cancel", description: err?.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? "Close" : "Schedule an auction"}</Button>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}><RefreshCw className="mr-1 h-4 w-4" /> Refresh</Button>
      </div>
      {showForm && <CreateForm onDone={() => { setShowForm(false); reload(); }} />}
      {loading && !data ? <Spinner /> : !data?.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No auctions yet.</CardContent></Card>
      ) : (
        <ul className="space-y-3">
          {data.map((a: any) => (
            <li key={a.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <Link href={`/property/${a.propertyId}`} className="block truncate font-semibold hover:underline">{a.title}</Link>
                    <p className="text-sm text-muted-foreground">
                      {a.sellerName} · from {money(a.currency, a.startingPrice)} · closes {eat(a.currentEndsAt)}
                    </p>
                    <p className="text-sm">
                      {a.currentBid ? <>Top bid <strong>{money(a.currency, a.currentBid)}</strong> · </> : "No bids · "}
                      {a.bidCount} bid{a.bidCount === 1 ? "" : "s"} from {a.bidderCount} bidder{a.bidderCount === 1 ? "" : "s"}
                      {typeof a.entries === "number" && ` · ${a.entries} registered`}
                    </p>
                  </div>
                  <Badge variant={a.phase === "live" ? "default" : "secondary"}>{a.cancelledAt ? "cancelled" : a.phase}</Badge>
                  {(a.phase === "live" || a.phase === "scheduled") && !a.cancelledAt && a.bidCount === 0 && (
                    <Button size="sm" variant="outline" onClick={() => cancel(a.id)}>Cancel</Button>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const props = useLoad<any[]>(async () => {
    const r = await auctionFetch<any[]>("GET", "/api/properties");
    return (Array.isArray(r) ? r : []).filter((p) => p.category === "bank_sales");
  });
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    f.forEach((v, k) => {
      if (typeof v === "string" && v.trim() !== "") body[k] = v;
    });
    for (const k of ["endsAt", "startsAt"]) if (body[k]) body[k] = new Date(String(body[k])).toISOString();
    body.propertyId = Number(body.propertyId);
    body.startingPrice = Number(String(body.startingPrice).replace(/[^\d]/g, ""));
    setBusy(true);
    try {
      await auctionFetch("POST", "/api/auctions", body);
      toast({ title: "Auction scheduled" });
      onDone();
    } catch (err: any) {
      toast({ title: "Couldn't schedule it", description: err?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardContent className="p-5">
        {props.loading ? <Spinner /> : !props.data?.length ? (
          <p className="text-muted-foreground">There are no bank-sale listings yet. Add one under Properties (category “Bank sales”), then schedule its auction here.</p>
        ) : (
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="propertyId">Bank-sale property</Label>
              <select id="propertyId" name="propertyId" required className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" defaultValue="">
                <option value="" disabled>Choose…</option>
                {props.data.map((p) => <option key={p.id} value={p.id}>{p.title} (#{p.id})</option>)}
              </select>
            </div>
            <div><Label htmlFor="sellerName">Bank / seller</Label><Input id="sellerName" name="sellerName" required className="mt-1" placeholder="e.g. Stanbic Bank Uganda" /></div>
            <div><Label htmlFor="startingPrice">Starting price</Label><Input id="startingPrice" name="startingPrice" inputMode="numeric" required className="mt-1" placeholder="e.g. 450000000" /></div>
            <div><Label htmlFor="endsAt">Final sale (closing) date and time</Label><Input id="endsAt" name="endsAt" type="datetime-local" required className="mt-1" /></div>
            <div><Label htmlFor="startsAt">Opens (leave empty to open now)</Label><Input id="startsAt" name="startsAt" type="datetime-local" className="mt-1" /></div>
            <div><Label htmlFor="minIncrement">Minimum step (optional, about 1% by default)</Label><Input id="minIncrement" name="minIncrement" inputMode="numeric" className="mt-1" /></div>
            <div><Label htmlFor="settlementDays">Days to pay the balance</Label><Input id="settlementDays" name="settlementDays" inputMode="numeric" defaultValue="14" className="mt-1" /></div>
            <div className="sm:col-span-2">
              <Label htmlFor="provisions">The bank's provisions of sale</Label>
              <Textarea id="provisions" name="provisions" required rows={6} className="mt-1" placeholder={"Payment of the balance, timing, taxes and fees, state of the title, viewing, occupants, any approvals needed, what happens if the winner defaults…"} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Schedule auction</Button>
              <p className="mt-2 text-xs text-muted-foreground">Times are your browser's local time. Bidders see East Africa Time. A bid in the last 2 minutes extends the closing time by 2 minutes.</p>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function VettingTab() {
  const [filter, setFilter] = useState<"under_review" | "">("under_review");
  const { data, loading, reload } = useLoad<any[]>(() => auctionFetch<any[]>("GET", `/api/admin/auction-bidders${filter ? `?status=${filter}` : ""}`), [filter]);
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" variant={filter ? "default" : "outline"} onClick={() => setFilter("under_review")}>Waiting for review</Button>
        <Button size="sm" variant={filter ? "outline" : "default"} onClick={() => setFilter("")}>Everyone</Button>
        <Button size="sm" variant="ghost" onClick={reload}><RefreshCw className="h-4 w-4" /></Button>
      </div>
      {loading && !data ? <Spinner /> : !data?.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nobody here.</CardContent></Card>
      ) : data.map((b) => <BidderCard key={b.id} b={b} onDone={reload} />)}
    </div>
  );
}

const FUND_LABEL: Record<string, string> = { savings: "Savings", sale_of_property: "Sale of property", business_income: "Business income", employment_income: "Employment income", loan_or_mortgage: "Loan or mortgage", gift_or_inheritance: "Gift or inheritance", other: "Other" };
const DOC_LABEL: Record<string, string> = { idDocument: "ID", proofOfAddress: "Proof of address", proofOfFunds: "Proof of funds", other: "Other" };

function BidderCard({ b, onDone }: { b: any; onDone: () => void }) {
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const app = b.application;
  const decide = async (decision: string) => {
    setBusy(true);
    try {
      await auctionFetch("POST", `/api/admin/auction-bidders/${b.id}/decision`, { decision, note });
      toast({ title: "Done" });
      onDone();
    } catch (err: any) {
      toast({ title: "Couldn't save", description: err?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-bold">{app.fullName}</h3>
          <Badge variant={b.status === "approved" ? "default" : b.status === "under_review" ? "secondary" : "destructive"}>{b.status.replace("_", " ")}</Badge>
        </div>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div><dt className="inline text-muted-foreground">Born: </dt><dd className="inline">{app.dateOfBirth}</dd></div>
          <div><dt className="inline text-muted-foreground">Nationality: </dt><dd className="inline">{app.nationality}</dd></div>
          <div><dt className="inline text-muted-foreground">Phone: </dt><dd className="inline">{app.phone}</dd></div>
          <div><dt className="inline text-muted-foreground">Email: </dt><dd className="inline">{app.email}</dd></div>
          <div className="sm:col-span-2"><dt className="inline text-muted-foreground">Address: </dt><dd className="inline">{app.address}</dd></div>
          <div><dt className="inline text-muted-foreground">ID: </dt><dd className="inline">{app.idType.replace("_", " ")} {app.idNumber}</dd></div>
          <div><dt className="inline text-muted-foreground">Funds from: </dt><dd className="inline">{FUND_LABEL[app.sourceOfFunds] ?? app.sourceOfFunds}</dd></div>
          {app.representing === "company" && <div className="sm:col-span-2"><dt className="inline text-muted-foreground">Bidding for company: </dt><dd className="inline">{app.companyName}</dd></div>}
          <div className="sm:col-span-2">
            <dt className="inline text-muted-foreground">Public position: </dt>
            <dd className={`inline ${app.isPep ? "font-semibold text-amber-700" : ""}`}>{app.isPep ? `YES: ${app.pepDetails}` : "No"}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2">
          {b.documents.map((d: any) =>
            d.present ? (
              <a key={d.id} href={`/api/admin/auction-bidders/${b.id}/documents/${d.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm hover:border-accent">
                <FileText className="h-4 w-4" aria-hidden="true" /> {DOC_LABEL[d.kind] ?? d.kind}
              </a>
            ) : (
              <span key={d.id} className="inline-flex items-center gap-1.5 rounded-full border border-red-300 bg-red-50 px-3 py-1 text-sm text-red-800">
                <X className="h-4 w-4" aria-hidden="true" /> {DOC_LABEL[d.kind] ?? d.kind} missing from server
              </span>
            ),
          )}
        </div>
        {b.decisionNote && <p className="text-sm text-muted-foreground">Last note: {b.decisionNote}</p>}
        <div>
          <Label htmlFor={`note-${b.id}`} className="text-xs">Note to the bidder (needed to reject or ask for more)</Label>
          <Textarea id={`note-${b.id}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => decide("approve")}><ShieldCheck className="mr-1 h-4 w-4" /> Approve</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => decide("request_more")}>Ask for more</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => decide("reject")}>Reject</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide("suspend")}>Suspend</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function FeesTab() {
  const { data, loading, reload } = useLoad<any[]>(() => auctionFetch<any[]>("GET", "/api/admin/auction-entries?feeStatus=submitted"));
  const { toast } = useToast();
  const [busy, setBusy] = useState<number | null>(null);
  const decide = async (id: number, decision: "confirm" | "reject") => {
    let note = "";
    if (decision === "reject") {
      note = window.prompt("Why? (the bidder will see this, e.g. “Payment not found”)") ?? "";
      if (!note) return;
    } else if (!window.confirm("Confirm only if you have SEEN the money arrive. This lets the bidder start bidding.")) return;
    setBusy(id);
    try {
      await auctionFetch("POST", `/api/admin/auction-entries/${id}/fee`, { decision, note });
      toast({ title: decision === "confirm" ? "Fee confirmed" : "Fee rejected" });
      reload();
    } catch (err: any) {
      toast({ title: "Couldn't save", description: err?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-4">
      <Button variant="outline" size="sm" onClick={reload}><RefreshCw className="mr-1 h-4 w-4" /> Refresh</Button>
      {loading && !data ? <Spinner /> : !data?.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No payments waiting to be confirmed.</CardContent></Card>
      ) : (
        <ul className="space-y-3">
          {data.map((e) => (
            <li key={e.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center gap-3 p-4">
                  <Wallet className="h-5 w-5 text-accent" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{e.bidderName} <span className="font-normal text-muted-foreground">({e.alias})</span></p>
                    <p className="text-sm text-muted-foreground">{e.auctionTitle}</p>
                    <p className="text-sm">Reference they entered: <code className="rounded bg-secondary px-1.5">{e.feeReference}</code> · {e.feeMethod ?? "—"} · our code <code className="rounded bg-secondary px-1.5">{e.reference}</code></p>
                  </div>
                  <Button size="sm" disabled={busy === e.id} onClick={() => decide(e.id, "confirm")}><Check className="mr-1 h-4 w-4" /> Confirm</Button>
                  <Button size="sm" variant="outline" disabled={busy === e.id} onClick={() => decide(e.id, "reject")}>Reject</Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
