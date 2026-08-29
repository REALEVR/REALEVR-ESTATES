import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AgentProfile, AgentProfileInput, AgentPurpose, RiskAppetite } from "@/hooks/useAgent";
import { useSaveAgentProfile } from "@/hooks/useAgent";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const INTEREST_OPTIONS: { value: string; label: string }[] = [
  { value: "rental_units", label: "Rental units" },
  { value: "bnbs", label: "Furnished BnBs" },
  { value: "for_sale", label: "For sale" },
  { value: "bank_sales", label: "Bank sales / auctions" },
];

interface AgentOnboardingProps {
  existingProfile: AgentProfile | null;
  onSaved?: () => void;
}

export default function AgentOnboarding({ existingProfile, onSaved }: AgentOnboardingProps) {
  const { toast } = useToast();
  const saveProfile = useSaveAgentProfile();

  const [budgetMin, setBudgetMin] = useState(existingProfile?.budgetMin?.toString() ?? "");
  const [budgetMax, setBudgetMax] = useState(existingProfile?.budgetMax?.toString() ?? "");
  const [currency, setCurrency] = useState(existingProfile?.currency ?? "UGX");
  const [purpose, setPurpose] = useState<AgentPurpose>(existingProfile?.purpose ?? "both");
  const [riskAppetite, setRiskAppetite] = useState<RiskAppetite>(existingProfile?.riskAppetite ?? "balanced");
  const [interests, setInterests] = useState<string[]>(existingProfile?.interests ?? []);
  const [preferredLocations, setPreferredLocations] = useState(
    existingProfile?.preferredLocations?.join(", ") ?? ""
  );
  const [monthlyIncome, setMonthlyIncome] = useState(existingProfile?.monthlyIncome?.toString() ?? "");
  const [investmentCapital, setInvestmentCapital] = useState(
    existingProfile?.investmentCapital?.toString() ?? ""
  );

  const toggleInterest = (value: string) => {
    setInterests((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input: AgentProfileInput = {
      budgetMin: budgetMin.trim() ? Number(budgetMin) : null,
      budgetMax: budgetMax.trim() ? Number(budgetMax) : null,
      currency: currency.trim() || "UGX",
      purpose,
      riskAppetite,
      interests,
      preferredLocations: preferredLocations
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      monthlyIncome: monthlyIncome.trim() ? Number(monthlyIncome) : null,
      investmentCapital: investmentCapital.trim() ? Number(investmentCapital) : null,
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
      toast({
        title: "Couldn't save your profile",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {!existingProfile && (
        <p className="text-sm text-muted-foreground">
          A few questions so your agent can recommend properties that actually fit you — your budget, what
          you're looking for, and where. You can change any of this later.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="agent-budget-min">Budget min</Label>
          <Input
            id="agent-budget-min"
            type="number"
            min={0}
            placeholder="e.g. 500,000"
            value={budgetMin}
            onChange={(e) => setBudgetMin(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="agent-budget-max">Budget max</Label>
          <Input
            id="agent-budget-max"
            type="number"
            min={0}
            placeholder="e.g. 2,000,000"
            value={budgetMax}
            onChange={(e) => setBudgetMax(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="agent-currency">Currency</Label>
        <Select value={currency} onValueChange={setCurrency}>
          <SelectTrigger id="agent-currency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="UGX">UGX — Ugandan Shilling</SelectItem>
            <SelectItem value="USD">USD — US Dollar</SelectItem>
            <SelectItem value="KES">KES — Kenyan Shilling</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>What are you looking to do?</Label>
        <Select value={purpose} onValueChange={(v) => setPurpose(v as AgentPurpose)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="live_in">Find a place to live in</SelectItem>
            <SelectItem value="invest">Invest</SelectItem>
            <SelectItem value="both">Both</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Risk appetite (for investing)</Label>
        <Select value={riskAppetite} onValueChange={(v) => setRiskAppetite(v as RiskAppetite)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="conservative">Conservative</SelectItem>
            <SelectItem value="balanced">Balanced</SelectItem>
            <SelectItem value="aggressive">Aggressive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Interested in</Label>
        <div className="flex flex-wrap gap-2">
          {INTEREST_OPTIONS.map((opt) => {
            const active = interests.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleInterest(opt.value)}
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
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="agent-locations">Preferred areas (comma-separated)</Label>
        <Input
          id="agent-locations"
          placeholder="e.g. Kololo, Ntinda, Naguru"
          value={preferredLocations}
          onChange={(e) => setPreferredLocations(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="agent-income">Monthly income (optional)</Label>
          <Input
            id="agent-income"
            type="number"
            min={0}
            value={monthlyIncome}
            onChange={(e) => setMonthlyIncome(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="agent-capital">Investment capital (optional)</Label>
          <Input
            id="agent-capital"
            type="number"
            min={0}
            value={investmentCapital}
            onChange={(e) => setInvestmentCapital(e.target.value)}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        This stays private to your account and is only used to personalize your recommendations.
      </p>

      <Button type="submit" className="w-full" disabled={saveProfile.isPending}>
        {saveProfile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {existingProfile ? "Save changes" : "Set up my agent"}
      </Button>
    </form>
  );
}
