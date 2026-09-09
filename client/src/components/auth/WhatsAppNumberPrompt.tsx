import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from "@/lib/country-codes";
import { PROMPT_WHATSAPP_FLAG } from "./GoogleSignInButton";

/**
 * Shown 5 seconds after a Google sign-in lands on an account with no phone
 * number on file (GoogleSignInButton sets the sessionStorage flag this
 * watches for — Google never gives us a phone number, unlike the sign-up
 * form's own phone field, which is compulsory there — see AuthModal.tsx /
 * auth-page.tsx / server/auth.ts's POST /api/register). Compulsory here
 * too, for the same reason (server/gene/rentrail.ts's
 * findLandlordUserIdByPhone doc comment: a rent payment/receipt can only
 * ever reach this account by matching its phone number) — no "skip",
 * and closing via the backdrop/Escape doesn't dismiss it either; the only
 * way out is saving a number. Lives outside AuthGate/AuthModal since it
 * needs to render over the real site, after sign-in has already landed.
 * The delay is deliberate — popping a dialog the instant the welcome toast
 * lands reads as a wall between the user and the site they just signed
 * into; a few seconds lets that moment land first.
 */
export default function WhatsAppNumberPrompt() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
    const [number, setNumber] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!user) return;
        let flagged = false;
        try {
            flagged = sessionStorage.getItem(PROMPT_WHATSAPP_FLAG) === "1";
        } catch {
            // Storage unavailable - just skip the prompt rather than error.
        }
        if (!flagged) return;

        const timer = setTimeout(() => setOpen(true), 5000);
        return () => clearTimeout(timer);
    }, [user]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (number.replace(/\D/g, "").length < 7) {
            toast({ title: "Enter a valid phone number", variant: "destructive" });
            return;
        }

        setSaving(true);
        try {
            const res = await apiRequest("PATCH", "/api/users/profile", {
                phoneNumber: `${countryCode}${number.replace(/^0+/, "")}`,
                countryCode,
            });
            const updated = await res.json();
            queryClient.setQueryData(["/api/user"], (prev: any) => (prev ? { ...prev, ...updated } : updated));
            toast({ title: "WhatsApp number saved", description: "We'll use this to reach you about bookings and updates." });
            // Only clears the flag / closes on an actual successful save —
            // this step is compulsory, so a failed save leaves the dialog
            // open to retry rather than silently disappearing.
            try {
                sessionStorage.removeItem(PROMPT_WHATSAPP_FLAG);
            } catch {
                // Nothing to clean up if storage isn't available.
            }
            setOpen(false);
        } catch (error: any) {
            toast({ title: "Couldn't save that number", description: error.message || "Please try again.", variant: "destructive" });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={() => {}}>
            <DialogContent hideClose className="sm:max-w-sm" onInteractOutside={(e) => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle className="font-display">Add your phone number</DialogTitle>
                    <DialogDescription>
                        Google doesn't share a phone number, and we require one on every account — add yours so
                        agents and RealEVR can reach you about bookings, viewings, and rent payment receipts.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSave} className="space-y-3">
                    <div className="flex gap-2">
                        <Select value={countryCode} onValueChange={setCountryCode}>
                            <SelectTrigger className="w-[110px] shrink-0">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-72">
                                {COUNTRY_CODES.map((c) => (
                                    <SelectItem key={c.code + c.country} value={c.code}>
                                        {c.flag} {c.code}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Input
                            type="tel"
                            placeholder="700 000 000"
                            value={number}
                            onChange={(e) => setNumber(e.target.value.replace(/[^0-9]/g, ""))}
                            autoFocus
                        />
                    </div>
                    <div className="flex gap-2">
                        <Button type="submit" className="flex-1" disabled={saving || !number.trim()}>
                            {saving ? "Saving..." : "Save"}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
