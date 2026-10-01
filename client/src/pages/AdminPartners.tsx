import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Globe2, Handshake, Loader2, Mail, Save, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { PARTNER_ROLES } from "@shared/partner-program";
import { WORLD_COUNTRIES } from "@shared/world";

/**
 * The partner programme in one place (backs server/gene/partner-program.ts): applications to decide (the one human
 * step), fees by band and by country, partner listings, contacts to invite, and which countries are covered.
 */

interface App {
  id: number; role: string; organisation: string; country: string; contactName: string; email: string; phone: string; website: string;
  registrationNumber: string; licenceNumber: string; authority: string; message: string;
  status: string; statusNote?: string; feeUsd: number; feeStatus: string; feeReference?: string; feeNote?: string;
  signals: { domainMatchesWebsite: boolean; freeMail: boolean; hasRegistration: boolean; hasLicence: boolean };
  createdAt: string; activeUntil?: string;
}
interface Data {
  config: { overrides: { tiers?: Record<string, number>; countries?: Record<string, number> }; autoInvite: boolean };
  tiers: Array<{ tier: number; label: string; defaultAnnualUsd: number }>;
  applications: App[];
  listings: Array<{ id: number; title: string; role: string; countries: string[]; description: string; status: string }>;
  leads: { pending: number; invited: number; failed: number; unsubscribed: number; recent: Array<{ id: number; email: string; organisation: string; country: string; role: string; status: string }> };
  coverage: Array<{ code: string; name: string; continent: string; feeUsd: number; contacts: number; invited: number; applications: number; partners: number }>;
  countriesTotal: number; countriesWithContacts: number; countriesInvited: number; countriesWithPartners: number;
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message || "Something went wrong.");
  return body;
}
const cname = (code: string) => WORLD_COUNTRIES.find((c) => c.code === code)?.name ?? code;
const Sig = ({ ok, label }: { ok: boolean; label: string }) => (
  <span className={`inline-flex items-center gap-1 text-xs ${ok ? "text-green-700" : "text-amber-700"}`}>{ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}{label}</span>
);

