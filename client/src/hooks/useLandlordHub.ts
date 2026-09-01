/**
 * React Query hooks for the landlord hub (server/gene/landlord-hub.ts) —
 * interested tenants + WhatsApp messages for the caller's own properties,
 * and reviews. Backs the Inbox/Reviews tabs in AgentDashboard.tsx.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getQueryFn } from "@/lib/queryClient";

export interface InterestedTenant {
  propertyId: number;
  propertyTitle: string;
  action: string;
  createdAt: string;
  tenantName: string;
  tenantEmail: string | null;
}

export interface LandlordWhatsappMessage {
  id: number;
  phone: string;
  direction: "inbound" | "outbound";
  text: string;
  userId?: number;
  matchedPropertyId?: number;
  propertyTitle: string | null;
  createdAt: string;
}

export interface LandlordInbox {
  interestedTenants: InterestedTenant[];
  messages: LandlordWhatsappMessage[];
}

export interface PropertyReview {
  id: number;
  propertyId: number;
  propertyTitle: string;
  reviewerUserId: number;
  reviewerName: string;
  rating: number;
  text: string;
  createdAt: string;
}

export function useLandlordInbox(enabled: boolean) {
  return useQuery<LandlordInbox>({
    queryKey: ["/api/gene/landlord/inbox"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled,
  });
}

export function useLandlordReviews(enabled: boolean) {
  return useQuery<PropertyReview[]>({
    queryKey: ["/api/gene/landlord/reviews"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled,
  });
}

export function usePropertyReviews(propertyId: number | null) {
  return useQuery<PropertyReview[]>({
    queryKey: [`/api/gene/reviews/property/${propertyId}`],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: propertyId !== null,
  });
}

export function useSubmitReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { propertyId: number; rating: number; text: string }) => {
      const res = await apiRequest("POST", "/api/gene/reviews", input);
      return (await res.json()) as PropertyReview;
    },
    onSuccess: (review) => {
      queryClient.invalidateQueries({ queryKey: [`/api/gene/reviews/property/${review.propertyId}`] });
    },
  });
}
