# GENE Platform — smoke test plan

No test runner is configured in this repo today (`package.json` has no
`test` script and no `jest`/`vitest`/`mocha`/`ava` dependency — confirmed by
inspection). Rather than add a new framework as a dependency under this
pass's "no new npm deps" constraint, this file is the interim regression
suite: a concrete, runnable-by-hand (or easily scriptable with `curl`)
checklist. **Recommendation for later:** if the team wants to formalize this,
[Vitest](https://vitest.dev) is the natural fit — the client already builds
with Vite, so it needs zero extra config, unlike Jest. Not installed here;
that decision is left to whoever picks this up next.

How to use this file: start the server (`npm run dev`), then either click
through with an admin-logged-in browser session/Postman, or `curl` each
`[ADMIN]` route with an authenticated session cookie. Each line says what to
hit and what a healthy response looks like — anything else is a regression.

> **Coverage note:** as of this writing, 12 sibling GENE modules exist in
> this checkout alongside Team 4's 4 — `chat.ts`, `data-partnerships.ts`,
> `listings-api.ts`, `whatsapp.ts`, `ingestion.ts`, `analytics.ts`,
> `data-quality.ts`, `investor-analytics.ts`, `learning-loop.ts`,
> `listings-lifecycle.ts`, `payments-core.ts`, `btc-payments.ts` — all get
> concrete lines below, sourced from reading their actual route
> registrations, not guessed. `docs/GENE_PLATFORM.md`, referenced in several
> of these files' header comments as the source of the full module roster,
> does not exist in this checkout, so if the "15 other modules" figure this
> plan was scoped against implies a couple more are still landing elsewhere,
> append a numbered entry for each following the same format once you can
> see its actual routes.

## Team 4 modules (this pass)

1. **content-promotion.ts** — `POST /api/gene/content/drafts` [ADMIN] with
   `{title, body, channel:'blog'}` → `201`, body has
   `approval: {requiresHumanApproval: true, status: 'pending'}`.
2. **content-promotion.ts** — `GET /api/gene/content/drafts?status=pending`
   [ADMIN] → `200`, array containing the draft just created.
3. **content-promotion.ts** — `POST /api/gene/content/drafts/:id/approve`
   [ADMIN] → `200`, `approval.status === 'approved'` and `approvedBy`/
   `approvedAt` populated.
4. **content-promotion.ts** — `POST /api/gene/content/drafts/:id/reject`
   [ADMIN] on a different draft → `200`, `approval.status === 'rejected'`.
5. **support.ts** — `GET /api/gene/support/macros` [ADMIN] on a fresh
   `data/gene/` → `200`, array of 4 seeded starter macros (real real-estate
   copy, not lorem ipsum) — confirms auto-seed-on-first-read works.
6. **support.ts** — `GET /api/gene/support/macros?tag=refund` [ADMIN] → `200`,
   only the refund-policy macro.
7. **support.ts** — `POST /api/gene/support/macros` [ADMIN] with
   `{title, body, tags:[...]}` → `201`, macro appended.
8. **support.ts** — `GET /api/gene/support/escalations` [ADMIN] → `200`,
   array (empty is fine until Team 2's `whatsapp.ts`/Team 1's `chat.ts`
   write rows into `gene_escalations`); confirms this is a pure read-through,
   never a 500.
9. **support.ts** — `POST /api/gene/support/escalations/:id/log-resolution`
   [ADMIN] against a real escalation id with `{resolutionSummary}` → `201`,
   entry appended to `gene_resolution_log`; re-`GET`
   `/api/gene/support/escalations` and confirm that escalation's `status`
   field is **unchanged** (this route must never mutate it).
10. **infra-health.ts** — `GET /api/gene/infra/health` (no auth) → `200` when
    all checks pass or `503` when any check (commonly `dynamodb`, if AWS
    creds/network aren't reachable from where you're running) fails; body has
    `status` plus a `checks[]` array with `dynamodb`, `filesystem`, `ffmpeg`,
    `ffprobe` entries, each with `{name, status, latencyMs}`.
11. **infra-health.ts** — `GET /api/gene/infra/health-history` [ADMIN] →
    `200`, array grows by one entry per prior call to `/health`, capped at
    500.
12. **qa-security.ts** — `GET /api/gene/qa/dependency-audit` [ADMIN] → `200`
    (even though `npm audit` itself exits non-zero when vulnerabilities
    exist) with `{critical, high, moderate, low, total, topFindings: [...]}`
    where `topFindings.length <= 20`, sorted most-severe first.
13. **qa-security.ts** — `GET /api/gene/qa/history` [ADMIN] → `200`, array
    with one entry per prior `/dependency-audit` call, each carrying the
    summary counts + timestamp.

## Sibling GENE modules present in this checkout

14. **chat.ts** (Team 1) — `POST /api/gene/chat` (no auth) with
    `{message: "how much is a 2 bedroom in Kampala?"}` → `200`,
    `{sessionId, reply, intent: 'price_inquiry', escalated: false}`; reply is
    non-empty even with `ANTHROPIC_API_KEY` unset (falls back to the canned
    reply, never 500s just because the AI provider isn't configured).
15. **chat.ts** — same route with `{message: "I want to talk to a human"}` →
    `200`, `intent: 'human_handoff_request'`, `escalated: true`, and a new row
    appears in `gene_escalations` with `status: 'open'`.
16. **chat.ts** — `GET /api/gene/chat/:sessionId` (no auth) with a
    `sessionId` from #14 → `200`, full message history; with a bogus
    `sessionId` → `404`.
17. **data-partnerships.ts** — `GET /api/gene/data-partnerships` (no auth) →
    `200`, array (empty is fine on a fresh checkout).
18. **data-partnerships.ts** — `POST /api/gene/data-partnerships` [ADMIN]
    with `{country: 'Uganda', institution: 'Uganda Land Commission',
    dataType: 'parcel_boundaries'}` → `201`, `status: 'not_started'` by
    default; retry with `country: 'Atlantis'` → `400`.
19. **data-partnerships.ts** — `PATCH /api/gene/data-partnerships/:id`
    [ADMIN] with `{status: 'in_discussion'}` → `200`, updated row;
    non-existent id → `404`.
20. **listings-api.ts** — `POST /api/gene/partner-keys` [ADMIN] with
    `{partnerName: 'Test Partner'}` → `201`, response includes the **raw**
    key exactly once (never re-derivable from `GET`/storage, since only the
    sha256 hash is persisted).
21. **listings-api.ts** — a partner-facing listings read using the raw key
    from #20 in the appropriate header → `200`, real listing data sourced
    from `storage` (never fabricated); calling the same route far more than
    `rateLimitPerMinute` times inside a minute → `429`.
22. **listings-api.ts** — `DELETE /api/gene/partner-keys/:id` [ADMIN] →
    `200`/`204`, then the same key from #20 used against the partner route →
    `401`/`403` (revoked keys must stop working immediately).
23. **whatsapp.ts** (Team 2) — `GET /api/gene/whatsapp/inbox` [ADMIN] → `200`,
    only escalations with `status: 'open'` from the shared `gene_escalations`
    collection, newest first.
24. **whatsapp.ts** — `POST /api/gene/whatsapp/inbox/:id/claim` [ADMIN] on an
    open escalation → `200`, `status: 'in_progress'`, `assignedTo`/
    `assignedAt` populated; confirm it drops out of the `#23` inbox listing.
25. **whatsapp.ts** — `POST /api/gene/whatsapp/inbox/:id/resolve` [ADMIN]
    with `{resolutionNote}` → `200`, `status: 'resolved'`, `resolvedAt` set,
    and a `notification: {sent: false, reason: ...}` field when
    `WHATSAPP_BUSINESS_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID` aren't configured
    (never a 500 just because WhatsApp creds are absent); confirm
    `support.ts`'s `GET /api/gene/support/escalations` (line 8 above) no
    longer lists it.
26. **ingestion.ts** — `POST /api/gene/ingestion/run/internal` [ADMIN] → `200`
    with a `SourceFreshness` row, `lastSyncStatus: 'ok'`, `recordCount`
    matching real properties pulled from `storage`.
27. **ingestion.ts** — `GET /api/gene/ingestion/status` (no auth) → `200`,
    array including the `internal` source's freshness row from #26.
28. **ingestion.ts** — `GET /api/gene/ingestion/listings` (no auth) → `200`,
    array of `GeneListingRecord`s normalized from real properties (run #26
    first if this is empty).
29. **analytics.ts** — `GET /api/gene/analytics/trends` (no auth, run
    ingestion first) → `200`, `{generatedAt, filters, buckets}`.
30. **analytics.ts** — `GET /api/gene/analytics/forecast?country=Uganda` (no
    auth) → `200` with `forecast: {p10, p50, p90}` (never a bare number, per
    `./types.ts`'s "never present a forecast as a certainty" contract) when
    listings exist for that filter, else `404` with a clear message.
31. **analytics.ts** — `POST /api/gene/analytics/backtest` [ADMIN] with a
    non-empty array of `{predicted: {p10,p50,p90}, actual}` → `200`,
    accuracy summary; empty/malformed body → `400`.
32. **data-quality.ts** — `GET /api/gene/data-quality/validate` [ADMIN] →
    `200`, array of `DataQualityIssue`s (missing title/price/location/images,
    duplicates) computed from real `storage.getAllProperties()` data.
33. **data-quality.ts** — `GET /api/gene/data-quality/source-uptime` [ADMIN]
    → `200`; reads `gene_source_freshness` (written by #26) and is resilient
    to that collection not existing yet (empty array, not a 500).
34. **investor-analytics.ts** — `GET /api/gene/investor/roi?propertyId=` →
    `200`, ROI metrics computed from a real property's actual
    `squareMeters`/`price` fields (not the `GeneListingRecord` view's
    `areaSqm`/`city` names, which don't exist on the real schema).
35. **investor-analytics.ts** — `GET /api/gene/investor/comparables` and
    `GET /api/gene/investor/report` → `200` each, both backed by real
    `storage` data.
36. **learning-loop.ts** — `GET /api/gene/learning/queue` [ADMIN] → `200`,
    unlabeled items derived from `gene_conversations`/`gene_escalations`.
37. **learning-loop.ts** — `POST /api/gene/learning/label` [ADMIN] with a
    valid label payload → `200`/`201`, entry appended to
    `gene_training_labels`; then `GET /api/gene/learning/eval-summary`
    [ADMIN] → `200` reflecting it. Confirm no model/prompt/runtime behavior
    actually changes as a result (out of scope by design — see file header).
38. **listings-lifecycle.ts** — `POST /api/gene/listings/:propertyId/transition`
    [ADMIN] with `{toState: 'active'}` on a real property id → `200`, state
    updated; with a fake property id → `404` (never invents a property).
39. **listings-lifecycle.ts** — `POST /api/gene/listings/:propertyId/offers`
    (no auth) with a valid offer payload → `201`; `GET
    /api/gene/listings/:propertyId/offers` [ADMIN] → `200` includes it;
    `PATCH /api/gene/offers/:id` [ADMIN] to accept/reject → `200`.
40. **payments-core.ts** — `POST /api/gene/payments/charge` (no auth) with a
    manual-provider payload → `200`/`201`, `status:
    'pending_manual_confirmation'` (never a fake "success" — no real gateway
    credentials exist); a `mobile_money`/`card` provider payload →
    clear, actionable error rather than a fake success.
41. **payments-core.ts** — `POST /api/gene/payments/:id/confirm` [ADMIN] on
    the charge from #40 → `200`, status moves to confirmed; `GET
    /api/gene/payments/ledger` [ADMIN] → `200`, includes it.
42. **btc-payments.ts** — `GET /api/gene/btc/quote` (no auth, no
    `?btcUsdRate=`) → `400` with a clear message (never a fabricated
    exchange rate); with `?btcUsdRate=60000&amountUsd=100` → `200`, a quote
    with a volatility buffer applied.
43. **btc-payments.ts** — `POST /api/gene/btc/settle` [ADMIN] → confirm the
    response/comments make clear this is **not** wired to a live BTC wallet
    and is blocked on finance/legal sign-off per the file's header banner —
    do not treat any "success" here as a real settlement.
