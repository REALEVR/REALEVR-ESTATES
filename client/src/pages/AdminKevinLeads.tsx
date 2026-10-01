import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageCircle, RefreshCw, Sparkles, Truck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/**
 * Everyone who talked to Kevin (backs server/gene/kevin-leads.ts via
 * GET /api/admin/kevin-leads and /api/admin/kevin-demand). Strict admin only:
 * it is visitors' personal details. Three views:
 *   - Everyone: name, contact, what they need. A lead tied to a RealEVR account
 *     (signed in, or the email they gave belongs to one) is marked so, which is
 *     how a Gmail/Google sign-in and a chat conversation end up on one record.
 *   - Shifting soon: people about to move, on their own list because they are
 *     the most time-sensitive (the team is alerted to them separately).
 *   - What to add: what visitors ask for (type, area, bedrooms, budget),
 *     counted, with how many searched and found nothing - the properties worth
 *     listing next. Includes visitors who never left contact details.
 */

interface Lead {
  sessionId: string;
  name?: string;
  email?: string;
  phone?: string;
  need?: string;
  location?: string;
  budget?: string;
  category?: string;
  propertyType?: string;
  bedrooms?: number;
  minBudget?: number;
  maxBudget?: number;
  movingSoon?: boolean;
  moveTiming?: string;
  interest?: { propertyId: number; title: string }[];
  language?: string;
  declined?: boolean;
  userId?: number;
  accountEmail?: string;
  createdAt: string;
  updatedAt: string;
}

interface DemandRow {
  category: string;
  location: string;
  bedrooms: number | null;
  maxBudget: number | null;
  people: number;
  unmet: number;
  lastAt: string;
}
interface Demand {
  visitors: number;
  movingSoon: number;
  rows: DemandRow[];
  topLocations: { name: string; people: number }[];
  topCategories: { name: string; people: number }[];
}

const CATEGORY_NAME: Record<string, string> = {
  rental_units: "Rentals",
  for_sale: "For sale",
  furnished_houses: "BnBs",
  bank_sales: "Bank sales",
  any: "Any kind",
};

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
};

const money = (n?: number | null) => (n ? `UGX ${new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 }).format(n)}` : "");

const whatsappLink = (phone: string) => `https://wa.me/${phone.replace(/\D/g, "")}`;

type View = "all" | "movers" | "demand";

