import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, Mail, MessageCircle, Bell, Smartphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/**
 * Unified admin broadcast composer (GENE v1.8) — backs
 * server/gene/broadcast.ts. One message, up to four real channels. Strict
 * admin only. Shows a real reach estimate per channel before sending, and
 * real per-channel sent/failed counts after — never a blanket "sent to
 * everyone."
 */

type Channel = "email" | "whatsapp" | "notification" | "push";

const CHANNELS: Array<{ id: Channel; label: string; icon: React.ReactNode }> = [
  { id: "email", label: "Email", icon: <Mail className="h-4 w-4" /> },
  { id: "whatsapp", label: "WhatsApp", icon: <MessageCircle className="h-4 w-4" /> },
  { id: "notification", label: "In-app notification", icon: <Bell className="h-4 w-4" /> },
  { id: "push", label: "Browser push", icon: <Smartphone className="h-4 w-4" /> },
];

interface Reach {
  email: { reach: number };
  whatsapp: { reach: number; note?: string };
  notification: { reach: number };
  push: { reach: number; configured: boolean };
}

export default function AdminBroadcast() {
  const { toast } = useToast();
  const [reach, setReach] = useState<Reach | null>(null);
  const [selected, setSelected] = useState<Set<Channel>>(new Set<Channel>(["email"]));
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<any | null>(null);

  useEffect(() => {
    fetch("/api/gene/broadcast/reach", { credentials: "include" })
      .then((r) => r.json())
      .then(setReach)
      .catch(() => {});
  }, []);

  const toggle = (c: Channel) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  const totalReach = reach
    ? Array.from(selected).reduce((sum, c) => sum + (reach[c]?.reach ?? 0), 0)
    : 0;

  const send = async () => {
    if (!message.trim()) {
      toast({ title: "A message is required", variant: "destructive" });
      return;
    }
    if (selected.size === 0) {
      toast({ title: "Pick at least one channel", variant: "destructive" });
      return;
    }
    setSending(true);
    setResults(null);
    try {
      const res = await fetch("/api/gene/broadcast/send", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channels: Array.from(selected), subject, message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Broadcast failed.");
      setResults(data.results);
      toast({ title: "Broadcast sent" });
    } catch (err: any) {
      toast({ title: "Broadcast failed", description: err?.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Send className="h-7 w-7 text-accent" /> Broadcast
        </h1>
        <p className="text-muted-foreground mt-1">Send one message to everyone, across real channels.</p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Channels</CardTitle>
          <CardDescription>Estimated reach updates as you pick channels.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {CHANNELS.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-md border border-border p-3">
              <div className="flex items-center gap-2">
                <Checkbox id={`ch-${c.id}`} checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                <Label htmlFor={`ch-${c.id}`} className="flex items-center gap-2 cursor-pointer">
                  {c.icon} {c.label}
                </Label>
              </div>
              <div className="text-sm text-muted-foreground">
                {reach ? (
                  c.id === "push" && !reach.push.configured ? (
                    <Badge variant="outline">Not configured</Badge>
                  ) : (
                    `~${reach[c.id]?.reach.toLocaleString() ?? 0} reachable`
                  )
                ) : (
                  <Loader2 className="h-3 w-3 animate-spin" />
                )}
              </div>
            </div>
          ))}
          {reach?.whatsapp?.note && selected.has("whatsapp") && (
            <p className="text-xs text-muted-foreground">{reach.whatsapp.note}</p>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Message</CardTitle>
          <CardDescription>Used as the email subject / notification title, and the body across every channel.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="broadcast-subject">Subject / title</Label>
            <Input id="broadcast-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="RealEVR Estates" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="broadcast-message">Message</Label>
            <Textarea id="broadcast-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={6} placeholder="What do you want to tell everyone?" />
          </div>
        </CardContent>
      </Card>

      <Button className="w-full" size="lg" onClick={send} disabled={sending}>
        {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
        Send to ~{totalReach.toLocaleString()} across {selected.size || 0} channel{selected.size === 1 ? "" : "s"}
      </Button>

      {results && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(results).map(([channel, r]: [string, any]) => (
              <div key={channel} className="flex justify-between text-sm border-b border-border pb-2 last:border-0">
                <span className="capitalize font-medium">{channel}</span>
                <span className="text-muted-foreground">
                  {r.sent ?? 0} sent · {r.failed ?? 0} failed{r.attempted !== undefined ? ` of ${r.attempted}` : ""}
                  {r.reason ? ` — ${r.reason}` : ""}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
