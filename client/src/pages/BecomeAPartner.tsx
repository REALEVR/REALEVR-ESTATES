import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "wouter";
import { CheckCircle2, Clock, Loader2, ShieldCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageSeo } from "@/components/seo/PageSeo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useCountryPage, useMyApplications, useProgram, type MyApplication } from "@/hooks/usePartnerProgram";
import { PARTNER_ROLES } from "@shared/partner-program";
import { WORLD_COUNTRIES } from "@shared/world";
import { regionForCountry } from "@shared/legal-regions";
import { openKevin } from "@/components/kevin/kevinEvents";

const STATUS: Record<MyApplication["status"], string> = {
  received: "Received. An administrator will review it",
  needs_info: "We need more from you",
  approved: "Approved",
  rejected: "Not accepted",
};

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || "Something went wrong.");
  return data;
}

function PayPanel({ app, onDone }: { app: MyApplication; onDone: () => void }) {
  const { toast } = useToast();
  const [reference, setReference] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!app.pay) return null;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await post(`/api/partner-program/applications/${app.id}/fee`, { reference, acknowledged: ack });
      toast({ title: "Reference received", description: "We confirm the payment automatically when the receipt arrives." });
      onDone();
    } catch (err: any) {
      toast({ title: "Couldn't send it", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      <p className="font-semibold">Partner fee: US${app.pay.feeUsd.toLocaleString()} (yearly, for this country)</p>
      <p className="mt-1">{app.pay.payTo}</p>
      <p className="mt-1">Use this reference when you pay: <strong>{app.pay.reference}</strong></p>
      {app.feeStatus === "submitted" ? (
        <p className="mt-2 flex items-center gap-1.5"><Clock className="h-4 w-4" /> We have your payment reference and are matching it. You will be told in the app.</p>
      ) : (
        <form onSubmit={submit} className="mt-3 space-y-2">
          {app.feeNote && <p className="text-destructive">{app.feeNote}</p>}
          <Label htmlFor={`ref-${app.id}`}>Payment reference or transaction number you received</Label>
          <Input id={`ref-${app.id}`} value={reference} onChange={(e) => setReference(e.target.value)} required minLength={4} autoComplete="off" />
          <label className="flex items-start gap-2">
            <Checkbox checked={ack} onCheckedChange={(v) => setAck(v === true)} className="mt-0.5" />
            <span>I have paid the amount above to the payee shown, with the account name matching, and I understand the fee is non-refundable once my partnership is approved.</span>
          </label>
          <Button type="submit" size="sm" disabled={busy || !ack || reference.trim().length < 4}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} I have paid
          </Button>
        </form>
      )}
    </div>
  );
}

