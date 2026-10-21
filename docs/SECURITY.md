# Security notes

Last full review: 2026-10-21. This is a code review plus a few live, side-effect-free probes. It cannot prove the site is unhackable; it lists what was found, what was changed, and what only the owner can do.

## Fixed in code (PR "security hardening")
| # | Finding | Fix |
|---|---------|-----|
| 1 | `POST /api/register` copied the whole request body into the new account, so `{"role":"admin"}` created an administrator | Fields are whitelisted; role is `normal` or `agent` only |
| 2 | `PATCH /api/users/:id/role`, `/complimentary-access`, `GET /api/users` and many money/PII routes used `adminMiddleware`, which admits any **agent**, and anyone can register as an agent | These now require a real administrator (`requireStrictAdmin`): users, roles, payments ledger, BTC settle, boost confirm, payouts, tour passes, partner API keys, lead billing, support, WhatsApp inbox, data/analytics tools |
| 3 | `POST /api/payment/iotec/token` handed the payment gateway's live access token to anyone | The browser gets a placeholder; the server adds the real token. Wallet balance is admin only |
| 4 | RentRail "payment collected" accepted any successful transaction id, any number of times, then paid the landlord automatically | One transaction settles one payment; the collected amount must cover it, otherwise the payout waits for a person |
| 5 | `DELETE /api/properties/:id` had no check at all | Sign-in plus owner-or-admin |
| 6 | Any agent could edit/delete/upload tours to any other agent's listing, and set `ownerId` / `isFeatured` | Owner-or-admin on edit, availability, tour uploads and room captures; ownership and placement fields are admin-only, on create too |
| 7 | `POST /api/setup-dynamodb` (open) overwrote user #1 | Removed. Test/debug routes are admin only; the header-logging test route is gone |
| 8 | CORS echoed any website's origin with credentials allowed | Allow-list of this site's own origins |
| 9 | No security headers; `X-Powered-By` shown | nosniff, frame, referrer, permissions, HSTS (over https) |
| 10 | No rate limits | Login (per address and per account), sign-up, e-mail/SMS codes, AI/speech, public forms, payment prompts, and a ceiling on all writes |
| 11 | Session cookie not `Secure`; default session secret in source | `secure: auto`; random secret if `SESSION_SECRET` is missing |
| 12 | JSON body limit 5 GB | 25 MB |
| 13 | Unauthenticated Infobip webhook sent our API key to any URL in a message | Media is fetched only from infobip.com (or `INFOBIP_BASE_URL`) |
| 14 | `/api/users/:id` returned e-mail, phone, role... to everyone; `/api/user` returned the e-mail verification secret; RentRail receipts showed phone numbers to anyone | Public fields only; secret removed; phones masked |
| 15 | `tourUrl` could be `javascript:`; tour-production "complete" was open | `tourUrl` must be https or one of our tour files; "complete" is admin only |
| 16 | SVG (script) accepted as a property image | JPG/PNG/WebP/GIF/AVIF only; extension from the checked type |
| 17 | AWS key + secret and Cloudinary secret written in source; cookies/user objects written to logs | Moved to environment variables; logging removed |

## Only the owner can do these
1. **Rotate the AWS access key** that was committed in `scripts/verify-existing-users.js` (key id starts `AKIAYBWO`) and the **Cloudinary API secret** in `server/cloudinary-util.ts`. Removing them from the code does not remove them from git history; assume they are public. Check CloudTrail for use you do not recognise. Set `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` if Cloudinary is still used.
2. **Rotate `IOTEC_CLIENT_SECRET`** and look at the IoTec wallet's transaction history: the token endpoint was public.
3. **Set `SESSION_SECRET`** on Railway (a long random string) if it is not set; rotating it logs everyone out.
4. **Look for damage from the open holes**: accounts with role `admin` you do not know (Admin > Users); listings with an unexpected `ownerId`, `isFeatured`, or a `tourUrl` that does not start with your tour host; listings that vanished; RentRail payments marked paid with the same `iotecTransactionId`.
5. Restrict the Google Maps key to your site (HTTP referrers) and the Firebase key to your domain, in the Google consoles. Both keys are public by design, so the restriction is the protection.
6. In Cloudflare: turn on the free managed WAF rules and a rate-limit rule for `/api/login`, `/api/register` and `/api/gene/*`; this is stronger than the in-app limits.
7. Give the AWS user used by the app only the S3 bucket and DynamoDB tables it needs.

## Known, not yet changed
- **Dependencies:** `npm audit` reports 75 issues (5 critical, mostly inside Firebase's client libraries and tooling). The runtime ones that matter (`adm-zip`, `nodemailer`, `drizzle-orm`, `basic-ftp`) need major-version upgrades that should be tested separately.
- Agent sign-up trusts the subscription fields the browser sends (a paid plan can be claimed without paying). That is revenue leakage, not a break-in; it needs the Flutterwave check moved to the server.
- Login does not require a verified e-mail. Sessions are in memory (lost on every deploy). No CSP header yet (add it in report-only mode first). No CSRF token; `SameSite=Lax` plus the CORS allow-list covers the browser cases.
- `/api/verify-payment` returns a stateless "access" grant that can be replayed with the same transaction id (low impact: viewing access).
