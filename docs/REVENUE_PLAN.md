# Making US$10 a day

US$10 a day is about US$300 a month, roughly UGX 1.1 million (at about UGX 3,700 to the dollar; check today's rate).
No code can promise income, so this lists what is built, what each stream needs to reach the target, and what to do
first. The numbers are arithmetic from the prices in the code plus stated assumptions, not forecasts.

## The four streams

| Stream | State | What US$10/day means | Needs |
| --- | --- | --- | --- |
| **Featured placement** (owners pay to be shown first, badged) | **Built and live**: bronze UGX 10,000 / 7 days, silver 25,000 / 14, gold 50,000 / 30, mobile-money payment, now listed on `/fees` | about 22 gold, or 110 bronze, a month | Owners who know it exists and see results |
| **Ads** (Google AdSense) | **Built, off** until you set three variables (below) | 3,300 to 20,000 page views a day if a thousand views earn US$0.50 to US$3. Traffic from Africa is at the low end, so check your own AdSense report | AdSense approval (needs real content, a privacy policy, steady visits) and traffic |
| **Pay per enquiry** | Built as metering only (`server/gene/lead-metering.ts`): 10 free enquiries per listing per month, then UGX 2,000, invoiced by hand | about 19 billable enquiries a day | Agents who agree to pay, and you invoicing. Not shown on `/fees` yet, so decide before you charge |
| **Affiliate / partner fees** | Not built; it needs real deals, not code | depends on the deal | Movers, mortgage lenders, furniture and insurance firms who pay per referral. Kevin already tags "shifting soon" people |

## The realistic first mix

Ads alone are the slowest: they pay only after the traffic exists. The fastest money is the one that needs few people:
owners and agents paying for placement, because each sale is UGX 10,000 to 50,000, not a fraction of a cent.

1. **This week**: get 30 to 50 good listings in one city (see [GROWTH_PLAN.md](GROWTH_PLAN.md)). Boost is worthless
   with nothing to rank against.
2. **Offer a boost by hand to 20 agents**: "your top listing first for 7 days, UGX 10,000". Ten take it, that is
   UGX 100,000 (about US$27) in a week. Then tell them what it did (the view count on the listing).
3. **Apply for AdSense** once there is steady traffic and the legal pages exist (they do: privacy, terms, contact).
   Set `ADSENSE_PUBLISHER_ID`, `VITE_ADSENSE_CLIENT`, `VITE_ADSENSE_SLOT` in Railway and redeploy (the two `VITE_`
   ones are read at build time). Ads then appear on listing results, place pages and guides, never beside a tour or a
   form. Visitors in the EU/UK need Google's consent message: turn it on in AdSense (Privacy & messaging).
4. **Pick two partners** (a moving company, a lender) and offer them the "shifting soon" and "buying" enquiries for a
   fee per referral.
5. **Check weekly**: the boost take-rate report (`/api/gene/boost/take-rate`, admin only), Admin > Leads, the AdSense report. Keep what pays, drop what does not.

## Reaching US$10 a day

An example that adds up, not a promise: 12 boosts a month averaging UGX 25,000 (about US$81), 3,000 page views a day on
ads at US$1 per thousand (about US$90 a month), and 60 paid enquiries a month at UGX 2,000 (about US$32) is about
US$200 a month, two-thirds of the way. Doubling the listings and the traffic gets there. It takes weeks of listings and
outreach, not a switch.

## What I would not do

Buying traffic, fake listings or clicking your own ads. They get AdSense accounts banned and the site de-ranked
(see the same warning in the growth plan), and they earn nothing that lasts.
