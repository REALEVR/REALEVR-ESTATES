import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, Phone, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

/**
 * Review queue for occupant recommendations and the redemptions of their
 * points (server/gene/building-recommendations.ts). Strict admin only: it
 * holds phone numbers and approves money. Approving a recommendation is
 * the moment its point is earned; the reviewer's job is to call the number
 * and confirm the person lives in that building.
 */

interface Rec {
  id: number;
  userName: string;
  buildingName: string;
  location: string;
  unit: string;
  category: string;
  contactPhone: string;
  landlordName?: string;
  landlordPhone?: string;
  notes?: string;
  lat?: number;
  lng?: number;
  status: string;
  createdAt: string;
}
interface Redemption {
  id: number;
  userId: number;
  points: number;
  ugxAmount: number;
  mobileMoneyNumber: string;
  provider: string;
  status: string;
  createdAt: string;
}

const get = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load");
  return res.json();
};

export default function AdminRecommendations() {
  const { toast } = useToast();
  const [recs, setRecs] = useState<Rec[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([get<Rec[]>("/api/admin/recommendations"), get<Redemption[]>("/api/admin/recommendation-payouts")]);
      setRecs(r);
      setRedemptions(p);
    } catch (err: any) {
      toast({ title: "Couldn't load", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const act = async (url: string, body?: unknown) => {
    try {
      await apiRequest("POST", url, body ?? {});
      await load();
    } catch {
      toast({ title: "That did not work", variant: "destructive" });
    }
  };

  const pending = recs.filter((r) => r.status === "pending_review");
  const decided = recs.filter((r) => r.status !== "pending_review");

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Recommendations</h1>
          <p className="text-muted-foreground mt-1">
            Occupants telling us about buildings that are not listed. Call the number to confirm they live there, then approve
            (their point is earned) or reject.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Refresh
        </Button>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">To check ({pending.length})</h2>
        {pending.length === 0 && <p className="text-sm text-muted-foreground">Nothing waiting.</p>}
        {pending.map((r) => (
          <Card key={r.id}>
            <CardContent className="p-4 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{r.buildingName}</p>
                  <p className="text-sm text-muted-foreground">{r.location}</p>
                </div>
                <Badge variant="outline">{r.category.replace(/_/g, " ")}</Badge>
              </div>
              <p className="text-sm">
                <strong>{r.userName}</strong> says they live in unit <strong>{r.unit}</strong>.{" "}
                <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`tel:${r.contactPhone}`}>
                  <Phone className="h-3.5 w-3.5" /> {r.contactPhone}
                </a>
                {r.landlordPhone && (
                  <span className="text-muted-foreground"> · landlord/caretaker {r.landlordName ?? ""} {r.landlordPhone}</span>
                )}
              </p>
              {r.lat !== undefined && r.lng !== undefined && (
                <a
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  href={`https://www.google.com/maps?q=${r.lat},${r.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MapPin className="h-3.5 w-3.5" /> Where they were when they sent it
                </a>
              )}
              {r.notes && <p className="text-sm text-muted-foreground">{r.notes}</p>}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" onClick={() => act(`/api/admin/recommendations/${r.id}/approve`)}>
                  Approve (+1 point)
                </Button>
                <Button size="sm" variant="outline" onClick={() => act(`/api/admin/recommendations/${r.id}/duplicate`, { note: "Already known to us" })}>
                  Already known
                </Button>
                <Button size="sm" variant="outline" onClick={() => act(`/api/admin/recommendations/${r.id}/reject`, { note: window.prompt("Reason (shown to them):") ?? "" })}>
                  Reject
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Redemptions ({redemptions.length})</h2>
        {redemptions.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
        {redemptions.map((p) => (
          <Card key={p.id}>
            <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                <p className="font-semibold">
                  {p.ugxAmount.toLocaleString()} UGX <span className="font-normal text-muted-foreground">({p.points} points)</span>
                </p>
                <p className="text-muted-foreground">
                  {p.provider} {p.mobileMoneyNumber}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{p.status.replace(/_/g, " ")}</Badge>
                {p.status === "pending_review" && (
                  <>
                    <Button size="sm" onClick={() => act(`/api/admin/recommendation-payouts/${p.id}/approve`)}>
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => act(`/api/admin/recommendation-payouts/${p.id}/reject`, { reason: window.prompt("Reason:") ?? "" })}>
                      Reject
                    </Button>
                  </>
                )}
                {p.status === "approved_manual_payout_required" && (
                  <Button size="sm" onClick={() => act(`/api/admin/recommendation-payouts/${p.id}/mark-paid`)}>
                    I sent the money
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      {decided.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Decided ({decided.length})</h2>
          {decided.slice(0, 30).map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 text-sm border-b py-1.5">
              <span className="min-w-0 truncate">
                {r.buildingName}, {r.location} · {r.userName}
              </span>
              <Badge variant="outline">{r.status.replace(/_/g, " ")}</Badge>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
