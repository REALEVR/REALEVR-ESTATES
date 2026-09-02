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
  useSendVerification,
  useVerifySelfServeOtp,
  useResendSelfServeOtp,
  fetchSelfServeStatus,
  type SelfServeDraftInput,
} from "@/hooks/useSelfServeListing";
import { CheckCircle2, Loader2, Smartphone, Upload, PartyPopper, Wallet } from "lucide-react";

type Step = "details" | "photo" | "verify" | "success";
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
  agentName: "",
  agentPhone: "",
  agentEmail: "",
  landlordName: "",
  landlordPhone: "",
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
  const [otpRequested, setOtpRequested] = useState(false);
  const [devOtpCode, setDevOtpCode] = useState<string | null>(null);
  const [landlordPhoneMasked, setLandlordPhoneMasked] = useState<string | null>(null);
  const [payoutAmount, setPayoutAmount] = useState(1000);
  const [dashboardUrl, setDashboardUrl] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const start = useStartSelfServeListing();
  const uploadPhoto = useUploadCoverPhoto();
  const sendVerification = useSendVerification();
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
          setPayoutAmount(s.payoutAmount);
          setLandlordPhoneMasked(s.landlordPhoneMasked);
          if (s.coverImageUrl) setCoverPreview(s.coverImageUrl);
          if (s.status === "live" && s.createdPropertyId) {
            setStep("success");
            setPropertyId(s.createdPropertyId);
          } else if (s.status === "otp_sent") {
            setOtpRequested(true);
            setStep("verify");
          } else if (s.coverImageUrl) {
            setStep("verify");
          }
        })
        .catch(() => sessionStorage.removeItem(SESSION_KEY));
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }, []);

  const set = <K extends keyof SelfServeDraftInput>(key: K, value: SelfServeDraftInput[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const handleStart = async () => {
    if (!draft.title || !draft.location || !draft.description || !draft.propertyType || !draft.category) {
      toast({ title: "A few property fields are missing", description: "Fill in every field before continuing.", variant: "destructive" });
      return;
    }
    if (!draft.agentName || !draft.agentPhone) {
      toast({ title: "Your name and phone are required", description: "This is where your payout confirmation and dashboard link go.", variant: "destructive" });
      return;
    }
    if (!draft.landlordName || !draft.landlordPhone) {
      toast({ title: "Landlord/manager details are required", description: "We text them a code to confirm you can list this property.", variant: "destructive" });
      return;
    }
    try {
      const res = await start.mutateAsync(draft);
      setSubmissionId(res.submissionId);
      setToken(res.token);
      setPayoutAmount(res.payoutAmount);
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
      setStep("verify");
    } catch (err: any) {
      toast({ title: "Photo upload failed", description: err?.message, variant: "destructive" });
    }
  };

  const handleSendVerification = async () => {
    if (!submissionId || !token) return;
    try {
      const res = await sendVerification.mutateAsync({ id: submissionId, token });
      toast({ title: "Code sent", description: res.message });
      setOtpRequested(true);
      const s = await fetchSelfServeStatus(submissionId, token);
      setLandlordPhoneMasked(s.landlordPhoneMasked);
      if (s.devOtpCode) setDevOtpCode(s.devOtpCode);
    } catch (err: any) {
      toast({ title: "Couldn't send verification code", description: err?.message, variant: "destructive" });
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

  const steps: Step[] = ["details", "photo", "verify", "success"];
  const stepIndex = steps.indexOf(step);

  return (
    <>
      <PageSeo
        title="List a Property, Earn 1,000 UGX — RealEVR Estates"
        description="List a property on RealEVR Estates and earn a 1,000 UGX referral fee once the landlord confirms it over WhatsApp. Free to list — live in minutes."
        canonicalPath="/list-your-property"
      />
      <section className="relative -mx-4 sm:-mx-6 lg:-mx-8 py-14 overflow-hidden">
        <MotionBackground tone="warm" />
        <div className="relative z-10 container mx-auto px-6 max-w-2xl">
          <Reveal>
            <div className="text-center mb-10">
              <h1 className="text-3xl md:text-4xl font-display font-medium text-foreground mb-3">
                List a property, earn 1,000 UGX
              </h1>
              <p className="text-muted-foreground">
                Submit any property, have the landlord or manager confirm it's real over a quick WhatsApp code, and
                we'll pay you a 1,000 UGX referral fee once our team approves it. Free to submit — no fee, ever, to
                list a property.
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
                    <Wallet className="h-4 w-4 text-accent" /> Your details (this is who gets paid)
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    We'll send your 1,000 UGX referral fee confirmation and your new dashboard link to this WhatsApp
                    number once the property is live and approved.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="agentName">Your name</Label>
                      <Input id="agentName" value={draft.agentName} onChange={(e) => set("agentName", e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="agentPhone">Your WhatsApp number</Label>
                      <Input id="agentPhone" value={draft.agentPhone} onChange={(e) => set("agentPhone", e.target.value)} placeholder="0770000000" />
                    </div>
                    <div className="md:col-span-2">
                      <Label htmlFor="agentEmail">Email (optional)</Label>
                      <Input id="agentEmail" type="email" value={draft.agentEmail} onChange={(e) => set("agentEmail", e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="border-t border-border pt-5">
                  <h3 className="font-display text-lg text-foreground mb-3 flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-accent" /> Landlord / manager's details
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    We text a verification code to this number to confirm they're really the owner or manager and
                    they're okay with you listing this property. The property only goes live once they confirm.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="landlordName">Landlord/manager name</Label>
                      <Input id="landlordName" value={draft.landlordName} onChange={(e) => set("landlordName", e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="landlordPhone">Their WhatsApp number</Label>
                      <Input id="landlordPhone" value={draft.landlordPhone} onChange={(e) => set("landlordPhone", e.target.value)} placeholder="0770000000" />
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
                  Just one photo to get this live — a full gallery or guided virtual tour can be added from the
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

            {step === "verify" && !otpRequested && (
              <div className="space-y-5 text-center">
                <h2 className="font-display text-xl text-foreground">Verify with the landlord</h2>
                <p className="text-sm text-muted-foreground">
                  We'll text a 6-digit code to <span className="font-medium text-foreground">{draft.landlordName}</span>'s
                  WhatsApp number. Ask them to share it with you once they receive it.
                </p>
                <Button className="w-full" size="lg" onClick={handleSendVerification} disabled={sendVerification.isPending}>
                  {sendVerification.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send verification code
                </Button>
              </div>
            )}

            {step === "verify" && otpRequested && (
              <div className="space-y-5 text-center">
                <h2 className="font-display text-xl text-foreground">Enter the verification code</h2>
                <p className="text-sm text-muted-foreground">
                  We texted a 6-digit code to the landlord/manager's WhatsApp{landlordPhoneMasked ? ` (ending ${landlordPhoneMasked.slice(-4)})` : ""}. Enter it once they share it with you.
                  {devOtpCode && (
                    <span className="block mt-2 text-xs bg-secondary rounded px-2 py-1 inline-block">
                      WhatsApp isn't configured on this deployment yet — the code is <span className="font-mono font-semibold">{devOtpCode}</span>
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
                  The property is published and a dashboard has been set up for you. Your {payoutAmount} UGX referral
                  fee is pending review by our team — you'll get a WhatsApp message the moment it's approved.
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
                  <CheckCircle2 className="h-3.5 w-3.5 text-accent" /> From the dashboard, add a full photo gallery or
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
