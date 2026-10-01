import { useEffect, useState } from "react";
import { Loader2, ShieldQuestion } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface Req {
  id: number;
  reference: string;
  type: string;
  fullName: string;
  email: string;
  country: string;
  details: string;
  status: string;
  note?: string;
  createdAt: string;
  dueAt: string;
}
const STATUSES = ["received", "verifying", "in_progress", "completed", "refused"];

export default function AdminDataRequests() {
  const { toast } = useToast();
  const [data, setData] = useState<{ types: Record<string, string>; requests: Req[] } | null>(null);
  const load = async () => {
    try {
      const res = await fetch("/api/admin/data-requests", { credentials: "include" });
      if (!res.ok) throw new Error("Could not load.");
      setData(await res.json());
    } catch (e: any) {
      toast({ title: "Couldn't load", description: e.message, variant: "destructive" });
    }
  };
  useEffect(() => {
    load();
  }, []);
  const patch = async (id: number, body: object) => {
    const res = await fetch(`/api/admin/data-requests/${id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) load();
    else toast({ title: "Couldn't save", variant: "destructive" });
  };
  if (!data) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  const now = Date.now();
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-3xl font-bold"><ShieldQuestion className="h-7 w-7 text-accent" /> Data requests</h1>
      <p className="mt-1 text-muted-foreground">Access, correction, deletion and complaints from the “Your data rights” page. Each has a 30-day deadline. Check who is asking before you hand over or delete anything.</p>
      <ul className="mt-6 space-y-3">
        {data.requests.length === 0 && <li className="text-sm text-muted-foreground">No requests yet.</li>}
        {data.requests.map((r) => {
          const open = r.status !== "completed" && r.status !== "refused";
          const late = open && Date.parse(r.dueAt) < now;
          return (
            <li key={r.id}>
              <Card className={late ? "border-destructive/60" : ""}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{r.reference}</strong>
                    <Badge variant="outline">{data.types[r.type] ?? r.type}</Badge>
                    {late && <Badge variant="destructive">Overdue</Badge>}
                    <span className="text-xs text-muted-foreground">due {new Date(r.dueAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm">{r.fullName} · <a className="underline" href={`mailto:${r.email}`}>{r.email}</a>{r.country ? ` · ${r.country}` : ""}</p>
                  {r.details && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{r.details}</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    <select value={r.status} onChange={(e) => patch(r.id, { status: e.target.value })} className="rounded-md border border-input bg-background px-2 py-1 text-sm">
                      {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                    </select>
                    <Input defaultValue={r.note ?? ""} placeholder="Internal note" className="max-w-xs" onBlur={(e) => e.target.value !== (r.note ?? "") && patch(r.id, { note: e.target.value })} />
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
