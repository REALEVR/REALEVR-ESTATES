/**
 * Which properties are currently boosted (server/gene/boost-placement.ts,
 * GET /api/gene/boost/active-property-ids) — drives the "Boosted" badge
 * shown on PropertyCard.tsx wherever a property renders, not just the
 * featured carousel. One shared react-query cache entry regardless of how
 * many cards call this hook, so rendering it on every card in a grid is
 * still just one network request.
 */
import { useQuery } from "@tanstack/react-query";

export function useActiveBoostedPropertyIds() {
  return useQuery<{ propertyIds: number[] }>({
    queryKey: ["/api/gene/boost/active-property-ids"],
    staleTime: 60_000,
  });
}
