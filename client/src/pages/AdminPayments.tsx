import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Copy, KeyRound, Landmark, Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/**
 * Where fees are paid, and how a payment is recognised without anyone looking (backs
 * server/gene/payment-settings.ts). The payee details are shown only to signed-in people who owe a fee.
 */

interface Settings {
  methodLabel: string;
  accountName: string;
  accountNumber: string;
  instructions: string;
  ugxPerUsd: number;
  autoConfirm: boolean;
  tokenSet: boolean;
}
interface Notice {
  id: number;
  at: string;
  source: string;
  text: string;
  amount?: number;
  currency?: string;
  status: "matched" | "unmatched" | "duplicate" | "ignored";
  matchedTo?: string;
  note?: string;
}

const STATUS_LABEL: Record<Notice["status"], string> = {
  matched: "Confirmed a payment",
  unmatched: "Waiting for a match",
  duplicate: "Already received",
  ignored: "Not a receipt",
};

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message || "Something went wrong.");
  return body;
}

export default function AdminPayments() {
  const { toast } = useToast();
  const [form, setForm] = useState<Settings | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [preview, setPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState("");
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const d = await api("/api/admin/payment-settings");
      setForm(d.settings);
      setNotices(d.notices);
      setPreview(d.preview);
    } catch (e: any) {
      toast({ title: "Couldn't load payment settings", description: e.message, variant: "destructive" });
    }
  };
  useEffect(() => {
    load();
  }, []);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const d = await api("/api/admin/payment-settings", { method: "PUT", body: JSON.stringify(form) });
      setForm(d.settings);
      setPreview(d.preview);
      toast({ title: "Saved", description: "New payments will show these details." });
    } catch (e: any) {
      toast({ title: "Couldn't save", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const makeToken = async () => {
    try {
      const d = await api("/api/admin/payment-settings/token", { method: "POST" });
      setToken(d.token);
      setForm((f) => (f ? { ...f, tokenSet: true } : f));
    } catch (e: any) {
      toast({ title: "Couldn't make a token", description: e.message, variant: "destructive" });
    }
  };

  const sendPaste = async () => {
    setBusy(true);
    try {
      const d = await api("/api/admin/payment-notices", { method: "POST", body: JSON.stringify({ text: paste }) });
      toast({
        title: d.status === "matched" ? "Payment confirmed" : STATUS_LABEL[d.status as Notice["status"]],
        description: d.matchedTo || d.note || "It will confirm a payment as soon as someone submits its reference.",
      });
      setPaste("");
      await load();
    } catch (e: any) {
      toast({ title: "Couldn't read it", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (!form) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const endpoint = `${window.location.origin}/api/payments/inbound`;

  return (
    <div className="container mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <Landmark className="h-7 w-7 text-accent" /> Payments
        </h1>
        <p className="mt-1 text-muted-foreground">
          Where bidders and partners send fees, and how a payment is recognised on its own.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="text-lg font-semibold">Payment details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="method">Method</Label>
              <Input id="method" value={form.methodLabel} onChange={(e) => set("methodLabel", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Account name payers must see</Label>
              <Input id="name" value={form.accountName} onChange={(e) => set("accountName", e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="number">Account number, wallet number or merchant code</Label>
              <Input id="number" inputMode="text" autoComplete="off" value={form.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} placeholder="Where money can be sent to" />
              <p className="text-xs text-muted-foreground">
                Use a number that can <em>receive</em> money: a mobile-money wallet or merchant code, or a bank account. A virtual card number is made for spending and
                usually cannot be paid into. Never put a card's expiry date or security code here or anywhere on this site.
              </p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ins">Extra instructions (optional)</Label>
              <Textarea id="ins" rows={2} value={form.instructions} onChange={(e) => set("instructions", e.target.value)} />
            </div>
          </div>
          <div className="rounded-lg bg-muted/60 p-3 text-sm">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">What a payer sees</div>
            {preview}
          </div>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Save
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="text-lg font-semibold">Automatic confirmation</h2>
          <p className="text-sm text-muted-foreground">
            When the “money received” message reaches the server and someone has submitted the reference found in it, for about the right amount, their fee is confirmed
            at once and they are told. Anything unclear stays for you.
          </p>
          <div className="flex items-center gap-3">
            <Switch id="auto" checked={form.autoConfirm} onCheckedChange={(v) => set("autoConfirm", v)} />
            <Label htmlFor="auto">Confirm matching payments automatically</Label>
          </div>
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="rate">Local currency per US$1 (for Uganda shillings receipts)</Label>
            <Input id="rate" type="number" min={0} value={form.ugxPerUsd || ""} onChange={(e) => set("ugxPerUsd", Number(e.target.value))} placeholder="e.g. 3700" />
            <p className="text-xs text-muted-foreground">Leave empty and only dollar receipts confirm automatically. Save above after changing.</p>
          </div>

          <div className="rounded-lg border border-border p-4">
            <div className="mb-2 flex items-center gap-2 font-medium">
              <KeyRound className="h-4 w-4" /> Forward messages automatically
              <Badge variant={form.tokenSet ? "default" : "outline"}>{form.tokenSet ? "Connected key set" : "No key yet"}</Badge>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              On the phone that receives the money, install any “SMS forwarder” app and have it send each incoming message as a web request:
            </p>
            <ul className="mb-3 list-disc space-y-1 pl-5 text-sm">
              <li>Address: <code className="break-all">{endpoint}</code> (method POST)</li>
              <li>Header: <code>x-payment-token</code> with your key</li>
              <li>Body: JSON, <code>{`{"text": "<the message>"}`}</code></li>
            </ul>
            <Button variant="outline" size="sm" onClick={makeToken}>
              {form.tokenSet ? "Make a new key (the old one stops working)" : "Make a key"}
            </Button>
            {token && (
              <div className="mt-3 flex items-center gap-2 rounded-md bg-muted p-2 text-sm">
                <code className="min-w-0 flex-1 break-all">{token}</code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard?.writeText(token);
                    toast({ title: "Copied" });
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            )}
            {token && <p className="mt-2 text-xs text-destructive">Copy it now. It is not shown again.</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <h2 className="text-lg font-semibold">Paste a receipt</h2>
          <p className="text-sm text-muted-foreground">No forwarder? Paste the message you received. It is handled the same way.</p>
          <Textarea rows={3} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="You have received ... Transaction ID ..." />
          <Button onClick={sendPaste} disabled={busy || paste.trim().length < 10}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />} Read it
          </Button>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-2 text-lg font-semibold">Recent messages</h2>
        {notices.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet. They are deleted after 90 days.</p>
        ) : (
          <ul className="space-y-2">
            {notices.map((n) => (
              <li key={n.id} className="rounded-lg border border-border p-3 text-sm">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge variant={n.status === "matched" ? "default" : "outline"}>{STATUS_LABEL[n.status]}</Badge>
                  <span className="text-xs text-muted-foreground">
                    #{n.id} · {new Date(n.at).toLocaleString()} · {n.source === "forwarder" ? "forwarded" : "pasted"}
                  </span>
                  {n.amount != null && (
                    <span className="text-xs font-medium">
                      {n.currency} {n.amount.toLocaleString()}
                    </span>
                  )}
                </div>
                <p className="break-words text-muted-foreground">{n.text}</p>
                {n.matchedTo && <p className="mt-1 text-xs">{n.matchedTo}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
