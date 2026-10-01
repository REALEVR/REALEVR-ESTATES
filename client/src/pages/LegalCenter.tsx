import LegalPage from "@/components/legal/LegalPage";
import { Link } from "wouter";
import { FileText, Gavel, ShieldCheck, Cookie, Receipt, Lock, ScrollText, LifeBuoy } from "lucide-react";

const DOCS = [
  { href: "/terms", title: "Terms of Service", text: "The rules for using RealEVR Estates, listing a property and booking.", Icon: FileText },
  { href: "/privacy", title: "Privacy Policy", text: "What we collect, why, how long we keep it, and your rights.", Icon: Lock },
  { href: "/cookies", title: "Cookie Policy", text: "The small files our site stores in your browser.", Icon: Cookie },
  { href: "/refund-policy", title: "Refund Policy", text: "Which payments can be refunded and which cannot.", Icon: Receipt },
  { href: "/auction-terms", title: "Auction Terms and Conditions", text: "How live bank-sale auctions work, including the commitment fee.", Icon: Gavel },
  { href: "/bidder-vetting", title: "Bidder Vetting Policy", text: "How we verify bidders and protect what they give us.", Icon: ShieldCheck },
  { href: "/trust-safety", title: "Trust & Safety", text: "How to avoid fraud, and how we keep listings honest.", Icon: ScrollText },
];

export default function LegalCenter() {
  return (
    <LegalPage
      title="Legal information"
      updated="October 1, 2026"
      path="/legal"
      description="Every RealEVR Estates legal document in one place: terms, privacy, cookies, refunds, auction terms, bidder vetting, and how to make a complaint."
    >
      <p>
        RealEVR Estates is an online property platform based in Kampala, Uganda. These are the documents that govern how
        it works, together with how to reach us if something goes wrong.
      </p>

      <ul className="!list-none !pl-0 grid gap-3 sm:grid-cols-2">
        {DOCS.map(({ href, title, text, Icon }) => (
          <li key={href} className="!m-0">
            <Link href={href} className="!no-underline flex h-full gap-3 rounded-xl border border-border p-4 transition hover:border-accent hover:shadow-sm">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
              <span>
                <span className="block font-semibold text-foreground">{title}</span>
                <span className="block text-sm text-muted-foreground">{text}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <h2>What we are, and what we are not</h2>
      <ul>
        <li>We are a platform that shows properties, virtual tours and live auctions. We are not a bank, a lender, a licensed valuer or a law firm, and nothing on the site is legal, tax, investment or financial advice.</li>
        <li>Listings are provided by owners, agents, developers and banks. We check what we can, but you should verify title, condition and the seller's authority before you pay for or commit to anything.</li>
        <li>Virtual tours and photos are there to help you look; they are not a survey or a promise about a property.</li>
        <li>We will never ask you to pay into a personal account. Payments are made through the details shown inside your signed-in account.</li>
      </ul>

      <h2>Making a complaint</h2>
      <ol>
        <li><strong>Tell us.</strong> Write to <a href="mailto:support@realevr.com">support@realevr.com</a> (or <a href="mailto:legal@realevr.com">legal@realevr.com</a> for legal and auction matters) with your name, the listing or auction involved and what went wrong.</li>
        <li><strong>We acknowledge it</strong> within two working days and tell you who is handling it.</li>
        <li><strong>We reply</strong> with our findings and what we will do within 14 days. If it needs longer we say why and when.</li>
        <li><strong>If you are not satisfied,</strong> ask for it to be reviewed by a senior member of our team, who will reply within a further 14 days.</li>
        <li><strong>Still not settled?</strong> We will try mediation before either side goes to court. These matters are governed by the laws of Uganda.</li>
      </ol>
      <p>
        Complaints about how we handle personal data may also be made to Uganda's Personal Data Protection Office.
      </p>

      <h2>Reporting a listing, a bidder or a concern</h2>
      <p>
        If you think a listing is fake, misleading or breaks the law, or that someone is behaving dishonestly in an
        auction, tell us at <a href="mailto:support@realevr.com">support@realevr.com</a> straight away. We investigate, and we
        remove content and suspend accounts that break our rules.
      </p>

      <h2>Anti-money-laundering and fraud</h2>
      <p>
        We follow Uganda's anti-money-laundering rules, verify bidders (see the{" "}
        <Link href="/bidder-vetting">Bidder Vetting Policy</Link>) and report suspicious activity to the authorities where
        the law requires.
      </p>

      <h2>Contact for legal notices</h2>
      <p>
        RealEVR Estates, Kampala, Uganda. <a href="mailto:legal@realevr.com">legal@realevr.com</a>. Company registration and
        tax details are available on request to that address.
      </p>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LifeBuoy className="h-4 w-4" aria-hidden="true" /> Need help right now? See the <Link href="/help">Help Center</Link>.
      </p>
    </LegalPage>
  );
}
