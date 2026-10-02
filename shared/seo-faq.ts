/**
 * The questions people actually type into a search box, answered in a few plain sentences. One source for the
 * visible "Questions people ask" block on each page, the FAQ structured data next to it, and the server-rendered
 * copy that search and AI crawlers read, so what a person sees, what Google reads and what an AI quotes always match.
 *
 * Keep answers short, true and stable. Nothing here promises a price or a legal outcome; the legal ones point to a
 * lawyer and to our policy pages.
 */
export interface Faq {
    q: string
    a: string
}

export type FaqPage = 'home' | 'forSale' | 'rentalUnits' | 'bnbs' | 'bankSales'

export const PAGE_FAQS: Record<FaqPage, Faq[]> = {
    home: [
        {
            q: 'How do I take a virtual tour of a home before I rent or buy it?',
            a: 'Open any listing and press the tour. Every property on RealEVR Estates has a 360° tour you can walk through on a phone, tablet, computer or VR headset, so you can see the real rooms before you visit.',
        },
        {
            q: 'Which countries does RealEVR Estates cover?',
            a: 'We started in Uganda and list homes across Africa. Anyone in any African country can list a property for free once the owner or manager confirms it on WhatsApp.',
        },
        {
            q: 'Is it free to list a property?',
            a: 'Yes. Listing a rental, a home for sale or a short stay is free. Some features, such as boosting a listing, are optional.',
        },
        {
            q: 'Can I pay for a home with Bitcoin?',
            a: 'You can ask to buy a home for sale with Bitcoin or another digital currency. The seller has to agree, and payment goes to an escrow or the seller’s lawyer on written instructions, never to a wallet shared in a chat.',
        },
    ],
    forSale: [
        {
            q: 'How do I buy a house in Uganda?',
            a: 'Find a home, take its virtual tour, then contact the agent. Before you pay, have a lawyer confirm the seller owns the title, search the land registry and prepare the sale agreement. Never pay a deposit to a person you have not verified.',
        },
        {
            q: 'Can a foreigner buy property in Uganda?',
            a: 'Non-citizens generally cannot hold freehold or mailo land in Uganda but can take a lease, often up to 99 years. Rules change, so ask a Ugandan property lawyer before you commit.',
        },
        {
            q: 'Can I buy a home with Bitcoin?',
            a: 'You can ask. Every home for sale has a Buy with Bitcoin button that shows the price in coin at the live rate. The seller must agree to accept it, your identity and the source of funds are checked, and payment goes to an escrow or the seller’s lawyer.',
        },
        {
            q: 'Do I have to visit before I make an offer?',
            a: 'No. The 360° tour lets you walk through the property first, which helps you shortlist. We still recommend a visit, with your own lawyer or a surveyor, before you pay.',
        },
    ],
    rentalUnits: [
        {
            q: 'How do I rent an apartment in Kampala?',
            a: 'Filter by area, bedrooms and monthly rent, take the 360° tour, then message the agent or book a viewing. Ask for the tenancy agreement in writing and keep a receipt for every payment.',
        },
        {
            q: 'Do I pay to view a rental?',
            a: 'Rental tours can be previewed for a few seconds for free. Viewing the full tour and details needs a small viewing fee, explained on our Refund Policy page.',
        },
        {
            q: 'How much deposit should a landlord ask for?',
            a: 'It varies by landlord and area. Many ask for one to three months’ rent upfront. Get the amount and the refund terms in writing before you pay.',
        },
        {
            q: 'How can I avoid rental scams?',
            a: 'Never pay before you have seen the home or its tour and spoken to the agent through the platform. Be wary of prices far below the area’s usual rent. Read our Trust & Safety page and report anything suspicious.',
        },
    ],
    bnbs: [
        {
            q: 'How do I book a BnB or short stay?',
            a: 'Choose your dates on the listing, pay the booking deposit and the host confirms. The Refund Policy page explains what happens if plans change.',
        },
        {
            q: 'Are BnB stays furnished?',
            a: 'Yes. BnBs and furnished houses come with furniture and basics, priced per night, and many offer a lower monthly rate for long stays.',
        },
        {
            q: 'Can I see the place before I book?',
            a: 'Yes. Every BnB has a 360° virtual tour so you can walk through the rooms before you pay.',
        },
    ],
    bankSales: [
        {
            q: 'How do bank auctions work?',
            a: 'Banks sell repossessed properties by auction. On RealEVR Estates you register as a bidder, are verified, then bid live; a bid close to the end extends the clock. See the Auction Terms for the exact rules and fees.',
        },
        {
            q: 'Who can bid in a bank sale?',
            a: 'Anyone who passes bidder vetting: identity, address and proof of funds. This keeps auctions safe for the banks and for other bidders. Read the Bidder Vetting policy.',
        },
        {
            q: 'Can I tour a bank-sale property first?',
            a: 'Yes. Every bank-sale listing has a 360° tour, with the auction date, bid details and bank information beside it.',
        },
    ],
}

export function faqJsonLd(faqs: Faq[]): Record<string, unknown> {
    return {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map((f) => ({
            '@type': 'Question',
            name: f.q,
            acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
    }
}
