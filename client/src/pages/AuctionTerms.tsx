import LegalPage from "@/components/legal/LegalPage";
import { Link } from "wouter";
import { AUCTION_RULES } from "@shared/auction-rules";

const fee = `US$${AUCTION_RULES.commitmentFeeUsd.toLocaleString()}`;

export default function AuctionTerms() {
  return (
    <LegalPage
      title="Auction Terms and Conditions"
      updated="October 1, 2026"
      path="/auction-terms"
      description="The rules for bidding in RealEVR Estates live bank-sale auctions: who can bid, vetting, the non-refundable commitment fee, how bids work, closing, and what the winner must do."
    >
      <p>
        These terms apply to every online bank-sale auction shown on RealEVR Estates (“RealEVR”, “we”, “us”). They sit
        alongside our <Link href="/terms">Terms of Service</Link>, <Link href="/privacy">Privacy Policy</Link> and{" "}
        <Link href="/bidder-vetting">Bidder Vetting Policy</Link>. By applying to bid, paying the commitment fee or placing a bid,
        you agree to them. Read them before you apply: some of what they say, in particular about the commitment fee and
        about bids being binding, cannot be undone afterwards.
      </p>

      <h2>1. Who does what</h2>
      <ul>
        <li><strong>The seller</strong> (usually a bank or another lender, or someone acting for it) owns, or has the legal right to sell, the property. The seller states the starting price, the closing date and time, and the <strong>seller's provisions</strong> shown on the listing.</li>
        <li><strong>RealEVR</strong> runs the website on which the auction is shown and bids are collected. We are a platform. We are not the seller, we do not own the property and we do not give legal, financial or valuation advice. Where Ugandan law requires a sale of this kind to be conducted, supervised or confirmed by a licensed auctioneer, court bailiff or other officer, the listing says so and the sale is not complete until that has happened.</li>
        <li><strong>The bidder</strong> is you, a person or company approved by us to bid.</li>
      </ul>

      <h2>2. Who may bid</h2>
      <ul>
        <li>You must be at least 18, have the legal capacity to buy land and buildings in Uganda, and be approved by us after the vetting described in the <Link href="/bidder-vetting">Bidder Vetting Policy</Link>.</li>
        <li>You may bid only for yourself, or for a company or person you have told us about and can prove you are authorised to act for. Bidding for an undisclosed buyer is not allowed.</li>
        <li>One person, one account. Duplicate or shared accounts are not allowed.</li>
        <li>Being approved to bid is not a promise that you may buy: the seller's provisions and the law still apply.</li>
      </ul>

      <h2>3. Registering, vetting and approval</h2>
      <ol>
        <li>You apply on the auction's page and upload the documents listed in the Bidder Vetting Policy.</li>
        <li>We check them. We may ask for more, may refuse an application, and do not have to give a reason where the law does not allow us to.</li>
        <li><strong>You pay nothing to be vetted.</strong> The commitment fee is asked for only after you are approved.</li>
        <li>An approval to bid is for the auction you applied for. Your identity checks stay valid for twelve months, so you do not repeat them for another auction in that time, but you do pay the commitment fee again for each auction.</li>
      </ol>

      <h2>4. The commitment fee: {fee}, non-refundable</h2>
      <p>
        Once approved, you must pay a <strong>commitment fee of {fee}</strong> (or the equivalent in a currency we accept)
        for the auction before you can place a bid. Please read this section carefully.
      </p>
      <ul>
        <li><strong>The fee is non-refundable.</strong> It is not a deposit, it is not part of the purchase price and it is not credited against the price, whether you win, lose, withdraw or are removed.</li>
        <li>It pays for the cost of vetting and monitoring bidders, for keeping your place in the auction and for discouraging bids made without serious intent.</li>
        <li>It is not a guarantee of anything: it does not reserve the property for you and does not make a bid binding on the seller.</li>
        <li>The only cases in which we return it are (a) we took it by mistake or twice, and (b) a court or law that applies to you requires us to. If the auction is cancelled before it opens, we will refund it only if the seller or we cancel it without a good reason connected to you.</li>
        <li>You must tick a box confirming that you understand this before the payment details are shown.</li>
        <li>We confirm receipt by hand. You can bid only after we have confirmed that the fee has arrived. We never ask for it into a personal account or by any method other than the details shown to you inside your signed-in RealEVR account. If anyone asks you to pay somewhere else, do not, and tell us.</li>
      </ul>

      <h2>5. How bidding works</h2>
      <ul>
        <li><strong>Starting price.</strong> The seller sets the starting price. The first bid must be at least the starting price. After that each bid must beat the current highest bid by at least the minimum step shown on the listing.</li>
        <li><strong>Bids are binding.</strong> A bid is a serious offer to buy on the seller's provisions. You cannot take it back or lower it. A higher bid by someone else ends your bid, but you remain bound by it until the auction closes if you are the highest bidder.</li>
        <li><strong>Live display.</strong> The page shows the highest bid so far, the number of bids, the bid history and the time left, updated within seconds. Other bidders are shown as anonymous aliases (for example “Bidder 4F2”). Only we and the seller know who is behind an alias.</li>
        <li><strong>Our record is the record.</strong> The time of a bid is the time our server recorded it, in East Africa Time. Screens may lag a few seconds behind; a bid you saw accepted is not final until our server has recorded it.</li>
        <li><strong>Closing time and extension.</strong> The seller states the closing date and time. If a valid bid arrives in the last {AUCTION_RULES.softCloseMinutes} minutes, the closing time moves {AUCTION_RULES.softCloseMinutes} minutes after that bid, so that nobody wins by bidding in the last second. The new closing time is shown on the page.</li>
        <li><strong>Winning.</strong> When the auction closes, the highest valid bid is the winning bid, subject to the seller's provisions (for example confirmation by the seller or a court, or other approvals the listing names).</li>
      </ul>

      <h2>6. The seller's provisions</h2>
      <p>
        Each listing shows the seller's provisions: the seller's name, how and when the balance must be paid, taxes and
        costs, the state of the title, whether viewing is possible, and anything else the seller requires. They are
        part of the sale. If a provision and these terms disagree about how the <em>sale</em> works, the provision wins; if they
        disagree about how you may use <em>our website</em>, these terms win.
      </p>

      <h2>7. If you win</h2>
      <ul>
        <li>We tell you and the seller the same day. The sale is between you and the seller.</li>
        <li>You must pay the balance, and sign what the seller requires, within the time the provisions give, or within {AUCTION_RULES.defaultSettlementDays} days of the auction closing if they give none. Payment goes to the seller's or the seller's lawyer's account named in the provisions, <strong>not to RealEVR</strong>, unless the listing clearly says otherwise.</li>
        <li>If you do not complete, you lose your place, the seller may offer the property to the next highest bidder or sell it again, and the seller keeps any rights it has against you under the provisions and the law. The commitment fee is not returned.</li>
        <li>Stamp duty, registration and legal fees, taxes and any other costs of transfer are yours unless the provisions say otherwise. Transfer must follow Ugandan law, including the Land Act, the Registration of Titles Act and the Mortgage Act where they apply.</li>
      </ul>

      <h2>8. Sold as seen: do your homework</h2>
      <ul>
        <li>Properties are sold in the condition they are in. Photos, floor plans and 360° virtual tours are there to help you look; they are not a survey, a valuation or a promise about the property's condition, boundaries or title.</li>
        <li>Before you bid, check the title at the land registry, inspect the property if you can, take your own legal and financial advice, and check for occupants, charges, caveats and unpaid bills. RealEVR does not give any warranty about title, condition, size, use or value.</li>
      </ul>

      <h2>9. What is not allowed</h2>
      <ul>
        <li>Bidding on a property you own or have an interest in, or having someone bid to push the price up (“shill bidding”).</li>
        <li>Working with others to hold the price down or to share out the property afterwards.</li>
        <li>Using false, altered or someone else's documents or details, or more than one account.</li>
        <li>Using software to place bids, or interfering with the website.</li>
        <li>Making a bid with no intention or means to pay for it.</li>
      </ul>
      <p>
        We may remove bids, suspend or ban a bidder, cancel an auction and tell the seller and the authorities. A removed
        bidder does not get the commitment fee back.
      </p>

      <h2>10. Problems with the website</h2>
      <p>
        We work to keep auctions running smoothly, but connections drop and servers fail. We may pause, extend, restart or
        cancel an auction if something goes wrong or if we suspect fraud. We are not liable for a bid that was not
        recorded because of your connection, device or an outage outside our control.
      </p>

      <h2>11. Money laundering and sanctions</h2>
      <p>
        We follow Uganda's anti-money-laundering rules. We may refuse or cancel any application, bid or sale, and report
        suspicious activity to the authorities without telling you. We may ask where your money comes from at any time.
      </p>

      <h2>12. Our responsibility</h2>
      <p>
        We are responsible for running the auction software with reasonable care. We are not responsible for the
        seller's decisions, the property, the title, or losses that follow from a sale, except where the law says we cannot
        exclude it. Our total responsibility to you for any one auction is limited to the commitment fee you paid for it,
        except where the law says otherwise.
      </p>

      <h2>13. Complaints and disputes</h2>
      <p>
        Tell us first: see the complaints procedure on the <Link href="/legal">legal information page</Link>. If we cannot
        settle it, the parties will try mediation before going to court. These terms are governed by the laws of Uganda and
        the courts of Uganda have jurisdiction.
      </p>

      <h2>14. Changes</h2>
      <p>
        We may change these terms for future auctions. The terms in force when an auction opens apply to that auction.
      </p>

      <h2>15. Contact</h2>
      <p>
        RealEVR Estates, Kampala, Uganda. Email <a href="mailto:legal@realevr.com">legal@realevr.com</a> or{" "}
        <a href="mailto:support@realevr.com">support@realevr.com</a>.
      </p>
    </LegalPage>
  );
}
