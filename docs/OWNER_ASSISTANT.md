# Talk to the platform from WhatsApp

Your WhatsApp number (the ones in `ADMIN_WHATSAPP_NUMBERS`, default the two in `admin-notify.ts`) is a control panel.
Type or send a voice note to the RealEVR business WhatsApp number.

## What you can say

| You send | What happens |
| --- | --- |
| `STATUS` | People, live homes, what needs you |
| `PENDING` | Everything waiting, with codes (P12 partner, C3 Bitcoin buyer, D5 data request, E8 visitor asking for a person, B4 bidder, T77 tour) |
| `SHOW P12` (or just `P12`) | Details and the automatic checks |
| `APPROVE P12` · `REJECT P12 <reason>` · `MORE P12 <what is missing>` | Partner applications (not banks) |
| `C3 CONTACTED` / `ESCROW` / `DONE` / `DECLINED` | Bitcoin buyer requests |
| `D5 VERIFYING` / `DONE` / `REFUSED` | Data requests |
| `REPLY E8 <message>` · `RESOLVE E8` | Answer or close a visitor who asked for a person |
| `CHECK TOURS` · `PAYMENTS` | Tour check · unmatched payment messages |
| `AUTOPILOT ON/OFF` · `DIGEST ON/OFF/8` | Switch autopilot · morning digest and its hour (East Africa time) |
| anything else | The AI answers from a live snapshot. It can only read |

Every change asks you to reply `YES` first (valid 10 minutes). Set `OWNER_WHATSAPP_PIN` and it becomes `YES <pin>`.

**Never from WhatsApp, on purpose:** approving bidders (ID documents must be looked at), approving bank partners, paying out
money, deleting anything. The assistant tells you when one is waiting and sends you to the dashboard.

## Switch it on (Railway variables)

1. **`WHATSAPP_APP_SECRET`** (Meta app → App settings → Basic → App secret). With it set, only deliveries signed by Meta are
   accepted at all, and the owner assistant listens. **Without it the assistant stays off**, because anyone could pretend to be you.
   Using Infobip instead: set `INFOBIP_WEBHOOK_SECRET` to a long random string and add `?key=<that string>` to the Infobip webhook
   address, `https://<your site>/api/gene/whatsapp/webhook/infobip?key=...`.
2. Meta webhook: callback URL `https://<your site>/api/gene/whatsapp/webhook`, verify token = `WHATSAPP_VERIFY_TOKEN`, subscribe to `messages`.
3. Optional: `OWNER_WHATSAPP_PIN` (a number only you know).
4. Optional but recommended: **`WHATSAPP_ALERT_TEMPLATE`**, see below.

## The 24-hour rule (important)

WhatsApp only delivers free-form messages for 24 hours after you last wrote to the business number. After a quiet day, alerts and
the morning digest would not reach you. Two ways round it:

- Message the number once a day (replying to the digest is enough), or
- Create a message template in Meta WhatsApp Manager: category **Utility**, name e.g. `owner_alert`, body `RealEVR: {{1}}`.
  When approved, set `WHATSAPP_ALERT_TEMPLATE=owner_alert` (and `WHATSAPP_ALERT_TEMPLATE_LANG` if not `en`). Alerts that fail the
  24-hour rule are then sent through the template automatically. (Meta Cloud API only; Infobip templates are not wired yet.)

## What runs without you

Already automatic: payment recognition from forwarded messages, tour health checks every 6 hours, partner invitations, reminders,
SEO files, Kevin answering visitors and alerting you on urgent messages, alerts for every new signup/request.

New: a **morning digest** (07:00 East Africa time by default) and **autopilot** for partner applications (off until you send
`AUTOPILOT ON`). Autopilot approves a non-bank application only if the website matches the email domain, it is not a free mail
address, a registration or licence number is given, and any fee is confirmed. Everything else waits for you.

Still needs a person: bidder vetting (ID documents), bank partners, payouts, data deletion and legal decisions, and replies to
Bitcoin buyers (you confirm the seller and send escrow instructions).

## Safety notes

- Voice notes are transcribed with the same providers as Kevin (`ELEVENLABS_API_KEY` or `GROQ_API_KEY`); without a key you get "please type it".
- A log of the last 200 commands is kept (`gene_owner_log`, last four digits of the number only).
- If you lose your phone: remove the number from `ADMIN_WHATSAPP_NUMBERS` on Railway; set a PIN in the meantime.
