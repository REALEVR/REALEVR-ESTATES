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
