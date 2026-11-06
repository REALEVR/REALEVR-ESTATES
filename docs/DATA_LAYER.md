# Data layer reference

Quick reference for how RealEVR Estates stores data. Complements
[`DYNAMODB_MIGRATION.md`](../DYNAMODB_MIGRATION.md) (how to migrate) with what
the tables look like today and the gotchas to know before touching them.

Source of truth: `server/dynamodb.ts` (table names, key schemas, retry logic)
and `shared/schema.ts` (TypeScript types and zod validation).

## Runtime store vs. shared schema

- Runtime storage is **DynamoDB** (`server/dynamodb-storage.ts`), which is
  schemaless. New optional fields can be written without a migration.
- `shared/schema.ts` uses Drizzle `pgTable` definitions only to produce shared
  TS types and zod insert schemas. It is not a live Postgres schema, so adding a
  column there does not require a migration either.

## Tables

All tables use on-demand billing (`PAY_PER_REQUEST`). Names can be overridden
with the environment variable shown.

| Logical table | Default name | Override env var | Key schema |
|---|---|---|---|
| Users | `realevr-users` | `DYNAMODB_USERS_TABLE` | `id` (HASH) |
| Properties | `realevr-properties` | `DYNAMODB_PROPERTIES_TABLE` | `id` (HASH) |
| Amenities | `realevr-amenities` | `DYNAMODB_AMENITIES_TABLE` | `id` (HASH) |
| Property types | `realevr-property-types` | `DYNAMODB_PROPERTY_TYPES_TABLE` | `id` (HASH) |
| User tours | `realevr-user-tours` | `DYNAMODB_USER_TOURS_TABLE` | `userId` (HASH), `tourId` (RANGE) |
| Property views | `realevr-property-views` | `DYNAMODB_PROPERTY_VIEWS_TABLE` | `propertyId` (HASH), `viewId` (RANGE) |
| Tour payments | `realevr-tour-payments` | `DYNAMODB_TOUR_PAYMENTS_TABLE` | `id` (HASH) |
| Settings | `realevr-settings` | `DYNAMODB_SETTINGS_TABLE` | `id` (HASH) |
| Notifications | `realevr-notifications` | `DYNAMODB_NOTIFICATIONS_TABLE` | `id` (HASH) |
| Reviews | `realevr-reviews` | `DYNAMODB_REVIEWS_TABLE` | `id` (HASH) |

Tables are created on demand: the setup routine describes each table and only
creates the ones that do not exist yet, so it is safe to run repeatedly.

## Access patterns

`dynamoDb` in `server/dynamodb.ts` exposes `putItem`, `getItem`, `scanTable`
and `queryTable`, all wrapped in `executeWithRetry`.

- **Retries.** Up to 5 attempts, 1s initial delay, 1.5x backoff, for throttling,
  service-unavailable and transient network errors. Other errors are wrapped in
  a `DynamoDBError` and thrown immediately.
- **Scans paginate.** `scanTable` follows `LastEvaluatedKey` until exhausted.
  A single DynamoDB Scan reads at most 1 MB *before* applying the filter, so
  without pagination matching rows past the first page are silently missed.
- **Filtered lookups are scans.** Lookups by `username` or `email` (neither is a
  key) scan the whole users table. That is fine at current size; if the table
  grows, add a global secondary index and use `queryTable` with `indexName`.

## Conventions

- IDs are strings in DynamoDB even though the shared schema declares `serial`.
- Dates are stored as ISO strings (`text` in the shared schema).
- User `role` is one of `admin`, `agent`, `normal`; `subscriptionStatus` is one of
  `active`, `inactive`, `expired`.

## Adding a table

1. Add its name to `TABLES` in `server/dynamodb.ts` with an env override.
2. Add its definition to the table-creation list in the same file.
3. Add the type and zod schema to `shared/schema.ts`.
4. Update the table list in this document.

## Follow-ups

- Replace scan-based user lookups with a GSI on `email` and `username`.
- Consider a TTL attribute on `realevr-property-views` to cap growth.
