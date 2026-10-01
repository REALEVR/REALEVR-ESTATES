import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Briefcase, Globe2, Handshake } from "lucide-react";
import { PageSeo } from "@/components/seo/PageSeo";
import { Label } from "@/components/ui/label";
import { useProgram } from "@/hooks/usePartnerProgram";
import { PARTNER_ROLES } from "@shared/partner-program";

/**
 * Careers and partner opportunities. There are no staff jobs advertised here (none are open, and we do not invent
 * any); the listings are the partner opportunities open in every country, plus any an administrator adds for
 * particular countries.
 */
export default function CareersPage() {
  const { data } = useProgram();
  const [code, setCode] = useState("");
  const [role, setRole] = useState("");
  const countries = data?.countries ?? [];
  const byCode = useMemo(() => new Map(countries.map((c) => [c.code, c])), [countries]);
  const chosen = code ? byCode.get(code) : undefined;

  const listings = (data?.listings ?? []).filter((l) => (!code || l.countries.length === 0 || l.countries.includes(code)) && (!role || l.role === role));

  return (
    <div className="container mx-auto max-w-4xl px-4 py-10">
      <PageSeo
        title="Careers and partner opportunities | RealEVR Estates"
        description="Work with RealEVR Estates: partner opportunities for banks, developers, agencies, auctioneers and professionals in every country, with the fees and requirements spelled out."
        canonicalPath="/careers"
      />
      <h1 className="font-display text-3xl font-bold">Careers and partner opportunities</h1>
      <p className="mt-2 text-muted-foreground">
        Join the platform that puts African property, and bank-sale auctions, in front of buyers worldwide.
      </p>

      <section className="mt-8 rounded-xl border border-border p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Briefcase className="h-5 w-5 text-accent" /> Working at RealEVR Estates</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          We have no staff roles open right now. If you would like to work with us, write to <a className="text-accent underline" href="mailto:support@realevr.com">support@realevr.com</a> with
          what you do and where you are, and we will get in touch when something fits.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="flex items-center gap-2 text-xl font-bold"><Handshake className="h-5 w-5 text-accent" /> Partner opportunities worldwide</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Open in every country. Choose yours to see the fee and what you need. Listing is free; banks pay a yearly partner fee for each country they run bank-sale auctions in.
        </p>

        <div className="mt-4 grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="c-country">Country</Label>
            <select id="c-country" value={code} onChange={(e) => setCode(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-base">
              <option value="">All countries</option>
              {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="c-role">Kind of partner</Label>
            <select id="c-role" value={role} onChange={(e) => setRole(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-base">
              <option value="">All kinds</option>
              {PARTNER_ROLES.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
          </div>
        </div>

        <ul className="mt-5 space-y-4">
          {listings.map((l) => {
            const where = l.countries.length === 0 ? "Worldwide" : l.countries.map((c) => byCode.get(c)?.name ?? c).join(", ");
            const target = chosen ?? (l.countries.length === 1 ? byCode.get(l.countries[0]) : undefined);
            return (
              <li key={l.id} className="rounded-xl border border-border p-5" data-testid="partner-listing">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold">{l.title}</h3>
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"><Globe2 className="h-3 w-3" /> {where}</span>
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium">
                    {l.paysFee ? (chosen ? `Partner fee: US$${chosen.feeUsd.toLocaleString()} a year` : "Yearly partner fee by country") : "No partner fee"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{l.description}</p>
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer font-medium">What you need and what you get</summary>
                  <h4 className="mt-2 font-semibold">You will need</h4>
                  <ul className="list-disc space-y-1 pl-5">{l.requirements.map((x) => <li key={x}>{x}</li>)}</ul>
                  <h4 className="mt-2 font-semibold">You get</h4>
                  <ul className="list-disc space-y-1 pl-5">{l.youGet.map((x) => <li key={x}>{x}</li>)}</ul>
                </details>
                <div className="mt-3">
                  <Link href={target ? `/become-a-partner/${target.slug}?role=${l.role}` : `/become-a-partner?role=${l.role}`} className="inline-flex min-h-10 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">
                    {target ? `Apply in ${target.name}` : "Choose a country and apply"}
                  </Link>
                </div>
              </li>
            );
          })}
          {listings.length === 0 && <li className="text-sm text-muted-foreground">Nothing matches. Clear a filter.</li>}
        </ul>
      </section>

      <section className="mt-10 rounded-xl border border-border p-5 text-sm">
        <h2 className="text-lg font-semibold">Before you apply</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><Link href="/fees" className="text-accent underline">Fee Schedule</Link>: every fee, by country</li>
          <li><Link href="/partner-terms" className="text-accent underline">Partner Terms</Link></li>
          <li><Link href="/auction-terms" className="text-accent underline">Auction Terms</Link> and the <Link href="/bidder-vetting" className="text-accent underline">Bidder Vetting Policy</Link></li>
          <li><Link href="/partners" className="text-accent underline">Our current partners</Link></li>
        </ul>
      </section>
    </div>
  );
}
