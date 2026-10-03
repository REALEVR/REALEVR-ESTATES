import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Clock, Copy, Gavel, Landmark, Loader2, ShieldAlert, ShieldCheck, Trophy, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import AuthModal from "@/components/auth/AuthModal";
import { useAuctionByProperty } from "@/hooks/useAuction";
import { auctionFetch, eat, formatLeft, money, type AuctionView } from "@/lib/auctionApi";

/**
 * The live auction on a bank-sale listing: price so far, a countdown, every bid as it comes in (as anonymous
 * aliases), the bank's provisions, and, depending on who is looking, the next step toward bidding:
 * apply to be vetted, register, pay the commitment fee, then bid. Refreshes itself every 3 seconds.
 */
export default function AuctionPanel({ propertyId }: { propertyId: number }) {
  const { data: auction, isLoading } = useAuctionByProperty(propertyId);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const offset = useRef(0);
  const [flash, setFlash] = useState(0);
  const lastTop = useRef<number | null>(null);

  // The countdown follows the SERVER's clock, so a wrong phone clock cannot show a wrong time left.
  useEffect(() => {
    if (auction) offset.current = Date.parse(auction.serverTime) - Date.now();
  }, [auction?.serverTime]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset.current), 250);
    return () => clearInterval(id);
  }, []);

  // A new top bid makes the price flash.
  useEffect(() => {
    const top = auction?.currentBid ?? null;
    if (lastTop.current !== null && top !== null && top !== lastTop.current) setFlash((f) => f + 1);
    lastTop.current = top;
  }, [auction?.currentBid]);

  const refresh = (view?: AuctionView) => {
    if (view) queryClient.setQueryData(["/auction/by-property", propertyId], view);
    else queryClient.invalidateQueries({ queryKey: ["/auction/by-property", propertyId] });
  };

  if (isLoading || !auction) return null;
  const a = auction;
  const phase = a.phase;
  const left = Date.parse(a.currentEndsAt) - now;
  const opensIn = Date.parse(a.startsAt) - now;
  const urgent = phase === "live" && left < 5 * 60_000;
  const me = a.me;

  return (
    <section className="mb-8 overflow-hidden rounded-2xl border border-border bg-card shadow-sm" aria-label="Live auction">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-[hsl(240_6%_8%)] px-4 py-3 text-white sm:px-5">
        <div className="flex items-center gap-2.5">
          <Gavel className="h-5 w-5 text-[hsl(158_64%_52%)]" aria-hidden="true" />
          <span className="whitespace-nowrap font-display text-sm font-bold uppercase tracking-[0.14em]">Live auction</span>
          {phase === "live" && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> LIVE
            </span>
          )}
          {phase === "scheduled" && <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold">Opens soon</span>}
          {phase === "ended" && <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold">Closed</span>}
        </div>
        <div className="flex items-center gap-2 text-sm" aria-live="off">
          <Clock className="h-4 w-4 opacity-80" aria-hidden="true" />
          {phase === "live" && (
            <span className={`font-mono text-lg font-bold tabular-nums ${urgent ? "text-red-300" : "text-[hsl(158_64%_52%)]"}`} role="timer" aria-label={`Time left ${formatLeft(left)}`}>
              {formatLeft(left)}
            </span>
          )}
          {phase === "scheduled" && <span className="font-mono tabular-nums">Opens in {formatLeft(opensIn)}</span>}
          {phase === "ended" && <span>Closed {eat(a.currentEndsAt)}</span>}
        </div>
      </header>

      <div className="grid gap-6 p-4 sm:p-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 19rem), 1fr))" }}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {phase === "ended" ? (a.winningBid ? "Winning bid" : "Closed with no bids") : a.currentBid ? "Current bid" : "Starting price"}
          </p>
          <p
            key={flash}
            className={`font-display text-3xl font-bold tabular-nums md:text-4xl ${flash > 0 ? "animate-[bidflash_1.2s_ease-out]" : ""}`}
            aria-live="polite"
          >
            {money(a.currency, phase === "ended" ? a.winningBid?.amount ?? a.currentBid ?? a.startingPrice : a.currentBid ?? a.startingPrice)}
          </p>
          <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Starting price</dt>
              <dd className="font-semibold">{money(a.currency, a.startingPrice)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Bids</dt>
              <dd className="font-semibold">{a.bidCount}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-muted-foreground"><Users className="h-3.5 w-3.5" aria-hidden="true" /> Bidders</dt>
              <dd className="font-semibold">{a.bidderCount}</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-muted-foreground">
            Seller: <strong className="text-foreground">{a.sellerName}</strong> · Closes {eat(a.endsAt)}
            {a.extended && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-900">extended to {eat(a.currentEndsAt)}</span>}
          </p>
          {phase === "live" && (
            <p className="mt-1 text-xs text-muted-foreground">
              A bid in the last {a.softCloseMinutes} minutes extends the closing time by {a.softCloseMinutes} minutes.
            </p>
          )}

          <Provisions a={a} />
        </div>

        <div className="space-y-4">
          <BidActions a={a} authed={!!user} onSignIn={() => setAuthOpen(true)} onChange={refresh} toast={toast} />
          <BidHistory a={a} />
        </div>
      </div>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-secondary/40 px-5 py-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Every bidder is vetted</span>
        <Link href="/auction-terms" className="underline underline-offset-2 hover:text-foreground">Auction terms</Link>
        <Link href="/bidder-vetting" className="underline underline-offset-2 hover:text-foreground">Bidder vetting</Link>
        <span>Times in East Africa Time. Bids are binding.</span>
      </footer>

      <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
    </section>
  );
}

