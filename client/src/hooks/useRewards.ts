/**
 * React Query hooks for the share-for-points-for-cash rewards system
 * (server/gene/referral-rewards.ts). 1 counted share = 1 point = 10 UGX;
 * points accrue automatically, a payout request queues for admin review —
 * see that file's docstring for the full policy.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getQueryFn } from "@/lib/queryClient";

export interface RewardsBalance {
  totalShares: number;
  totalPoints: number;
  ugxValue: number;
  availablePoints: number;
  availableUgx: number;
  minPayoutPoints: number;
  minPayoutUgx: number;
  canRequestPayout: boolean;
  // Distinct WhatsApp numbers shared to so far — literal progress toward
  // "100 times to different numbers" (see referral-rewards.ts).
  uniqueWhatsappRecipients: number;
}

export type PayoutStatus = "pending_review" | "approved_manual_payout_required" | "paid" | "rejected";

export interface PayoutRequest {
  id: number;
  userId: number;
  pointsRequested: number;
  ugxAmount: number;
  mobileMoneyNumber: string;
  provider: string;
  status: PayoutStatus;
  createdAt: string;
  decidedAt?: string;
  note?: string;
}

const BALANCE_KEY = ["/api/gene/rewards/balance"];
const MY_PAYOUTS_KEY = ["/api/gene/rewards/payout-requests/me"];

export function useRewardsBalance(enabled: boolean) {
  return useQuery<RewardsBalance>({
    queryKey: BALANCE_KEY,
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled,
  });
}

export function useMyPayoutRequests(enabled: boolean) {
  return useQuery<PayoutRequest[]>({
    queryKey: MY_PAYOUTS_KEY,
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled,
  });
}

export function useRequestPayout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { mobileMoneyNumber: string; provider: string; pointsToRedeem?: number }) => {
      const res = await apiRequest("POST", "/api/gene/rewards/payout-request", input);
      return (await res.json()) as { request: PayoutRequest; balance: RewardsBalance };
    },
    onSuccess: (data) => {
      queryClient.setQueryData(BALANCE_KEY, data.balance);
      queryClient.invalidateQueries({ queryKey: MY_PAYOUTS_KEY });
    },
  });
}

/**
 * Fire-and-forget-ish share logger — used from the share button/modal.
 * Signed-out users can still trigger a native share, but only signed-in
 * users earn points (the endpoint requires auth), so callers should check
 * useAuth().user before calling this if they want to avoid a stray 401.
 *
 * Pass recipientPhone alongside channel: 'whatsapp' when sharing to a
 * specific number — that's what makes the share count toward "100 times to
 * different numbers" instead of the looser per-property cooldown that
 * every other channel uses (see referral-rewards.ts's doc comment).
 */
export async function logPropertyShare(
  propertyId: number,
  channel: string,
  recipientPhone?: string
): Promise<{ counted: boolean; message?: string; balance?: RewardsBalance } | null> {
  try {
    const res = await apiRequest("POST", "/api/gene/rewards/share", { propertyId, channel, recipientPhone });
    return await res.json();
  } catch {
    return null;
  }
}

// --- Listing earnings (server/gene/listing-earnings.ts) ---
// Separate balance from the share-points system above: agents earn a flat
// amount per property they list through the dashboard, claimable once
// their accrued balance crosses 10,000 UGX.

export interface ListingEarningsBalance {
  totalListings: number;
  totalUgx: number;
  availableUgx: number;
  minPayoutUgx: number;
  canRequestPayout: boolean;
}

export interface ListingEarning {
  id: number;
  userId: number;
  propertyId: number;
  propertyTitle: string;
  amountUgx: number;
  createdAt: string;
}

export type ListingPayoutStatus = "pending_review" | "approved_manual_payout_required" | "paid" | "rejected";

export interface ListingPayoutRequest {
  id: number;
  userId: number;
  ugxAmount: number;
  mobileMoneyNumber: string;
  provider: string;
  status: ListingPayoutStatus;
  createdAt: string;
  decidedAt?: string;
  note?: string;
}

const LISTING_BALANCE_KEY = ["/api/gene/listing-earnings/balance"];
const LISTING_HISTORY_KEY = ["/api/gene/listing-earnings/history"];
const LISTING_MY_PAYOUTS_KEY = ["/api/gene/listing-earnings/payout-requests/me"];

export function useListingEarningsBalance(enabled: boolean) {
  return useQuery<ListingEarningsBalance>({
    queryKey: LISTING_BALANCE_KEY,
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled,
  });
}

export function useListingEarningsHistory(enabled: boolean) {
  return useQuery<ListingEarning[]>({
    queryKey: LISTING_HISTORY_KEY,
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled,
  });
}

export function useMyListingPayoutRequests(enabled: boolean) {
  return useQuery<ListingPayoutRequest[]>({
    queryKey: LISTING_MY_PAYOUTS_KEY,
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled,
  });
}

export function useRequestListingPayout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { mobileMoneyNumber: string; provider: string }) => {
      const res = await apiRequest("POST", "/api/gene/listing-earnings/payout-request", input);
      return (await res.json()) as { request: ListingPayoutRequest; balance: ListingEarningsBalance };
    },
    onSuccess: (data) => {
      queryClient.setQueryData(LISTING_BALANCE_KEY, data.balance);
      queryClient.invalidateQueries({ queryKey: LISTING_MY_PAYOUTS_KEY });
    },
  });
}