export default function AdminKevinLeads() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Lead[]>([]);
  const [demand, setDemand] = useState<Demand | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("all");

  const load = async () => {
    setLoading(true);
    try {
      const [leadsRes, demandRes] = await Promise.all([
        fetch("/api/admin/kevin-leads", { credentials: "include" }),
        fetch("/api/admin/kevin-demand", { credentials: "include" }),
      ]);
      const data = await leadsRes.json().catch(() => []);
      if (!leadsRes.ok) throw new Error((data as any)?.message || "Failed to load leads.");
      setRows(Array.isArray(data) ? data : []);
      if (demandRes.ok) setDemand(await demandRes.json().catch(() => null));
    } catch (err: any) {
      toast({ title: "Couldn't load leads", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const movers = useMemo(() => rows.filter((l) => l.movingSoon), [rows]);
  const shown = view === "movers" ? movers : rows;

  const tab = (id: View, label: string, count?: number) => (
    <Button
      key={id}
      variant={view === id ? "default" : "outline"}
      size="sm"
      onClick={() => setView(id)}
      aria-pressed={view === id}
    >
      {label}
      {count !== undefined && <span className="ml-1.5 opacity-70">({count})</span>}
    </Button>
  );

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-7 w-7 text-accent" /> Leads from Kevin
          </h1>
          <p className="text-muted-foreground mt-1">
            Visitors who told Kevin their name, what they are looking for and how to reach them. Each one is also sent to
            your email as it happens.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Refresh
        </Button>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {tab("all", "Everyone", rows.length)}
        {tab("movers", "Shifting soon", movers.length)}
        {tab("demand", "What to add")}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : view === "demand" ? (
        <DemandView demand={demand} />
      ) : shown.length === 0 ? (
        <Card>
          <CardContent className="text-center py-16 text-muted-foreground">
            {view === "movers"
              ? "Nobody has said they are shifting soon yet. They appear here as soon as someone does."
              : "No leads yet. They appear here as visitors chat with Kevin."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {shown.map((lead) => (
            <Card key={lead.sessionId} className={lead.movingSoon ? "border-amber-400/60" : undefined}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-lg font-semibold">{lead.name || "Name not given"}</p>
                    <p className="text-sm text-muted-foreground break-words">
                      {[lead.email, lead.phone].filter(Boolean).join(" · ") || "No contact details"}
                      {lead.phone && (
                        <a
                          href={whatsappLink(lead.phone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 inline-flex items-center gap-1 text-emerald-600 hover:underline"
                        >
                          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                        </a>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {lead.movingSoon && (
                      <Badge className="bg-amber-500 text-black hover:bg-amber-500">
                        <Truck className="h-3 w-3 mr-1" /> Shifting soon{lead.moveTiming ? `: ${lead.moveTiming}` : ""}
                      </Badge>
                    )}
                    {lead.accountEmail && <Badge variant="secondary">Account: {lead.accountEmail}</Badge>}
                    {lead.declined && <Badge variant="outline">Declined to share contact</Badge>}
                    {lead.language && <Badge variant="outline">{lead.language}</Badge>}
                  </div>
                </div>
                {(lead.need || lead.location || lead.budget || lead.maxBudget) && (
                  <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                    {lead.need && (
                      <div className="sm:col-span-3">
                        <dt className="text-muted-foreground">Looking for</dt>
                        <dd>{lead.need}</dd>
                      </div>
                    )}
                    {lead.location && (
                      <div>
                        <dt className="text-muted-foreground">Area</dt>
                        <dd>{lead.location}</dd>
                      </div>
                    )}
                    {(lead.budget || lead.maxBudget) && (
                      <div>
                        <dt className="text-muted-foreground">Budget</dt>
                        <dd>{lead.budget || [money(lead.minBudget), money(lead.maxBudget)].filter(Boolean).join(" – ")}</dd>
                      </div>
                    )}
                  </dl>
                )}
                {lead.interest && lead.interest.length > 0 && (
                  <p className="mt-3 text-sm">
                    <span className="text-muted-foreground">Asked on WhatsApp about: </span>
                    {lead.interest.map((i) => i.title).join(", ")}
                  </p>
                )}
                <p className="mt-3 text-xs text-muted-foreground">Last updated {when(lead.updatedAt)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function DemandView({ demand }: { demand: Demand | null }) {
  if (!demand || demand.rows.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-16 text-muted-foreground">
          Nothing to show yet. As visitors tell Kevin what they want (type, area, bedrooms, budget) it is counted here.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Visitors who said what they want</p>
            <p className="text-2xl font-bold">{demand.visitors}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Shifting soon</p>
            <p className="text-2xl font-bold">{demand.movingSoon}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Most asked-for areas</p>
            <p className="text-sm font-medium">
              {demand.topLocations.slice(0, 4).map((l) => `${l.name} (${l.people})`).join(", ") || "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="p-4 text-left text-muted-foreground">
              Properties people ask for. "Found nothing" counts visitors whose search had no exact match: those are the ones worth adding.
            </caption>
            <thead>
              <tr className="border-y bg-muted/40 text-left">
                <th className="px-4 py-2 font-medium">Kind</th>
                <th className="px-4 py-2 font-medium">Area</th>
                <th className="px-4 py-2 font-medium">Bedrooms</th>
                <th className="px-4 py-2 font-medium">Budget up to</th>
                <th className="px-4 py-2 font-medium text-right">People</th>
                <th className="px-4 py-2 font-medium text-right">Found nothing</th>
              </tr>
            </thead>
            <tbody>
              {demand.rows.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-4 py-2">{CATEGORY_NAME[r.category] ?? r.category}</td>
                  <td className="px-4 py-2">{r.location}</td>
                  <td className="px-4 py-2">{r.bedrooms ?? "any"}</td>
                  <td className="px-4 py-2">{money(r.maxBudget) || "any"}</td>
                  <td className="px-4 py-2 text-right font-medium">{r.people}</td>
                  <td className="px-4 py-2 text-right">
                    {r.unmet > 0 ? <Badge className="bg-red-500 hover:bg-red-500">{r.unmet}</Badge> : "0"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
