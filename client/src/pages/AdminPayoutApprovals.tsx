import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, CheckCircle2, XCircle, Banknote, Wallet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/**
 * Admin-only review queue for agent listing referral payouts
 * (server/gene/self-serve-listing.ts). Strictly admin-gated server-side via
 * requireStrictAdmin (server/gene/admin-guard.ts) — an 'agent' account
 * cannot approve its own or anyone else's payout, even though it can reach
 * this route client-side if it guessed the URL (the API calls below will
 * 403 for it).
 */

type PayoutStatus = "pending_admin_review" | "approved_manual_payout_required" | "paid" | "rejected";

interface ListingPayoutRequest {
  id: number;
  submissionId: number;
  agentUserId: number;
  propertyId: number;
  amountUgx: number;
  status: PayoutStatus;
  propertyTitle: string;
  agentName: string;
  agentPhone: string;
  landlordName: string;
  landlordPhone: string;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  note?: string;
}

const STATUS_LABEL: Record<PayoutStatus, string> = {
  pending_admin_review: "Pending review",
  approved_manual_payout_required: "Approved — pay manually",
  paid: "Paid",
  rejected: "Rejected",
};

const STATUS_VARIANT: Record<PayoutStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending_admin_review: "secondary",
  approved_manual_payout_required: "default",
  paid: "outline",
  rejected: "destructive",
};

export default function AdminPayoutApprovals() {
  const { toast } = useToast();
  const [rows, setRows] = useState<ListingPayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<number | null>(null);
  const [tab, setTab] = useState<"pending_admin_review" | "approved_manual_payout_required" | "paid" | "rejected" | "all">(
    "pending_admin_review"
  );

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/gene/self-serve/payout-requests", { credentials: "include" });
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data?.message || "Failed to load payout requests.");
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast({ title: "Couldn't load payout requests", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const act = async (id: number, action: "approve" | "reject" | "mark-paid", reason?: string) => {
    setActingOn(id);
    try {
      const res = await fetch(`/api/gene/self-serve/payout-requests/${id}/${action}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reason ? { reason } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Action failed.");
      setRows((prev) => prev.map((r) => (r.id === id ? data : r)));
      toast({ title: action === "approve" ? "Approved" : action === "reject" ? "Rejected" : "Marked paid" });
    } catch (err: any) {
      toast({ title: "Action failed", description: err?.message, variant: "destructive" });
    } finally {
      setActingOn(null);
    }
  };

  const filtered = tab === "all" ? rows : rows.filter((r) => r.status === tab);
  const pendingCount = rows.filter((r) => r.status === "pending_admin_review").length;
  const approvedCount = rows.filter((r) => r.status === "approved_manual_payout_required").length;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Wallet className="h-7 w-7 text-accent" /> Listing Payout Approvals
        </h1>
        <p className="text-muted-foreground mt-1">
          Agents earn a flat 1,000 UGX referral fee once a landlord confirms a listing over WhatsApp. Review and
          approve those payouts here — you're also notified on WhatsApp the moment a new one comes in.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending your review</CardDescription>
            <CardTitle className="text-3xl">{pendingCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Approved, awaiting manual payment</CardDescription>
            <CardTitle className="text-3xl">{approvedCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="pending_admin_review">Pending</TabsTrigger>
          <TabsTrigger value="approved_manual_payout_required">Approved</TabsTrigger>
          <TabsTrigger value="paid">Paid</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
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
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-lg">{r.propertyTitle}</h3>
                        <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Agent: <span className="text-foreground">{r.agentName}</span> ({r.agentPhone})
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Vouched for by: <span className="text-foreground">{r.landlordName}</span> ({r.landlordPhone})
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Submitted {new Date(r.createdAt).toLocaleString()}
                        {r.decidedBy && ` · Decided by ${r.decidedBy}`}
                      </p>
                      {r.note && <p className="text-sm mt-1 italic text-muted-foreground">"{r.note}"</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">{r.amountUgx.toLocaleString()} UGX</p>
                      <a href={`/property/${r.propertyId}`} className="text-xs text-accent hover:underline">
                        View listing
                      </a>
                    </div>
                  </div>

                  {r.status === "pending_admin_review" && (
                    <div className="flex gap-2 mt-4">
                      <Button size="sm" onClick={() => act(r.id, "approve")} disabled={actingOn === r.id}>
                        {actingOn === r.id ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => act(r.id, "reject", window.prompt("Reason for rejecting (optional):") || undefined)}
                        disabled={actingOn === r.id}
                      >
                        <XCircle className="h-4 w-4 mr-1" /> Reject
                      </Button>
                    </div>
                  )}
                  {r.status === "approved_manual_payout_required" && (
                    <div className="flex gap-2 mt-4">
                      <Button size="sm" onClick={() => act(r.id, "mark-paid")} disabled={actingOn === r.id}>
                        {actingOn === r.id ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Banknote className="h-4 w-4 mr-1" />}
                        Mark as paid
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
