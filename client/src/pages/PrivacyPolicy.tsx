import { Link } from "wouter";
import LegalPage from "@/components/legal/LegalPage";
import { COMPANY, companyLines } from "@shared/company";

export default function PrivacyPolicy() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="October 1, 2026"
      path="/privacy"
      description="How RealEVR Estates collects, uses, shares and protects personal data worldwide, the legal basis for each use, how long we keep it, and your rights in Uganda, the EU/UK, the US and elsewhere."
    >
      <p>
        This policy explains what personal data {COMPANY.tradingName} collects, why, who sees it, how long we keep it, and what
        you can do about it. It is written to meet Uganda's Data Protection and Privacy Act, 2019, and to follow the principles
        and rights found in the laws of other places we serve, including the GDPR/UK GDPR, South Africa's POPIA, Kenya's and
        Nigeria's data protection laws, and US state laws such as the CCPA/CPRA. See{" "}
        <Link href="/legal/regions">the laws we design around, by region</Link>.
      </p>

      <h2>1. Who is responsible</h2>
      <p>
        {COMPANY.tradingName} is the "data controller" (the party that decides how your data is used) for the Service. Contact for
        privacy matters and our data protection contact:
      </p>
      <address className="not-italic">
        {companyLines().map((l) => (
          <span key={l}>
            {l}
            <br />
          </span>
        ))}
        <a href={`mailto:${COMPANY.emails.privacy}`}>{COMPANY.emails.privacy}</a>
      </address>
      <p>
        If you live in the European Economic Area or the UK and a representative is required for us there, we will name them
        here before we actively market in those places.
      </p>

      <h2>2. What we collect</h2>
      <ul>
        <li><strong>Account and contact data:</strong> name, email, phone, username, password (stored hashed), country, language, role (visitor, owner, agent, partner).</li>
        <li><strong>Listing and content data:</strong> property details, photos, 360° images, tours, messages and enquiries.</li>
        <li><strong>Transactions:</strong> bookings, viewing passes, fees paid, payment references and amounts, and the "money received" messages that confirm them. We do not store card numbers, expiry dates or security codes.</li>
        <li><strong>Auction bidder verification (sensitive):</strong> identity document and number, date of birth, nationality, address, proof of address, proof of funds, source-of-funds and politically-exposed-person declarations, and your bids. Kept privately, seen only by administrators who vet bidders. See the <Link href="/bidder-vetting">Bidder Vetting Policy</Link>.</li>
        <li><strong>Partner data:</strong> business name, registration details, the contact person, and authority documents for a bank or developer.</li>
        <li><strong>Kevin conversations:</strong> what you type or say to Kevin, kept only where it is about properties; chit-chat is not saved. Voice is processed in your browser or by a speech provider only while you have listening switched on.</li>
        <li><strong>Technical data:</strong> IP address, device and browser type, pages viewed, approximate location from your time zone, and precise location only if you allow it.</li>
        <li><strong>Data you send us:</strong> support messages, data requests, complaints.</li>
      </ul>
      <p>We get this from you, from the device you use, from the people you deal with on the Service (for example a seller replying to you), and, for sanctions and fraud checks, from public lists.</p>

      <h2>3. Why we use it, and the legal basis</h2>
      <p>Where the law asks us to name a legal basis, these are ours:</p>
      <ul>
        <li><strong>To run the Service you asked for</strong> (account, listings, messages, bookings, auctions, fees): <em>contract</em> / performance of the agreement with you.</li>
        <li><strong>To vet bidders and partners, prevent fraud and money laundering, check sanctions, keep records:</strong> <em>legal obligation</em> and <em>legitimate interests</em> in keeping the platform and its users safe.</li>
        <li><strong>To improve and secure the Service</strong> (fixing errors, abuse detection, measuring what works): <em>legitimate interests</em>.</li>
        <li><strong>Location beyond your time zone, microphone/voice for Kevin, optional cookies, and marketing messages to individuals:</strong> <em>consent</em>, which you can withdraw at any time.</li>
        <li><strong>To meet legal requests and protect rights</strong> (courts, regulators, defending claims): <em>legal obligation</em> and <em>legitimate interests</em>.</li>
      </ul>
      <p>We do not sell personal data, and we do not share it for cross-context behavioural advertising. We do not make decisions with legal or similarly significant effect about you by automated means alone: bidder approval and partner approval are decided by people; automated payment matching only <em>confirms</em> a payment and anything unclear goes to a person.</p>

      <h2>4. Who we share it with</h2>
      <ul>
        <li><strong>Other users, as you intend:</strong> a seller or agent sees your enquiry and contact details when you contact them. In auctions other people see only an anonymous bidder alias and bid amounts, never your name.</li>
        <li><strong>Service providers (processors)</strong> who work for us under contract: cloud hosting and storage (including Amazon Web Services), email and messaging (including WhatsApp), speech and AI providers used by Kevin, mapping, analytics we run ourselves, and payment or mobile-money providers.</li>
        <li><strong>Authorities and advisers</strong> where the law requires or allows: courts, tax, the Financial Intelligence Authority, law enforcement, our lawyers and auditors.</li>
        <li><strong>A successor</strong> if the business is sold or merged, bound to this policy.</li>
      </ul>

      <h2>5. Sending data across borders</h2>
      <p>
        We are in Uganda and our providers run servers in other countries, so your data may be processed outside the country
        where you live. Where the law restricts this (for example Uganda's Data Protection and Privacy Act, the GDPR/UK GDPR,
        POPIA), we send it only where the destination gives adequate protection, or under approved safeguards such as standard
        contractual clauses, or with your consent. Ask us for details at {COMPANY.emails.privacy}.
      </p>

      <h2>6. How long we keep it</h2>
      <p>These are the longest periods we keep each kind of data. We review and delete at least once a year, and straight away when you ask and nothing requires us to keep it.</p>
      <ul>
        <li><strong>Account data:</strong> while your account is open, then up to 12 months unless you ask for earlier deletion and nothing requires us to keep it.</li>
        <li><strong>Listings and messages:</strong> while the listing is live, then up to 24 months for dispute handling.</li>
        <li><strong>Bidder and partner verification files and payment/anti-money-laundering records:</strong> for the period the law requires (commonly at least 5 to 10 years after the relationship ends), then securely deleted.</li>
        <li><strong>"Money received" messages used to match payments:</strong> 90 days.</li>
        <li><strong>Kevin property conversations:</strong> up to 24 months; voice audio is not kept by us.</li>
        <li><strong>Security logs:</strong> up to 12 months.</li>
      </ul>

      <h2>7. Security</h2>
      <p>
        We use access controls (administrator-only areas, private file storage for identity documents), encryption in transit,
        hashed passwords, limited retention, and monitoring. No system is perfectly secure. If a breach is likely to harm you,
        we will tell you and the regulator within the time the law sets (for example 72 hours to the regulator under the GDPR)
        and say what happened and what to do.
      </p>

      <h2>8. Your rights</h2>
      <p>Depending on where you live, you can:</p>
      <ul>
        <li>know whether we hold your data and get a copy (access / portability);</li>
        <li>correct data that is wrong or incomplete;</li>
        <li>ask us to delete it (we will, unless the law or a dispute requires us to keep it, and we will say which);</li>
        <li>object to, or ask us to restrict, some uses, including direct marketing (always free to stop);</li>
        <li>withdraw consent at any time, without affecting what was done before;</li>
        <li>not be subject to a significant decision made only by automated means (we do not make one);</li>
        <li>in California and other US states: know, delete, correct and opt out of sale/sharing (we do neither), and not be treated worse for using these rights; you may use an authorised agent; and</li>
        <li>complain to your data protection authority.</li>
      </ul>
      <p>
        Use the form on <Link href="/data-rights">Your data rights</Link> or write to {COMPANY.emails.privacy}. We reply within 30
        days (sooner where the law says), may ask you to prove who you are, and do not charge unless a request is clearly
        excessive. If we refuse, we say why and how to complain.
      </p>

      <h2>9. Complaints</h2>
      <p>
        Please tell us first so we can fix it. You may always complain to a regulator: in Uganda the Personal Data Protection
        Office at NITA-U; elsewhere the authority in your country (see the regional list). For the EU/UK this is the authority
        where you live, work, or where you think the problem happened.
      </p>

      <h2>10. Cookies, microphone and location</h2>
      <p>
        See the <Link href="/cookies">Cookie Policy</Link>. The microphone and precise location only work if you allow them in
        your browser, and you can switch them off at any time.
      </p>

      <h2>11. Messages from us</h2>
      <p>
        Account and safety messages (a fee confirmed, a bid outbid, a listing problem) are part of the Service. Marketing or
        announcement messages to individuals are sent only where you agreed or the law allows, and each tells you how to stop.
        Messages to businesses about the partner programme identify us and include an unsubscribe link, and we keep a list of
        people who opted out so they are not contacted again.
      </p>

      <h2>12. Children</h2>
      <p>The Service is for people aged 18 and over. We do not knowingly collect data from anyone under 18 and delete it if we learn we have.</p>

      <h2>13. Changes</h2>
      <p>If we change this policy in a way that matters, we tell you in the Service or by email before it takes effect, and update the date above.</p>
    </LegalPage>
  );
}
