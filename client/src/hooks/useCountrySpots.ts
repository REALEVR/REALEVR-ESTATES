/**
 * Country spots (server/gene/country-spots.ts): paid, promoted places per country.
 * `useActiveCountrySpots` is one cheap shared request that every card can read to show its "Promoted" badge;
 * `useCountrySpotInfo` is one country's spots, for its strip and its buy button.
 */
import { useQuery } from "@tanstack/react-query";

export interface CountrySpotPlan {
  id: "week" | "month" | "quarter";
  label: string;
  days: number;
  amountLocal: number;
  currency: string;
  usd: number;
}

export interface CountrySpotInfo {
  code: string;
  name: string;
  dial: string;
  open: boolean;
  total: number;
  free: number;
  nextFreeAt: string | null;
  currency: string;
  plans: CountrySpotPlan[];
  propertyIds: number[];
}

export function useActiveCountrySpots() {
  return useQuery<{ spots: Array<{ propertyId: number; countryCode: string }> }>({
    queryKey: ["/api/country-spots/active"],
    staleTime: 60_000,
  });
}

export function useCountrySpotInfo(code: string | null | undefined) {
  return useQuery<CountrySpotInfo>({
    queryKey: [`/api/country-spots/country/${code}`],
    enabled: !!code,
    staleTime: 60_000,
  });
}