export default function BecomeAPartner() {
  const params = useParams<{ country?: string }>();
  const [search] = useSearchParams();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: program } = useProgram();
  const page = useCountryPage(params.country);
  const mine = useMyApplications(!!user);

  const country = page.data?.country;
  const [role, setRole] = useState(search.get("role") && PARTNER_ROLES.some((r) => r.id === search.get("role")) ? (search.get("role") as string) : "bank");
  const roleInfo = PARTNER_ROLES.find((r) => r.id === role)!;
  const fee = roleInfo.paysFee && country ? country.feeUsd : 0;

  const [f, setF] = useState({ organisation: "", contactName: "", email: "", phone: "", website: "", registrationNumber: "", licenceNumber: "", authority: "", message: "" });
  const [feeAck, setFeeAck] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (user) setF((p) => ({ ...p, contactName: p.contactName || user.fullName || "", email: p.email || user.email || "" }));
  }, [user]);

  const region = country ? regionForCountry(country.code) : undefined;
  const title = country ? `Partner with RealEVR Estates in ${country.name}` : "Become a RealEVR Estates partner";
  const partners = page.data?.partners ?? [];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!country) return;
    setBusy(true);
    try {
      await post("/api/partner-program/apply", { ...f, role, country: country.code, consent, feeAcknowledged: feeAck });
      toast({ title: "Application received", description: fee ? "Now pay the partner fee shown below." : "We will review it soon." });
      await qc.invalidateQueries({ queryKey: ["/api/partner-program/mine"] });
      setConsent(false);
      setFeeAck(false);
    } catch (err: any) {
      toast({ title: "Couldn't send your application", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const countryList = program?.countries ?? [];
  const myHere = useMemo(() => (mine.data ?? []).filter((a) => !country || a.country === country.code), [mine.data, country]);

  return (
    <div className="container mx-auto max-w-4xl px-4 py-10">
      <PageSeo
        title={`${title} | RealEVR Estates`}
        description={country ? `How banks, developers, agencies and other firms partner with RealEVR Estates in ${country.name}: what is required, the fee, and live bank-sale auctions with vetted bidders.` : "Banks, developers, agencies, auctioneers and professionals can partner with RealEVR Estates in any country: list free, run live bank-sale auctions with vetted bidders."}
        canonicalPath={params.country ? `/become-a-partner/${params.country}` : "/become-a-partner"}
      />
      <h1 className="font-display text-3xl font-bold">{title}</h1>
      <p className="mt-2 text-muted-foreground">
        Banks, developers, agencies, auctioneers and other professionals can partner with us in any country. Listing is free. Banks that run live bank-sale auctions
        pay a yearly partner fee that depends on the country.
      </p>

      <div className="mt-5 rounded-xl border border-border p-4">
        <Label htmlFor="partner-country">Choose your country</Label>
        <select
          id="partner-country"
          value={country?.slug ?? ""}
          onChange={(e) => e.target.value && navigate(`/become-a-partner/${e.target.value}`)}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-base"
        >
          <option value="">Select a country…</option>
          {countryList.map((c) => (
            <option key={c.code} value={c.slug}>{c.name}</option>
          ))}
        </select>
        {!country && params.country && page.isError && <p className="mt-2 text-sm text-destructive">We do not recognise that country.</p>}
      </div>

      {country && (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border p-4"><div className="text-sm text-muted-foreground">Bank-sale partner fee</div><div className="text-2xl font-bold">US${country.feeUsd.toLocaleString()}</div><div className="text-xs text-muted-foreground">a year, for {country.name}</div></div>
            <div className="rounded-xl border border-border p-4"><div className="text-sm text-muted-foreground">Developers, agencies, professionals</div><div className="text-2xl font-bold">Free</div><div className="text-xs text-muted-foreground">no partner fee</div></div>
            <div className="rounded-xl border border-border p-4"><div className="text-sm text-muted-foreground">Bidder commitment fee</div><div className="text-2xl font-bold">US$1,000</div><div className="text-xs text-muted-foreground">non-refundable, paid by each bidder to us</div></div>
          </div>

          {partners.length > 0 && (
            <div className="mt-6">
              <h2 className="text-lg font-semibold">Partners already in {country.name}</h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {partners.map((p) => (
                  <li key={p.organisation} className="rounded-full border border-border px-3 py-1 text-sm">{p.organisation}</li>
                ))}
              </ul>
            </div>
          )}

          <h2 className="mt-8 text-xl font-bold">What each kind of partner needs</h2>
          <div className="mt-3 space-y-3">
            {PARTNER_ROLES.map((r) => (
              <details key={r.id} className="rounded-xl border border-border p-4" open={r.id === role}>
                <summary className="cursor-pointer font-semibold">{r.title} <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal">{r.paysFee ? `US$${country.feeUsd.toLocaleString()}/yr` : "Free"}</span></summary>
                <p className="mt-2 text-sm text-muted-foreground">{r.summary}</p>
                <h3 className="mt-3 text-sm font-semibold">You will need</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{r.requirements.map((x) => <li key={x}>{x}</li>)}</ul>
                <h3 className="mt-3 text-sm font-semibold">You get</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{r.youGet.map((x) => <li key={x}>{x}</li>)}</ul>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => { setRole(r.id); document.getElementById("apply")?.scrollIntoView({ behavior: "smooth" }); }}>Apply as this kind of partner</Button>
              </details>
            ))}
          </div>

          <h2 className="mt-8 text-xl font-bold">How bank-sale auctions and fees work</h2>
          <ul className="mt-2 list-disc space-y-2 pl-6 text-sm">{(page.data?.auctionRules ?? []).map((r) => <li key={r}>{r}</li>)}</ul>

          <h2 className="mt-8 text-xl font-bold">The law in {country.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You are responsible for following the licensing, mortgage, auction, tax, anti-money-laundering and data-protection rules of {country.name}.
            {region ? <> We design around: {region.privacy[0]}; see the <Link href={`/legal/regions#${region.id}`} className="text-accent underline">laws by region</Link>.</> : <> See the <Link href="/legal/regions" className="text-accent underline">laws by region</Link>.</>}{" "}
            Read the <Link href="/partner-terms" className="text-accent underline">Partner Terms</Link> and the <Link href="/fees" className="text-accent underline">Fee Schedule</Link> before you apply.
          </p>

          {(page.data?.listings ?? []).length > 0 && (
            <>
              <h2 className="mt-8 text-xl font-bold">Open partner listings</h2>
              <ul className="mt-2 space-y-2">
                {(page.data?.listings ?? []).map((l) => (
                  <li key={l.id} className="rounded-lg border border-border p-3 text-sm">
                    <div className="font-semibold">{l.title}</div>
                    <p className="text-muted-foreground">{l.description}</p>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h2 id="apply" className="mt-10 scroll-mt-24 text-xl font-bold">Apply</h2>
          {!user ? (
            <div className="mt-3 rounded-xl border border-border p-4 text-sm">
              <p>Create a free account or log in, then come back here to apply. It takes about five minutes.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/auth"><Button>Log in or sign up</Button></Link>
                <Button variant="outline" onClick={() => openKevin({ context: "signup", handsFree: true })}>Ask Kevin to help</Button>
              </div>
            </div>
          ) : (
            <>
              {myHere.length > 0 && (
                <div className="mt-3 space-y-3">
                  {myHere.map((a) => (
                    <div key={a.id} className="rounded-xl border border-border p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{a.organisation}</span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{PARTNER_ROLES.find((r) => r.id === a.role)?.title}</span>
                        {a.status === "approved" && <span className="inline-flex items-center gap-1 text-sm text-green-700"><CheckCircle2 className="h-4 w-4" /> Approved{a.activeUntil ? ` until ${new Date(a.activeUntil).toLocaleDateString()}` : ""}</span>}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{STATUS[a.status]}{a.statusNote ? `: ${a.statusNote}` : ""}</p>
                      {a.feeUsd > 0 && a.feeStatus === "confirmed" && <p className="mt-1 flex items-center gap-1 text-sm text-green-700"><ShieldCheck className="h-4 w-4" /> Partner fee confirmed</p>}
                      {a.status !== "rejected" && (a.feeStatus === "unpaid" || a.feeStatus === "submitted" || a.feeStatus === "rejected") && <PayPanel app={a} onDone={() => qc.invalidateQueries({ queryKey: ["/api/partner-program/mine"] })} />}
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={submit} className="mt-4 space-y-4 rounded-xl border border-border p-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ap-role">Kind of partner</Label>
                  <select id="ap-role" value={role} onChange={(e) => setRole(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-base">
                    {PARTNER_ROLES.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                  </select>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label htmlFor="ap-org">Organisation name</Label><Input id="ap-org" value={f.organisation} onChange={(e) => set("organisation", e.target.value)} required /></div>
                  <div className="space-y-1.5"><Label htmlFor="ap-contact">Contact person</Label><Input id="ap-contact" value={f.contactName} onChange={(e) => set("contactName", e.target.value)} required /></div>
                  <div className="space-y-1.5"><Label htmlFor="ap-email">Work email</Label><Input id="ap-email" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} required /></div>
                  <div className="space-y-1.5"><Label htmlFor="ap-phone">Phone / WhatsApp (with country code)</Label><Input id="ap-phone" type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} required /></div>
                  <div className="space-y-1.5"><Label htmlFor="ap-web">Website</Label><Input id="ap-web" value={f.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" /></div>
                  <div className="space-y-1.5"><Label htmlFor="ap-reg">Business registration number</Label><Input id="ap-reg" value={f.registrationNumber} onChange={(e) => set("registrationNumber", e.target.value)} required /></div>
                  {(role === "bank" || role === "professional") && (
                    <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ap-lic">{role === "bank" ? "Banking or lending licence number" : "Professional licence or membership number"}</Label><Input id="ap-lic" value={f.licenceNumber} onChange={(e) => set("licenceNumber", e.target.value)} required /></div>
                  )}
                </div>
                {role === "bank" && (
                  <div className="space-y-1.5"><Label htmlFor="ap-auth">Who signs for the bank, and what is your authority to list and sell its properties?</Label><Textarea id="ap-auth" rows={3} value={f.authority} onChange={(e) => set("authority", e.target.value)} required /></div>
                )}
                <div className="space-y-1.5"><Label htmlFor="ap-msg">Anything else we should know (optional)</Label><Textarea id="ap-msg" rows={2} value={f.message} onChange={(e) => set("message", e.target.value)} /></div>
                {fee > 0 && (
                  <label className="flex items-start gap-2 text-sm"><Checkbox checked={feeAck} onCheckedChange={(v) => setFeeAck(v === true)} className="mt-0.5" /><span>I understand the partner fee for {country.name} is <strong>US${fee.toLocaleString()} a year</strong>, payable after I apply, and non-refundable once my partnership is approved.</span></label>
                )}
                <label className="flex items-start gap-2 text-sm"><Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" /><span>I accept the <Link href="/partner-terms" className="text-accent underline">Partner Terms</Link>, and that RealEVR Estates may keep these details and check them under the <Link href="/aml-sanctions" className="text-accent underline">Anti-Money-Laundering Policy</Link> and <Link href="/privacy" className="text-accent underline">Privacy Policy</Link>.</span></label>
                <Button type="submit" disabled={busy || !consent || (fee > 0 && !feeAck)}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Send my application</Button>
              </form>
            </>
          )}
        </>
      )}

      {!country && !params.country && (
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {PARTNER_ROLES.map((r) => (
            <div key={r.id} className="rounded-xl border border-border p-4">
              <div className="font-semibold">{r.title}</div>
              <p className="mt-1 text-sm text-muted-foreground">{r.summary}</p>
              <p className="mt-2 text-xs font-medium">{r.paysFee ? "Yearly partner fee by country" : "Free"}</p>
            </div>
          ))}
        </div>
      )}
      <p className="mt-10 text-sm text-muted-foreground">Questions? <Link href="/careers" className="text-accent underline">See all partner listings</Link>, or message us on WhatsApp +256 771 891 323.</p>
    </div>
  );
}
