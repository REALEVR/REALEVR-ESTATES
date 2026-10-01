/** Types and calls for the live auctions (server/gene/auctions.ts). */

export interface AuctionBid {
  id: number;
  alias: string;
  amount: number;
  at: string;
}

export interface AuctionMe {
  bidderStatus: "none" | "applied" | "under_review" | "approved" | "rejected" | "suspended";
  decisionNote: string | null;
  approvedUntil: string | null;
  entry: { id: number; alias: string; feeStatus: "unpaid" | "submitted" | "confirmed" | "rejected"; feeNote: string | null; reference: string; payTo: string } | null;
  isHighestBidder: boolean;
  canBid: boolean;
}

export interface AuctionView {
  id: number;
  propertyId: number;
  title: string;
  sellerName: string;
  provisions: string;
  currency: string;
  startingPrice: number;
  minIncrement: number;
  startsAt: string;
  endsAt: string;
  currentEndsAt: string;
  extended: boolean;
  settlementDays: number;
  phase: "scheduled" | "live" | "ended" | "cancelled";
  currentBid: number | null;
  bidCount: number;
  bidderCount: number;
  minNextBid: number;
  bids: AuctionBid[];
  serverTime: string;
  commitmentFeeUsd: number;
  softCloseMinutes: number;
  winningBid?: AuctionBid | null;
  me?: AuctionMe;
}

/** A fetch that throws the server's own sentence on failure. */
export async function auctionFetch<T = any>(method: string, url: string, body?: unknown | FormData): Promise<T> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: body && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: body ? (isForm ? (body as FormData) : JSON.stringify(body)) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  if (!res.ok) throw Object.assign(new Error(json?.message || `Something went wrong (${res.status}).`), { status: res.status });
  return json as T;
}

export const money = (currency: string, n: number | null | undefined) => (n == null ? "—" : `${currency} ${n.toLocaleString()}`);

/** "2d 04:12:09" / "04:12:09" / "00:42" for a number of milliseconds left. */
export function formatLeft(ms: number): string {
  if (ms <= 0) return "00:00";
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return d > 0 ? `${d}d ${p(h)}:${p(m)}:${p(s)}` : h > 0 ? `${p(h)}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

export const eat = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Kampala", weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " EAT";
