/**
 * Plain-language guides that answer what people search before they rent, buy or book. Every guide has an author
 * and dates (shown on the page and in Article structured data). General information only, never legal advice:
 * each says so and points to a lawyer for the parts that depend on the case.
 */
export interface GuideSection {
    /** A question or a plain topic, as a person would search it. */
    heading: string
    paras?: string[]
    bullets?: string[]
    steps?: string[]
}

export interface Guide {
    slug: string
    title: string
    /** Under 160 characters. */
    description: string
    /** The short answer, shown first. */
    summary: string
    published: string
    updated: string
    sections: GuideSection[]
    related: Array<{ label: string; path: string }>
}

export const GUIDE_AUTHOR = { name: 'RealEVR Estates Editorial Team', path: '/about' }
const D = '2026-10-02'

export const GUIDES: Guide[] = [
    {
        slug: 'how-to-buy-a-house-in-uganda',
        title: 'How to Buy a House in Uganda: Step by Step',
        description: 'The steps to buy a house in Uganda: set a budget, find a home, check the title, agree the price, sign the sale agreement and register the transfer.',
        summary: 'Buying a house in Uganda comes down to six steps: budget, shortlist, check the title, agree the price, sign with a lawyer, and register the transfer. Never pay until a lawyer has confirmed the seller owns what they are selling.',
        published: D,
        updated: D,
        sections: [
            {
                heading: 'What are the steps to buy a house in Uganda?',
                steps: [
                    'Set a budget that includes costs on top of the price: legal fees, stamp duty on the transfer, registration and any valuation or survey.',
                    'Shortlist homes. Take the 360° virtual tour of each one first, then visit the best two or three.',
                    'Check the title. Your lawyer searches the land registry and confirms who owns the land, what kind of ownership it is, and whether there is a mortgage or a dispute on it.',
                    'Agree the price and put it in writing, with the payment dates.',
                    'Sign the sale agreement with your lawyer present. Pay through a channel your lawyer approves, and keep every receipt.',
                    'Register the transfer in your name. The sale is not complete for you until it is registered.',
                ],
            },
            {
                heading: 'How do I check that the seller really owns the property?',
                paras: ['Ask for a copy of the land title and an official search of the registry done by your lawyer, not a copy supplied by the seller.'],
                bullets: ['The name on the title must match the seller’s ID.', 'Check for a mortgage, caveat or court order on the title.', 'If the seller is acting for someone else, ask for a signed power of attorney and verify it.'],
            },
            {
                heading: 'Should I pay a deposit before the lawyer has checked the title?',
                paras: ['No. Deposits paid early are the most common way buyers lose money. Pay only once your lawyer is satisfied, and pay to an account in the seller’s name or to your lawyer’s client account.'],
            },
            {
                heading: 'Can I buy without visiting?',
                paras: ['A 360° tour lets you shortlist from anywhere, but you should still have someone you trust, such as a lawyer or surveyor, inspect the property before you pay.'],
            },
            {
                heading: 'Is this legal advice?',
                paras: ['No. This is general information. Rules and fees change, so ask a Ugandan property lawyer about your case.'],
            },
        ],
        related: [
            { label: 'Homes for sale', path: '/for-sale' },
            { label: 'Can foreigners buy property in Uganda?', path: '/guides/can-foreigners-buy-property-in-uganda' },
            { label: 'How to avoid property scams', path: '/guides/how-to-avoid-property-scams-in-uganda' },
            { label: 'Buy a house with Bitcoin', path: '/guides/how-to-buy-a-house-with-bitcoin' },
        ],
    },
    {
        slug: 'can-foreigners-buy-property-in-uganda',
        title: 'Can Foreigners Buy Property in Uganda?',
        description: 'What non-citizens can and cannot own in Uganda: leasehold up to 99 years is usually possible, freehold and mailo land usually is not. Plus what to check first.',
        summary: 'In general, non-citizens in Uganda cannot hold freehold or mailo land, but they can take a lease, commonly up to 99 years, and they can buy apartments and buildings on leased land. Always confirm the current rules with a Ugandan lawyer.',
        published: D,
        updated: D,
        sections: [
            {
                heading: 'Can a non-citizen own land in Uganda?',
                paras: ['As a general rule, no: freehold and mailo land are reserved for citizens. A non-citizen can usually hold land on a lease, commonly for up to 99 years.'],
            },
            {
                heading: 'What can foreigners buy?',
                bullets: ['A lease on land, usually up to 99 years.', 'An apartment or house built on leased land, where the lease is transferred to you.', 'Property through a company, where the rules on who may own the company’s land apply.'],
            },
            {
                heading: 'What should a foreign buyer check first?',
                steps: ['Ask the lawyer which kind of ownership the land has and how long the lease has left.', 'Check the lease terms: ground rent, permitted use and any conditions on transfer.', 'Check that the seller can lawfully transfer to a non-citizen.', 'Confirm all taxes and fees before you pay.'],
            },
            {
                heading: 'Can I pay in a foreign currency or with Bitcoin?',
                paras: ['The sale is documented in Uganda shillings or an agreed currency, and your lawyer will advise how the funds must arrive and be recorded. On RealEVR Estates you can ask to buy with Bitcoin; the seller must agree and payment goes to an escrow or the seller’s lawyer.'],
            },
            {
                heading: 'Is this legal advice?',
                paras: ['No. Land law changes. Ask a Ugandan property lawyer before you commit.'],
            },
        ],
        related: [
            { label: 'How to buy a house in Uganda', path: '/guides/how-to-buy-a-house-in-uganda' },
            { label: 'Homes for sale', path: '/for-sale' },
            { label: 'Laws by region', path: '/legal/regions' },
        ],
    },
    {
        slug: 'how-to-rent-an-apartment-in-kampala',
        title: 'How to Rent an Apartment in Kampala',
        description: 'How to find, view and rent an apartment in Kampala: set a budget, tour online, check the landlord, read the agreement and keep receipts.',
        summary: 'To rent in Kampala: pick an area and budget, tour online first, meet the landlord or agent, read the tenancy agreement, and pay only against a receipt. Get every promise in writing.',
        published: D,
        updated: D,
        sections: [
            {
                heading: 'How do I find an apartment to rent in Kampala?',
                steps: ['Choose two or three areas by commute and budget.', 'Filter listings by bedrooms and monthly rent.', 'Take the 360° tour of each shortlisted home.', 'Message the agent and book a viewing for the best ones.'],
            },
            {
                heading: 'What do I pay when I rent?',
                bullets: ['The first month’s rent, often with a deposit of one to three months.', 'Sometimes an agent’s fee. Ask before you view.', 'Utilities, such as water, power and internet, are usually separate.'],
                paras: ['Amounts vary by landlord and area. Get each one in writing.'],
            },
            {
                heading: 'What should the tenancy agreement include?',
                bullets: ['Names of landlord and tenant, and the address.', 'Rent, due date and how it is paid.', 'Deposit amount and when it is refunded.', 'Notice period, repairs and who pays for what.'],
            },
            {
                heading: 'How do I pay rent safely?',
                paras: ['Pay by a traceable method and keep every receipt. RealEVR Estates offers RentRail for paying rent through the platform, so there is a record of each payment.'],
            },
        ],
        related: [
            { label: 'Rental units', path: '/rental-units' },
            { label: 'How to avoid property scams', path: '/guides/how-to-avoid-property-scams-in-uganda' },
            { label: 'Refund policy', path: '/refund-policy' },
        ],
    },
    {
        slug: 'how-to-avoid-property-scams-in-uganda',
        title: 'How to Avoid Property Scams in Uganda',
        description: 'The common property scams in Uganda and how to avoid them: fake agents, double sales, deposits before viewing and forged titles. A checklist before you pay.',
        summary: 'Do not pay anyone before you have seen the property or its tour, met the owner or agent, and had the title checked. Be suspicious of low prices, pressure to pay fast and requests to pay a personal account.',
        published: D,
        updated: D,
        sections: [
            {
                heading: 'What are the most common property scams?',
                bullets: ['A fake agent who collects “viewing” or “booking” fees for a home they do not control.', 'The same plot sold to several buyers.', 'A forged or borrowed land title.', 'A listing priced far below the area’s normal rent or price.', 'Pressure to pay today “because there are other buyers”.'],
            },
            {
                heading: 'What should I check before I pay?',
                steps: ['See the property, or take its 360° tour, and confirm the address.', 'Meet the owner or agent and check their ID.', 'For a purchase, have a lawyer search the title.', 'Pay to an account in the owner’s name, or to your lawyer, never to a personal wallet shared in a chat.', 'Keep proof of every payment.'],
            },
            {
                heading: 'What if someone asks me to pay in Bitcoin?',
                paras: ['Be extra careful: coin payments cannot be reversed. On RealEVR Estates the Buy with Bitcoin button only sends a request; real payment instructions come in writing from us or the escrow lawyer. Never send coin to an address from a chat or call.'],
            },
            {
                heading: 'How do I report a scam?',
                paras: ['Tell us at once through the Trust & Safety page or WhatsApp, and report to the police. If you have already paid, say so immediately and keep all messages and receipts.'],
            },
        ],
        related: [
            { label: 'Trust & Safety', path: '/trust-safety' },
            { label: 'How to buy a house in Uganda', path: '/guides/how-to-buy-a-house-in-uganda' },
            { label: 'How to rent an apartment in Kampala', path: '/guides/how-to-rent-an-apartment-in-kampala' },
        ],
    },
    {
        slug: 'how-bank-auctions-work-in-uganda',
        title: 'How Bank Property Auctions Work in Uganda',
        description: 'How a bank sells a mortgaged property at auction in Uganda, who can bid, what to check before bidding and how bank sales work on RealEVR Estates.',
        summary: 'When a borrower defaults on a mortgage, the bank may sell the property, often by auction. Buyers should check the title, the reserve and the terms of sale before bidding. On RealEVR Estates, bidders are verified and bid live.',
        published: D,
        updated: D,
        sections: [
            {
                heading: 'Why do banks sell properties at auction?',
                paras: ['A bank that has lent money against a property can sell it to recover the debt if the borrower defaults and the law has been followed. These are often called bank sales.'],
            },
            {
                heading: 'How does bidding work on RealEVR Estates?',
                steps: ['Open a bank-sale listing and take its 360° tour.', 'Register as a bidder and complete verification: identity, address and proof of funds.', 'Pay the bidder fee shown in your account, with its reference.', 'Bid live. A bid close to the end extends the clock so nobody is cut off.', 'The highest bidder follows the bank’s terms to complete the purchase.'],
            },
            {
                heading: 'What should I check before I bid?',
                bullets: ['The title and any claims on the property.', 'The condition of the property, ideally with a surveyor.', 'The reserve price, deposit and payment deadline in the terms of sale.', 'Whether the property is occupied.'],
            },
            {
                heading: 'Can I pay for a bank sale with Bitcoin?',
                paras: ['You can ask. The bank decides how it sells, so it must agree to accept digital currency first.'],
            },
        ],
        related: [
            { label: 'Bank sales', path: '/bank-sales' },
            { label: 'Auction terms', path: '/auction-terms' },
            { label: 'Bidder vetting', path: '/bidder-vetting' },
            { label: 'Fees', path: '/fees' },
        ],
    },
    {
        slug: 'how-to-buy-a-house-with-bitcoin',
        title: 'How to Buy a House with Bitcoin',
        description: 'Can you buy a house with Bitcoin? Yes, if the seller agrees. How it works, what is checked, how the price is set and how to stay safe from fraud.',
        summary: 'You can buy a house with Bitcoin when the seller agrees to accept it. The price is agreed in a normal currency, converted at an agreed rate, and the coin goes to an escrow or the seller’s lawyer on written instructions, never to a wallet from a chat.',
        published: D,
        updated: D,
        sections: [
            {
                heading: 'Can you really buy a house with Bitcoin?',
                paras: ['Yes, where the seller is willing. In many countries, including Uganda, Bitcoin is not legal tender, so the sale is documented in a normal currency and the coin is the way the price is paid.'],
            },
            {
                heading: 'How does it work on RealEVR Estates?',
                steps: ['Open a home for sale and press Buy with Bitcoin.', 'See the price in Bitcoin at the live rate and choose Bitcoin, Ether, USDT or USDC.', 'Send your details. Nothing is paid at this point.', 'We check the seller accepts digital currency and verify your identity and the source of funds.', 'You get written payment instructions for an escrow or the seller’s lawyer.'],
            },
            {
                heading: 'Why does the price in Bitcoin change?',
                paras: ['Bitcoin’s price moves all day. The figure on the page is a guide. The amount that counts is the one agreed in writing, at an agreed rate, shortly before payment.'],
            },
            {
                heading: 'How do I avoid Bitcoin fraud?',
                bullets: ['Never send coin to an address from a chat, call or unsigned message.', 'We never ask you to pay a personal wallet.', 'Confirm payment instructions through our website or the escrow lawyer.', 'Payments in coin cannot be reversed, so check twice.'],
            },
        ],
        related: [
            { label: 'Homes for sale', path: '/for-sale' },
            { label: 'AML and sanctions policy', path: '/aml-sanctions' },
            { label: 'How to avoid property scams', path: '/guides/how-to-avoid-property-scams-in-uganda' },
        ],
    },
    {
        slug: 'how-to-take-a-virtual-property-tour',
        title: 'How to Take a Virtual Property Tour',
        description: 'How to use a 360° virtual tour to shortlist homes from anywhere, and a checklist of what to look for in each room before you visit or pay.',
        summary: 'A 360° tour lets you walk through a home on your phone, tablet, computer or VR headset. Use it to shortlist, then check light, space, condition and surroundings before you visit.',
        published: D,
        updated: D,
        sections: [
            {
                heading: 'How do I take a virtual tour on RealEVR Estates?',
                steps: ['Open a listing and press the tour.', 'Drag to look around, or tap the arrows and doors to walk to the next room.', 'Use the Enter VR button on a headset for the full effect.', 'Press the Map button next to the tour to see where the home is on Google Maps.'],
            },
            {
                heading: 'What should I look for in each room?',
                bullets: ['Size: does your furniture fit?', 'Light and windows: how bright is it, and where do the windows face?', 'Condition: damp marks, cracks, flooring and fixtures.', 'Kitchen and bathrooms: space, fittings, signs of leaks.', 'Storage and power points.'],
            },
            {
                heading: 'What a tour cannot tell you',
                paras: ['Noise, smell, water pressure, the neighbours and the street at night. Visit, or send someone you trust, before you pay.'],
            },
        ],
        related: [
            { label: 'Rental units', path: '/rental-units' },
            { label: 'BnBs and short stays', path: '/bnbs' },
            { label: 'Homes for sale', path: '/for-sale' },
        ],
    },
]

export const guideBySlug = (slug: string) => GUIDES.find((g) => g.slug === slug)
