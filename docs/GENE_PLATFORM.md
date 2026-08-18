# GENE Platform — v1 scaffolding

This implements the first pass of the "GENE Platform" team plan: an AI
concierge + data + commerce + growth layer built additively on top of
REALEVR-ESTATES. Nothing here changes an existing route, table, or UI
component — see "Why additive" below.

16 modules, one per role in the plan, live under `server/gene/`:

| # | File | Team | Role |
|---|---|---|---|
| 1 | `chat.ts` | 1 Core AI | Conversational/NLU |
| 2 | `ingestion.ts` | 1 Core AI | Data ingestion / RAG-lite |
| 3 | `analytics.ts` | 1 Core AI | Analytics & prediction |
| 4 | `learning-loop.ts` | 1 Core AI | Learning loop |
| 5 | `data-partnerships.ts` | 2 Data & Integrations | Regulatory/gov data tracker |
| 6 | `listings-api.ts` | 2 Data & Integrations | Property listing API |
| 7 | `whatsapp.ts` | 2 Data & Integrations | WhatsApp routing / handoff |
| 8 | `data-quality.ts` | 2 Data & Integrations | Data quality/ops |
| 9 | `payments-core.ts` | 3 Commerce | Payments core |
| 10 | `btc-payments.ts` | 3 Commerce | Bitcoin payment flow |
| 11 | `investor-analytics.ts` | 3 Commerce | Investor analytics |
| 12 | `listings-lifecycle.ts` | 3 Commerce | Listings & transactions backend |
| 13 | `content-promotion.ts` | 4 Growth/Support/Infra | Content/promotion agent |
| 14 | `support.ts` | 4 Growth/Support/Infra | Support agent |
| 15 | `infra-health.ts` | 4 Growth/Support/Infra | Infra/DevOps agent |
| 16 | `qa-security.ts` | 4 Growth/Support/Infra | QA/security agent |

## v1.1 — requested follow-ups

Four more modules, added in a second pass in direct response to specific
follow-up requests:

| # | File | What it does |
|---|---|---|
| 17 | `btc-qr.ts` | Extends `btc-payments.ts` — generates a real BIP21 `bitcoin:` URI + scannable QR code (PNG data URI, via the `qrcode` package) for a locked quote, against your own receiving address (`GENE_BTC_RECEIVE_ADDRESS`). Also does best-effort on-chain payment detection against mempool.space's free public API. |
| 18 | `slack-bridge.ts` | Real two-way Slack integration: posts new WhatsApp escalations to a Slack channel (`SLACK_WEBHOOK_URL`), and a signed Slack slash command (`SLACK_SIGNING_SECRET`) lets you `resolve <id> <note>` or check `inbox` without leaving Slack. |
| 19 | `agent-whatsapp-onboarding.ts` | Lets any logged-in agent/admin self-link their WhatsApp number and immediately receive a one-tap group invite link (`WHATSAPP_AGENT_GROUP_INVITE_LINK`) via WhatsApp DM. See the important caveat below — WhatsApp's API cannot silently add someone to a group. |
| 20 | `tour-access-pass.ts` | The real enforcement of "pay UGX 15,000, view up to 5 properties, one account, 24 hours" — the existing IoTec flow only ever had this as UI copy; a payment now actually mints a pass, and views are actually capped and expire. Wired into the existing `/api/payment/iotect/record` route as one small, best-effort, try/catch-guarded addition — that route's original behavior is unchanged. |

### On "automatically adds them to the WhatsApp group"

Worth being upfront about a real platform limit: WhatsApp's Business
Platform (Cloud API) has no endpoint to programmatically add a phone number
to a Group — Meta blocks this for anti-spam reasons, for every legitimate
integration, not just this one. What's actually built is the closest
compliant equivalent: the moment an agent links their number, they get an
automatic WhatsApp DM with your group's invite link, so joining is one tap
rather than them having to ask you for the link manually. If a true
zero-tap add ever becomes a hard requirement, the realistic alternative is
moving that channel to a platform whose API does support it (e.g. a
Telegram or Slack group instead of a WhatsApp group).

### New env vars this pass

