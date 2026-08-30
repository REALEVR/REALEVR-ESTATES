import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { PageSeo } from "@/components/seo/PageSeo";
import MotionBackground from "@/components/motion/MotionBackground";
import Reveal from "@/components/motion/Reveal";
import {
  useStartSelfServeListing,
  useUploadCoverPhoto,
  usePaySelfServeListing,
  useVerifySelfServeOtp,
  useResendSelfServeOtp,
  fetchSelfServeStatus,
  type SelfServeDraftInput,
} from "@/hooks/useSelfServeListing";
import { CheckCircle2, Loader2, Smartphone, Upload, PartyPopper } from "lucide-react";

type Step = "details" | "photo" | "pay" | "otp" | "success";
const SESSION_KEY = "realevr:selfServeSubmission";

const CATEGORY_OPTIONS = [
  { value: "rental_units", label: "Rental Unit" },
  { value: "furnished_houses", label: "Furnished House / BnB" },
  { value: "for_sale", label: "For Sale" },
];
const PROPERTY_TYPES = ["Apartment", "House", "Villa", "Land", "Commercial"];

const emptyDraft: SelfServeDraftInput = {
  title: "",
  location: "",
  price: 0,
  description: "",
  bedrooms: 1,
  bathrooms: 1,
  squareMeters: 0,
  propertyType: "",
  category: "",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
};

