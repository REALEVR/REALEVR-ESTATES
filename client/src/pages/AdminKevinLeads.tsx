import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/**
 * Everyone who told Kevin who they are and what they need (backs
 * server/gene/kevin-leads.ts via GET /api/admin/kevin-leads). Strict admin
 * only: it is visitors' personal details. A lead tied to a RealEVR account
 * (signed in, or the email they gave belongs to one) is marked so, which is
 * how a Gmail/Google sign-in and a chat conversation end up on one record.
 */

interface Lead {
  sessionId: string;
  name?: string;
  email?: string;
  phone?: string;
  need?: string;
  location?: string;
  budget?: string;
  language?: string;
  declined?: boolean;
  userId?: number;
  accountEmail?: string;
  createdAt: string;
  updatedAt: string;
}

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
};

export default function AdminKevinLeads() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/kevin-leads", { credentials: "include" });
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error((data as any)?.message || "Failed to load leads.");
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast({ title: "Couldn't load leads", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

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

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="text-center py-16 text-muted-foreground">
            No leads yet. They appear here as visitors chat with Kevin.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((lead) => (
            <Card key={lead.sessionId}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-lg font-semibold">{lead.name || "Name not given"}</p>
                    <p className="text-sm text-muted-foreground break-words">
                      {[lead.email, lead.phone].filter(Boolean).join(" · ") || "No contact details"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {lead.accountEmail && <Badge variant="secondary">Account: {lead.accountEmail}</Badge>}
                    {lead.declined && <Badge variant="outline">Declined to share contact</Badge>}
                    {lead.language && <Badge variant="outline">{lead.language}</Badge>}
                  </div>
                </div>
                {(lead.need || lead.location || lead.budget) && (
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
                    {lead.budget && (
                      <div>
                        <dt className="text-muted-foreground">Budget</dt>
                        <dd>{lead.budget}</dd>
                      </div>
                    )}
                  </dl>
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