export default function AdminPartners() {
  const { toast } = useToast();
  const [d, setD] = useState<Data | null>(null);
  const [tab, setTab] = useState<"apps" | "fees" | "listings" | "contacts" | "coverage">("apps");
  const load = async () => {
    try {
      setD(await api("/api/admin/partner-program"));
    } catch (e: any) {
      toast({ title: "Couldn't load", description: e.message, variant: "destructive" });
    }
  };
  useEffect(() => {
    load();
  }, []);
  const run = async (fn: () => Promise<any>, ok?: string) => {
    try {
      const r = await fn();
      if (ok) toast({ title: ok });
      await load();
      return r;
    } catch (e: any) {
      toast({ title: "Couldn't do that", description: e.message, variant: "destructive" });
    }
  };

  if (!d) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  const waiting = d.applications.filter((a) => a.status === "received" || a.status === "needs_info").length;

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-3xl font-bold"><Handshake className="h-7 w-7 text-accent" /> Partners</h1>
      <p className="mt-1 text-muted-foreground">Applications, fees by country, partner listings and invitations to organisations in every country.</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        {[["Awaiting you", waiting], ["Countries with contacts", `${d.countriesWithContacts}/${d.countriesTotal}`], ["Countries invited", `${d.countriesInvited}/${d.countriesTotal}`], ["Countries with a partner", `${d.countriesWithPartners}/${d.countriesTotal}`]].map(([l, v]) => (
          <Card key={String(l)}><CardContent className="p-4"><div className="text-sm text-muted-foreground">{l}</div><div className="text-2xl font-bold">{v}</div></CardContent></Card>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-2" role="tablist">
        {([["apps", `Applications (${d.applications.length})`], ["fees", "Fees"], ["listings", "Listings"], ["contacts", "Contacts and invitations"], ["coverage", "Country coverage"]] as const).map(([k, l]) => (
          <Button key={k} role="tab" aria-selected={tab === k} variant={tab === k ? "default" : "outline"} size="sm" onClick={() => setTab(k)}>{l}</Button>
        ))}
      </div>

      {tab === "apps" && <Applications d={d} run={run} />}
      {tab === "fees" && <Fees d={d} run={run} />}
      {tab === "listings" && <Listings d={d} run={run} />}
      {tab === "contacts" && <Contacts d={d} run={run} />}
      {tab === "coverage" && <Coverage d={d} />}
    </div>
  );
}

type Run = (fn: () => Promise<any>, ok?: string) => Promise<any>;

function Applications({ d, run }: { d: Data; run: Run }) {
  const [note, setNote] = useState<Record<number, string>>({});
  const [waive, setWaive] = useState<Record<number, boolean>>({});
  if (!d.applications.length) return <p className="mt-6 text-sm text-muted-foreground">No applications yet.</p>;
  const decide = (a: App, decision: string) =>
    run(() => api(`/api/admin/partner-program/applications/${a.id}/decision`, { method: "POST", body: JSON.stringify({ decision, note: note[a.id] ?? "", waiveFee: waive[a.id] === true }) }), "Done");
  return (
    <ul className="mt-6 space-y-3">
      {d.applications.map((a) => {
        const open = a.status === "received" || a.status === "needs_info";
        return (
          <li key={a.id}>
            <Card className={open ? "border-accent/50" : ""}>
              <CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{a.organisation}</strong>
                  <Badge variant="outline">{PARTNER_ROLES.find((r) => r.id === a.role)?.title ?? a.role}</Badge>
                  <Badge variant="outline">{cname(a.country)}</Badge>
                  <Badge variant={a.status === "approved" ? "default" : "outline"}>{a.status.replace("_", " ")}</Badge>
                  {a.feeUsd > 0 && <Badge variant={a.feeStatus === "confirmed" ? "default" : "outline"}>Fee US${a.feeUsd}: {a.feeStatus}</Badge>}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <Sig ok={a.signals.domainMatchesWebsite} label="Email matches website" />
                  <Sig ok={!a.signals.freeMail} label="Work email" />
                  <Sig ok={a.signals.hasRegistration} label="Registration given" />
                  {(a.role === "bank" || a.role === "professional") && <Sig ok={a.signals.hasLicence} label="Licence given" />}
                </div>
                <p className="text-sm">{a.contactName} · <a className="underline" href={`mailto:${a.email}`}>{a.email}</a> · {a.phone}{a.website ? <> · <a className="underline" href={a.website.startsWith("http") ? a.website : `https://${a.website}`} target="_blank" rel="noreferrer">{a.website}</a></> : null}</p>
                <p className="text-xs text-muted-foreground">Reg: {a.registrationNumber}{a.licenceNumber ? ` · Licence: ${a.licenceNumber}` : ""}</p>
                {a.authority && <p className="whitespace-pre-wrap rounded bg-muted/60 p-2 text-sm">{a.authority}</p>}
                {a.message && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{a.message}</p>}
                {a.feeReference && <p className="text-xs">Payment reference: <code>{a.feeReference}</code> {a.feeNote ? `· ${a.feeNote}` : ""}</p>}
                {a.feeStatus === "submitted" && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => run(() => api(`/api/admin/partner-program/applications/${a.id}/fee`, { method: "POST", body: JSON.stringify({ decision: "confirm" }) }), "Fee confirmed")}>Confirm fee by hand</Button>
                    <Button size="sm" variant="outline" onClick={() => run(() => api(`/api/admin/partner-program/applications/${a.id}/fee`, { method: "POST", body: JSON.stringify({ decision: "reject", note: note[a.id] ?? "" }) }), "Fee rejected")}>Fee not found</Button>
                  </div>
                )}
                {open && (
                  <div className="space-y-2 border-t border-border pt-3">
                    <Input placeholder="Note to the applicant (needed to refuse or ask for more)" value={note[a.id] ?? ""} onChange={(e) => setNote((p) => ({ ...p, [a.id]: e.target.value }))} />
                    {a.feeUsd > 0 && a.feeStatus !== "confirmed" && (
                      <label className="flex items-center gap-2 text-sm"><Switch checked={waive[a.id] === true} onCheckedChange={(v) => setWaive((p) => ({ ...p, [a.id]: v }))} /> Waive the fee for this partner</label>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => decide(a, "approve")}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => decide(a, "request_more")}>Ask for more</Button>
                      <Button size="sm" variant="destructive" onClick={() => decide(a, "reject")}>Refuse</Button>
                    </div>
                  </div>
                )}
                {a.status === "approved" && a.activeUntil && <p className="text-xs text-muted-foreground">Active until {new Date(a.activeUntil).toLocaleDateString()}</p>}
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

function Fees({ d, run }: { d: Data; run: Run }) {
  const [tiers, setTiers] = useState<Record<string, string>>(() => Object.fromEntries(d.tiers.map((t) => [String(t.tier), d.config.overrides.tiers?.[String(t.tier)]?.toString() ?? ""])));
  const [countries, setCountries] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(d.config.overrides.countries ?? {}).map(([k, v]) => [k, String(v)])));
  const [add, setAdd] = useState("");
  const save = () => run(() => api("/api/admin/partner-program/fees", { method: "PUT", body: JSON.stringify({ tiers, countries }) }), "Fees saved");
  return (
    <div className="mt-6 space-y-6">
      <p className="text-sm text-muted-foreground">Yearly partner fee for a bank-sale partner, in US dollars, per country. Leave a box empty to use the default. What you save is what the site shows and charges.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {d.tiers.map((t) => (
          <div key={t.tier} className="space-y-1.5 rounded-lg border border-border p-3">
            <Label htmlFor={`tier-${t.tier}`}>Band {t.tier}: {t.label}</Label>
            <Input id={`tier-${t.tier}`} type="number" min={0} placeholder={`Default ${t.defaultAnnualUsd}`} value={tiers[String(t.tier)] ?? ""} onChange={(e) => setTiers((p) => ({ ...p, [String(t.tier)]: e.target.value }))} />
          </div>
        ))}
      </div>
      <div>
        <h3 className="font-semibold">Single countries</h3>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <select value={add} onChange={(e) => setAdd(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="">Add a country…</option>
            {WORLD_COUNTRIES.filter((c) => !(c.code in countries)).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
          <Button size="sm" variant="outline" disabled={!add} onClick={() => { setCountries((p) => ({ ...p, [add]: "" })); setAdd(""); }}>Add</Button>
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {Object.entries(countries).map(([code, v]) => (
            <li key={code} className="flex items-center gap-2 rounded-lg border border-border p-2">
              <span className="flex-1 text-sm">{cname(code)}</span>
              <Input aria-label={`Fee for ${cname(code)}`} className="w-28" type="number" min={0} value={v} onChange={(e) => setCountries((p) => ({ ...p, [code]: e.target.value }))} />
              <Button size="sm" variant="ghost" onClick={() => setCountries((p) => { const n = { ...p }; delete n[code]; return n; })}>Remove</Button>
            </li>
          ))}
        </ul>
      </div>
      <Button onClick={save}><Save className="mr-1 h-4 w-4" /> Save fees</Button>
    </div>
  );
}

function Listings({ d, run }: { d: Data; run: Run }) {
  const [f, setF] = useState({ title: "", role: "bank", description: "", countries: [] as string[] });
  return (
    <div className="mt-6 space-y-6">
      <div className="space-y-3 rounded-xl border border-border p-4">
        <h3 className="font-semibold">Add a partner listing</h3>
        <p className="text-xs text-muted-foreground">Appears on the Careers page and the country pages. The five worldwide listings are always shown; add one here to look for a particular kind of partner in particular countries.</p>
        <Input placeholder="Title, e.g. Banks in West Africa" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
          {PARTNER_ROLES.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
        </select>
        <Textarea rows={3} placeholder="What you are looking for" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <div>
          <Label htmlFor="l-countries">Countries (hold Ctrl or Cmd to pick several; none = worldwide)</Label>
          <select id="l-countries" multiple size={6} value={f.countries} onChange={(e) => setF({ ...f, countries: Array.from(e.target.selectedOptions).map((o) => o.value) })} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            {WORLD_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </div>
        <Button onClick={() => run(async () => { await api("/api/admin/partner-program/listings", { method: "POST", body: JSON.stringify(f) }); setF({ title: "", role: "bank", description: "", countries: [] }); }, "Listing added")}>Add listing</Button>
      </div>
      <ul className="space-y-2">
        {d.listings.length === 0 && <li className="text-sm text-muted-foreground">No custom listings yet.</li>}
        {d.listings.map((l) => (
          <li key={l.id} className="rounded-lg border border-border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <strong>{l.title}</strong>
              <Badge variant="outline">{l.countries.length ? l.countries.map(cname).join(", ") : "Worldwide"}</Badge>
              <Badge variant={l.status === "open" ? "default" : "outline"}>{l.status}</Badge>
              <span className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" onClick={() => run(() => api(`/api/admin/partner-program/listings/${l.id}`, { method: "PATCH", body: JSON.stringify({ status: l.status === "open" ? "closed" : "open" }) }))}>{l.status === "open" ? "Close" : "Reopen"}</Button>
                <Button size="sm" variant="ghost" onClick={() => run(() => api(`/api/admin/partner-program/listings/${l.id}`, { method: "DELETE" }), "Removed")}>Delete</Button>
              </span>
            </div>
            <p className="mt-1 text-muted-foreground">{l.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Contacts({ d, run }: { d: Data; run: Run }) {
  const [text, setText] = useState("");
  return (
    <div className="mt-6 space-y-5">
      <div className="space-y-3 rounded-xl border border-border p-4">
        <h3 className="flex items-center gap-2 font-semibold"><Mail className="h-4 w-4" /> Invite organisations</h3>
        <p className="text-sm text-muted-foreground">
          Paste one contact per line: <code>email, organisation, country, kind</code> (kind is bank, developer, agency, professional or media; bank if left out). Each gets one
          invitation in the right language, with an unsubscribe link, sent automatically a few every hour. Only add organisations you have a genuine business reason to write to; anyone who unsubscribes is never contacted again.
        </p>
        <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={"info@examplebank.co.ke, Example Bank Kenya, Kenya, bank\nsales@builder.com.ng, Builder Ltd, NG, developer"} />
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={text.trim().length < 5} onClick={() => run(async () => { const r = await api("/api/admin/partner-program/leads", { method: "POST", body: JSON.stringify({ text }) }); if (r.bad?.length) alert(`${r.bad.length} line(s) were not understood:\n${r.bad.join("\n")}`); setText(""); return r; }, "Contacts added")}>Add contacts</Button>
          <Button variant="outline" onClick={() => run(async () => { const r = await api("/api/admin/partner-program/invite-now", { method: "POST" }); alert(`Sent ${r.sent}, failed ${r.failed}, skipped ${r.skipped}`); })}>Send a batch now</Button>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={d.config.autoInvite} onCheckedChange={(v) => run(() => api("/api/admin/partner-program/fees", { method: "PUT", body: JSON.stringify({ tiers: d.config.overrides.tiers ?? {}, countries: d.config.overrides.countries ?? {}, autoInvite: v }) }))} /> Send automatically every hour
          </label>
        </div>
        <p className="text-sm">Waiting {d.leads.pending} · Invited {d.leads.invited} · Failed {d.leads.failed} · Unsubscribed {d.leads.unsubscribed}</p>
      </div>
      <ul className="space-y-1 text-sm">
        {d.leads.recent.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-2 rounded border border-border px-3 py-1.5">
            <span className="font-medium">{l.organisation}</span><span className="text-muted-foreground">{l.email}</span><Badge variant="outline">{cname(l.country)}</Badge><Badge variant="outline">{l.role}</Badge><Badge variant={l.status === "invited" ? "default" : "outline"}>{l.status}</Badge>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => run(() => api(`/api/admin/partner-program/leads/${l.id}`, { method: "DELETE" }))}>Remove</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Coverage({ d }: { d: Data }) {
  const [show, setShow] = useState<"all" | "none">("all");
  const rows = useMemo(() => d.coverage.filter((c) => show === "all" || (c.contacts === 0 && c.partners === 0)), [d, show]);
  return (
    <div className="mt-6">
      <p className="text-sm text-muted-foreground">
        <Globe2 className="mr-1 inline h-4 w-4" />Every country has its own public page and is in the sitemap, so search engines are told about all {d.countriesTotal}. Reaching organisations needs contacts: countries with none are listed under “No contact yet”.
      </p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant={show === "all" ? "default" : "outline"} onClick={() => setShow("all")}>All countries</Button>
        <Button size="sm" variant={show === "none" ? "default" : "outline"} onClick={() => setShow("none")}>No contact yet ({d.coverage.filter((c) => c.contacts === 0 && c.partners === 0).length})</Button>
      </div>
      <div className="mt-3 overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/60"><tr><th className="p-2">Country</th><th className="p-2">Bank fee</th><th className="p-2">Contacts</th><th className="p-2">Invited</th><th className="p-2">Applications</th><th className="p-2">Partners</th></tr></thead>
          <tbody className="divide-y divide-border">
            {rows.map((c) => (
              <tr key={c.code}><td className="p-2">{c.name}</td><td className="p-2">US${c.feeUsd}</td><td className="p-2">{c.contacts}</td><td className="p-2">{c.invited}</td><td className="p-2">{c.applications}</td><td className="p-2">{c.partners}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
