import { Link } from "wouter";
import LegalPage from "@/components/legal/LegalPage";
import { COMPANY } from "@shared/company";

export default function AmlSanctions() {
  return (
    <LegalPage
      title="Anti-Money-Laundering, Sanctions and Anti-Corruption Policy"
      updated="October 1, 2026"
      path="/aml-sanctions"
      description="How RealEVR Estates guards against money laundering, terrorist financing, sanctions breaches and bribery: bidder and partner checks, record-keeping and reporting."
    >
      <p>
        Property is a common route for dirty money, so we take extra care. This policy sets out what we do and what we ask of
        you. It follows Uganda's Anti-Money Laundering Act, 2013 (as amended), the Anti-Terrorism Act, 2002 and the Anti-Corruption
        Act, 2009, and is designed to be consistent with international standards (the FATF Recommendations) and the laws of other
        places where we operate, such as the EU and UK money-laundering rules, US OFAC sanctions and the Foreign Corrupt Practices
        Act, and the UK Bribery Act.
      </p>

      <h2>1. What we do</h2>
      <ul>
        <li><strong>Know who bids.</strong> Everyone who wants to bid in a bank-sale auction is vetted first: identity, address, proof and source of funds, and whether they hold a public position or are linked to someone who does. See the <Link href="/bidder-vetting">Bidder Vetting Policy</Link>.</li>
        <li><strong>Know our partners.</strong> Partners are asked for their business registration and, for banks, developers and auctioneers, proof of authority and licence. A bank-sale partner is reviewed by a person before it can list.</li>
        <li><strong>Screen against sanctions.</strong> We check applicants and counterparties against the sanctions lists that apply to us (United Nations, and where relevant the EU, UK and US). We do not accept a bidder or partner who is listed or acting for someone who is.</li>
        <li><strong>Stay away from cash.</strong> We take fees only through the channels shown inside your account, and tie each payment to a reference. We do not accept cash fees.</li>
        <li><strong>Watch for red flags.</strong> Examples: funds that do not match the person's means, third parties paying for a bidder, use of different names, pressure to close fast, refusal to explain the source of funds, a price far from the market with no reason.</li>
        <li><strong>Keep records.</strong> Verification files and payment records are kept for the period the law requires (generally at least 5 to 10 years after the relationship ends).</li>
        <li><strong>Report.</strong> Where we know or suspect that funds are the proceeds of crime or linked to terrorist financing, we report to the Financial Intelligence Authority (and the equivalent authority elsewhere). The law may forbid us to tell you that we have; we may also freeze or refuse to proceed.</li>
        <li><strong>Train.</strong> People who handle vetting and payments are told what to look for and whom to tell.</li>
      </ul>

      <h2>2. What we ask of you</h2>
      <ul>
        <li>Give true information and documents, and tell us if they change.</li>
        <li>Use your own funds, and tell us if anyone else is paying or you act for someone (a "beneficial owner").</li>
        <li>Do not offer or accept bribes, or make facilitation payments, to anyone to influence a sale, a licence, a title or an official.</li>
        <li>Do not use the Service if you are on a sanctions list, or are owned or controlled by someone who is.</li>
      </ul>

      <h2>3. What may happen</h2>
      <p>
        We may ask for more information, delay or refuse an application, bid, partnership or payment, cancel a bid, end an
        account, keep a fee where the Terms allow, and report to the authorities, without notice where the law requires secrecy.
      </p>

      <h2>4. Buying a home with Bitcoin or other digital currency</h2>
      <p>
        A buyer may ask to pay for a home in Bitcoin or another digital currency. Digital assets can move across borders fast and
        hide who is behind them, so these purchases get the same checks as any large purchase, and more:
      </p>
      <ul>
        <li><strong>The seller must agree.</strong> Digital currency is not legal tender in Uganda and in many other countries. A seller is never required to accept it, and a bank decides for itself whether to accept it in a bank sale.</li>
        <li><strong>We verify the buyer</strong> (identity, address, and the source of the funds, including how the coin was obtained) before any instructions are given, and we may ask for exchange or wallet history. We do not deal with buyers who are on a sanctions list or who refuse to explain where the funds come from.</li>
        <li><strong>No payment on this site.</strong> Pressing "Buy with Bitcoin" sends us a request; it moves no money. Payment goes to an escrow or the seller's lawyer on written instructions, and the sale and the title transfer are documented in the listing's currency at a rate agreed in writing, because the price in coin moves with the market.</li>
        <li><strong>Mixers and anonymising services are refused.</strong> We may decline coin that has passed through one, or that comes from an address linked to crime.</li>
        <li><strong>Beware of fraud.</strong> Never send coin to an address you were given in a chat, a call or an unsigned message. We will never ask you to pay a personal wallet.</li>
      </ul>

      <h2>5. Contact</h2>
      <p>
        Questions or concerns about this policy: <a href={`mailto:${COMPANY.emails.legal}`}>{COMPANY.emails.legal}</a>. To report suspected
        wrongdoing in confidence, use the same address and write "Confidential" in the subject.
      </p>
    </LegalPage>
  );
}
