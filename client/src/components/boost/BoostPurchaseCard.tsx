import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Rocket, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/**
 * Boost purchase UI (server/gene/boost-placement.ts) — lets a listing's
 * owner request a paid featured-placement boost. Payment is manual
 * (mobile money, confirmed by an admin) — see the module's honesty note —
 * so this UI's job is just: pick a tier, show the "awaiting confirmation"
 * state, and show the active/expires-at state once confirmed.
 */

type Tier = "bronze" | "silver" | "gold";

interface TierInfo {
  priceUgx: number;
  durationDays: number;
  label: string;
}

interface BoostStatus {
  boosted: boolean;
  tier?: Tier;
  tierLabel?: string;
  expiresAt?: string;
}

export default function BoostPurchaseCard({ propertyId }: { propertyId: number }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [tiers, setTiers] = useState<Record<Tier, TierInfo> | null>(null);
  const [status, setStatus] = useState<BoostStatus | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [busyTier, setBusyTier] = useState<Tier | null>(null);
  const [loading, setLoading] = useState(false);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const [tiersRes, statusRes] = await Promise.all([
        fetch("/api/gene/boost/tiers").then((r) => r.json()),
        fetch(`/api/gene/boost/status/${propertyId}`).then((r) => r.json()),
      ]);
      setTiers(tiersRes.tiers);
      setStatus(statusRes);
    } catch {
      // Non-fatal — the dialog just shows the tier picker without a status banner.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setPendingMessage(null);
      loadStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const purchase = async (tier: Tier) => {
    setBusyTier(tier);
    try {
      const res = await fetch(`/api/gene/boost/${propertyId}/purchase`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Could not start boost purchase.");
      setPendingMessage(data.message || "Boost requested — awaiting payment confirmation.");
      toast({ title: "Boost requested", description: "We'll confirm once payment is received." });
    } catch (err: any) {
      toast({ title: "Couldn't request boost", description: err?.message, variant: "destructive" });
    } finally {
      setBusyTier(null);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" className="flex-1" onClick={() => setOpen(true)}>
        <Rocket className="mr-1 h-3 w-3" />
        Boost
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-accent" /> Boost this listing
            </DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {status?.boosted && (
                <div className="flex items-center gap-2 rounded-md border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>
                    Active: <Badge variant="default">{status.tierLabel}</Badge>
                    {status.expiresAt && ` — until ${new Date(status.expiresAt).toLocaleDateString()}`}
                  </span>
                </div>
              )}

              {pendingMessage && (
                <p className="text-sm rounded-md border bg-muted/40 px-3 py-2">{pendingMessage}</p>
              )}

              {tiers && (
                <div className="space-y-2">
                  {(Object.keys(tiers) as Tier[]).map((tier) => (
                    <div key={tier} className="flex items-center justify-between rounded-md border px-3 py-2">
                      <div>
                        <p className="font-medium text-sm">{tiers[tier].label}</p>
                        <p className="text-xs text-muted-foreground">{tiers[tier].priceUgx.toLocaleString()} UGX</p>
                      </div>
                      <Button size="sm" onClick={() => purchase(tier)} disabled={busyTier !== null}>
                        {busyTier === tier ? <Loader2 className="h-4 w-4 animate-spin" /> : "Request"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                After requesting, pay via mobile money and message us on WhatsApp to speed up confirmation — your boost
                activates as soon as an admin confirms payment.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
