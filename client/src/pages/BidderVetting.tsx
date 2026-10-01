import LegalPage from "@/components/legal/LegalPage";
import { Link } from "wouter";
import { AUCTION_RULES } from "@shared/auction-rules";

export default function BidderVetting() {
  return (
    <LegalPage
      title="Bidder Vetting Policy"
      updated="October 1, 2026"
      path="/bidder-vetting"
      description="How RealEVR Estates verifies people who want to bid in bank-sale auctions: what we ask for, what we check, how long it takes, how your information is protected."
    >
      <p>
        Bank-sale auctions involve large sums, so only people we have checked may bid. This policy explains what we ask
        for, what we check, and what happens to the information you give us. It is part of the{" "}
        <Link href="/auction-terms">Auction Terms and Conditions</Link>.
      </p>

      <h2>1. Why we vet bidders</h2>
      <ul>
        <li>To make sure the bidder is who they say they are, so a winning bid is a real offer from a real person.</li>
        <li>To check the bidder can afford what they bid for.</li>
        <li>To meet our duties under Uganda's anti-money-laundering rules, including the Anti-Money Laundering Act, 2013, and to keep criminals and sanctioned persons out of the property market.</li>
        <li>To protect sellers and other bidders from fake and time-wasting bids.</li>
      </ul>

      <h2>2. What we ask for</h2>
      <p>For a person:</p>
      <ul>
        <li>Full legal name, date of birth, nationality, residential address, phone number (WhatsApp) and email.</li>
        <li>Identity document type and number.</li>
        {AUCTION_RULES.requiredDocuments.map((d) => (
          <li key={d}>{d}.</li>
        ))}
        <li>A declaration of where the money will come from (savings, sale of property, business income, loan, gift, other) and whether you, or a close family member or associate, hold or have held a prominent public position (“politically exposed person”).</li>
        <li>If you bid for a company or for someone else: proof of the company or the authority to act, and the identity of the real buyer.</li>
      </ul>

      <h2>3. What we check</h2>
      <ul>
        <li>That the documents look genuine and match each other and the details you typed.</li>
        <li>That your phone and email work, by contacting you on them.</li>
        <li>That your funds look sufficient for the auction you want to join, and that their source is plausible.</li>
        <li>Public sanctions lists, lists of politically exposed persons and public records for warnings about you.</li>
        <li>A person from our team reviews every application. No application is approved or refused by software alone.</li>
      </ul>

      <h2>4. Decisions</h2>
      <ul>
        <li>We aim to decide within two working days of a complete application. We may ask for more, and the clock stops while we wait.</li>
        <li>You pay nothing to be vetted. If you are approved, you will then be asked to pay the commitment fee described in the Auction Terms before you can bid.</li>
        <li>If we refuse an application we say so. We give the reason where we may; in some cases the law does not allow us to explain.</li>
        <li>You can ask us to look again if you believe we got it wrong, by writing to <a href="mailto:legal@realevr.com">legal@realevr.com</a> with your reference.</li>
      </ul>

      <h2>5. After approval</h2>
      <ul>
        <li>Your identity checks are valid for twelve months, after which we ask you to confirm or renew them.</li>
        <li>We may check again at any time, and may suspend a bidder while we do.</li>
        <li>We may withdraw approval if the information proves false, if you break the Auction Terms, or if the law requires.</li>
      </ul>

      <h2>6. How we protect what you give us</h2>
      <ul>
        <li><strong>Private storage.</strong> Identity documents and proof of funds are stored privately, separately from the public website and its images. They are never shown on a listing and never shown to sellers or other bidders.</li>
        <li><strong>Who can see them.</strong> Only the RealEVR administrators who carry out vetting. Access is restricted to signed-in administrators.</li>
        <li><strong>Use.</strong> Only to vet you, run the auction you applied for and meet legal duties. We do not sell them or use them for marketing.</li>
        <li><strong>Sharing.</strong> With the seller only your approved/not approved status and, if you win, what the seller needs to complete the sale. With regulators, law-enforcement and courts when the law requires.</li>
        <li><strong>Keeping them.</strong> For as long as the law requires us to keep identity and transaction records, then deleted. If your application is refused, we keep it for the period the law requires for such records.</li>
        <li><strong>Your rights.</strong> You can ask to see, correct or (where the law allows) delete your data, as set out in our <Link href="/privacy">Privacy Policy</Link> and the Data Protection and Privacy Act, 2019. Some records we are required to keep cannot be deleted on request.</li>
      </ul>

      <h2>7. Telling you about suspicious activity</h2>
      <p>
        If we suspect money laundering, fraud or sanctions evasion we must report it to the authorities, including the
        Financial Intelligence Authority, and the law may forbid us from telling you that we have.
      </p>

      <h2>8. Contact</h2>
      <p>
        Questions about vetting: <a href="mailto:support@realevr.com">support@realevr.com</a>. Legal and data-protection
        matters: <a href="mailto:legal@realevr.com">legal@realevr.com</a>.
      </p>
    </LegalPage>
  );
}
