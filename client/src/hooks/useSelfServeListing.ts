import { useMutation } from "@tanstack/react-query";

/**
 * Client for the agent listing referral flow (server/gene/self-serve-listing.ts).
 * Deliberately plain fetch + mutations rather than react-query caching for
 * the read side — this is a linear wizard driven by local component state
 * (see pages/ListYourPropertyPage.tsx), not cached data.
 *
 * MODEL: an agent (anyone, no account required) submits a property; the
 * landlord/manager verifies it's real via a WhatsApp OTP sent to *their*
 * number; the property goes live and RealEVR owes the agent a flat payout
 * (currently 1,000 UGX), pending admin approval. Nobody pays to list.
 */

export interface SelfServeDraftInput {
  title: string;
  location: string;
  price: number;
  description: string;
  bedrooms: number;
  bathrooms: number;
  squareMeters: number;
  propertyType: string;
  category: string;
  agentName: string;
  agentPhone: string;
  agentEmail?: string;
  landlordName: string;
  landlordPhone: string;
}

export interface SelfServeStartResponse {
  submissionId: number;
  token: string;
  payoutAmount: number;
  payoutCurrency: string;
}

export interface SelfServeStatusResponse {
  id: number;
  status: "draft" | "otp_sent" | "live" | "expired";
  draft: Record<string, unknown>;
  coverImageUrl: string | null;
  payoutAmount: number;
  payoutCurrency: string;
  landlordPhoneMasked: string;
  createdPropertyId: number | null;
  whatsappConfigured?: boolean;
  devOtpCode?: string;
}

async function parseJsonOrThrow(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `Request failed (${res.status})`);
  return data;
}

export function useStartSelfServeListing() {
  return useMutation({
    mutationFn: async (input: SelfServeDraftInput): Promise<SelfServeStartResponse> => {
      const res = await fetch("/api/gene/self-serve/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return parseJsonOrThrow(res);
    },
  });
}

export function useUploadCoverPhoto() {
  return useMutation({
    mutationFn: async ({ id, token, file }: { id: number; token: string; file: File }): Promise<{ imageUrl: string }> => {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch(`/api/gene/self-serve/${id}/cover-photo?token=${encodeURIComponent(token)}`, {
        method: "POST",
        body: form,
      });
      return parseJsonOrThrow(res);
    },
  });
}

export function useSendVerification() {
  return useMutation({
    mutationFn: async ({ id, token }: { id: number; token: string }): Promise<{ status: string; message: string }> => {
      const res = await fetch(`/api/gene/self-serve/${id}/send-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      return parseJsonOrThrow(res);
    },
  });
}

export async function fetchSelfServeStatus(id: number, token: string): Promise<SelfServeStatusResponse> {
  const res = await fetch(`/api/gene/self-serve/${id}/status?token=${encodeURIComponent(token)}`);
  return parseJsonOrThrow(res);
}

export function useVerifySelfServeOtp() {
  return useMutation({
    mutationFn: async ({
      id,
      token,
      code,
    }: {
      id: number;
      token: string;
      code: string;
    }): Promise<{ status: string; propertyId: number; payoutStatus: string; whatsappConfigured: boolean; dashboardUrl?: string }> => {
      const res = await fetch(`/api/gene/self-serve/${id}/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, code }),
      });
      return parseJsonOrThrow(res);
    },
  });
}

export function useResendSelfServeOtp() {
  return useMutation({
    mutationFn: async ({ id, token }: { id: number; token: string }): Promise<{ sent: boolean; whatsappConfigured: boolean; devOtpCode?: string }> => {
      const res = await fetch(`/api/gene/self-serve/${id}/resend-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      return parseJsonOrThrow(res);
    },
  });
}
