import { useMemo, useState } from "react";
import { Link } from "wouter";
import LegalPage from "@/components/legal/LegalPage";
import { useProgram } from "@/hooks/usePartnerProgram";
import { AUCTION_RULES } from "@shared/auction-rules";

export default function FeesPage() {
  const { data } = useProgram();
  const [code, setCode] = useState("UG");
  const mine = useMemo(() => data?.countries.find((c) => c.code === code), [data, code]);

  return (
    <LegalPage
      title="Fee Schedule"
      updated="October 1, 2026"
      path="/fees"
      description="Every fee RealEVR Estates charges: listing is free; live bank-sale auctions have a US$1,000 non-refundable bidder commitment fee and a yearly partner fee for bank-sale partners that depends on the country."
    >
      <p>Every fee we charge is on this page. If it is not here, we do not charge it. All amounts are in US dollars unless stated.</p>

      <div className="not-prose overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/60">
            <tr>
              <th className="p-3 font-semibold">Fee</th>
              <th className="p-3 font-semibold">Who pays</th>
              <th className="p-3 font-semibold">Amount</th>
              <th className="p-3 font-semibold">Refundable?</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border align-top">
            <tr><td className="p-3">Listing a property (rent, sale, short stay, bank sale)</td><td className="p-3">Owner, agent, developer, bank</td><td className="p-3">Free</td><td className="p-3">n/a</td></tr>
            <tr><td className="p-3">Partner fee for developers, agencies, auctioneers, valuers, law firms, photographers</td><td className="p-3">Partner</td><td className="p-3">Free</td><td className="p-3">n/a</td></tr>
            <tr><td className="p-3"><strong>Bank-sale partner fee</strong></td><td className="p-3">Bank or lender listing bank sales, for each country</td><td className="p-3">By country (see below)</td><td className="p-3">Returned if we refuse the application; non-refundable once approved</td></tr>
            <tr><td className="p-3"><strong>Auction commitment fee</strong></td><td className="p-3">Each vetted bidder, for each auction they register for</td><td className="p-3">US${AUCTION_RULES.commitmentFeeUsd.toLocaleString()}</td><td className="p-3"><strong>No</strong>, even if you do not win. It is not part of the price and is not paid to the bank</td></tr>
            <tr><td className="p-3">Commission on the sale price</td><td className="p-3">Nobody</td><td className="p-3">None</td><td className="p-3">n/a</td></tr>
            <tr><td className="p-3">Other services (viewing passes, deposits, RentRail, memberships)</td><td className="p-3">As shown before you pay</td><td className="p-3">Shown at checkout</td><td className="p-3">See the <Link href="/refund-policy">Refund Policy</Link></td></tr>
          </tbody>
        </table>
      </div>

      <h2>Bank-sale partner fee by country</h2>
      <p>The yearly fee for each country a bank lists in depends on that country's band. An administrator may set a different fee for one country; the table below always shows what is charged today.</p>

      <div className="not-prose space-y-3 rounded-xl border border-border p-4">
        <label htmlFor="fee-country" className="block text-sm font-medium">Your country</label>
        <select id="fee-country" value={code} onChange={(e) => setCode(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-base">
          {(data?.countries ?? []).map((c) => (
            <option key={c.code} value={c.code}>{c.name}</option>
          ))}
        </select>
        {mine && (
          <p className="text-lg" aria-live="polite">
            <strong>{mine.name}</strong>: <strong>US${mine.feeUsd.toLocaleString()}</strong> a year for a bank-sale partner.{" "}
            <Link href={`/become-a-partner/${mine.slug}`} className="text-sm text-accent underline">See what is needed and apply</Link>
          </p>
        )}
      </div>

      <ul>
        {(data?.tiers ?? []).map((t) => (
          <li key={t.tier}><strong>{t.label}:</strong> US${t.annualUsd.toLocaleString()} a year (band {t.tier})</li>
        ))}
      </ul>

      <h2>How the money moves</h2>
      <ul>
        <li>You pay only to the payee details shown inside your signed-in account, with your payment reference. Check the account name matches before you pay.</li>
        <li>We recognise the payment from the receipt and tell you in the app. If we cannot match it, a person checks.</li>
        <li>You are responsible for any bank, mobile-money or currency-exchange charges, and for sending the full amount.</li>
        <li>Fees may be shown in your local currency for convenience; the amount due is the US-dollar amount.</li>
      </ul>
      <p>
        See also: <Link href="/partner-terms">Partner Terms</Link> · <Link href="/auction-terms">Auction Terms</Link> · <Link href="/refund-policy">Refund Policy</Link>.
      </p>
    </LegalPage>
  );
}
