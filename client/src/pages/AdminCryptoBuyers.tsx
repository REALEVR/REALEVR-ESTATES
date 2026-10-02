import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import BitcoinMark from "@/components/crypto/BitcoinMark";
import { CRYPTO_STATUS_LABEL, formatCoin, type CryptoQuote, type CryptoRequestStatus } from "@shared/crypto-buy";

/** People who asked to buy a home with Bitcoin or another digital currency (backs server/gene/crypto-buy.ts). */

interface Req {
  id: number;
  reference: string;
  propertyId: number;
  propertyTitle: string;
  price: number;
  currency: string;
  asset: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  note: string;
  quote: CryptoQuote | null;
  status: CryptoRequestStatus;
  adminNote?: string;
  createdAt: string;
}
interface Payload {
  settings: { enabled: boolean; assets: string[]; note: string };
  assets: Array<{ code: string; name: string }>;
  statuses: CryptoRequestStatus[];
  rate: { btcUsd: number; ethUsd: number | null; asOf: string; stale: boolean } | null;
  requests: Req[];
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message || "Something went wrong.");
  return body;
}

export default function AdminCryptoBuyers() {
  const { toast } = useToast();
  const [data, setData] = useState<Payload | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [assets, setAssets] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const d: Payload = await api("/api/admin/crypto-buy");
      setData(d);
      setEnabled(d.settings.enabled);
      setAssets(d.settings.assets);
      setNote(d.settings.note);
    } catch (e: any) {
      toast({ title: "Couldn't load", description: e.message, variant: "destructive" });
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api("/api/admin/crypto-buy/settings", { method: "PUT", body: JSON.stringify({ enabled, assets, note }) });
      toast({ title: "Saved" });
      await load();
    } catch (e: any) {
      toast({ title: "Couldn't save", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const update = async (id: number, patch: { status?: CryptoRequestStatus; adminNote?: string }) => {
    try {
      await api(`/api/admin/crypto-buy/requests/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      await load();
    } catch (e: any) {
      toast({ title: "Couldn't update", description: e.message, variant: "destructive" });
    }
  };

  if (!data) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div>
        <h1 className="flex items-center gap-2.5 text-3xl font-bold">
          <BitcoinMark size={32} /> Crypto buyers
        </h1>
        <p className="mt-1 text-muted-foreground">
          People who asked to buy a home with Bitcoin or another digital currency. Nothing is paid on the site: you confirm the seller accepts, check who the buyer is
          and where the money comes from, then send written instructions for an escrow or the seller's lawyer.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">The button</h2>
            <p className="text-sm text-muted-foreground">
              {data.rate ? (
                <>
                  1 BTC = US${Math.round(data.rate.btcUsd).toLocaleString()} · read {new Date(data.rate.asOf).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {data.rate.stale ? " (earlier reading, feeds unreachable)" : ""}
                </>
              ) : (
                "Live rates unreachable right now"
              )}
            </p>
          </div>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            Show "Buy with Bitcoin" on every home for sale
          </label>
          <div>
            <Label className="mb-2 block">Digital currencies on offer</Label>
            <div className="flex flex-wrap gap-2">
              {data.assets.map((a) => {
                const on = assets.includes(a.code);
                return (
                  <button
                    key={a.code}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setAssets((cur) => (on ? cur.filter((c) => c !== a.code) : [...cur, a.code]))}
                    className={`rounded-full border px-3.5 py-1.5 text-sm ${on ? "border-foreground bg-foreground text-background" : "border-border"}`}
                  >
                    {a.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cb-note">Message shown to buyers (optional)</Label>
            <Input id="cb-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={400} placeholder="e.g. Sellers decide whether they accept digital currency; we confirm within one working day." />
          </div>
          <Button onClick={save} disabled={saving || !assets.length}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Save
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Requests ({data.requests.length})</h2>
        {data.requests.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
        {data.requests.map((r) => {
          const coin = r.quote ? (r.asset === "ETH" && r.quote.eth ? formatCoin(r.quote.eth, "ETH") : r.asset === "USDT" || r.asset === "USDC" ? formatCoin(r.quote.usd, r.asset as any) : formatCoin(r.quote.btc, "BTC")) : null;
          return (
            <Card key={r.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      {r.name} <span className="font-normal text-muted-foreground">· {r.reference}</span>
                    </p>
                    <Link href={`/property/${r.propertyId}`} className="text-sm underline">
                      {r.propertyTitle}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {r.currency} {r.price.toLocaleString()} · wants to pay with {r.asset}
                      {coin ? ` (≈ ${coin} when asked)` : ""}
                    </p>
                  </div>
                  <Badge variant={r.status === "new" ? "default" : "secondary"}>{CRYPTO_STATUS_LABEL[r.status]}</Badge>
                </div>
                <p className="text-sm">
                  <a className="underline" href={`mailto:${r.email}`}>{r.email}</a> ·{" "}
                  <a className="underline" href={`https://wa.me/${r.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">{r.phone}</a>
                  {r.country ? ` · ${r.country}` : ""} · {new Date(r.createdAt).toLocaleString()}
                </p>
                {r.note && <p className="rounded-lg bg-muted/60 p-2.5 text-sm">{r.note}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                    value={r.status}
                    aria-label="Status"
                    onChange={(e) => update(r.id, { status: e.target.value as CryptoRequestStatus })}
                  >
                    {data.statuses.map((s) => (
                      <option key={s} value={s}>{CRYPTO_STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                  <Input
                    className="h-9 min-w-[12rem] flex-1"
                    placeholder="Your note (saved when you leave the box)"
                    defaultValue={r.adminNote || ""}
                    maxLength={600}
                    onBlur={(e) => e.target.value !== (r.adminNote || "") && update(r.id, { adminNote: e.target.value })}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
