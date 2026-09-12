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
 */
export async function logPropertyShare(propertyId: number, channel: string): Promise<{ counted: boolean; balance?: RewardsBalance } | null> {
  try {
    const res = await apiRequest("POST", "/api/gene/rewards/share", { propertyId, channel });
    return await res.json();
  } catch {
    return null;
  }
}