| Var | Used by | Effect if unset |
|---|---|---|
| `GENE_BTC_RECEIVE_ADDRESS` | `btc-qr.ts` | Defaults to `bc1qmpymf6hdspdac7rkhjlnjq83lggmjttx820za2` (the address you gave us) — set this env var only if you ever want to route BTC payments to a different wallet |
| `SLACK_WEBHOOK_URL` | `slack-bridge.ts` | Escalation notifications log locally instead of posting to Slack |
| `SLACK_SIGNING_SECRET` | `slack-bridge.ts` | Slash command endpoint fails closed (401) rather than accepting unsigned requests |
| `WHATSAPP_AGENT_GROUP_INVITE_LINK` | `agent-whatsapp-onboarding.ts` | Agent's number is still saved, but no invite DM is sent |

Setting up Slack: in your workspace, add an **Incoming Webhook** app
(Slack → Apps) pointed at whichever channel should receive escalations —
that URL is `SLACK_WEBHOOK_URL`. Separately, create a Slack App with a
**Slash Command** (e.g. `/gene`) whose Request URL is
`https://<your-domain>/api/gene/slack/commands`, then copy that app's
Signing Secret into `SLACK_SIGNING_SECRET`.

### Verification performed this pass

Same standard as the first pass — `npx tsc --noEmit` (41 pre-existing
errors, zero new), `npx esbuild` production bundle (clean), and a real
runtime smoke test against a mocked-storage Express app: an escalation
correctly triggered (and gracefully no-op'd) a Slack notification; a BTC
quote's QR endpoint correctly 501'd before `GENE_BTC_RECEIVE_ADDRESS` was
set and correctly returned a real BIP21 URI + QR after; on-chain checking
correctly reported "could not reach blockchain explorer" (this sandbox has
no general internet egress — same limitation noted for the CDN and
DynamoDB elsewhere in this repo's docs; the mempool.space call itself is
standard and keyless and will work once deployed); the Slack slash command
correctly rejected an unsigned request with 401; agent WhatsApp linking
correctly reported "invite not sent" without a group link configured; and
the tour pass correctly allowed exactly 5 redemptions, marked itself
`exhausted` on the 6th, and rejected further redemption with 402 until a
new pass is issued.

Plus two shared contract files (the plan's "Week 0 architecture pass",
built first so all 4 teams could work in parallel against it):

- `server/gene/types.ts` — canonical shared types (`GeneListingRecord`,
  `ConfidenceInterval`, `ApprovalGate`, `SUPPORTED_COUNTRIES`, etc.)
- `server/gene/store.ts` — the persistence layer (see below)

## Why additive, and why a JSON-file store instead of new DynamoDB tables

Every module is registered from `server/routes.ts` via its own
`registerXRoutes(app, adminMiddleware)` call (same pattern the existing
`registerRoomCaptureRoutes` and `notificationRoutes` use) — no existing
route, table, or React component was touched.

Rather than provisioning 12+ brand-new DynamoDB tables sight-unseen, every
GENE module persists through one tiny shared interface,
`server/gene/store.ts` (`readCollection`/`writeCollection`/`nextId`), backed
by JSON files under `data/gene/*.json`. This is the same pattern
`server/room-capture.ts` already uses for its draft manifests. Each
collection (`gene_conversations`, `gene_transactions`, `gene_offers`, etc.)
is a natural DynamoDB table later — swapping the implementation is a
localized change in that one file; nothing that imports from it needs to
change. Recommended follow-up once this is reviewed: promote the handful of
collections that need real concurrency/scale (transactions, offers,
escalations) to DynamoDB tables via `server/dynamodb.ts`'s existing
`TABLES`/`DynamoDBUtils` pattern.

## What's real vs. what needs your credentials

Every module was runtime-smoke-tested end-to-end against real logic (not
just type-checked) — see "Verification" below. What's real today:

- **Chat** actually classifies intent and replies (rule-based out of the
  box; calls the real Anthropic API automatically if `ANTHROPIC_API_KEY` is
  set, with live property data as context).
- **Ingestion** actually pulls your real DynamoDB properties and normalizes
  them.
- **Analytics/forecast** computes real confidence intervals from your real
  price data (never a bare point estimate).
- **Data quality** actually validates your real listings (missing
  images/price/location, duplicate title+location pairs).
- **Listings API** actually issues hashed partner API keys, rate-limits
  them, and the availability-toggle endpoint really calls
  `storage.togglePropertyAvailability`.
- **Payments (manual)**, **listings lifecycle/offers**, **investor ROI /
  comparables**, **content approval queue**, **support macros**, **infra
  health checks**, and **the `npm audit` dependency scan** all run for
  real against real data.

What's scaffolded and explicitly needs something from you before it goes
live:

| Needs | Module | What happens without it |
|---|---|---|
| `ANTHROPIC_API_KEY` | `chat.ts` | Falls back to rule-based canned replies per intent — never errors |
| `WHATSAPP_BUSINESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` | `whatsapp.ts` | Logs to console instead of sending; the escalation queue itself works fully without it |
| A live BTC/USD rate feed (e.g. CoinGecko) | `btc-payments.ts` | `/api/gene/btc/quote` requires you to pass the rate explicitly and 400s otherwise, rather than inventing one |
| **Finance sign-off** | `btc-payments.ts` | Buffer/tolerance percentages are placeholders pending review — flagged in a banner comment at the top of the file, per the product plan's explicit callout |
| `MOBILE_MONEY_API_KEY` / `STRIPE_SECRET_KEY` | `payments-core.ts` | Those providers throw a clear "not configured" error; only the `manual` (human-confirmed) provider works today |
| Real government data-sharing agreements | `data-partnerships.ts` | It's a tracker, starts empty by design — per the plan, this is realistically the slowest-moving track and should not block launch |
| A test framework (none configured repo-wide) | `qa-security.ts` | `server/gene/__smoke__.test-plan.md` is a manual checklist instead; Vitest is the natural fit if you want to formalize this later |

No AML/KYC step exists anywhere in the payment flows (manual or BTC) — worth
a compliance pass before real money moves through these endpoints.

## Cross-module contracts

A few modules intentionally share state rather than duplicating it:

- `chat.ts` writes to `gene_escalations` (any inquiry it can't confidently
  resolve, or an explicit "talk to a human" request); `whatsapp.ts` owns the
  claim/resolve workflow over that same collection; `support.ts` reads it
  read-only for the tier-1 view. One collection, one writer per field.
- `ingestion.ts` writes `gene_listings` + `gene_source_freshness`;
  `analytics.ts` and `data-quality.ts` read them.

## API surface

16 modules × ~4 routes each ≈ 60 endpoints under `/api/gene/*`. Full list
with expected responses: `server/gene/__smoke__.test-plan.md`.

## Verification performed this session

- `npx tsc --noEmit`: 41 pre-existing errors before and after, zero new
  errors across all 16 new modules + the `routes.ts` registration.
- `npx esbuild` production server bundle: builds clean.
- **Real runtime smoke test**: booted an isolated Express app with all 16
  modules mounted (storage mocked with two realistic properties, since this
  dev sandbox has no network egress to AWS — the same limitation documented
  in `docs/GUIDED_360_UPLOAD.md`) and exercised ~30 real requests across
  every module — chat classified intents and escalated correctly, ingestion
  pulled and normalized both properties, analytics returned a real
  confidence interval, a partner API key was issued and its availability
  toggle worked, a BTC quote correctly 400'd without a rate and correctly
  quoted with one, ROI/comparables computed from real property data, and
  `npm audit --json` returned this repo's real vulnerability counts (66
  found: 6 critical / 21 high / 33 moderate / 6 low — pre-existing, not
  introduced here, now visible via `GET /api/gene/qa/dependency-audit`).

## Suggested next steps

1. Review this scaffolding, then decide which of the "needs your
   credentials" items above to provision first — Team 1 (chat +
   ingestion) is the highest-leverage, lowest-dependency piece to turn on
   first, per the plan's own sequencing.
2. Wire a scheduled job (there's already a `server/cron/` folder with a
   matching pattern) to call `POST /api/gene/ingestion/run/internal`
   periodically — that's also what unlocks real time-series forecasting in
   `analytics.ts` instead of today's cross-sectional estimate.
3. Build the admin-facing UI screens for these endpoints (WhatsApp inbox,
   content approval queue, investor report, BTC settlement) — this pass is
   API-only, no new React components, by design (kept the diff reviewable).
4. Run `GET /api/gene/qa/dependency-audit` for real and start working down
   the 6 critical / 21 high findings — pre-existing, unrelated to this
   change, but now something the platform surfaces to you automatically.
