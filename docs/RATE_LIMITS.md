# API rate limits

Reference for the limits applied in `server/lib/rate-limits.ts` (mechanism in `server/lib/security.ts`). Limits are per visitor address unless a key is noted. If the code and this table disagree, the code wins; update this file.

| Name | Applies to (writes only unless noted) | Window | Max | Notes |
|------|---------------------------------------|--------|-----|-------|
| `login` | `/api/login` | 15 min | 20 per account, 120 per address | Keyed on the submitted `username` |
| `register` | `/api/register` | 60 min | 30 | |
| `resend` | `/api/resend-verification` | 60 min | 6 per email, 30 per address | Keyed on the submitted `email` |
| `verify-token` | `/api/verify-token` | 15 min | 40 | |
| `otp` | `/api/gene/self-serve/:id/{send-verification,resend-otp,verify-otp}` | 15 min | 30 | |
| `ai` | `/api/gene/chat`, `/api/gene/speak` | 10 min | 120 | Costs money per call |
| `ai2` | `/api/ai/*` | 10 min | 80 | Costs money per call |
| `collect` | `/api/payment/iotec/collect` | 10 min | 30 | Each call prompts a phone |
| `forms` | Public forms (crypto requests, data requests, partner and auction-bidder applications, Gene message start, tour reports, lead pings) | 15 min | 60 | |
| `writes` | Every other non-GET `/api` request | 1 min | 600 | Ceiling only a script should reach |

## Exempt from the `writes` ceiling

Machine callers: `/api/payments/inbound`, `/api/country-spots/inbound/*`, `/api/rum`, `/api/gene/whatsapp/webhook`, `/api/payment/iotec*`.

## Adding a limit

1. Add a `rateLimit({ name, windowMs, max })` entry in `applyRateLimits`, wrapped in `when(<path regex>, ...)`.
2. Give it a unique `name`; the name separates counters.
3. Add a row to the table above.
4. If a webhook calls the path, add it to the exempt list instead of limiting it.
