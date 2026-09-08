import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AgentProfile, AgentProfileInput, AgentPurpose, RiskAppetite } from "@/hooks/useAgent";
import { useSaveAgentProfile } from "@/hooks/useAgent";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Send } from "lucide-react";
import WhatsappLinkCard from "./WhatsappLinkCard";

const INTEREST_OPTIONS: { value: string; label: string }[] = [
  { value: "rental_units", label: "Rental units" },
  { value: "bnbs", label: "Furnished BnBs" },
  { value: "for_sale", label: "For sale" },
  { value: "bank_sales", label: "Bank sales / auctions" },
];

const PURPOSE_OPTIONS: { value: AgentPurpose; label: string; keywords: string[] }[] = [
  { value: "live_in", label: "Find a place to live in", keywords: ["live", "rent", "move", "stay"] },
  { value: "invest", label: "Invest", keywords: ["invest", "investment", "buy to let", "return"] },
  { value: "both", label: "Both", keywords: ["both"] },
];

const RISK_OPTIONS: { value: RiskAppetite; label: string; keywords: string[] }[] = [
  { value: "conservative", label: "Conservative", keywords: ["conservative", "safe", "cautious", "low risk"] },
  { value: "balanced", label: "Balanced", keywords: ["balanced", "moderate", "medium"] },
  { value: "aggressive", label: "Aggressive", keywords: ["aggressive", "high risk", "high-risk", "bold"] },
];

// ---------------------------------------------------------------------------
// Free-text parsing — this is what lets someone just type a sentence
// ("around 500k to 2 million ugx") instead of filling separate boxes,
// while still landing on the exact same structured AgentProfileInput the
// old form produced.
// ---------------------------------------------------------------------------

function parseAmounts(text: string): number[] {
  const results: number[] = [];
  const re = /(\d[\d,]*(?:\.\d+)?)\s*(k|m|thousand|million)?/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const raw = match[1].replace(/,/g, "");
    let value = parseFloat(raw);
    if (!Number.isFinite(value)) continue;
    const suffix = (match[2] || "").toLowerCase();
    if (suffix === "k" || suffix === "thousand") value *= 1_000;
    if (suffix === "m" || suffix === "million") value *= 1_000_000;
    results.push(value);
  }
  return results;
}

function detectCurrency(text: string): string | null {
  const lowered = text.toLowerCase();
  if (/\busd\b|\bdollars?\b|\$/.test(lowered)) return "USD";
  if (/\bkes\b|kenyan shilling/.test(lowered)) return "KES";
  if (/\bugx\b|ugandan shilling/.test(lowered)) return "UGX";
  return null;
}

function matchByKeywords<T extends string>(text: string, options: { value: T; keywords: string[] }[]): T | null {
  const lowered = text.toLowerCase();
  for (const opt of options) {
    if (opt.keywords.some((k) => lowered.includes(k))) return opt.value;
  }
  return null;
}

function isSkip(text: string): boolean {
  return /^(skip|no|none|n\/a|pass|prefer not to say)$/i.test(text.trim());
}

// ---------------------------------------------------------------------------
// Conversation steps
// ---------------------------------------------------------------------------

type StepId = "budget" | "purpose" | "risk" | "interests" | "locations" | "income" | "capital";

interface Bubble {
  role: "assistant" | "user";
  text: string;
}

interface Answers {
  budgetMin: number | null;
  budgetMax: number | null;
  currency: string;
  purpose: AgentPurpose | null;
  riskAppetite: RiskAppetite;
  interests: string[];
  preferredLocations: string[];
  monthlyIncome: number | null;
  investmentCapital: number | null;
}

function initialAnswers(existingProfile: AgentProfile | null): Answers {
  return {
    budgetMin: existingProfile?.budgetMin ?? null,
    budgetMax: existingProfile?.budgetMax ?? null,
    currency: existingProfile?.currency ?? "UGX",
    purpose: existingProfile?.purpose ?? null,
    riskAppetite: existingProfile?.riskAppetite ?? "balanced",
    interests: existingProfile?.interests ?? [],
    preferredLocations: existingProfile?.preferredLocations ?? [],
    monthlyIncome: existingProfile?.monthlyIncome ?? null,
    investmentCapital: existingProfile?.investmentCapital ?? null,
  };
}

