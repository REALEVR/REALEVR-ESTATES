import { Link } from "wouter";
import LegalPage from "@/components/legal/LegalPage";
import { COMPANY, companyLines } from "@shared/company";

export default function TermsOfService() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="October 1, 2026"
      path="/terms"
      description="The terms for using RealEVR Estates anywhere in the world: accounts, listings, fees, live bank-sale auctions, partners, acceptable use, liability and governing law."
    >
      <p>
        These Terms of Service ("Terms") are the agreement between you and {COMPANY.tradingName} ("we", "us"), an online
        property platform operated from {COMPANY.city}, {COMPANY.country}. They cover our website, apps, virtual tours, live
        auctions, Kevin (our assistant) and everything else we offer (the "Service"), in every country where it can be
        reached. Please read them with our <Link href="/privacy">Privacy Policy</Link>, <Link href="/cookies">Cookie Policy</Link>,{" "}
        <Link href="/acceptable-use">Acceptable Use Policy</Link>, <Link href="/auction-terms">Auction Terms</Link> and{" "}
        <Link href="/partner-terms">Partner Terms</Link>, which form part of the agreement where they apply to you.
      </p>
      <p>
        <strong>Your local rights.</strong> Nothing in these Terms removes a right you have under the mandatory law of the
        country where you live (for example consumer-protection or data-protection law). Where a term would be unlawful
        or unenforceable for you, it does not apply to you, and the rest still does. See{" "}
        <Link href="/legal/regions">the laws we design around, by region</Link>.
      </p>

      <h2>1. Who we are and what we do</h2>
      <p>
        We are a platform. We show properties, virtual tours and live bank-sale auctions that others list, and we provide the
        tools to contact them and to bid. We are not a bank, lender, estate agent acting for either side, licensed valuer,
        surveyor, notary or law firm, and nothing on the Service is legal, tax, investment or financial advice. A property
        sale, rental or booking is a contract between you and the owner, agent, developer or bank, not with us, unless we say
        otherwise in writing.
      </p>

      <h2>2. Agreeing, eligibility and accounts</h2>
      <ol>
        <li>By creating an account, ticking the agreement box, or using the Service, you agree to these Terms. If you do not agree, do not use it. Agreeing electronically is a valid way to make a contract (for example under Uganda's Electronic Transactions Act, 2011, and similar laws elsewhere).</li>
        <li>You must be at least 18 years old and able to make a binding contract. If you act for a company or another person, you confirm you have authority to bind them.</li>
        <li>Give accurate, current information and keep it up to date. Keep your password safe: you are responsible for what happens under your account. Tell us at once if you think it has been misused.</li>
        <li>One person, one account, unless we agree otherwise. Do not sell, share or transfer an account.</li>
        <li>You must not use the Service if you are barred from doing so by law, or are on a sanctions list (see our <Link href="/aml-sanctions">Anti-Money-Laundering and Sanctions Policy</Link>).</li>
      </ol>

      <h2>3. Listings: owners, agents, developers and banks</h2>
      <p>If you list a property, you promise that:</p>
      <ul>
        <li>you own it or are authorised by the owner (or, for a bank sale, by the lender with power of sale) to list and sell or let it, and can show us proof if asked;</li>
        <li>the description, price, photos, 360° images and virtual tour are accurate, current and show the property you are offering, and you disclose fees, taxes, charges, encumbrances and known defects;</li>
        <li>you have the right to upload the content and to give us the licence in section 8, and you have the consent of anyone identifiable in it;</li>
        <li>the listing does not discriminate unlawfully (for example on race, ethnicity, religion, sex, disability, nationality or family status) and follows the licensing, rental, safety and consumer rules that apply where the property is; and</li>
        <li>you will not take money for a listing outside the Service in a way that breaks these Terms, and will not ask people to pay into an account we have not published.</li>
      </ul>
      <p>
        Listing on RealEVR Estates is free. We may refuse, edit, hide or remove any listing that breaks these Terms, the law or
        our <Link href="/trust-safety">Trust and Safety</Link> rules, or that we reasonably believe could harm people.
      </p>

      <h2>4. Visitors, tenants and buyers</h2>
      <ul>
        <li>Photos, 360° tours and descriptions help you look; they are not a survey, valuation or promise. Check title, condition, planning/permit status, taxes and the seller's authority yourself, with your own adviser, before you pay or commit.</li>
        <li>We do not guarantee that any listing is available, accurate or lawful, or that any person you meet through the Service is who they say they are. Read our <Link href="/trust-safety">Trust and Safety</Link> advice: view before paying, never pay into an account that is not the one the Service shows you, and walk away from pressure.</li>
      </ul>

      <h2>5. Fees and payments</h2>
      <ul>
        <li>The <Link href="/fees">Fee Schedule</Link> lists every fee we charge, and which are refundable. Prices are shown before you pay. Taxes are extra where the law requires.</li>
        <li>Payment details are shown only inside your signed-in account (or on a page we send you after you sign in). We never ask you to pay into a different account by message, call or email. If you are unsure, ask us through the Service first.</li>
        <li>Where we accept mobile money, bank or card payments, a payment provider handles the money under its own terms. Where a payment is confirmed by hand or by matching a receipt, we tell you when it is confirmed.</li>
        <li>Refunds follow our <Link href="/refund-policy">Refund Policy</Link>. Some fees (including the auction commitment fee) are non-refundable once paid, and you must acknowledge that before you pay.</li>
        <li>You are responsible for your own taxes, duties and currency-exchange costs, and for any charges your bank or mobile-money provider makes.</li>
      </ul>

      <h2>6. Bank sales and live auctions</h2>
      <p>
        Bank sales are run as live online auctions under the <Link href="/auction-terms">Auction Terms and Conditions</Link>.
        Only bidders we have vetted (see the <Link href="/bidder-vetting">Bidder Vetting Policy</Link>) may bid, and each pays a
        non-refundable commitment fee (US${" "}1,000) for each auction before bidding. Bids are binding, the seller's provisions
        of sale bind the winning bidder, and the sale is between the bidder and the seller. We are the platform and do not
        guarantee the result of any auction or sale.
      </p>

      <h2>7. Partners</h2>
      <p>
        Banks, developers, agencies, auctioneers, law firms and other businesses may join as partners on the terms in the{" "}
        <Link href="/partner-terms">Partner Terms</Link>, including any partner fee for their country. Being a partner is not an
        endorsement by us of any partner's property, advice or conduct.
      </p>

      <h2>8. Your content and our rights</h2>
      <ol>
        <li><strong>Yours stays yours.</strong> You keep ownership of what you upload (photos, tours, text, messages).</li>
        <li><strong>Licence to us.</strong> You give us a worldwide, non-exclusive, royalty-free licence to host, copy, display, adapt (for example resize and compress), translate and distribute your content on the Service and in our promotion of your listing (including search results, social posts and the sitemap), for as long as the content is on the Service and for a reasonable period afterwards while it is cleared from backups.</li>
        <li><strong>Ours stays ours.</strong> The Service, our software, branding, tour viewer, design and the way data is arranged belong to us or our licensors and are protected by copyright, trademark and similar laws. You may not copy, scrape at scale, reverse engineer or resell them without permission.</li>
        <li><strong>Copyright and takedowns.</strong> If you think content infringes your rights, or is illegal, email <a href={`mailto:${COMPANY.emails.legal}`}>{COMPANY.emails.legal}</a> with: who you are; what the work is; the page address of the content; a statement that you believe in good faith the use is not authorised; a statement that your notice is accurate and, for copyright, that you are the owner or authorised to act; and your signature (typed is fine). We act promptly, tell the uploader, and allow a reply (a counter-notice). We end the accounts of repeat infringers. This process is designed to meet the US DMCA §512, the EU Digital Services Act and similar laws.</li>
      </ol>

      <h2>9. Acceptable use</h2>
      <p>
        You must follow the <Link href="/acceptable-use">Acceptable Use Policy</Link>: no fraud or fake listings, no
        harassment or discrimination, no scraping or interference with the Service, no illegal money movement, no malware.
        Breaking it can lead to removal of content, suspension, and reporting to the authorities.
      </p>

      <h2>10. Kevin and other automated features</h2>
      <p>
        Kevin, our assistant, uses automated systems to suggest properties and answer questions. It can be wrong. Do not rely
        on it for legal, tax or financial decisions. If you switch on voice listening, Kevin reacts only to talk about
        properties, and we keep only property-related content; you can switch it off at any time.
      </p>

      <h2>11. Third-party services</h2>
      <p>
        The Service links to or relies on others (maps, payment and messaging providers, tour hosts, WhatsApp). Their
        services are governed by their own terms, and we are not responsible for them.
      </p>

      <h2>12. Availability and changes to the Service</h2>
      <p>
        We work to keep the Service available but do not promise it will be uninterrupted or error-free. We may change or end
        features. For live auctions, if a technical fault or other event makes a fair result impossible, we may pause,
        extend, restart or cancel the auction, as set out in the Auction Terms.
      </p>

      <h2>13. Disclaimers</h2>
      <p>
        To the fullest extent the law allows, the Service is provided "as is" and "as available" without warranties of any kind,
        including fitness for a particular purpose, accuracy of listings, or non-infringement. Some laws do not allow some
        disclaimers; where that is so, they apply only as far as the law permits.
      </p>

      <h2>14. Limit of liability</h2>
      <ul>
        <li>We are not responsible for what owners, agents, banks, bidders, partners or other users say or do, or for the condition, title or legality of any property.</li>
        <li>To the fullest extent the law allows, we are not liable for indirect, incidental, special or consequential loss, or for lost profit, opportunity, or the cost of a purchase or rental that fails.</li>
        <li>Our total liability to you for anything arising from the Service is limited to the greater of the fees you paid us in the 12 months before the claim and US$100, except that nothing limits liability for death or personal injury caused by negligence, fraud, wilful misconduct, or anything the law does not allow to be limited.</li>
      </ul>

      <h2>15. Indemnity</h2>
      <p>
        If your breach of these Terms, your content, or your listing or bid causes a third party to claim against us, you will
        compensate us for the reasonable losses and costs that result, to the extent the law allows. This does not apply to
        consumers where the law does not permit it.
      </p>

      <h2>16. Suspension and ending</h2>
      <p>
        You may close your account at any time (see <Link href="/data-rights">Your data rights</Link>). We may suspend or end your access
        if you break these Terms or the law, if we must by law, to protect others, or if we stop offering the Service in your
        country; where reasonable we give notice and a chance to respond. Fees already paid are handled under the Fee
        Schedule and Refund Policy. Sections that by nature continue (content licence for existing material, liability,
        governing law) survive.
      </p>

      <h2>17. International use, sanctions and export</h2>
      <p>
        The Service is operated from Uganda and may be reached from anywhere, but not every feature is offered in every
        country. You are responsible for following the laws where you live and where the property is, including foreign-buyer
        restrictions, tax and currency controls. You may not use the Service if you are subject to applicable economic sanctions
        or in breach of export-control law.
      </p>

      <h2>18. Governing law and disputes</h2>
      <ol>
        <li><strong>Talk first.</strong> Tell us the problem at <a href={`mailto:${COMPANY.emails.legal}`}>{COMPANY.emails.legal}</a>; we follow the complaints steps on the <Link href="/legal">Legal information</Link> page.</li>
        <li><strong>Mediation.</strong> If it is not settled in 30 days, both sides will try mediation in good faith before starting proceedings.</li>
        <li><strong>Law and courts.</strong> These Terms are governed by the laws of Uganda. Disputes that mediation does not resolve go to the courts of Uganda, except that (a) a business may instead choose arbitration under the rules of the Centre for Arbitration and Dispute Resolution (CADER), Kampala, in English, and (b) if you are a consumer, nothing stops you bringing a claim in the courts of your home country where the law of that country gives you that right, or relying on its mandatory consumer protections.</li>
      </ol>

      <h2>19. General</h2>
      <ul>
        <li><strong>Whole agreement.</strong> These Terms and the documents they point to are the whole agreement about the Service.</li>
        <li><strong>If part fails.</strong> If a part is invalid, the rest continues.</li>
        <li><strong>No waiver.</strong> Not enforcing a right now does not give it up.</li>
        <li><strong>Transfer.</strong> We may transfer these Terms to a successor to our business; you may not transfer yours without our consent.</li>
        <li><strong>Notices.</strong> We may notify you by posting in the Service, in-app notification, email or WhatsApp to the contact details you gave us. You can notify us at the addresses below.</li>
        <li><strong>Language.</strong> The English version governs; translations are for convenience.</li>
        <li><strong>No third-party rights</strong> except where a document says so.</li>
      </ul>

      <h2>20. Changes to these Terms</h2>
      <p>
        We may update these Terms. For a material change we give at least 30 days' notice in the Service or by email before it
        takes effect (shorter only where the law or an urgent safety reason requires). If you keep using the Service after the
        date, you accept the change; if you do not agree, close your account before then.
      </p>

      <h2>21. Contact</h2>
      <address className="not-italic">
        {companyLines().map((l) => (
          <span key={l}>
            {l}
            <br />
          </span>
        ))}
        Legal: <a href={`mailto:${COMPANY.emails.legal}`}>{COMPANY.emails.legal}</a>
        <br />
        Support: <a href={`mailto:${COMPANY.emails.support}`}>{COMPANY.emails.support}</a> · WhatsApp {COMPANY.whatsapp}
      </address>
    </LegalPage>
  );
}
