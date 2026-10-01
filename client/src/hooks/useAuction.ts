import { useQuery } from "@tanstack/react-query";
import { auctionFetch, type AuctionView } from "@/lib/auctionApi";

/**
 * The auction for a property, kept live: refreshed every 3 seconds while the page is open and visible
 * (every 15 seconds once it is over). Returns null when the property has no auction.
 */
export function useAuctionByProperty(propertyId: number | undefined, enabled = true) {
  return useQuery<AuctionView | null>({
    queryKey: ["/auction/by-property", propertyId],
    enabled: enabled && !!propertyId,
    queryFn: async () => {
      try {
        return await auctionFetch<AuctionView>("GET", `/api/auctions/by-property/${propertyId}`);
      } catch (err: any) {
        if (err?.status === 404) return null;
        throw err;
      }
    },
    refetchInterval: (q) => {
      const data = q.state.data as AuctionView | null | undefined;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return false;
      return data && (data.phase === "ended" || data.phase === "cancelled") ? 15_000 : 3_000;
    },
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
}

export type AuctionSummary = Omit<AuctionView, "bids" | "provisions" | "me">;

/** Every running or finished auction, lightly: used to mark bank-sale cards. */
export function useAuctionList() {
  return useQuery<AuctionSummary[]>({
    queryKey: ["/auction/list"],
    queryFn: () => auctionFetch<AuctionSummary[]>("GET", "/api/auctions"),
    refetchInterval: 15_000,
    staleTime: 5_000,
  });
}
