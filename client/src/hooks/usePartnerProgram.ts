import { useQuery } from "@tanstack/react-query";
import type { CountryProgram, PartnerRoleInfo } from "@shared/partner-program";

export interface ProgramListing {
  id: number;
  title: string;
  role: string;
  countries: string[];
  description: string;
  requirements: string[];
  youGet: string[];
  paysFee: boolean;
  builtIn: boolean;
}

export interface Program {
  roles: PartnerRoleInfo[];
  tiers: Array<{ tier: number; label: string; defaultAnnualUsd: number; annualUsd: number }>;
  auctionRules: string[];
  countries: CountryProgram[];
  listings: ProgramListing[];
}

export interface CountryPage {
  country: CountryProgram;
  roles: PartnerRoleInfo[];
  auctionRules: string[];
  listings: ProgramListing[];
  partners: Array<{ organisation: string; role: string; website: string | null }>;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.message || "Could not load.");
  return res.json();
}

export const useProgram = () => useQuery<Program>({ queryKey: ["/api/partner-program"], queryFn: () => getJson("/api/partner-program"), staleTime: 120_000 });

export const useCountryPage = (param: string | undefined) =>
  useQuery<CountryPage>({ queryKey: ["/api/partner-program/country", param], queryFn: () => getJson(`/api/partner-program/country/${param}`), enabled: !!param, staleTime: 120_000, retry: false });

export interface MyApplication {
  id: number;
  role: string;
  organisation: string;
  country: string;
  status: "received" | "needs_info" | "approved" | "rejected";
  statusNote: string | null;
  feeUsd: number;
  feeStatus: "none" | "unpaid" | "submitted" | "confirmed" | "rejected";
  feeNote: string | null;
  activeUntil: string | null;
  createdAt: string;
  pay?: { reference: string; payTo: string; feeUsd: number };
}

export const useMyApplications = (enabled: boolean) =>
  useQuery<MyApplication[]>({ queryKey: ["/api/partner-program/mine"], queryFn: () => getJson("/api/partner-program/mine"), enabled, refetchInterval: 15_000 });
