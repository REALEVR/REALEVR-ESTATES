import { useState } from "react";
import { Link } from "wouter";
import { Loader2 } from "lucide-react";
import LegalPage from "@/components/legal/LegalPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WORLD_COUNTRIES } from "@shared/world";
import { COMPANY } from "@shared/company";

const TYPES: Array<[string, string]> = [
  ["access", "Get a copy of my data"],
  ["correct", "Correct my data"],
  ["delete", "Delete my data / close my account"],
  ["object", "Stop or limit how my data is used"],
  ["portability", "Move my data to another service"],
  ["withdraw_consent", "Withdraw my consent"],
  ["no_sale", "Do not sell or share my data (California and similar laws)"],
  ["complaint", "Complain about how my data is handled"],
];

export default function DataRights() {
  const [type, setType] = useState("access");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ reference: string; dueAt: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/data-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, fullName, email, country, details }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message || "We could not send your request. Please email us instead.");
      setDone(body);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <LegalPage
      title="Your data rights"
      updated="October 1, 2026"
      path="/data-rights"
      description="Ask RealEVR Estates for a copy of your data, to correct or delete it, to stop its use, or to complain. We answer within 30 days. Works for Uganda, the EU/UK, California and other regions."
    >
      <p>
        You can ask us what we hold about you and what we do with it. Whatever the country you live in, you can use this form;
        the right to do each thing depends on your local law, and we tell you if we cannot do something and why. Read the{" "}
        <Link href="/privacy">Privacy Policy</Link> for how we use data.
      </p>
      <ul>
        <li>We reply within <strong>30 days</strong> (sooner where the law says).</li>
        <li>We may ask you to prove who you are so nobody else can get or delete your data.</li>
        <li>It is free unless a request is clearly excessive.</li>
        <li>Some records (identity checks and payments for bank-sale auctions, anti-money-laundering records) must be kept by law for years; we tell you which.</li>
      </ul>

      {done ? (
        <div className="not-prose rounded-xl border border-green-300 bg-green-50 p-5 text-green-900" role="status">
          <p className="font-semibold">We have your request.</p>
          <p className="mt-1 text-sm">
            Your reference is <strong>{done.reference}</strong>. We have emailed you a copy, and we will reply by{" "}
            <strong>{new Date(done.dueAt).toDateString()}</strong> at the latest.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="not-prose space-y-4 rounded-xl border border-border p-5">
          <div className="space-y-1.5">
            <Label htmlFor="dr-type">What would you like us to do?</Label>
            <select id="dr-type" value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-base">
              {TYPES.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dr-name">Your name</Label>
              <Input id="dr-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dr-email">Email we should reply to</Label>
              <Input id="dr-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dr-country">Where do you live?</Label>
            <select id="dr-country" value={country} onChange={(e) => setCountry(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-base">
              <option value="">Choose a country</option>
              {WORLD_COUNTRIES.map((c) => (
                <option key={c.code} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dr-details">Anything we should know (optional, required for complaints)</Label>
            <Textarea id="dr-details" rows={4} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={2000} />
            <p className="text-xs text-muted-foreground">Do not send passwords, card numbers or identity documents here.</p>
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Send my request
          </Button>
        </form>
      )}

      <p>
        Prefer email? Write to <a href={`mailto:${COMPANY.emails.privacy}`}>{COMPANY.emails.privacy}</a>. You can also complain to your data protection authority; see{" "}
        <Link href="/legal/regions">the list by region</Link>.
      </p>
    </LegalPage>
  );
}
