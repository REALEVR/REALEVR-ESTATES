import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Building2, Gift, Loader2, MapPin } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { PageSeo } from "@/components/seo/PageSeo";
import {
  useMyRecommendations,
  useRedeemRecommendationPoints,
  useSendRecommendation,
  type RecommendationInput,
} from "@/hooks/useRecommendations";

const STATUS_LABEL: Record<string, string> = {
  pending_review: "Being checked",
  approved: "Approved: +1 point",
  rejected: "Not used",
  duplicate: "Already known",
  approved_manual_payout_required: "Approved, payment on its way",
  paid: "Paid",
};

const empty: RecommendationInput = {
  buildingName: "",
  location: "",
  unit: "",
  category: "rental_units",
  contactPhone: "",
  landlordName: "",
  landlordPhone: "",
  notes: "",
  occupant: false,
};

/**
 * "Do you live in a building that is not on RealEVR yet?" Only occupants may
 * recommend a building (server/gene/building-recommendations.ts). Each approved
 * recommendation is a point; 100 points redeem for 10,000 UGX.
 */
export default function RecommendPlacePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const mine = useMyRecommendations(!!user);
  const send = useSendRecommendation();
  const redeem = useRedeemRecommendationPoints();
  const [form, setForm] = useState<RecommendationInput>(empty);
  const [pay, setPay] = useState({ mobileMoneyNumber: "", provider: "MTN" });
  const set = <K extends keyof RecommendationInput>(key: K, value: RecommendationInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const points = mine.data?.points;

  // Where the phone is helps the team check the building. Asked for when they confirm they live
  // there (so sending never waits on it), kept only for the reviewer, and never required.
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const confirmOccupant = (yes: boolean) => {
    set("occupant", yes);
    if (yes && !here && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setHere({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => {},
        { timeout: 8000, maximumAge: 60_000 },
      );
    }
  };

  const submit = async () => {
    try {
      await send.mutateAsync({ ...form, ...(here ?? {}) });
      toast({ title: "Thank you!", description: "We will call you to confirm, then your point is added." });
      setForm(empty);
    } catch (err: any) {
      toast({ title: "Could not send", description: String(err?.message ?? "").replace(/^\d+:\s*/, "").replace(/^\{"message":"|"\}$/g, ""), variant: "destructive" });
    }
  };

  return (
    <>
      <PageSeo
        title="Recommend Your Building — RealEVR Estates"
        description="Live in a building that is not on RealEVR Estates yet? Tell us and earn points: 100 points are worth 10,000 UGX."
        canonicalPath="/recommend-a-place"
      />
      <div className="container mx-auto max-w-2xl px-4 py-10 space-y-6">
        <div className="text-center">
          <h1 className="font-display text-3xl font-medium text-foreground mb-2">Recommend your building</h1>
          <p className="text-muted-foreground">
            Live in a building that is not on RealEVR yet? Tell us about it. Each recommendation we approve earns you a
            point, and <strong>100 points can be redeemed for 10,000 UGX</strong>. Only people who live in the building
            can recommend it.
          </p>
        </div>

        {!user ? (
          <Card>
            <CardContent className="py-10 text-center space-y-3">
              <p className="text-muted-foreground">Sign in to recommend your building and keep track of your points.</p>
              <Button asChild>
                <Link href="/auth">Sign in</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {points && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Gift className="h-5 w-5 text-primary" /> Your points
                  </CardTitle>
                  <CardDescription>
                    {points.available} of {points.pointsPerBlock} points. {points.pending > 0 && `${points.pending} being checked.`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Progress value={Math.min(100, (points.available / points.pointsPerBlock) * 100)} />
                  {points.canRedeem ? (
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                      <div className="flex-1">
                        <Label className="text-xs">Mobile money number</Label>
                        <Input value={pay.mobileMoneyNumber} onChange={(e) => setPay((p) => ({ ...p, mobileMoneyNumber: e.target.value }))} placeholder="0772123456" />
                      </div>
                      <div className="sm:w-32">
                        <Label className="text-xs">Provider</Label>
                        <Input value={pay.provider} onChange={(e) => setPay((p) => ({ ...p, provider: e.target.value }))} />
                      </div>
                      <Button
                        disabled={redeem.isPending || !pay.mobileMoneyNumber}
                        onClick={() =>
                          redeem.mutate(pay, {
                            onSuccess: () => toast({ title: "Requested", description: `${points.redeemableUgx.toLocaleString()} UGX will be reviewed and sent.` }),
                            onError: () => toast({ title: "Could not redeem", variant: "destructive" }),
                          })
                        }
                      >
                        Redeem {points.redeemableUgx.toLocaleString()} UGX
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {points.pointsPerBlock - points.available} more approved recommendations until you can redeem 10,000 UGX.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" /> Tell us about your building
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="buildingName">Building name</Label>
                    <Input id="buildingName" value={form.buildingName} onChange={(e) => set("buildingName", e.target.value)} placeholder="e.g. Acacia Court" />
                  </div>
                  <div>
                    <Label htmlFor="location">Area or address</Label>
                    <Input id="location" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Ntinda, Kampala" />
                  </div>
                  <div>
                    <Label htmlFor="unit">Your flat or house number</Label>
                    <Input id="unit" value={form.unit} onChange={(e) => set("unit", e.target.value)} placeholder="e.g. B4" />
                  </div>
                  <div>
                    <Label>What is it?</Label>
                    <Select value={form.category} onValueChange={(v) => set("category", v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rental_units">Rental building</SelectItem>
                        <SelectItem value="for_sale">Homes for sale</SelectItem>
                        <SelectItem value="furnished_houses">Furnished / BnB</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="contactPhone">Your phone (we call to confirm)</Label>
                    <Input id="contactPhone" value={form.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} placeholder="0772123456" />
                  </div>
                  <div>
                    <Label htmlFor="landlordPhone">Landlord or caretaker phone (optional)</Label>
                    <Input id="landlordPhone" value={form.landlordPhone} onChange={(e) => set("landlordPhone", e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="notes">Anything else? (optional)</Label>
                    <Textarea id="notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
                  </div>
                </div>
                <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                  <Checkbox checked={form.occupant} onCheckedChange={(v) => confirmOccupant(v === true)} className="mt-0.5" />
                  <span>
                    I live in this building. I understand RealEVR will call me to check, and that a recommendation only counts
                    once it is approved.
                  </span>
                </label>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" /> If you allow it, your phone's location is sent to help the team check the building.
                </p>
                <Button
                  className="w-full"
                  size="lg"
                  disabled={send.isPending || !form.occupant || !form.buildingName || !form.location || !form.unit || !form.contactPhone}
                  onClick={submit}
                >
                  {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send my recommendation"}
                </Button>
              </CardContent>
            </Card>

            {mine.data && (mine.data.recommendations.length > 0 || mine.data.redemptions.length > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Your recommendations</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {mine.data.recommendations.map((r) => (
                    <div key={`r${r.id}`} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">
                        {r.buildingName}, {r.location}
                      </span>
                      <Badge variant="outline">{STATUS_LABEL[r.status]}</Badge>
                    </div>
                  ))}
                  {mine.data.redemptions.map((p) => (
                    <div key={`p${p.id}`} className="flex items-center justify-between gap-3 text-sm">
                      <span>Redeemed {p.points} points = {p.ugxAmount.toLocaleString()} UGX</span>
                      <Badge variant="outline">{STATUS_LABEL[p.status]}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </>
  );
}
