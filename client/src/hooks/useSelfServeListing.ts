import { useMutation } from "@tanstack/react-query";

/**
 * Client for the self-serve paid listing flow (server/gene/self-serve-listing.ts).
 * Deliberately plain fetch + mutations rather than react-query caching for
 * the read side — this is a linear five-step wizard driven by local
 * component state (see pages/ListYourPropertyPage.tsx), not cached data.
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
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
}

export interface SelfServeStartResponse {
  submissionId: number;
  token: string;
  feeAmount: number;
  feeCurrency: string;
}

export interface SelfServeStatusResponse {
  id: number;
  status: "draft" | "awaiting_payment" | "payment_confirmed" | "otp_sent" | "live" | "expired";
  draft: Record<string, unknown>;
  coverImageUrl: string | null;
  feeAmount: number;
  feeCurrency: string;
  createdPropertyId: number | null;
  whatsappConfigured?: boolean;
  devOtpCode?: string;
  paymentFailed?: boolean;
  paymentDetail?: string;
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

export function usePaySelfServeListing() {
  return useMutation({
    mutationFn: async ({ id, token }: { id: number; token: string }): Promise<{ status: string; message: string }> => {
      const res = await fetch(`/api/gene/self-serve/${id}/pay`, {
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
    }): Promise<{ status: string; propertyId: number; whatsappConfigured: boolean; dashboardUrl?: string }> => {
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
