# Getting the first 1,000 real users

No code can promise a number of visitors. Traffic comes from people who find or
are told about the platform, so the honest plan has two halves: what the product
now does to turn every visit and every share into more visits, and what has to be
done by people, in the places the users already are. Only real people count here.
Bought traffic, fake accounts, scraped-number WhatsApp blasts and bot signups
inflate a dashboard, get a WhatsApp number banned and a site de-ranked, and never
become tenants.

## What the product now does for growth

| Lever | What exists |
| --- | --- |
| Search engines | A page for every country and city that has homes (`/homes/kenya/nairobi`), with real listings, structured data and sitemap entries. Empty places are not advertised. The sitemap, `llms.txt` and link previews cover them. |
| Starts where the visitor is | Listings, filters and Kevin are ordered by the visitor's city, then country, from their time zone (no prompt) or location if they allow it. A Nairobi visitor sees Nairobi first, not Kampala. |
| Anyone in Africa can list | Free, landlord-verified over WhatsApp, priced in the local currency. More listings in more cities is what makes the place pages worth visiting. |
| Neighbours bring neighbours | Occupant recommendations: a resident tells us about their building, earns a point, 100 points = 10,000 UGX. Each one is also a new listing lead and a resident who talks about the site. |
| Share loop | Share points (100 shares to different WhatsApp numbers = 1,000 UGX) and a Share button on every place page. |
| Kevin | Greets, understands what someone wants without an AI key, recommends real homes, hands them to the owner on WhatsApp, and records shifting-soon people and unmet demand. |
| Measurement | Admin > Leads: who talked to Kevin, who is shifting soon, what to add (by country), plus the "Is Kevin working?" check. |

## What people have to do (in this order)

1. **Make 50 good listings in one city before anything else.** Visitors who find
   nothing do not come back. Pick Kampala or Nairobi, get agents and landlords to
   list (free), and add a virtual tour to the best 10.
2. **Agents are the cheapest users to win, and each brings tenants.** Message
   agents and caretakers directly (one by one, by name, from public listings or
   your own contacts) with: free listing, virtual tour, leads on WhatsApp. Aim for
   20 agents who each list 5.
3. **Go where renters already are.** Estate and building WhatsApp groups you are a
   member of (ask the admin first), university housing groups, Facebook housing
   groups, Reddit/X communities for the city. Post a real home with its tour link,
   not an advert. Use the place link, e.g. `/homes/uganda/kampala?utm_source=whatsapp`.
4. **Short video of tours.** A 20-second walk-through clip on TikTok/Reels/YouTube
   Shorts of one real listing, with the link in the bio. Post daily for a month.
5. **Let residents recruit.** Promote `/recommend-a-place` to residents: "Live in a
   building we don't have? Earn points." Tell landlords' tenants' groups about it.
6. **Google Business Profile and local directories** for each city you operate in.
7. **Partnerships**: SACCOs, student guilds, employer relocation desks, moving
   companies (they meet "shifting soon" people daily: Kevin has a category for it).

## Rough funnel (so the target is believable)

To reach 1,000 users you need on the order of 10,000 visits at a typical
5-10% signup rate, or 3,000 visits at a strong 30% from warm WhatsApp referrals.
A single active WhatsApp group of 300 people with a real listing posted weekly
can bring 30-60 visits per post. Twenty such groups, plus a few agents sharing
their own listings, is the realistic path in 6-10 weeks.

## Weekly rhythm

- Monday: pick the week's city and listings; post to 5 groups with `utm_source=<group>`.
- Wednesday: one tour video. Message 10 agents.
- Friday: look at Admin > Leads > "What to add" and list what people asked for and
  did not find. That list is your supply roadmap.
- Track: visits, signups, listings added, Kevin conversations, WhatsApp taps.

## Things to switch on

- `ANTHROPIC_API_KEY` (done) for Kevin in every language.
- WhatsApp Business (`WHATSAPP_BUSINESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`): without
  it the live site cannot verify new listings (by design).
- `KEVIN_WHATSAPP_NUMBER`: the number visitors message.
- Submit `/sitemap.xml` in Google Search Console once; check Coverage after a week.
