import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLinkWhatsapp, useWhatsappLinkStatus } from "@/hooks/useWhatsappLink";
import { useToast } from "@/hooks/use-toast";
import { MessageCircle, Loader2, CheckCircle2 } from "lucide-react";

/**
 * Lets a user link their WhatsApp number so they can chat with their agent
 * over WhatsApp (and, for landlords, toggle listing availability by texting
 * "available <id>" / "unavailable <id>", or an agent submit a whole new
 * listing by texting "list property" — see
 * server/gene/whatsapp-listing-upload.ts) — see
 * server/gene/whatsapp-concierge.ts. Not OTP-verified in this v1; the copy
 * below says so plainly rather than implying a stronger guarantee.
 */
export default function WhatsappLinkCard() {
  const { toast } = useToast();
  const statusQuery = useWhatsappLinkStatus(true);
  const linkWhatsapp = useLinkWhatsapp();
  const [phone, setPhone] = useState("");

  const linked = statusQuery.data?.linked;

  const handleLink = async () => {
    if (!/^\+?[0-9]{6,20}$/.test(phone.trim())) {
      toast({ title: "Enter a valid phone number", variant: "destructive" });
      return;
    }
    try {
      await linkWhatsapp.mutateAsync(phone.trim());
      toast({ title: "WhatsApp linked", description: "Message this number any time to chat with your agent." });
    } catch (err: any) {
      toast({ title: "Couldn't link WhatsApp", description: err?.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <MessageCircle className="h-4 w-4 text-primary" /> Chat via WhatsApp
      </p>
      {linked ? (
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" /> Linked to {statusQuery.data?.phone} — message our
            WhatsApp number any time.
          </p>
          <p className="text-xs text-muted-foreground">
            Tip: text "list property" to that number to add a whole new listing — photos and all — straight from
            WhatsApp.
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Link your number to chat with your agent over WhatsApp too — same recommendations, real time.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="+256700000000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="flex-1"
            />
            <Button size="sm" onClick={handleLink} disabled={linkWhatsapp.isPending}>
              {linkWhatsapp.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Link
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
