/**
 * Paying people for uploading properties is switched OFF.
 *
 * Two mechanisms used to pay per upload: an agent's 500 UGX per listing added
 * through the dashboard (listing-earnings.ts) and the 1,000 UGX referral fee on
 * a landlord-verified public submission (self-serve-listing.ts). Money per
 * upload invites junk and fake listings, so neither pays now. What people
 * already earned stays theirs to claim; nothing new accrues.
 *
 * The way to earn is the occupant recommendation programme
 * (building-recommendations.ts): an occupant tells us about a building that is
 * not yet listed, and earns points that redeem as cash.
 *
 * Set PAID_UPLOADS_ENABLED=true to bring the old payments back.
 */
export const paidUploadsEnabled = (): boolean => process.env.PAID_UPLOADS_ENABLED === 'true'
