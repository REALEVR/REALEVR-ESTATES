import { Link } from "wouter";
import LegalPage from "@/components/legal/LegalPage";
import { COMPANY } from "@shared/company";

export default function AcceptableUse() {
  return (
    <LegalPage
      title="Acceptable Use Policy"
      updated="October 1, 2026"
      path="/acceptable-use"
      description="What you may and may not do on RealEVR Estates: honest listings, fair dealing in auctions, no fraud, harassment, discrimination, scraping or illegal money movement."
    >
      <p>
        This policy applies to everyone who uses {COMPANY.tradingName}: visitors, owners, agents, bidders, partners and staff. It is
        part of our <Link href="/terms">Terms of Service</Link>.
      </p>

      <h2>You must not</h2>
      <ul>
        <li><strong>Deceive.</strong> List a property you do not own or have no authority over, use photos or tours of a different property, hide fees or defects, post fake reviews, or pretend to be another person or company.</li>
        <li><strong>Defraud.</strong> Ask anyone to pay a deposit, fee or "viewing charge" into an account we have not published, offer a property you cannot deliver, or use the Service to launder money or finance crime.</li>
        <li><strong>Rig an auction.</strong> Bid through more than one account, bid to push the price up without meaning to buy, agree with others to hold bids back or share bids (collusion), let someone bid in your name, or have the seller or a connected person bid. Bids are binding.</li>
        <li><strong>Discriminate or harass.</strong> Refuse or advertise a property in a way that discriminates unlawfully, or threaten, abuse or stalk anyone.</li>
        <li><strong>Break the law</strong> where you or the property are, including sanctions, anti-bribery and consumer laws.</li>
        <li><strong>Misuse the platform.</strong> Scrape or copy listings at scale, probe or bypass security, overload the Service, upload malware, interfere with the auction clock, bid-rate limits or payment matching, or use the Service to send spam.</li>
        <li><strong>Misuse content.</strong> Upload what you have no right to, include other people's personal data without a lawful reason, or upload illegal, sexual, hateful or violent material.</li>
        <li><strong>Misuse Kevin.</strong> Try to make the assistant produce harmful or unlawful content, or reverse engineer it.</li>
      </ul>

      <h2>What happens if you do</h2>
      <p>
        We may remove content, hide a listing, cancel a bid or auction entry (without refunding a non-refundable fee), suspend
        or close an account, tell the people affected, and report to the police, regulators or the Financial Intelligence
        Authority. We try to be fair: where reasonable we explain why and give you a chance to reply.
      </p>

      <h2>Report something</h2>
      <p>
        Tell us at <a href={`mailto:${COMPANY.emails.support}`}>{COMPANY.emails.support}</a> or through WhatsApp {COMPANY.whatsapp}. For
        illegal content or intellectual-property complaints, use the steps in section 8 of the Terms. We do not disclose who
        reported unless the law makes us.
      </p>
    </LegalPage>
  );
}
