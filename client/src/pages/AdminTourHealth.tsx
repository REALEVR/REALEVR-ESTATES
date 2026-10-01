import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, RefreshCw, Video, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/**
 * Does every property's virtual tour load? (backs server/gene/tour-health.ts via GET /api/admin/tour-health
 * and POST /api/admin/tour-health/run.) The server opens every listed tour the way a visitor's browser would
 * every six hours, and tells the administrators (dashboard bell, email, WhatsApp) the moment one fails.
 * This page shows the same state and lets you check right now.
 */

interface Row {
  propertyId: number;
  title: string;
  tourUrl: string;
  ok: boolean;
  reason?: string;
  firstFailedAt?: string;
  lastCheckedAt: string;
}
interface Health {
  total: number;
  failing: number;
  lastCheckedAt: string | null;
  rows: Row[];
}

const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "never");

export default function AdminTourHealth() {
  const { toast } = useToast();
  const [data, setData] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/tour-health", { credentials: "include" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message || "Failed to load.");
      setData(body);
    } catch (err: any) {
      toast({ title: "Couldn't load the tour checks", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const checkNow = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/admin/tour-health/run", { method: "POST", credentials: "include" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message || "The check failed.");
      toast({
        title: body.failing ? `${body.failing} tour${body.failing === 1 ? "" : "s"} not loading` : "Every tour loads",
        description: `Checked ${body.checked} tour${body.checked === 1 ? "" : "s"}.${body.notified ? " The administrators have been told." : ""}`,
        variant: body.failing ? "destructive" : "default",
      });
      await load();
    } catch (err: any) {
      toast({ title: "Couldn't run the check", description: err?.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const rows = data?.rows ?? [];

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <Video className="h-7 w-7 text-accent" /> Tour health
          </h1>
          <p className="mt-1 text-muted-foreground">
            Every listed property's virtual tour is opened the way a visitor's browser would, every six hours. When one
            does not load, the administrators are told by dashboard notification, email and WhatsApp.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading || running}>
            <RefreshCw className="mr-1 h-4 w-4" /> Refresh
          </Button>
          <Button size="sm" onClick={checkNow} disabled={running}>
            {running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
            Check now
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Tours listed</div>
                <div className="text-2xl font-bold">{data?.total ?? 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Not loading</div>
                <div className={`text-2xl font-bold ${data?.failing ? "text-destructive" : ""}`}>{data?.failing ?? 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Last checked</div>
                <div className="text-base font-semibold">{when(data?.lastCheckedAt)}</div>
              </CardContent>
            </Card>
          </div>

          {rows.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                Nothing checked yet. Press “Check now” to open every tour.
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-2">
              {rows.map((r) => (
                <li key={r.propertyId}>
                  <Card className={r.ok ? "" : "border-destructive/50"}>
                    <CardContent className="flex flex-wrap items-center gap-3 p-4">
                      {r.ok ? (
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" aria-label="Loads" />
                      ) : (
                        <XCircle className="h-5 w-5 shrink-0 text-destructive" aria-label="Does not load" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">
                          <Link href={`/property/${r.propertyId}`} className="hover:underline">
                            {r.title}
                          </Link>{" "}
                          <span className="text-xs font-normal text-muted-foreground">#{r.propertyId}</span>
                        </div>
                        {r.ok ? (
                          <div className="text-xs text-muted-foreground">Loads. Checked {when(r.lastCheckedAt)}.</div>
                        ) : (
                          <div className="text-sm text-destructive">
                            {r.reason} <span className="text-xs text-muted-foreground">Broken since {when(r.firstFailedAt)}.</span>
                          </div>
                        )}
                      </div>
                      {!r.ok && (
                        <div className="flex gap-2">
                          <Badge variant="destructive">Not loading</Badge>
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/admin/virtual-tour-manager?propertyId=${r.propertyId}`}>Fix it</Link>
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