export default function ListYourPropertyPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>("details");
  const [draft, setDraft] = useState<SelfServeDraftInput>(emptyDraft);
  const [submissionId, setSubmissionId] = useState<number | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [devOtpCode, setDevOtpCode] = useState<string | null>(null);
  const [dashboardUrl, setDashboardUrl] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useStartSelfServeListing();
  const uploadPhoto = useUploadCoverPhoto();
  const pay = usePaySelfServeListing();
  const verifyOtp = useVerifySelfServeOtp();
  const resendOtp = useResendSelfServeOtp();

  // Rehydrate an in-progress submission after a page refresh.
  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (!saved) return;
    try {
      const { id, tok } = JSON.parse(saved);
      if (!id || !tok) return;
      fetchSelfServeStatus(id, tok)
        .then((s) => {
          setSubmissionId(id);
          setToken(tok);
          if (s.coverImageUrl) setCoverPreview(s.coverImageUrl);
          if (s.status === "live" && s.createdPropertyId) {
            setStep("success");
            setPropertyId(s.createdPropertyId);
          } else if (s.status === "otp_sent") {
            setStep("otp");
          } else if (s.status === "awaiting_payment" || s.status === "payment_confirmed") {
            setStep("pay");
          } else if (s.coverImageUrl) {
            setStep("pay");
          }
        })
        .catch(() => sessionStorage.removeItem(SESSION_KEY));
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const set = <K extends keyof SelfServeDraftInput>(key: K, value: SelfServeDraftInput[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const handleStart = async () => {
    if (!draft.title || !draft.location || !draft.description || !draft.propertyType || !draft.category) {
      toast({ title: "A few fields are missing", description: "Fill in every field before continuing.", variant: "destructive" });
      return;
    }
    if (!draft.contactName || !draft.contactPhone) {
      toast({ title: "Your name and phone are required", description: "We text your verification code to this number.", variant: "destructive" });
      return;
    }
    try {
      const res = await start.mutateAsync(draft);
      setSubmissionId(res.submissionId);
      setToken(res.token);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: res.submissionId, tok: res.token }));
      setStep("photo");
    } catch (err: any) {
      toast({ title: "Couldn't save your listing details", description: err?.message, variant: "destructive" });
    }
  };

  const handlePhotoChange = async (file: File | null) => {
    if (!file || !submissionId || !token) return;
    setCoverPreview(URL.createObjectURL(file));
    try {
      await uploadPhoto.mutateAsync({ id: submissionId, token, file });
      setStep("pay");
    } catch (err: any) {
      toast({ title: "Photo upload failed", description: err?.message, variant: "destructive" });
    }
  };

  const startPolling = () => {
    if (!submissionId || !token) return;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const s = await fetchSelfServeStatus(submissionId, token);
        if (s.paymentFailed) {
          clearInterval(pollRef.current!);
          toast({ title: "Payment didn't go through", description: `Status: ${s.paymentDetail ?? "unknown"} — try again.`, variant: "destructive" });
          setStep("pay");
          return;
        }
        if (s.status === "otp_sent") {
          clearInterval(pollRef.current!);
          if (s.devOtpCode) setDevOtpCode(s.devOtpCode);
          setStep("otp");
        }
      } catch {
        // transient — keep polling
      }
    }, 4000);
  };

  const handlePay = async () => {
    if (!submissionId || !token) return;
    try {
      const res = await pay.mutateAsync({ id: submissionId, token });
      toast({ title: "Mobile money prompt sent", description: res.message });
      startPolling();
    } catch (err: any) {
      toast({ title: "Payment could not be started", description: err?.message, variant: "destructive" });
    }
  };

  const handleVerify = async () => {
    if (!submissionId || !token) return;
    try {
      const res = await verifyOtp.mutateAsync({ id: submissionId, token, code: otp });
      setPropertyId(res.propertyId);
      if (res.dashboardUrl) setDashboardUrl(res.dashboardUrl);
      sessionStorage.removeItem(SESSION_KEY);
      setStep("success");
    } catch (err: any) {
      toast({ title: "Verification failed", description: err?.message, variant: "destructive" });
    }
  };

  const handleResend = async () => {
    if (!submissionId || !token) return;
    try {
      const res = await resendOtp.mutateAsync({ id: submissionId, token });
      if (res.devOtpCode) setDevOtpCode(res.devOtpCode);
      toast({ title: "Code resent" });
    } catch (err: any) {
      toast({ title: "Couldn't resend code", description: err?.message, variant: "destructive" });
    }
  };

  const steps: Step[] = ["details", "photo", "pay", "otp", "success"];
  const stepIndex = steps.indexOf(step);

  return (
    <>
      <PageSeo
        title="List Your Property — RealEVR Estates"
        description="List your property yourself for a flat 1,000 UGX fee, verified by WhatsApp, live in minutes."
        canonicalPath="/list-your-property"
      />
      <section className="relative -mx-4 sm:-mx-6 lg:-mx-8 py-14 overflow-hidden">
        <MotionBackground tone="warm" />
        <div className="relative z-10 container mx-auto px-6 max-w-2xl">
          <Reveal>
            <div className="text-center mb-10">
              <h1 className="text-3xl md:text-4xl font-display font-medium text-foreground mb-3">
                List your property yourself
              </h1>
              <p className="text-muted-foreground">
                A flat 1,000 UGX fee, your WhatsApp number to verify you own it, and you're live — with your own
                landlord dashboard to add photos, a tour, and manage the listing afterwards.
              </p>
            </div>
          </Reveal>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 mb-10">
            {steps.map((s, i) => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all ${
                  i <= stepIndex ? "bg-accent w-10" : "bg-border w-6"
                }`}
              />
            ))}
          </div>

          <div className="bg-card border border-border rounded-2xl shadow-sm p-6 md:p-8">
            {step === "details" && (
              <div className="space-y-5">
                <h2 className="font-display text-xl text-foreground">Property details</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Label htmlFor="title">Title</Label>
                    <Input id="title" value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder="Cozy 2-bedroom apartment in Ntinda" />
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="location">Location</Label>
                    <Input id="location" value={draft.location} onChange={(e) => set("location", e.target.value)} placeholder="Ntinda, Kampala" />
                  </div>
                  <div>
                    <Label>Category</Label>
                    <Select value={draft.category} onValueChange={(v) => set("category", v)}>
                      <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>
                        {CATEGORY_OPTIONS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Property type</Label>
                    <Select value={draft.propertyType} onValueChange={(v) => set("propertyType", v)}>
                      <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        {PROPERTY_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="price">Price (UGX)</Label>
                    <Input id="price" type="number" min={0} value={draft.price || ""} onChange={(e) => set("price", Number(e.target.value))} />
                  </div>
                  <div>
                    <Label htmlFor="sqm">Size (sq m)</Label>
                    <Input id="sqm" type="number" min={0} value={draft.squareMeters || ""} onChange={(e) => set("squareMeters", Number(e.target.value))} />
                  </div>
                  <div>
                    <Label htmlFor="beds">Bedrooms</Label>
                    <Input id="beds" type="number" min={0} value={draft.bedrooms} onChange={(e) => set("bedrooms", Number(e.target.value))} />
                  </div>
                  <div>
                    <Label htmlFor="baths">Bathrooms</Label>
                    <Input id="baths" type="number" min={0} value={draft.bathrooms} onChange={(e) => set("bathrooms", Number(e.target.value))} />
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea id="description" rows={4} value={draft.description} onChange={(e) => set("description", e.target.value)} placeholder="What makes this place worth seeing?" />
                  </div>
                </div>

                <div className="border-t border-border pt-5">
                  <h3 className="font-display text-lg text-foreground mb-3 flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-accent" /> Your contact details
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    We send a WhatsApp verification code here before your listing goes live — this proves you're the
                    landlord or manager, not just anyone typing in a property.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="contactName">Your name</Label>
                      <Input id="contactName" value={draft.contactName} onChange={(e) => set("contactName", e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="contactPhone">WhatsApp number</Label>
                      <Input id="contactPhone" value={draft.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} placeholder="0770000000" />
                    </div>
                    <div className="md:col-span-2">
                      <Label htmlFor="contactEmail">Email (optional)</Label>
                      <Input id="contactEmail" type="email" value={draft.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} />
                    </div>
                  </div>
                </div>

                <Button className="w-full" size="lg" onClick={handleStart} disabled={start.isPending}>
                  {start.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Continue to photo
                </Button>
              </div>
            )}

            {step === "photo" && (
              <div className="space-y-5 text-center">
                <h2 className="font-display text-xl text-foreground">Add a cover photo</h2>
                <p className="text-sm text-muted-foreground">
                  Just one photo to get you live — you'll add the full gallery or a guided virtual tour from your
                  dashboard right after this.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handlePhotoChange(e.target.files?.[0] ?? null)}
                />
                {coverPreview ? (
                  <img src={coverPreview} alt="Cover preview" className="w-full h-56 object-cover rounded-xl border border-border" />
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-56 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-accent hover:text-accent transition-colors"
                  >
                    <Upload className="h-8 w-8" />
                    <span>Tap to choose a photo</span>
                  </button>
                )}
                {uploadPhoto.isPending && (
                  <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
                  </p>
                )}
                {coverPreview && !uploadPhoto.isPending && (
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    Change photo
                  </Button>
                )}
              </div>
            )}

            {step === "pay" && (
              <div className="space-y-5 text-center">
                <h2 className="font-display text-xl text-foreground">Pay the listing fee</h2>
                <p className="text-3xl font-display font-medium text-foreground">1,000 UGX</p>
                <p className="text-sm text-muted-foreground">
                  We'll send a mobile money prompt to <span className="font-medium text-foreground">{draft.contactPhone}</span>. Approve it on your
                  phone, then we'll text your verification code.
                </p>
                <Button className="w-full" size="lg" onClick={handlePay} disabled={pay.isPending || Boolean(pollRef.current)}>
                  {(pay.isPending || pollRef.current) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {pollRef.current ? "Waiting for approval…" : "Send payment prompt"}
                </Button>
              </div>
            )}

            {step === "otp" && (
              <div className="space-y-5 text-center">
                <h2 className="font-display text-xl text-foreground">Enter your verification code</h2>
                <p className="text-sm text-muted-foreground">
                  We texted a 6-digit code to your WhatsApp number.
                  {devOtpCode && (
                    <span className="block mt-2 text-xs bg-secondary rounded px-2 py-1 inline-block">
                      WhatsApp isn't configured on this deployment yet — your code is <span className="font-mono font-semibold">{devOtpCode}</span>
                    </span>
                  )}
                </p>
                <div className="flex justify-center">
                  <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                    <InputOTPGroup>
                      {[0, 1, 2, 3, 4, 5].map((i) => (
                        <InputOTPSlot key={i} index={i} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <Button className="w-full" size="lg" onClick={handleVerify} disabled={verifyOtp.isPending || otp.length !== 6}>
                  {verifyOtp.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Verify &amp; publish
                </Button>
                <Button variant="ghost" size="sm" onClick={handleResend} disabled={resendOtp.isPending}>
                  Resend code
                </Button>
              </div>
            )}

            {step === "success" && (
              <div className="space-y-5 text-center py-6">
                <PartyPopper className="h-12 w-12 text-accent mx-auto" />
                <h2 className="font-display text-2xl text-foreground">You're live!</h2>
                <p className="text-muted-foreground">
                  Your property is published and we've set up your landlord dashboard. Check your WhatsApp for a
                  one-tap link — or use the button below now.
                </p>
                {dashboardUrl ? (
                  <Button className="w-full" size="lg" asChild>
                    <a href={dashboardUrl}>Open my dashboard</a>
                  </Button>
                ) : (
                  <Button className="w-full" size="lg" onClick={() => setLocation("/auth")}>
                    Go to sign in
                  </Button>
                )}
                {propertyId && (
                  <Button variant="outline" className="w-full" asChild>
                    <a href={`/property/${propertyId}`}>View my listing</a>
                  </Button>
                )}
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5 pt-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-accent" /> From your dashboard, add a full photo gallery or
                  guided virtual tour any time.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