interface AgentOnboardingProps {
  existingProfile: AgentProfile | null;
  onSaved?: () => void;
}

/**
 * "Meet your RealEVR agent" — one question at a time, chat-bubble style,
 * instead of the old single static form (budget/currency/purpose/risk/
 * interests/areas/income/capital all visible at once as boxes and
 * dropdowns). Free text is parsed into the same structured
 * AgentProfileInput the form used to produce (see the parse* helpers
 * above) — you can type a full sentence, or tap a suggested chip. Editing
 * an existing profile reuses the same flow, pre-filling each answer from
 * what's already on file so it's a quick confirm-or-change per question
 * rather than starting over.
 */
export default function AgentOnboarding({ existingProfile, onSaved }: AgentOnboardingProps) {
  const { toast } = useToast();
  const saveProfile = useSaveAgentProfile();

  const [answers, setAnswers] = useState<Answers>(() => initialAnswers(existingProfile));
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [pendingInterests, setPendingInterests] = useState<string[]>(() => existingProfile?.interests ?? []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const askedStepsRef = useRef<Set<number>>(new Set());

  // Risk appetite only matters if they're investing at all.
  const steps: StepId[] = [
    "budget",
    "purpose",
    ...(answers.purpose !== "live_in" ? (["risk"] as StepId[]) : []),
    "interests",
    "locations",
    "income",
    "capital",
  ];
  const currentStep = stepIndex < steps.length ? steps[stepIndex] : null;
  const done = currentStep === null;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [bubbles.length, stepIndex]);

  // Ask the current step's question the first time it's reached (guarded
  // by index so re-renders don't re-ask), and prefill the draft/selection
  // from an existing profile so editing is a quick confirm, not a restart.
  useEffect(() => {
    if (currentStep === null) {
      if (!askedStepsRef.current.has(-1)) {
        askedStepsRef.current.add(-1);
        setBubbles((prev) => [...prev, { role: "assistant", text: summaryText(answers) }]);
      }
      return;
    }
    if (askedStepsRef.current.has(stepIndex)) return;
    askedStepsRef.current.add(stepIndex);
    setBubbles((prev) => [...prev, { role: "assistant", text: questionFor(currentStep) }]);
    setDraft(prefillFor(currentStep, answers));
    if (currentStep === "interests") setPendingInterests(answers.interests);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, currentStep]);

  function questionFor(step: StepId): string {
    switch (step) {
      case "budget":
        return "Hi! I'm your RealEVR agent. Let's set up your profile — first, what's your budget range? Just tell me roughly, like \"500k to 2 million UGX\".";
      case "purpose":
        return "Got it. Are you looking for a place to live in, to invest, or both?";
      case "risk":
        return "How would you describe your risk appetite for investing — conservative, balanced, or aggressive?";
      case "interests":
        return "What type of properties are you interested in? Pick as many as you like — rentals, furnished BnBs, for sale, or bank sales/auctions.";
      case "locations":
        return "Any specific areas you like? e.g. Kololo, Ntinda, Naguru — or just say \"no preference\".";
      case "income":
        return "Almost done — what's your monthly income, if you'd like to share? Totally optional, just say \"skip\" if not.";
      case "capital":
        return "Last one: how much capital do you have available to invest, if any? Optional too — say \"skip\" to move on.";
    }
  }

  function prefillFor(step: StepId, a: Answers): string {
    switch (step) {
      case "budget": {
        if (a.budgetMin || a.budgetMax) {
          const parts = [a.budgetMin, a.budgetMax].filter((n): n is number => n != null);
          return `${parts.join(" to ")} ${a.currency}`.trim();
        }
        return "";
      }
      case "purpose":
        return "";
      case "risk":
        return "";
      case "interests":
        return "";
      case "locations":
        return a.preferredLocations.join(", ");
      case "income":
        return a.monthlyIncome != null ? String(a.monthlyIncome) : "";
      case "capital":
        return a.investmentCapital != null ? String(a.investmentCapital) : "";
    }
  }

  function summaryText(a: Answers): string {
    const purposeLabel = PURPOSE_OPTIONS.find((o) => o.value === a.purpose)?.label ?? "Not sure yet";
    const budget =
      a.budgetMin || a.budgetMax
        ? `${a.currency} ${(a.budgetMin ?? 0).toLocaleString()}–${(a.budgetMax ?? a.budgetMin ?? 0).toLocaleString()}`
        : "Not set";
    const interestLabels =
      a.interests.map((v) => INTEREST_OPTIONS.find((o) => o.value === v)?.label ?? v).join(", ") || "Not set";
    const areas = a.preferredLocations.join(", ") || "No preference";
    return [
      "Here's what I've got:",
      `• Budget: ${budget}`,
      `• Looking to: ${purposeLabel}`,
      a.purpose !== "live_in" ? `• Risk appetite: ${a.riskAppetite}` : null,
      `• Interested in: ${interestLabels}`,
      `• Areas: ${areas}`,
      a.monthlyIncome != null ? `• Monthly income: ${a.currency} ${a.monthlyIncome.toLocaleString()}` : null,
      a.investmentCapital != null ? `• Investment capital: ${a.currency} ${a.investmentCapital.toLocaleString()}` : null,
      "",
      "Look good?",
    ]
      .filter(Boolean)
      .join("\n");
  }

  function advance(userText: string, patch: Partial<Answers>) {
    setBubbles((prev) => [...prev, { role: "user", text: userText }]);
    setAnswers((prev) => ({ ...prev, ...patch }));
    setStepIndex((i) => i + 1);
    setDraft("");
  }

  const handleTextSubmit = () => {
    const text = draft.trim();
    if (!text || !currentStep) return;

    switch (currentStep) {
      case "budget": {
        const amounts = parseAmounts(text).sort((a, b) => a - b);
        const currency = detectCurrency(text) ?? answers.currency;
        if (amounts.length === 0) {
          toast({ title: "Didn't catch a number there", description: "Try something like \"500k to 2 million\".", variant: "destructive" });
          return;
        }
        const budgetMin = amounts.length >= 2 ? amounts[0] : null;
        const budgetMax = amounts.length >= 2 ? amounts[1] : amounts[0];
        advance(text, { budgetMin, budgetMax, currency });
        return;
      }
      case "locations": {
        const areas = /^(no preference|any|anywhere|none)$/i.test(text)
          ? []
          : text.split(/,| and /i).map((s) => s.trim()).filter(Boolean);
        advance(text, { preferredLocations: areas });
        return;
      }
      case "income": {
        const value = isSkip(text) ? null : parseAmounts(text)[0] ?? null;
        advance(isSkip(text) ? "Skip" : text, { monthlyIncome: value });
        return;
      }
      case "capital": {
        const value = isSkip(text) ? null : parseAmounts(text)[0] ?? null;
        advance(isSkip(text) ? "Skip" : text, { investmentCapital: value });
        return;
      }
      case "purpose": {
        const value = matchByKeywords(text, PURPOSE_OPTIONS);
        if (!value) {
          toast({ title: "Didn't quite catch that", description: "Try \"live in\", \"invest\", or \"both\".", variant: "destructive" });
          return;
        }
        advance(PURPOSE_OPTIONS.find((o) => o.value === value)!.label, { purpose: value });
        return;
      }
      case "risk": {
        const value = matchByKeywords(text, RISK_OPTIONS);
        if (!value) {
          toast({ title: "Didn't quite catch that", description: "Try \"conservative\", \"balanced\", or \"aggressive\".", variant: "destructive" });
          return;
        }
        advance(RISK_OPTIONS.find((o) => o.value === value)!.label, { riskAppetite: value });
        return;
      }
      case "interests": {
        const matched = INTEREST_OPTIONS.filter(
          (o) => text.toLowerCase().includes(o.label.toLowerCase()) || text.toLowerCase().includes(o.value.replace("_", " "))
        );
        const values = matched.length > 0 ? matched.map((o) => o.value) : pendingInterests;
        if (values.length === 0) {
          toast({ title: "Pick at least one", description: "Tap a chip below, or describe what you're after.", variant: "destructive" });
          return;
        }
        const label = (matched.length > 0 ? matched : INTEREST_OPTIONS.filter((o) => pendingInterests.includes(o.value)))
          .map((o) => o.label)
          .join(", ");
        advance(label, { interests: values });
        return;
      }
    }
  };

  const handleChipPick = (step: "purpose" | "risk", value: string, label: string) => {
    if (step === "purpose") advance(label, { purpose: value as AgentPurpose });
    else advance(label, { riskAppetite: value as RiskAppetite });
  };

  const toggleInterestChip = (value: string) => {
    setPendingInterests((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  const confirmInterests = () => {
    if (pendingInterests.length === 0) {
      toast({ title: "Pick at least one", variant: "destructive" });
      return;
    }
    const label = INTEREST_OPTIONS.filter((o) => pendingInterests.includes(o.value))
      .map((o) => o.label)
      .join(", ");
    advance(label, { interests: pendingInterests });
  };

  const handleConfirm = async () => {
    const input: AgentProfileInput = {
      budgetMin: answers.budgetMin,
      budgetMax: answers.budgetMax,
      currency: answers.currency,
      purpose: answers.purpose ?? "both",
      riskAppetite: answers.riskAppetite,
      interests: answers.interests,
      preferredLocations: answers.preferredLocations,
      monthlyIncome: answers.monthlyIncome,
      investmentCapital: answers.investmentCapital,
    };
    try {
      await saveProfile.mutateAsync(input);
      toast({
        title: existingProfile ? "Profile updated" : "Your agent is ready",
        description: existingProfile
          ? "Your recommendations will reflect these changes."
          : "I'll start finding matches based on this right away.",
      });
      onSaved?.();
    } catch (err: any) {
      toast({ title: "Couldn't save your profile", description: err?.message ?? "Please try again.", variant: "destructive" });
    }
  };

  const startOver = () => {
    askedStepsRef.current = new Set();
    setBubbles([]);
    setAnswers(initialAnswers(existingProfile));
    setPendingInterests(existingProfile?.interests ?? []);
    setStepIndex(0);
  };

  return (
    <div className="flex h-full flex-col">
      {!existingProfile && bubbles.length === 0 && (
        <p className="mb-2 text-sm text-muted-foreground">
          A few questions so your agent can recommend properties that actually fit you. Just chat with me below —
          you can change any of this later.
        </p>
      )}

      <div ref={scrollRef} className="max-h-[50vh] flex-1 space-y-3 overflow-y-auto pr-1">
        {bubbles.map((b, i) => (
          <div
            key={i}
            className={`max-w-[90%] whitespace-pre-line rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
              b.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted text-foreground"
            }`}
          >
            {b.text}
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-2 border-t border-border pt-3">
        {currentStep === "purpose" && (
          <div className="flex flex-wrap gap-2">
            {PURPOSE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleChipPick("purpose", opt.value, opt.label)}
                className="rounded-full border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:border-primary hover:bg-primary/10"
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
        {currentStep === "risk" && (
          <div className="flex flex-wrap gap-2">
            {RISK_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleChipPick("risk", opt.value, opt.label)}
                className="rounded-full border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:border-primary hover:bg-primary/10"
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
        {currentStep === "interests" && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {INTEREST_OPTIONS.map((opt) => {
                const active = pendingInterests.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleInterestChip(opt.value)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-transparent text-foreground hover:bg-muted"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <Button size="sm" onClick={confirmInterests} disabled={pendingInterests.length === 0}>
              Continue
            </Button>
          </div>
        )}
        {(currentStep === "income" || currentStep === "capital") && (
          <button
            type="button"
            onClick={() => advance("Skip", currentStep === "income" ? { monthlyIncome: null } : { investmentCapital: null })}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            Skip this question
          </button>
        )}

        {done ? (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={startOver} disabled={saveProfile.isPending}>
              Let me adjust something
            </Button>
            <Button className="flex-1" onClick={handleConfirm} disabled={saveProfile.isPending}>
              {saveProfile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {existingProfile ? "Save changes" : "Set up my agent"}
            </Button>
          </div>
        ) : (
          currentStep !== "interests" && (
            <div className="flex items-end gap-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleTextSubmit();
                  }
                }}
                placeholder="Type your answer…"
                className="min-h-[42px] flex-1 resize-none"
                rows={1}
              />
              <Button size="icon" onClick={handleTextSubmit} disabled={!draft.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          )
        )}
      </div>

      {done && (
        <p className="mt-2 text-xs text-muted-foreground">
          This stays private to your account and is only used to personalize your recommendations.
        </p>
      )}
      {existingProfile && done && <WhatsappLinkCard />}
    </div>
  );
}
