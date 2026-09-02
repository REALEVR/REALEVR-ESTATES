/**
 * React Query hooks for the "My RealEVR Agent" personal AI concierge
 * (server/gene/personal-agent.ts). Every request goes through apiRequest /
 * getQueryFn from lib/queryClient, so it carries the session cookie the same
 * way the rest of the app's authenticated calls do — no extra auth wiring
 * needed here. All hooks are safe to mount only when useAuth().user exists;
 * callers are expected to gate that themselves (see AgentLauncher).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import type { Property } from "@shared/schema";

export type AgentPurpose = "live_in" | "invest" | "both";
export type RiskAppetite = "conservative" | "balanced" | "aggressive";

export interface AgentProfile {
  userId: number;
  budgetMin: number | null;
  budgetMax: number | null;
  currency: string;
  purpose: AgentPurpose;
  riskAppetite: RiskAppetite;
  interests: string[];
  preferredLocations: string[];
  monthlyIncome: number | null;
  investmentCapital: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentProfileInput {
  budgetMin?: number | null;
  budgetMax?: number | null;
  currency?: string;
  purpose?: AgentPurpose;
  riskAppetite?: RiskAppetite;
  interests?: string[];
  preferredLocations?: string[];
  monthlyIncome?: number | null;
  investmentCapital?: number | null;
}

export interface AgentRecommendation {
  property: Property;
  score: number;
  reasons: string[];
}

export interface AgentRecommendationsResponse {
  generatedAt: string;
  usedAi: boolean;
  summary: string;
  recommendations: AgentRecommendation[];
}

export interface AgentLocationStat {
  location: string;
  count: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  currency: string;
  availablePct: number;
  forSaleCount: number;
  bankSaleCount: number;
}

export interface AgentMarketInsightResponse {
  generatedAt: string;
  usedAi: boolean;
  narrative: string;
  areas: AgentLocationStat[];
}

export interface AgentNewsItem {
  title: string;
  description: string | null;
  url: string;
  source: string | null;
  publishedAt: string | null;
}

export interface AgentNewsResponse {
  configured: boolean;
  items: AgentNewsItem[];
  fetchedAt: string | null;
}

export interface AgentChatMessage {
  role: "user" | "assistant";
  text: string;
  createdAt: string;
}

export type AgentSignalAction = "viewed" | "saved" | "inquired" | "tour_viewed";

export interface AgentNearbyResponse {
  synced: boolean;
  location: string | null;
  lastSyncedAt: string | null;
  matches: AgentRecommendation[];
  notified: boolean;
}

const PROFILE_KEY = ["/api/gene/agent/profile"];
const RECOMMENDATIONS_KEY = ["/api/gene/agent/recommendations"];
const MARKET_INSIGHT_KEY = ["/api/gene/agent/market-insight"];
const NEWS_KEY = ["/api/gene/agent/news"];
const CHAT_HISTORY_KEY = ["/api/gene/agent/chat/history"];

export function useAgentProfile(enabled: boolean) {
  return useQuery<{ profile: AgentProfile | null }>({
    queryKey: PROFILE_KEY,
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled,
  });
}

export function useSaveAgentProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AgentProfileInput) => {
      const res = await apiRequest("PUT", "/api/gene/agent/profile", input);
      return (await res.json()) as { profile: AgentProfile };
    },
    onSuccess: (data) => {
      queryClient.setQueryData(PROFILE_KEY, { profile: data.profile });
      queryClient.invalidateQueries({ queryKey: RECOMMENDATIONS_KEY });
      queryClient.invalidateQueries({ queryKey: MARKET_INSIGHT_KEY });
    },
  });
}

export function useAgentRecommendations(enabled: boolean) {
  return useQuery<AgentRecommendationsResponse>({
    queryKey: RECOMMENDATIONS_KEY,
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled,
    staleTime: 60_000,
  });
}

export function useAgentMarketInsight(enabled: boolean) {
  return useQuery<AgentMarketInsightResponse>({
    queryKey: MARKET_INSIGHT_KEY,
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled,
    staleTime: 60_000,
  });
}

export function useAgentNews(enabled: boolean) {
  return useQuery<AgentNewsResponse>({
    queryKey: NEWS_KEY,
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useAgentChatHistory(enabled: boolean) {
  return useQuery<{ messages: AgentChatMessage[] }>({
    queryKey: CHAT_HISTORY_KEY,
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled,
  });
}

export function useSendAgentChatMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (message: string) => {
      const res = await apiRequest("POST", "/api/gene/agent/chat", { message });
      return (await res.json()) as { reply: string; usedAi: boolean };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHAT_HISTORY_KEY });
    },
  });
}

export function useSyncAgentLocation() {
  return useMutation({
    mutationFn: async (input: { lat: number; lng: number; label: string }) => {
      const res = await apiRequest("POST", "/api/gene/agent/location", input);
      return (await res.json()) as { ok: boolean; lastLocationLabel: string };
    },
  });
}

/**
 * Not a useQuery — this is called imperatively (on an interval / visibility
 * change) by useNearbyPropertyAlerts so each check can react to `notified`
 * without fighting React Query's caching of a "the same" GET.
 */
export async function fetchAgentNearby(): Promise<AgentNearbyResponse> {
  const res = await apiRequest("GET", "/api/gene/agent/nearby");
  return (await res.json()) as AgentNearbyResponse;
}

/**
 * Fire-and-forget behavioral signal logging — never throws, never blocks the
 * UI. Safe to call from anywhere a logged-in user interacts with a property.
 */
export function logAgentSignal(propertyId: number, action: AgentSignalAction) {
  apiRequest("POST", "/api/gene/agent/signal", { propertyId, action }).catch(() => {
    // Best-effort only — recommendations just won't reflect this one signal.
  });
}
