import { Link } from "wouter";
import LegalPage from "@/components/legal/LegalPage";
import { COMPANY } from "@shared/company";
import { AUCTION_FEE_RULES, FEE_TIERS } from "@shared/partner-program";

export default function PartnerTerms() {
  return (
    <LegalPage
      title="Partner Terms"
      updated="October 1, 2026"
      path="/partner-terms"
      description="The terms for banks, developers, agencies, auctioneers and other businesses that partner with RealEVR Estates anywhere in the world, including the yearly partner fee for bank-sale partners."
    >
      <p>
        These terms apply to a business or professional that applies to be, or is, a partner of {COMPANY.tradingName}. They add to our{" "}
        <Link href="/terms">Terms of Service</Link>, <Link href="/acceptable-use">Acceptable Use Policy</Link> and, for bank sales, the{" "}
        <Link href="/auction-terms">Auction Terms</Link>. If they conflict, these Partner Terms win for partners.
      </p>

      <h2>1. Who can be a partner</h2>
      <p>
        A business, institution or professional that can lawfully do what it offers in the country it applies for: a bank or
        lender, developer, agency, auctioneer, valuer, surveyor, law firm, conveyancer, photographer or tour creator. Each kind
        must show the documents on its <Link href="/become-a-partner">partner page</Link>. You apply for each country separately.
      </p>

      <h2>2. Approval</h2>
      <ul>
        <li>We review each application. We may refuse, or ask for more, and we say why. Listing and displaying your name as a partner starts only when we approve.</li>
        <li>A partner relationship lasts 12 months from approval and can be renewed. We may suspend or end it if you break these terms, the law or our policies, if what you told us was untrue, or if we must by law.</li>
        <li>We run checks on partners (identity, authority, sanctions and anti-money-laundering); see the <Link href="/aml-sanctions">policy</Link>. You agree to let us do this and to answer our questions promptly.</li>
      </ul>

      <h2>3. Fees</h2>
      <ul>
        <li><strong>Developers, agencies, professionals, photographers and tour creators:</strong> no partner fee. Listing on RealEVR Estates is free.</li>
        <li>
          <strong>Banks and lenders listing bank sales ("bank-sale partners"):</strong> a yearly partner fee for each country you list in, set by
          that country's band (shown on its page and in the <Link href="/fees">Fee Schedule</Link>). Current default bands, in US dollars a year:{" "}
          {FEE_TIERS.map((t) => `${t.label}: ${t.defaultAnnualUsd.toLocaleString()}`).join("; ")}. We may set a different fee for a single country and show it on that country's page before you apply.
        </li>
        <li>The partner fee is payable when you apply, to the payee details shown inside your signed-in account. Your partnership is reviewed once it is paid. If we refuse your application, the fee is returned (less any bank charges); once approved the fee is non-refundable.</li>
        <li>We take no commission on the price at which a property sells.</li>
        <li>Bidders pay us a separate commitment fee for each auction (see below). It is our platform fee, not part of your price, and not paid to you.</li>
      </ul>

      <h2>4. Running bank-sale auctions</h2>
      <p>For every bank sale you list as an auction, you promise that:</p>
      <ul>
        <li>you are the lender or its authorised agent, with power under the mortgage and the law to sell the property, and you will show proof on request;</li>
        <li>the sale will be conducted by a licensed auctioneer or court officer where the law of the country requires one, and you have given any notice the law requires to the borrower and others;</li>
        <li>the starting price, closing date and provisions of sale you give are accurate and complete (payment, timing, taxes, title position, viewing), and you will not change them after bidding opens except as the Auction Terms allow;</li>
        <li>no one connected to you, the borrower or the property bids or has someone bid for them; and</li>
        <li>you will complete the sale with the winning bidder on your stated provisions, or tell us promptly why you cannot.</li>
      </ul>
      <p>How fees and bids work for auctions:</p>
      <ul>{AUCTION_FEE_RULES.map((r) => <li key={r}>{r}</li>)}</ul>

      <h2>5. Your responsibilities</h2>
      <ul>
        <li>Follow every law that applies to you and to the properties you list, including licensing, consumer, anti-discrimination, tax, data-protection, anti-money-laundering, sanctions and anti-bribery law.</li>
        <li>Handle the personal data of people you meet through the Service only to deal with them, keep it secure, and follow the <Link href="/privacy">Privacy Policy</Link>. Where you decide how a bidder's or buyer's data is used, you are a data controller in your own right.</li>
        <li>Do not make false claims about us, or use our name or logo without permission. We may show your name and logo as a partner while you are one.</li>
        <li>Keep your listings accurate and remove what is sold or withdrawn.</li>
      </ul>

      <h2>6. Our role and limits</h2>
      <p>
        We provide the platform, bidder vetting and tools. We do not guarantee any sale, price, number of bidders or
        enquiries. Vetting reduces risk; it does not guarantee a bidder will complete. Our liability to you is limited as set
        out in the Terms of Service.
      </p>

      <h2>7. Law, disputes and changes</h2>
      <p>
        The laws of Uganda govern these terms, and disputes follow the process in section 18 of the Terms of Service
        (talk, mediation, then the courts of Uganda or, at your choice if you are a business, arbitration at CADER, Kampala). Mandatory law in your
        country that cannot be excluded still applies. We may change these terms with 30 days' notice; if you do not agree, you may end the partnership
        before the change takes effect.
      </p>

      <h2>8. Contact</h2>
      <p>
        <a href={`mailto:${COMPANY.emails.partners}`}>{COMPANY.emails.partners}</a> · WhatsApp {COMPANY.whatsapp}
      </p>
    </LegalPage>
  );
}
