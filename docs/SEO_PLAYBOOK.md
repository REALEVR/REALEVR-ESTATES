# SEO playbook

What is built, what to switch on, and what only a person can do.

## Built into the site

| Checklist item | How it is done |
| --- | --- |
| Canonical tags | Every page sets one through `PageSeo`; crawler pages repeat it in the raw HTML. |
| JSON-LD | Organization + WebSite on every crawler page; RealEstateListing (properties), CollectionPage + ItemList (lists), FAQPage (home and the four category pages), Article + BreadcrumbList (guides), BreadcrumbList (comparisons), Person-style agent profiles. |
| Server-rendered pages | `server/crawler-pages.ts`. Search engines, AI crawlers (GPTBot, ClaudeBot, PerplexityBot, …) and link-preview bots get finished HTML: the real content, title, description, canonical, structured data and links. Content pages are the real React pages rendered on the server (`server/ssr/static-pages.tsx` → `dist/ssr/static-pages.cjs`, built by `npm run build`). People still get the app. This is "dynamic rendering", which Google documents as acceptable. It is not server rendering for visitors. |
| AI crawlers not blocked | `robots.txt` names GPTBot, ChatGPT-User, OAI-SearchBot, ClaudeBot, Claude-SearchBot, Claude-User, PerplexityBot, Google-Extended, CCBot, Applebot-Extended, Meta-ExternalAgent and others, all `Allow: /`. Private areas (`/api`, `/admin`, `/dashboard`, …) stay blocked for everyone. |
| `llms.txt` | `client/public/llms.txt`: what the site is, key pages, guides, comparisons and facts. |
| sitemap.xml / robots.txt | Dynamic. Includes every property, place, guide (with last-updated date) and comparison. |
| Unique title + description per page | Each page sets its own. Titles aim for 65 characters or fewer. |
| One H1, no skipped levels | Checked in the browser on every public page. |
| Headings as search queries | About, How it works, Trust & Safety, Contact, the FAQ blocks and every guide use question headings. |
| Internal links | Header/footer links on every crawler page, breadcrumbs, "Keep reading" blocks on guides and comparisons, related listings on property pages. |
| Short, scannable text | Guides use a one-paragraph answer first, then short sections, lists and steps. |
| Author + date | Every guide shows author (RealEVR Estates Editorial Team), published and updated dates, and has them in Article JSON-LD. |
| "vs" / alternatives pages | `/compare` and four pages (Lamudi, BuyRentKenya, Property24, Airbnb). See "Keep honest" below. |
| Broken links | `npm run check:links` compares every internal link with the real routes. It found and fixed four. |
| Lighthouse | See below. |

## Switch on (Railway variables)

- `GOOGLE_SITE_VERIFICATION`: the content value of the meta tag Google Search Console gives you. Served on every crawler page.
- or `GOOGLE_SITE_VERIFICATION_FILE`: the file name for the "HTML file" method (e.g. `google1234abcd.html`).
- `BING_SITE_VERIFICATION`: same, for Bing Webmaster Tools.
- `SEO_SAME_AS`: comma-separated https links to your real YouTube channel, Facebook, X, LinkedIn, Reddit profile. They go into the Organization structured data.
- `BASE_URL` must be your real address (it already is).

## Connect Google Search Console (only you can do this)

1. Go to search.google.com/search-console and add your site as a **URL prefix** property.
2. Choose the **HTML tag** method, copy the `content` value into `GOOGLE_SITE_VERIFICATION` on Railway, redeploy, press Verify.
3. Submit `https://<your site>/sitemap.xml` under Sitemaps.
4. Use URL inspection on `/`, `/for-sale`, `/guides` and one property, then "Request indexing".
5. Do the same in Bing Webmaster Tools (it can import from Search Console). Bing, Yandex and others also get new pages through IndexNow, which the site already sends.

## Backlinks: Reddit and YouTube first

These need a real person. Nothing here is posted automatically, and it should not be: undisclosed or repeated link-dropping gets accounts banned and hurts the site.

**YouTube** (best long-term: Google shows video, and AI answers cite it)
- Put each 360° tour on a short video with the property name and area in the title, and the page link in the first line of the description.
- Make 4 explainer videos from the guides: how bank auctions work, how to buy a house in Uganda, how to avoid property scams, how to buy a house with Bitcoin. Link each to its guide.
- Add the channel to `SEO_SAME_AS`.

**Reddit**
- Use a real account with a history. Say you are part of RealEVR Estates when you mention it.
- Answer questions where they are asked (renting in Kampala, moving to Uganda, buying land safely, crypto and property) with the full answer in the comment, and link a guide only when it adds something.
- Never post the same link in many places. One genuine answer a day beats thirty drops.

## Keep honest

- The comparison pages state only what RealEVR Estates does and describe the other sites in general terms from how they describe themselves. Re-read each page before you publish changes, review it every few months, and update `COMPARE_REVIEWED` in `shared/compare.ts` when you do.
- Guides are general information, not legal advice. Have a Ugandan property lawyer read the title, foreign-ownership and bank-auction guides.

## Lighthouse

Run it yourself:

```
npm i -g lighthouse
lighthouse https://<your site>/ --view
```

Results from this build on a simulated slow phone (4× CPU, slow 4G), with no live data behind it:

| | Before | After |
| --- | --- | --- |
| Mobile performance | 44 | ~60 |
| Desktop performance | not run | 92 |
| Accessibility | 96 | 100 |
| Best practices | 100 | 100 |
| SEO | 92 | 100 |

What changed: text compression (the script was served uncompressed at 2.3 MB), a one-year cache on built files, the main script split from 2.3 MB to 1.0 MB (every page, admin, maps, dialogs and floating helpers now load on demand), non-blocking web fonts, a 60 KB hero image instead of 258 KB that no longer fades in, the YouTube player loaded only on click, image sizes set, and the pinch-zoom block removed.

Not done: mobile performance is still limited by roughly 300 KB of script on the first page and a 250 KB stylesheet. Rendering the app for visitors (not just crawlers) would be the next step and is a larger change.
