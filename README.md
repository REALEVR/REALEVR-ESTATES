# RealEVR Estates

RealEVR Estates is a real-estate platform for Uganda offering immersive VR property
tours, listings for rentals/sales/BnBs/bank auctions, agent and admin dashboards,
and secure booking payments.

## Stack

- **Client**: React + Vite, Tailwind CSS, shadcn/ui, TanStack Query, Wouter
- **Server**: Express + TypeScript
- **Data**: AWS DynamoDB (primary), with a legacy Postgres/Drizzle schema retained
  for typing and the seed/migration scripts
- **Storage**: AWS S3 (tour hosting), Dropbox and Cloudinary integrations
- **Payments**: Flutterwave, IoTec
- **AI**: Google Gemini (`@google/genai`), proxied through the server so the API
  key never reaches the browser

## Getting started

```bash
npm install
cp .env.example .env   # fill in real credentials
npm run dev
```

See `.env.example` for the full list of required environment variables.

## Feature guides

- [Dropbox tour storage setup](./DROPBOX_SETUP.md)
- [DynamoDB migration guide](./DYNAMODB_MIGRATION.md)
- [S3 tour hosting guide](./S3_TOUR_HOSTING_GUIDE.md)
- [Upload speed optimization](./UPLOAD_OPTIMIZATION_GUIDE.md)
- [Email verification setup](./EMAIL_VERIFICATION_SETUP.md)
- [Social media posting setup](./SOCIAL_MEDIA_SETUP.md)

## Recently merged in from the SRBS prototype

This codebase absorbed the useful, non-duplicated pieces of the
[SRBS (Smart Rental Booking System)](https://github.com/Sendrick01/SRBS)
prototype — keeping RealEVR Estates' structure and DynamoDB-backed storage as
the single source of truth rather than running two parallel apps:

- **Per-user reviews & ratings** (`shared/schemas/review.ts`,
  `server/models/Review.ts`, `server/routes/reviews.ts`,
  `client/src/components/property/ReviewsSection.tsx`) — SRBS only had a UI
  mockup for this; RealEVR previously stored just an aggregate rating with no
  way to actually leave one.
- **AI Assistant chat widget** (`client/src/components/AIAssistant.tsx`,
  `server/routes/ai.ts`) — a floating Gemini-powered helper for visitors.
  Unlike SRBS's version, the Gemini API key is kept server-side.
- **AI-generated listing descriptions** — a "Generate with AI" button in the
  agent/admin property form (`PropertyFormNew.tsx`), also backed by
  `server/routes/ai.ts`.
- **Real owner contact details** — `OwnerContactDetails.tsx` previously
  rendered hardcoded placeholder data; it now uses the actual property owner
  record once a booking is confirmed.

SRBS's VR tour viewer, Firebase-based deposit reminders, and notifications
were **not** ported, since RealEVR already has more mature equivalents
(S3-backed virtual tours, DynamoDB cron reminders in `server/cron/`, and a
full notification hub).

## Authentication

Sign-in is compulsory site-wide: with no active session, visitors get a
full-screen sign-in/sign-up card (`client/src/components/auth/AuthGate.tsx`),
styled after Airbnb's own auth screen, instead of the app — a "Continue with
Google" button up top, then plain Log in / Sign up tabs. Signing up (still via
`/api/ai/onboarding-register` under the hood, despite the name — no AI/Gemini
call involved) creates the account and logs the visitor in immediately, no
separate email-verification click required, and collects a WhatsApp number up
front. A Google sign-in that lands on an account with no number on file gets a
one-time follow-up prompt for it instead (`WhatsAppNumberPrompt.tsx`), since
Google never shares one. The AI-guided conversational sign-up this project
used to have was retired in favor of this simpler flow; `/api/ai/onboarding-chat`
still exists server-side but nothing in the UI calls it anymore.

Passwords are scrypt-hashed (`server/auth.ts`); there is no plaintext or
legacy-format fallback in the comparison path.

## Admin dashboard

`/admin/users` (admin-only) is the single consolidated dashboard: users,
properties, reviews, agent subscriptions, tour payments, and system analytics
all in one page. It's backed by one endpoint, `GET /api/admin/overview`, which
returns everything in a single JSON response — built specifically so an AI
agent (or any external tool) can get the full picture in one call instead of
stitching together several endpoints.

## Contact

WhatsApp (`+256771891323`, `+256702742333`) is linked site-wide via a floating
button and the footer (`client/src/lib/siteLinks.ts`). Social media links in
the footer are currently placeholders pending real page URLs — update
`SOCIAL_LINKS` in the same file once available.
