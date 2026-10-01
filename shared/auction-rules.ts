/**
 * The numbers and rules of RealEVR's live bank-sale auctions, in one place, so the law pages, the
 * bidder screens and the server can never disagree about them.
 */
export const AUCTION_RULES = {
    /** One-off, non-refundable fee a vetted bidder pays to be allowed to bid. USD. */
    commitmentFeeUsd: 1000,
    /** A bid in the last N minutes pushes the closing time out by N minutes (0 = off). Stops last-second sniping. */
    softCloseMinutes: 2,
    /** Smallest step when the seller sets none, as a share of the starting price (min 1). */
    defaultIncrementShare: 0.01,
    /** Days the winning bidder has to pay the balance if the seller's provisions do not say otherwise. */
    defaultSettlementDays: 14,
    /** Documents a bidder must supply to be vetted. */
    requiredDocuments: ['Government photo ID (national ID, passport or driving permit)', 'Proof of address from the last three months', 'Proof of funds (bank statement, bank letter or mortgage pre-approval)'],
} as const

export const AUCTION_STATUS_LABELS = {
    scheduled: 'Opens soon',
    live: 'Live now',
    ended: 'Ended',
    cancelled: 'Cancelled',
} as const

export type BidderStatus = 'applied' | 'under_review' | 'approved' | 'rejected' | 'suspended'
export type FeeStatus = 'unpaid' | 'submitted' | 'confirmed' | 'rejected'
