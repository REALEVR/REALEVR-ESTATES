import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, Settings2, Sparkles } from "lucide-react";
import {
  useAgentChatHistory,
  useAgentMarketInsight,
  useAgentNews,
  useAgentProfile,
  useAgentRecommendations,
  useSendAgentChatMessage,
  type AgentProfile,
} from "@/hooks/useAgent";
import AgentOnboarding from "./AgentOnboarding";

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-UG", { style: "currency", currency, maximumFractionDigits: 0 }).format(
      amount
    );
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

interface AgentPanelProps {
  onClose?: () => void;
}

export default function AgentPanel({ onClose }: AgentPanelProps) {
  const profileQuery = useAgentProfile(true);
  const profile = profileQuery.data?.profile ?? null;
  const hasProfile = !!profile;

  const [editingProfile, setEditingProfile] = useState(false);
  const [tab, setTab] = useState("chat");

  if (profileQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!hasProfile || editingProfile) {
    return (
      <div className="px-1 py-2">
        {hasProfile && (
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-lg text-foreground">Edit your profile</h3>
            <Button variant="ghost" size="sm" onClick={() => setEditingProfile(false)}>
              Cancel
            </Button>
          </div>
        )}
        {!hasProfile && (
          <h3 className="mb-1 font-display text-lg text-foreground">Meet your RealEVR agent</h3>
        )}
        <AgentOnboarding existingProfile={profile} onSaved={() => setEditingProfile(false)} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-display text-base text-foreground">My RealEVR Agent</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setEditingProfile(true)} title="Edit profile">
          <Settings2 className="h-4 w-4" />
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="matches">Matches</TabsTrigger>
          <TabsTrigger value="insight">Insight</TabsTrigger>
          <TabsTrigger value="news">News</TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="flex-1 overflow-hidden">
          <ChatTab profile={profile} />
        </TabsContent>
        <TabsContent value="matches" className="flex-1 overflow-y-auto">
          <MatchesTab active={tab === "matches"} />
        </TabsContent>
        <TabsContent value="insight" className="flex-1 overflow-y-auto">
          <InsightTab active={tab === "insight"} />
        </TabsContent>
        <TabsContent value="news" className="flex-1 overflow-y-auto">
          <NewsTab active={tab === "news"} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ChatTab({ profile }: { profile: AgentProfile }) {
  const historyQuery = useAgentChatHistory(true);
  const sendMessage = useSendAgentChatMessage();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = historyQuery.data?.messages ?? [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, sendMessage.isPending]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sendMessage.isPending) return;
    setDraft("");
    await sendMessage.mutateAsync(text);
  };

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <p className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
            Ask me anything — "what fits my budget in Ntinda?", "any bank sales worth a look?", or "show me
            more like this."
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
              m.role === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : "bg-muted text-foreground"
            }`}
          >
            {m.text}
          </div>
        ))}
        {sendMessage.isPending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
          </div>
        )}
      </div>
      <div className="mt-3 flex items-end gap-2 border-t border-border pt-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Message your agent…"
          className="min-h-[42px] flex-1 resize-none"
          rows={1}
        />
        <Button size="icon" onClick={handleSend} disabled={!draft.trim() || sendMessage.isPending}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function MatchesTab({ active }: { active: boolean }) {
  const recsQuery = useAgentRecommendations(active);

  if (recsQuery.isLoading) {
    return (
      <div className="flex h-32 items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!recsQuery.data || recsQuery.data.recommendations.length === 0) {
    return (
      <p className="p-2 text-sm text-muted-foreground">
        No strong matches yet — as you browse and save properties I'll sharpen these.
      </p>
    );
  }

  const { summary, recommendations, usedAi } = recsQuery.data;

  return (
    <div className="space-y-4 py-1">
      <p className="rounded-lg bg-muted/60 p-3 text-sm leading-relaxed text-foreground">{summary}</p>
      <div className="space-y-3">
        {recommendations.map(({ property, reasons }) => (
          <Link
            key={property.id}
            href={`/property/${property.id}`}
            className="block overflow-hidden rounded-xl border border-border transition-shadow hover:shadow-md"
          >
            <div className="flex gap-3">
              <img
                src={property.imageUrl}
                alt={property.title}
                className="h-20 w-24 flex-shrink-0 object-cover"
              />
              <div className="min-w-0 flex-1 py-2 pr-3">
                <p className="truncate font-medium text-foreground">{property.title}</p>
                <p className="text-xs text-muted-foreground">{property.location}</p>
                <p className="mt-0.5 text-sm font-semibold text-primary">
                  {formatMoney(property.price, property.currency)}
                </p>
                {reasons[0] && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{reasons[0]}</p>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
      {!usedAi && (
        <p className="text-xs text-muted-foreground">
          Showing rule-based matches (AI summary unavailable right now).
        </p>
      )}
    </div>
  );
}

function InsightTab({ active }: { active: boolean }) {
  const insightQuery = useAgentMarketInsight(active);

  if (insightQuery.isLoading) {
    return (
      <div className="flex h-32 items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!insightQuery.data || insightQuery.data.areas.length === 0) {
    return <p className="p-2 text-sm text-muted-foreground">Not enough listing data yet to rank areas.</p>;
  }

  const { narrative, areas } = insightQuery.data;

  return (
    <div className="space-y-4 py-1">
      <p className="rounded-lg bg-muted/60 p-3 text-sm leading-relaxed text-foreground">{narrative}</p>
      <div className="space-y-2">
        {areas.map((a) => (
          <div key={a.location} className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <p className="font-medium text-foreground">{a.location}</p>
              <Badge variant="secondary">{a.count} listing{a.count === 1 ? "" : "s"}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Avg. {formatMoney(a.avgPrice, a.currency)} · {a.availablePct}% available
            </p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Based on RealEVR Estates' current listings — a snapshot, not a historical trend.
      </p>
    </div>
  );
}

function NewsTab({ active }: { active: boolean }) {
  const newsQuery = useAgentNews(active);

  if (newsQuery.isLoading) {
    return (
      <div className="flex h-32 items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!newsQuery.data?.configured) {
    return (
      <p className="p-2 text-sm text-muted-foreground">
        World real-estate news isn't connected yet for this site — check back soon.
      </p>
    );
  }

  if (newsQuery.data.items.length === 0) {
    return <p className="p-2 text-sm text-muted-foreground">No fresh headlines right now — check back later.</p>;
  }

  return (
    <div className="space-y-3 py-1">
      {newsQuery.data.items.map((item) => (
        <a
          key={item.url}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
        >
          <p className="text-sm font-medium leading-snug text-foreground">{item.title}</p>
          {item.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
          )}
          <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            {item.source ?? "News"}
          </p>
        </a>
      ))}
    </div>
  );
}
