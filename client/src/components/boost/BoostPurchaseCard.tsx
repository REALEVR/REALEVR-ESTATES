import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Rocket, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import PaymentModal from "@/components/payment/PaymentModal";

/**
 * Boost purchase UI (server/gene/boost-placement.ts) — lets a listing's
 * owner request a paid featured-placement boost. Picking a tier opens the
 * real IoTec mobile-money gateway (same one used for BnB booking deposits
 * and viewing fees — see client/src/components/payment/PaymentModal.tsx);
 * once that reports a confirmed transaction, this calls
 * POST /api/gene/boost/:id/confirm-payment to activate the boost
 * immediately, no admin involved. If that automatic step somehow fails
 * (or the buyer pays some other way), the purchase still sits as
 * "awaiting confirmation" and an admin/agent can confirm it manually from
 * the Boost Confirmations queue (AdminBoostConfirmations.tsx) — see that
 * fallback note below.
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

  // Set once a purchase is created (pending_manual_confirmation) — drives
  // the IoTec payment modal, and is what confirm-payment gets called for.
  const [pendingPurchase, setPendingPurchase] = useState<{ id: number; amountUgx: number } | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

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

      // Straight into the real payment gateway — a pending purchase on its
      // own is worthless until it's actually paid for.
      setPendingPurchase({ id: data.purchase.id, amountUgx: data.purchase.amountUgx });
      setIsPaymentModalOpen(true);
    } catch (err: any) {
      toast({ title: "Couldn't request boost", description: err?.message, variant: "destructive" });
    } finally {
      setBusyTier(null);
    }
  };

  // Called by PaymentModal once the IoTec gateway reports a real confirmed
  // transaction — this is what actually activates the boost.
  const handlePaymentSuccess = async (response: any) => {
    setIsPaymentModalOpen(false);
    if (!pendingPurchase) return;

    try {
      const res = await fetch(`/api/gene/boost/${pendingPurchase.id}/confirm-payment`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: response.transaction_id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Payment received, but activation failed.");

      toast({ title: "🚀 Boost activated!", description: "This listing is now featured." });
      setPendingMessage(null);
      setPendingPurchase(null);
      await loadStatus();
    } catch (err: any) {
      // The payment itself succeeded even if this failed — don't leave the
      // buyer thinking they lost their money. The purchase still exists as
      // pending_manual_confirmation and an admin can confirm it from the
      // Boost Confirmations queue.
      setPendingMessage(
        "Payment received — activation is finishing up. If your listing isn't showing as boosted in a few minutes, contact us and we'll confirm it manually."
      );
      toast({ title: "Activation delayed", description: err?.message, variant: "destructive" });
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
                        {busyTier === tier ? <Loader2 className="h-4 w-4 animate-spin" /> : "Pay & Boost"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Pay via mobile money and your boost activates immediately. If the automatic confirmation doesn't go
                through, message us on WhatsApp and we'll confirm it manually.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {pendingPurchase && (
        <PaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          propertyId={propertyId}
          paymentType="BoostPlacement"
          amount={pendingPurchase.amountUgx}
          currency="UGX"
          successCallback={handlePaymentSuccess}
        />
      )}
    </>
  );
}
