/**
 * Shared pricing constants — single source of truth for both client
 * (payment modal copy/amount) and server (pass issuance), so the two never
 * drift apart the way TourPaymentModal.tsx/PaymentModal.tsx's hardcoded
 * '15000' already had drifted from their own `amount` props before this.
 */

/** UGX price to unlock the "Similar Properties in Your Budget" section on
 * a property page for 24 hours — see server/gene/similar-properties-pass.ts. */
export const SIMILAR_PROPERTIES_PASS_PRICE_UGX = 20000
