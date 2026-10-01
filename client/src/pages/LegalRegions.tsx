import { useMemo, useState } from "react";
import { Link } from "wouter";
import LegalPage from "@/components/legal/LegalPage";
import { LEGAL_REGIONS } from "@shared/legal-regions";
import { WORLD_COUNTRIES } from "@shared/world";
import { regionForCountry } from "@shared/legal-regions";

export default function LegalRegions() {
  const [code, setCode] = useState("");
  const mine = code ? regionForCountry(code) : undefined;
  const list = useMemo(() => (code ? (mine ? [mine] : LEGAL_REGIONS) : LEGAL_REGIONS), [code, mine]);

  return (
    <LegalPage
      title="The laws we design around, by region"
      updated="October 1, 2026"
      path="/legal/regions"
      description="Data-protection, consumer, anti-money-laundering and property laws RealEVR Estates follows in Uganda, East and West Africa, Europe, the UK, North America, Asia-Pacific and Latin America."
    >
      <p>
        RealEVR Estates is based in Uganda and used from many countries. Our documents and processes are written around the laws
        below so they can be applied wherever you are. <strong>This is information, not legal advice.</strong> Laws change, no
        regulator has "approved" these documents, and local counsel confirms the position for each country before we market there
        actively. If a mandatory law where you live gives you more protection than our Terms, that law applies to you.
      </p>

      <div className="not-prose rounded-xl border border-border p-4">
        <label htmlFor="country" className="mb-1 block text-sm font-medium">Where are you?</label>
        <select
          id="country"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-base"
        >
          <option value="">Show every region</option>
          {WORLD_COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>{c.name}</option>
          ))}
        </select>
        {code && !mine && (
          <p className="mt-2 text-sm text-muted-foreground">
            We have no region note for that country yet. Our Terms still apply, together with your own country's mandatory law. Showing every region below.
          </p>
        )}
      </div>

      {list.map((r) => (
        <section key={r.id} id={r.id}>
          <h2>{r.name}</h2>
          <h3>Privacy and data protection</h3>
          <ul>{r.privacy.map((x) => <li key={x}>{x}</li>)}</ul>
          <p><strong>Where to complain:</strong> {r.authority}</p>
          <h3>Consumer and electronic contracts</h3>
          <ul>{r.consumer.map((x) => <li key={x}>{x}</li>)}</ul>
          <h3>Money laundering, sanctions and corruption</h3>
          <ul>{r.moneyAndSanctions.map((x) => <li key={x}>{x}</li>)}</ul>
          <h3>Property and auctions</h3>
          <ul>{r.property.map((x) => <li key={x}>{x}</li>)}</ul>
          {r.note && <p className="rounded-lg bg-muted/60 p-3 text-sm">{r.note}</p>}
        </section>
      ))}

      <p>
        See also: <Link href="/terms">Terms</Link>, <Link href="/privacy">Privacy</Link>, <Link href="/aml-sanctions">Anti-money-laundering</Link>,{" "}
        <Link href="/data-rights">Your data rights</Link>.
      </p>
    </LegalPage>
  );
}
