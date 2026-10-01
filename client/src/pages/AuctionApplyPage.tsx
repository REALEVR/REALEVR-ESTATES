import { useState } from "react";
import { Link, useLocation, useSearchParams } from "wouter";
import { Loader2, ShieldCheck, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import AuthModal from "@/components/auth/AuthModal";
import { PageSeo } from "@/components/seo/PageSeo";
import { auctionFetch } from "@/lib/auctionApi";
import { AUCTION_RULES } from "@shared/auction-rules";

const ID_TYPES = [
  ["national_id", "National ID"],
  ["passport", "Passport"],
  ["driving_permit", "Driving permit"],
];
const FUNDS = [
  ["savings", "Savings"],
  ["sale_of_property", "Sale of property"],
  ["business_income", "Business income"],
  ["employment_income", "Employment income"],
  ["loan_or_mortgage", "Loan or mortgage"],
  ["gift_or_inheritance", "Gift or inheritance"],
  ["other", "Other"],
];

const select = "mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

/** Apply to be vetted as a bidder. Free; the commitment fee comes only after approval. */
export default function AuctionApplyPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [params] = useSearchParams();
  const [, navigate] = useLocation();
  const next = params.get("next");
  const back = next && next.startsWith("/") && !next.startsWith("//") ? next : "/bank-sales";
  const [authOpen, setAuthOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isPep, setIsPep] = useState(false);
  const [company, setCompany] = useState(false);
  const [consent, setConsent] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    form.set("isPep", String(isPep));
    form.set("representing", company ? "company" : "self");
    form.set("consent", String(consent));
    setBusy(true);
    try {
      await auctionFetch("POST", "/api/auction-bidder/apply", form);
      toast({ title: "Application sent", description: "We aim to decide within two working days. You will be notified." });
      navigate(back);
    } catch (err: any) {
      toast({ title: "We couldn't send your application", description: err?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container mx-auto max-w-3xl px-4 py-10">
      <PageSeo title="Apply to bid | RealEVR Estates" description="Apply to be vetted as a bidder in RealEVR Estates live bank-sale auctions." canonicalPath="/auctions/apply" />
      <h1 className="font-display text-3xl font-bold">Apply to bid</h1>
      <p className="mt-2 text-muted-foreground">
        Bank-sale auctions involve large sums, so every bidder is checked before they can bid. It is free to apply. If you are approved, you will then pay a
        US${AUCTION_RULES.commitmentFeeUsd.toLocaleString()} <strong>non-refundable</strong> commitment fee for each auction you join. Read the{" "}
        <Link href="/bidder-vetting" className="text-accent underline">Bidder Vetting Policy</Link> and{" "}
        <Link href="/auction-terms" className="text-accent underline">Auction Terms</Link>.
      </p>

      {!user ? (
        <div className="mt-8 rounded-2xl border border-border p-6 text-center">
          <p className="mb-4">Sign in or create an account to apply.</p>
          <Button className="rounded-full" onClick={() => setAuthOpen(true)}>Sign in</Button>
          <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-8">
          <fieldset className="space-y-4">
            <legend className="mb-1 font-display text-lg font-bold">About you</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label htmlFor="fullName">Full legal name</Label><Input id="fullName" name="fullName" required className="mt-1" autoComplete="name" /></div>
              <div><Label htmlFor="dateOfBirth">Date of birth</Label><Input id="dateOfBirth" name="dateOfBirth" type="date" required className="mt-1" autoComplete="bday" /></div>
              <div><Label htmlFor="nationality">Nationality</Label><Input id="nationality" name="nationality" required className="mt-1" /></div>
              <div><Label htmlFor="phone">Phone (WhatsApp)</Label><Input id="phone" name="phone" type="tel" required className="mt-1" autoComplete="tel" placeholder="+256…" /></div>
              <div className="sm:col-span-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required className="mt-1" autoComplete="email" /></div>
              <div className="sm:col-span-2"><Label htmlFor="address">Residential address</Label><Textarea id="address" name="address" required rows={2} className="mt-1" autoComplete="street-address" /></div>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="mb-1 font-display text-lg font-bold">Your ID</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="idType">Type of ID</Label>
                <select id="idType" name="idType" required className={select} defaultValue="national_id">
                  {ID_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div><Label htmlFor="idNumber">ID number</Label><Input id="idNumber" name="idNumber" required className="mt-1" /></div>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="mb-1 font-display text-lg font-bold">Money and position</legend>
            <div>
              <Label htmlFor="sourceOfFunds">Where will the money come from?</Label>
              <select id="sourceOfFunds" name="sourceOfFunds" required className={select} defaultValue="">
                <option value="" disabled>Choose…</option>
                {FUNDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <Checkbox checked={isPep} onCheckedChange={(v) => setIsPep(v === true)} className="mt-0.5" />
              <span>I, or a close family member or associate, hold or have held a prominent public position (a politician, senior official, judge, military officer or head of a state company).</span>
            </label>
            {isPep && <div><Label htmlFor="pepDetails">Which position?</Label><Textarea id="pepDetails" name="pepDetails" rows={2} className="mt-1" required /></div>}
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <Checkbox checked={company} onCheckedChange={(v) => setCompany(v === true)} className="mt-0.5" />
              <span>I am bidding for a company.</span>
            </label>
            {company && <div><Label htmlFor="companyName">Company name</Label><Input id="companyName" name="companyName" className="mt-1" required /></div>}
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="mb-1 font-display text-lg font-bold">Documents</legend>
            <p className="text-sm text-muted-foreground">
              JPG, PNG, WEBP or PDF, up to 8 MB each. They are stored privately and seen only by the administrators who vet bidders.
            </p>
            {[
              ["idDocument", "Government photo ID", false],
              ["proofOfAddress", "Proof of address (last 3 months)", false],
              ["proofOfFunds", "Proof of funds (bank statement, bank letter or mortgage pre-approval)", false],
            ].map(([name, label]) => (
              <div key={name as string}>
                <Label htmlFor={name as string} className="flex items-center gap-2"><Upload className="h-4 w-4" aria-hidden="true" /> {label}</Label>
                <Input id={name as string} name={name as string} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required className="mt-1" />
              </div>
            ))}
          </fieldset>

          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" aria-label="I agree to the verification" />
            <span>
              I confirm everything above is true, I agree to being verified and to my details being checked against public sanctions and public-position lists, and I
              have read the <Link href="/privacy" className="text-accent underline">Privacy Policy</Link> and <Link href="/bidder-vetting" className="text-accent underline">Bidder Vetting Policy</Link>.
            </span>
          </label>

          <Button type="submit" size="lg" className="w-full rounded-full" disabled={busy || !consent}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />}
            Send my application
          </Button>
        </form>
      )}
    </div>
  );
}
