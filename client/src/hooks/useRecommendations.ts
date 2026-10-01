/**
 * React Query hooks for the occupant recommendation programme
 * (server/gene/building-recommendations.ts): tell us about your building,
 * earn a point per approved one, redeem 100 points for 10,000 UGX.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getQueryFn } from "@/lib/queryClient";

export interface RecommendationPoints {
  earned: number;
  available: number;
  pending: number;
  pointsPerBlock: number;
  ugxPerBlock: number;
  redeemableBlocks: number;
  redeemableUgx: number;
  canRedeem: boolean;
}

export interface MyRecommendation {
  id: number;
  buildingName: string;
  location: string;
  unit: string;
  category: string;
  status: "pending_review" | "approved" | "rejected" | "duplicate";
  note?: string;
  createdAt: string;
}

export interface MyRedemption {
  id: number;
  points: number;
  ugxAmount: number;
  status: "pending_review" | "approved_manual_payout_required" | "paid" | "rejected";
  createdAt: string;
}

export interface MyRecommendations {
  points: RecommendationPoints;
  recommendations: MyRecommendation[];
  redemptions: MyRedemption[];
}

export interface RecommendationInput {
  buildingName: string;
  location: string;
  unit: string;
  category: string;
  contactPhone: string;
  landlordName?: string;
  landlordPhone?: string;
  notes?: string;
  occupant: boolean;
  lat?: number;
  lng?: number;
}

const KEY = ["/api/gene/recommendations/me"];

export function useMyRecommendations(enabled = true) {
  return useQuery<MyRecommendations | null>({
    queryKey: KEY,
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled,
  });
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await apiRequest("POST", url, body);
  return res.json();
}

export function useSendRecommendation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RecommendationInput) => postJson("/api/gene/recommendations", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRedeemRecommendationPoints() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { mobileMoneyNumber: string; provider: string }) => postJson("/api/gene/recommendations/redeem", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
