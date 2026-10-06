# Things only the owner can do

Everything here needs one of your accounts. Each item says what breaks without it and where to click.

## 1. A working Claude key (Kevin's brain)
Without it Kevin runs on Gemini alone, which is often busy. Create a key at console.anthropic.com > API Keys, add a few dollars of
credit, and set it in Railway (REALEVR-ESTATES service > Variables) as `ANTHROPIC_API_KEY`.

## 2. WhatsApp (alerts, leads, the owner assistant)
The number is registered and the webhook is set. What is still missing, in order:
1. **Publish the app.** The Meta app "REALEVR ESTATES" is in development mode, so real people may not receive messages.
   developers.facebook.com/apps/1464774815485981 > App settings > Basic (privacy policy URL) > switch to Live.
2. **Add a payment method** to the WhatsApp account, or messages are accepted but not delivered:
   business.facebook.com/billing_hub (WhatsApp account "Realevr ug").
3. **Use a permanent token.** In Business Settings > System Users, create a system user, give it your app and the WhatsApp
   account (full control), generate a token with `business_management`, `whatsapp_business_messaging`,
   `whatsapp_business_management`, and put it in Railway as `WHATSAPP_BUSINESS_TOKEN`. A normal or temporary token expires.
4. Optional: complete Business Verification (raises sending limits).
The server now calls a current Graph API version (`META_GRAPH_VERSION`, default v23.0; the old v19.0 was retired).

## 3. Email (sign-up verification, alerts)
Gmail's mail port is blocked on many hosts, which is why email timed out. Use an HTTPS service instead: create a free account at
resend.com, verify your domain (realevr.com) there, create an API key, and set in Railway `RESEND_API_KEY` and
`EMAIL_FROM` (for example `RealEVR Estates <noreply@realevr.com>`). Until the domain is verified, `onboarding@resend.dev` only
delivers to your own address.

## 4. Search engines
- Google Search Console: add `https://estates.realevr.com`, copy the verification code, set `GOOGLE_SITE_VERIFICATION` in Railway,
  submit `sitemap.xml`.
- Bing Webmaster Tools: import the site from Search Console.
- Google AdSense: apply; once approved set `ADSENSE_PUBLISHER_ID`, `VITE_ADSENSE_CLIENT`, `VITE_ADSENSE_SLOT` ([REVENUE_PLAN.md](REVENUE_PLAN.md)).

## 5. Kevin's voice
Open `/admin/voice-lab` (signed in as admin), listen, and pick. Then set `KEVIN_AZURE_ENGLISH_VOICE` in Railway.

## 6. Clean-up of empty records (one decision)
Visits to ids that were not homes used to create empty "ghost" records (only a view count). They are now hidden everywhere and
no new ones can be created. The old ones can be deleted from the database whenever you say so.
