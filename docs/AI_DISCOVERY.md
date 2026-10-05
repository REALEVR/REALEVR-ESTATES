# Being found by AI assistants

People now ask ChatGPT, Claude, Perplexity and Google's AI "find me a 2 bedroom in Kololo". For the platform to be
the answer, AI tools need two things: to be allowed to read the site, and a way to search it that returns real homes
with a link back. Both exist.

## What is built

| What | Where | For whom |
| --- | --- | --- |
| Crawlers welcome: named AI bots allowed, sitemap, IndexNow pings, finished HTML for bots | `robots.txt`, `sitemap.xml`, `server/crawler-pages.ts` | AI search tools that browse the web |
| `llms.txt` describing the platform, pages, guides and now the API below | `/llms.txt` | AI tools that read it |
| **Open listings API** (read only, free, 60 requests a minute per address) | `/public-api/v1/search`, `/properties/:id`, `/places`, `/knowledge` | Developers and agents |
| **MCP server** (Streamable HTTP, no login, no sessions) with tools `search_properties`, `get_property`, `list_places`, `real_estate_knowledge` | `POST /mcp`, card at `/.well-known/mcp.json` | Claude, ChatGPT developer mode, Cursor, any MCP client |
| API description | `/openapi.json` | Custom GPTs / Actions, developers |

Code: `server/ai-discovery.ts`. Every result carries the listing's page `url` and the tool descriptions tell the AI to
give that link to the person, so the visit (and the tour, and the enquiry) lands on your platform.

**What it never exposes:** owner phone numbers or emails, unavailable listings, anything not already public on the
page. Nothing in it calls a paid AI service, so heavy use costs you nothing but server time.

"Search anything real estate": homes come from `search_properties`; market news and "how does buying work in
<country>" come from `real_estate_knowledge`, which reads what Kevin has gathered from published reports (see
[KEVIN_KNOWLEDGE.md](KEVIN_KNOWLEDGE.md)) and names its sources.

## Try it

```bash
curl 'https://estates.realevr.com/public-api/v1/search?location=Kololo&bedrooms=2&max_price=3000000'

# MCP: list the tools
curl -X POST https://estates.realevr.com/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Add it to Claude (Settings > Connectors > add custom connector) or any MCP client with the URL
`https://estates.realevr.com/mcp`.

## What you do to get listed (I cannot do these from here; each needs your account)

1. **Google Search Console**: add the site, submit `sitemap.xml`, request indexing of the home page
   ([SEO_PLAYBOOK.md](SEO_PLAYBOOK.md)). Google's AI answers draw on this index.
2. **Bing Webmaster Tools**: add the site and import from Search Console. Bing powers ChatGPT search and others.
   (IndexNow already pings Bing on every new listing.)
3. **MCP directories**, so people can find the server: the official MCP Registry, Smithery, Glama, PulseMCP, mcp.so.
   Each has its own submit form or CLI and changes over time; use the URL `https://estates.realevr.com/mcp` and the
   description "Search real, available homes in Africa with 360° tours".
4. **A GitHub repository** for the integration is optional. The code stays private; if you later want a public
   example repo (README, the curl examples above, an OpenAPI file), say so and I will make one with no platform code.
5. **Be the cited answer**: AI tools quote pages that answer a question plainly. The guides and `/homes/<country>/<city>`
   pages are that. Add a guide for each question you want to own (`shared/guides.ts`).

## Honest limits

- Nobody can promise that an AI assistant will recommend the platform. This makes it findable, searchable and
  linkable, which is what decides it.
- Until the sitemap is processed and MCP clients add the URL, traffic from this is small. It compounds with more
  listings in more cities.