function Provisions({ a }: { a: AuctionView }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-5 rounded-xl border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 font-semibold">
          <Landmark className="h-4 w-4 text-accent" aria-hidden="true" /> Bank provisions
        </span>
        <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="border-t border-border px-4 py-3 text-sm">
          <p className="whitespace-pre-wrap leading-relaxed text-foreground/90">{a.provisions}</p>
          <p className="mt-3 text-xs text-muted-foreground">
            Balance due within {a.settlementDays} days of closing unless the provisions above say otherwise. These provisions bind the winning bidder.
          </p>
        </div>
      )}
    </div>
  );
}

function BidHistory({ a }: { a: AuctionView }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">Bids so far</h3>
      {a.bids.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">No bids yet. The first bid sets the pace.</p>
      ) : (
        <ol className="max-h-64 space-y-1.5 overflow-y-auto pr-1" aria-label="Bid history">
          {a.bids.map((b, i) => (
            <li key={b.id} className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-lg px-3 py-2 text-sm ${i === 0 ? "bg-accent/10 font-semibold" : "bg-secondary/50"}`}>
              <span className="flex min-w-0 items-center gap-2">
                {i === 0 && <Trophy className="h-3.5 w-3.5 text-accent" aria-label="Highest" />}
                {b.alias}
                {a.me?.entry?.alias === b.alias && <span className="rounded bg-accent px-1.5 text-[10px] font-bold text-accent-foreground">YOU</span>}
              </span>
              <span className="text-right">
                <span className="tabular-nums">{money(a.currency, b.amount)}</span>
                <span className="block text-[11px] font-normal text-muted-foreground">{new Date(b.at).toLocaleTimeString("en-GB", { timeZone: "Africa/Kampala", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function BidActions({
  a,
  authed,
  onSignIn,
  onChange,
  toast,
}: {
  a: AuctionView;
  authed: boolean;
  onSignIn: () => void;
  onChange: (view?: AuctionView) => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const me = a.me;
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<AuctionView | void>) => {
    setBusy(true);
    try {
      const view = await fn();
      onChange(view || undefined);
    } catch (err: any) {
      toast({ title: "Couldn't do that", description: err?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const box = "rounded-xl border border-border p-4";

  if (a.phase === "ended" || a.phase === "cancelled") {
    return (
      <div className={`${box} bg-secondary/40 text-sm`}>
        {a.phase === "cancelled" ? "This auction was cancelled." : a.winningBid ? `This auction has closed. The winning bid was ${money(a.currency, a.winningBid.amount)} by ${a.winningBid.alias}.` : "This auction has closed with no bids."}
        {me?.isHighestBidder && a.phase === "ended" && <p className="mt-2 font-semibold text-accent">You won. We will contact you about the next steps.</p>}
      </div>
    );
  }

  if (!authed) {
    return (
      <div className={box}>
        <p className="mb-3 text-sm">Sign in to apply to bid. Every bidder is vetted before they can bid.</p>
        <Button className="w-full rounded-full" onClick={onSignIn}>Sign in to bid</Button>
      </div>
    );
  }

  if (!me || me.bidderStatus === "none") {
    return (
      <div className={box}>
        <p className="mb-1 font-semibold">Want to bid?</p>
        <p className="mb-3 text-sm text-muted-foreground">Apply to be vetted with your ID and proof of funds. It is free. You pay the US${a.commitmentFeeUsd.toLocaleString()} commitment fee only after you are approved.</p>
        <Button asChild className="w-full rounded-full"><Link href={`/auctions/apply?next=${encodeURIComponent(`/property/${a.propertyId}`)}`}>Apply to bid</Link></Button>
      </div>
    );
  }
  if (me.bidderStatus === "under_review") {
    return <div className={`${box} text-sm`}><p className="mb-1 flex items-center gap-2 font-semibold"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Your application is being reviewed</p>We aim to decide within two working days. We will notify you here and in your notifications.</div>;
  }
  if (me.bidderStatus === "applied" || me.bidderStatus === "rejected") {
    return (
      <div className={`${box} text-sm`}>
        <p className="mb-1 flex items-center gap-2 font-semibold"><ShieldAlert className="h-4 w-4 text-amber-600" aria-hidden="true" /> {me.bidderStatus === "rejected" ? "Your application was not approved" : "We need a little more from you"}</p>
        {me.decisionNote && <p className="mb-3 text-muted-foreground">{me.decisionNote}</p>}
        <Button asChild variant="outline" className="rounded-full"><Link href={`/auctions/apply?next=${encodeURIComponent(`/property/${a.propertyId}`)}`}>Update your application</Link></Button>
      </div>
    );
  }
  if (me.bidderStatus === "suspended") {
    return <div className={`${box} text-sm`}>Your bidder account is suspended. Please contact support@realevr.com.</div>;
  }

  // Approved from here on.
  if (!me.entry) {
    return (
      <div className={box}>
        <p className="mb-1 flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-green-600" aria-hidden="true" /> You are approved to bid</p>
        <p className="mb-3 text-sm text-muted-foreground">Register for this auction. You will get an anonymous bidder name and be asked for the commitment fee.</p>
        <Button className="w-full rounded-full" disabled={busy} onClick={() => run(() => auctionFetch<AuctionView>("POST", `/api/auctions/${a.id}/register`))}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Register for this auction
        </Button>
      </div>
    );
  }
  if (me.entry.feeStatus === "unpaid" || me.entry.feeStatus === "rejected") {
    return <FeeBox a={a} busy={busy} run={run} />;
  }
  if (me.entry.feeStatus === "submitted") {
    return (
      <div className={`${box} text-sm`}>
        <p className="mb-1 flex items-center gap-2 font-semibold"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Waiting to confirm your payment</p>
        We have your payment reference and are checking that the money arrived. You will be able to bid as soon as it is confirmed. Your bidder name here is <strong>{me.entry.alias}</strong>.
      </div>
    );
  }
  return <BidBox a={a} busy={busy} run={run} />;
}

function FeeBox({ a, busy, run }: { a: AuctionView; busy: boolean; run: (fn: () => Promise<AuctionView | void>) => Promise<void> }) {
  const entry = a.me!.entry!;
  const [ack, setAck] = useState(false);
  const [ref, setRef] = useState("");
  const [method, setMethod] = useState("bank transfer");
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-border p-4 text-sm">
      <p className="mb-1 font-semibold">Pay the commitment fee: US${a.commitmentFeeUsd.toLocaleString()}</p>
      {entry.feeStatus === "rejected" && entry.feeNote && (
        <p className="mb-2 rounded-lg bg-red-50 p-2 text-red-800">We couldn’t confirm your last payment: {entry.feeNote}. You can submit the reference again.</p>
      )}
      <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950">
        <strong>This fee is non-refundable.</strong> It is not a deposit and is not part of the price, whether you win, lose or withdraw. See the{" "}
        <Link href="/auction-terms" className="underline">Auction terms</Link>.
      </div>
      <label className="mb-3 flex cursor-pointer items-start gap-2.5">
        <Checkbox checked={ack} onCheckedChange={(v) => setAck(v === true)} className="mt-0.5" aria-label="I understand the commitment fee is non-refundable" />
        <span>I understand that the US${a.commitmentFeeUsd.toLocaleString()} commitment fee is <strong>non-refundable</strong> and I agree to the Auction Terms.</span>
      </label>
      {ack && (
        <div className="space-y-3">
          <div className="rounded-lg bg-secondary/60 p-3">
            <p className="whitespace-pre-wrap">{entry.payTo}</p>
            <p className="mt-2 flex items-center gap-2">
              Use this reference: <code className="rounded bg-background px-1.5 py-0.5 font-mono font-bold">{entry.reference}</code>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs text-accent underline"
                onClick={() => {
                  navigator.clipboard?.writeText(entry.reference).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  });
                }}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
              </button>
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label htmlFor="fee-method">How you paid</Label>
              <select id="fee-method" value={method} onChange={(e) => setMethod(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3">
                <option>bank transfer</option>
                <option>mobile money</option>
                <option>card</option>
                <option>other</option>
              </select>
            </div>
            <div>
              <Label htmlFor="fee-ref">Your payment reference</Label>
              <Input id="fee-ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Transaction number" className="mt-1" />
            </div>
          </div>
          <Button
            className="w-full rounded-full"
            disabled={busy || ref.trim().length < 4}
            onClick={() => run(() => auctionFetch<AuctionView>("POST", `/api/auctions/${a.id}/fee`, { acknowledged: true, reference: ref.trim(), method }))}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} I have paid: send for confirmation
          </Button>
        </div>
      )}
    </div>
  );
}

function BidBox({ a, busy, run }: { a: AuctionView; busy: boolean; run: (fn: () => Promise<AuctionView | void>) => Promise<void> }) {
  const me = a.me!;
  const min = a.minNextBid;
  const [amount, setAmount] = useState<string>(String(min));
  const [confirm, setConfirm] = useState(false);
  const touched = useRef(false);
  // Keep the box at the new minimum unless the bidder is typing their own number.
  useEffect(() => {
    if (!touched.current || Number(amount) < min) setAmount(String(min));
  }, [min]);
  const n = Number(amount.replace(/[^\d]/g, ""));
  const valid = Number.isInteger(n) && n >= min && a.phase === "live";
  const live = a.phase === "live";

  return (
    <div className="rounded-xl border-2 border-accent/50 bg-accent/5 p-4">
      {me.isHighestBidder ? (
        <p className="mb-2 flex items-center gap-2 text-sm font-bold text-green-700"><Trophy className="h-4 w-4" aria-hidden="true" /> You are the highest bidder</p>
      ) : (
        <p className="mb-2 text-sm font-semibold">You are bidding as <span className="rounded bg-accent px-1.5 py-0.5 text-accent-foreground">{me.entry!.alias}</span></p>
      )}
      <Label htmlFor="bid-amount" className="text-xs uppercase tracking-wider text-muted-foreground">Your bid ({a.currency})</Label>
      <Input
        id="bid-amount"
        inputMode="numeric"
        value={amount ? Number(amount.replace(/[^\d]/g, "")).toLocaleString() : ""}
        onChange={(e) => {
          touched.current = true;
          setAmount(e.target.value.replace(/[^\d]/g, ""));
        }}
        className="mt-1 h-12 text-lg font-bold tabular-nums"
        disabled={!live || me.isHighestBidder}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {[1, 2, 5].map((k) => (
          <button
            key={k}
            type="button"
            disabled={!live || me.isHighestBidder}
            onClick={() => {
              touched.current = true;
              setAmount(String(min + (k - 1) * a.minIncrement));
            }}
            className="rounded-full border border-border px-3 py-1 text-xs font-semibold hover:border-accent disabled:opacity-50"
          >
            {money(a.currency, min + (k - 1) * a.minIncrement)}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Minimum next bid: <strong>{money(a.currency, min)}</strong></p>
      <Button className="mt-3 h-12 w-full rounded-full text-base font-bold" disabled={busy || !valid || me.isHighestBidder} onClick={() => setConfirm(true)}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Place bid
      </Button>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm your bid</DialogTitle>
            <DialogDescription>Bids are binding. You cannot lower or withdraw a bid once it is placed.</DialogDescription>
          </DialogHeader>
          <p className="text-center font-display text-3xl font-bold tabular-nums">{money(a.currency, n)}</p>
          <p className="text-center text-sm text-muted-foreground">for {a.title}, on the bank’s provisions of sale.</p>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setConfirm(false)}>Go back</Button>
            <Button
              disabled={busy}
              onClick={async () => {
                setConfirm(false);
                touched.current = false;
                await run(async () => {
                  const r = await auctionFetch<{ auction: AuctionView }>("POST", `/api/auctions/${a.id}/bids`, { amount: n });
                  return r.auction;
                });
              }}
            >
              Yes, place my bid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
