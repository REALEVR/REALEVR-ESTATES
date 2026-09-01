import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, CheckCircle2, XCircle, Rocket } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/**
 * Admin/agent queue for confirming Boost (featured placement) payments —
 * server/gene/boost-placement.ts. Gated by the shared adminMiddleware
 * (admin OR agent) server-side, same as payments-core.ts's own /confirm —
 * this is money coming IN, not a payout, so it doesn't need the stricter
 * admin-only guard the referral payouts use.
 */

type BoostStatus = "pending_manual_confirmation" | "active" | "expired" | "cancelled" | "superseded";

interface BoostPurchase {
  id: number;
  propertyId: number;
  tier: string;
  tierLabel?: string;
  amountUgx: number;
  durationDays: number;
  status: BoostStatus;
  referredListing: boolean;
  requestedAt: string;
  confirmedAt?: string;
  expiresAt?: string;
}

const STATUS_LABEL: Record<BoostStatus, string> = {
  pending_manual_confirmation: "Awaiting payment confirmation",
  active: "Active",
  expired: "Expired",
  cancelled: "Cancelled",
  superseded: "Superseded (re-boosted)",
};

const STATUS_VARIANT: Record<BoostStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending_manual_confirmation: "secondary",
  active: "default",
  expired: "outline",
  cancelled: "destructive",
  superseded: "outline",
};

const TIER_LABEL: Record<string, string> = {
  bronze: "Bronze — 7 days",
  silver: "Silver — 14 days",
  gold: "Gold — 30 days",
};

export default function AdminBoostConfirmations() {
  const { toast } = useToast();
  const [rows, setRows] = useState<BoostPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<number | null>(null);
  const [tab, setTab] = useState<BoostStatus | "all">("pending_manual_confirmation");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/gene/boost/purchases", { credentials: "include" });
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data?.message || "Failed to load boost purchases.");
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast({ title: "Couldn't load boost purchases", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const act = async (id: number, action: "confirm" | "cancel") => {
    setActingOn(id);
    try {
      const res = await fetch(`/api/gene/boost/${id}/${action}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Action failed.");
      toast({ title: action === "confirm" ? "Boost activated" : "Boost cancelled" });
      await load();
    } catch (err: any) {
      toast({ title: "Action failed", description: err?.message, variant: "destructive" });
    } finally {
      setActingOn(null);
    }
  };

  const filtered = tab === "all" ? rows : rows.filter((r) => r.status === tab);
  const pendingCount = rows.filter((r) => r.status === "pending_manual_confirmation").length;
  const activeCount = rows.filter((r) => r.status === "active").length;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Rocket className="h-7 w-7 text-accent" /> Boost Payment Confirmations
        </h1>
        <p className="text-muted-foreground mt-1">
          Listing owners request a paid featured-placement boost, then pay via mobile money. Confirm receipt here to
          activate it — that's what actually features the listing.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Awaiting confirmation</CardDescription>
            <CardTitle className="text-3xl">{pendingCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Currently active</CardDescription>
            <CardTitle className="text-3xl">{activeCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="pending_manual_confirmation">Pending</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="expired">Expired</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4 space-y-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">Nothing here.</p>
          ) : (
            filtered.map((r) => (
              <Card key={r.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-semibold text-lg">Property #{r.propertyId}</h3>
                        <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                        {r.referredListing && <Badge variant="outline">Agent-referred</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">{TIER_LABEL[r.tier] ?? r.tier}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Requested {new Date(r.requestedAt).toLocaleString()}
                        {r.expiresAt && ` · Expires ${new Date(r.expiresAt).toLocaleString()}`}
                      </p>
                      <a href={`/property/${r.propertyId}`} className="text-xs text-accent hover:underline">
                        View listing
                      </a>
                    </div>
                    <p className="text-2xl font-bold">{r.amountUgx.toLocaleString()} UGX</p>
                  </div>

                  {r.status === "pending_manual_confirmation" && (
                    <div className="flex gap-2 mt-4">
                      <Button size="sm" onClick={() => act(r.id, "confirm")} disabled={actingOn === r.id}>
                        {actingOn === r.id ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                        Confirm payment received
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => act(r.id, "cancel")} disabled={actingOn === r.id}>
                        <XCircle className="h-4 w-4 mr-1" /> Cancel
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
