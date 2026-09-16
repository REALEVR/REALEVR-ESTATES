import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { usePublicAgentPortfolio, type PublicAgentPortfolio } from "@/hooks/useAgentPortfolio";
import { PageSeo } from "@/components/seo/PageSeo";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  MessageCircle,
  Share2,
  Copy,
  Star,
  MapPin,
  BedDouble,
  Bath,
  Eye,
  Facebook,
  Award,
  Home as HomeIcon,
} from "lucide-react";
import { buildAgentPortfolioTitle, buildAgentPortfolioDescription, buildAgentPortfolioJsonLd } from "@shared/seo";

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          className={n <= Math.round(rating) ? "fill-[#FFB400] text-[#FFB400]" : "text-gray-300"}
        />
      ))}
    </div>
  );
}

function whatsAppHref(phone: string, agentName: string) {
  const text = `Hi ${agentName}, I found your profile on RealEVR Estates and I'm interested in your listings.`;
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

function PortfolioPropertyCard({ property }: { property: PublicAgentPortfolio["properties"][number] }) {
  return (
    <Link
      href={`/property/${property.id}`}
      className="group block overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-lg"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {property.imageUrl ? (
          <img
            src={property.imageUrl}
            alt={property.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <HomeIcon className="h-8 w-8" />
          </div>
        )}
        {property.hasTour && (
          <Badge className="absolute left-2 top-2 bg-black/70 text-white hover:bg-black/70">Virtual tour</Badge>
        )}
      </div>
      <div className="p-3">
        <p className="truncate font-medium text-foreground">{property.title}</p>
        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" /> {property.location}
        </p>
        <div className="mt-1.5 flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">
            {property.currency} {property.price?.toLocaleString()}
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <BedDouble className="h-3 w-3" /> {property.bedrooms}
            </span>
            <span className="flex items-center gap-0.5">
              <Bath className="h-3 w-3" /> {property.bathrooms}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function AgentPortfolioPage() {
  const [, params] = useRoute<{ username: string }>("/agent/:username");
  const username = params?.username;
  const { toast } = useToast();
  const { data, isLoading, error } = usePublicAgentPortfolio(username);
  const [openArticleId, setOpenArticleId] = useState<number | null>(null);

  const handleShare = async (shareUrl: string, agentName: string) => {
    const shareData = { title: `${agentName} on RealEVR Estates`, url: shareUrl };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
    } catch {
      // User cancelled the native share sheet, or it's unsupported — fall
      // through to copy-link rather than treating either as an error.
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({ title: "Link copied", description: "Share it anywhere — WhatsApp, Facebook, a text message." });
    } catch {
      toast({ title: "Couldn't copy the link", description: shareUrl, variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-10">
        <Skeleton className="h-48 w-full rounded-2xl" />
        <div className="mt-6 flex items-center gap-4">
          <Skeleton className="h-24 w-24 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-semibold text-foreground">Profile not found</h1>
        <p className="mt-2 text-muted-foreground">
          This agent hasn't set up a public portfolio yet, or the link is incorrect.
        </p>
        <Link href="/" className="mt-6 inline-block text-accent hover:underline">
          Back to RealEVR Estates
        </Link>
      </div>
    );
  }

  const { agent, portfolio, stats, properties, articles, reviews, shareUrl } = data;
  const openArticle = articles.find((a) => a.id === openArticleId);

  return (
    <div className="pb-16">
      <PageSeo
        title={buildAgentPortfolioTitle(agent)}
        description={buildAgentPortfolioDescription({ ...agent, ...stats })}
        canonicalPath={`/agent/${agent.username}`}
        image={portfolio.avatarUrl || undefined}
        type="article"
        jsonLd={buildAgentPortfolioJsonLd(
          typeof window !== "undefined" ? window.location.origin : "",
          { fullName: agent.fullName, bio: portfolio.bio, avatarUrl: portfolio.avatarUrl },
          `/agent/${agent.username}`
        )}
      />

      {/* Cover + avatar hero — deliberately styled after a Superhost-style
          profile card (cover photo, overlapping circular avatar, stat
          chips) since this page's whole purpose is "make a tenant feel
          confident in this agent," the same job that pattern does well. */}
      <div className="relative h-44 w-full overflow-hidden bg-gradient-to-br from-primary/90 to-primary sm:h-56">
        {portfolio.coverImageUrl && (
          <img src={portfolio.coverImageUrl} alt="" className="h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-black/10" />
      </div>

      <div className="container mx-auto max-w-5xl px-4">
        <div className="-mt-14 flex flex-col items-start gap-4 sm:-mt-16 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end">
            <Avatar className="h-28 w-28 border-4 border-background shadow-lg sm:h-32 sm:w-32">
              <AvatarImage src={portfolio.avatarUrl || undefined} alt={agent.fullName} />
              <AvatarFallback className="text-3xl">{agent.fullName.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">{agent.fullName}</h1>
                {agent.role === "admin" && <Badge variant="secondary">RealEVR Team</Badge>}
              </div>
              {agent.companyName && <p className="text-sm text-muted-foreground">{agent.companyName}</p>}
              {portfolio.tagline && <p className="mt-1 max-w-md text-muted-foreground">{portfolio.tagline}</p>}
            </div>
          </div>

          <div className="flex w-full gap-2 pb-1 sm:w-auto">
            {agent.phoneNumber && (
              <Button asChild className="flex-1 gap-2 bg-[#25D366] text-white hover:bg-[#1ebe57] sm:flex-none">
                <a href={whatsAppHref(agent.phoneNumber, agent.fullName)} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-4 w-4" fill="white" strokeWidth={0} /> Message on WhatsApp
                </a>
              </Button>
            )}
            <Button variant="outline" className="gap-2" onClick={() => handleShare(shareUrl, agent.fullName)}>
              <Share2 className="h-4 w-4" /> Share
            </Button>
          </div>
        </div>

        {/* Stat chips */}
        <div className="mt-6 flex flex-wrap gap-3">
          <div className="rounded-xl border border-border px-4 py-2.5 text-center">
            <p className="text-lg font-bold text-foreground">{stats.totalProperties}</p>
            <p className="text-xs text-muted-foreground">Listings</p>
          </div>
          {stats.totalReviews > 0 && (
            <div className="rounded-xl border border-border px-4 py-2.5 text-center">
              <div className="flex items-center justify-center gap-1">
                <Star className="h-4 w-4 fill-[#FFB400] text-[#FFB400]" />
                <p className="text-lg font-bold text-foreground">{stats.avgRating}</p>
              </div>
              <p className="text-xs text-muted-foreground">{stats.totalReviews} review{stats.totalReviews === 1 ? "" : "s"}</p>
            </div>
          )}
          {portfolio.yearsExperience != null && (
            <div className="rounded-xl border border-border px-4 py-2.5 text-center">
              <div className="flex items-center justify-center gap-1">
                <Award className="h-4 w-4 text-accent" />
                <p className="text-lg font-bold text-foreground">{portfolio.yearsExperience}</p>
              </div>
              <p className="text-xs text-muted-foreground">Year{portfolio.yearsExperience === 1 ? "" : "s"} experience</p>
            </div>
          )}
          {stats.totalViews > 0 && (
            <div className="rounded-xl border border-border px-4 py-2.5 text-center">
              <div className="flex items-center justify-center gap-1">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <p className="text-lg font-bold text-foreground">{stats.totalViews.toLocaleString()}</p>
              </div>
              <p className="text-xs text-muted-foreground">Listing views</p>
            </div>
          )}
        </div>

        {portfolio.specialties.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {portfolio.specialties.map((s) => (
              <Badge key={s} variant="outline">
                {s}
              </Badge>
            ))}
          </div>
        )}

        {portfolio.bio && (
          <div className="mt-8">
            <h2 className="font-display text-lg font-semibold text-foreground">About</h2>
            <p className="mt-2 whitespace-pre-line leading-relaxed text-muted-foreground">{portfolio.bio}</p>
          </div>
        )}

        {properties.length > 0 && (
          <div className="mt-10">
            <h2 className="font-display text-lg font-semibold text-foreground">Listings</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {properties.map((p) => (
                <PortfolioPropertyCard key={p.id} property={p} />
              ))}
            </div>
          </div>
        )}

        {articles.length > 0 && (
          <div className="mt-10">
            <h2 className="font-display text-lg font-semibold text-foreground">From {agent.fullName.split(" ")[0]}</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {articles.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setOpenArticleId(a.id)}
                  className="flex overflow-hidden rounded-xl border border-border bg-card text-left transition-shadow hover:shadow-md"
                >
                  {a.coverImageUrl && (
                    <img src={a.coverImageUrl} alt="" className="h-24 w-24 shrink-0 object-cover sm:h-28 sm:w-28" />
                  )}
                  <div className="min-w-0 p-3">
                    <p className="line-clamp-2 font-medium text-foreground">{a.title}</p>
                    {a.excerpt && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.excerpt}</p>}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {new Date(a.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {reviews.length > 0 && (
          <div className="mt-10">
            <h2 className="font-display text-lg font-semibold text-foreground">What tenants say</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {reviews.map((r, i) => (
                <div key={i} className="rounded-xl border border-border p-4">
                  <StarRow rating={r.rating} />
                  <p className="mt-2 text-sm leading-relaxed text-foreground">{r.comment}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {r.userName}
                    {r.propertyTitle ? ` · ${r.propertyTitle}` : ""}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bottom CTA — repeats the primary action for anyone who scrolled
            through the whole page before deciding to reach out. */}
        {agent.phoneNumber && (
          <div className="mt-12 rounded-2xl border border-border bg-muted/40 p-6 text-center">
            <p className="font-display text-lg font-semibold text-foreground">Looking for a place?</p>
            <p className="mt-1 text-sm text-muted-foreground">Message {agent.fullName.split(" ")[0]} directly on WhatsApp.</p>
            <Button asChild className="mt-4 gap-2 bg-[#25D366] text-white hover:bg-[#1ebe57]">
              <a href={whatsAppHref(agent.phoneNumber, agent.fullName)} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4" fill="white" strokeWidth={0} /> Message on WhatsApp
              </a>
            </Button>
          </div>
        )}

        <div className="mt-6 flex items-center justify-center gap-3 text-xs text-muted-foreground">
          <button onClick={() => handleShare(shareUrl, agent.fullName)} className="flex items-center gap-1 hover:text-foreground">
            <Copy className="h-3.5 w-3.5" /> Copy link to this page
          </button>
          <a
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-foreground"
          >
            <Facebook className="h-3.5 w-3.5" /> Share on Facebook
          </a>
        </div>
      </div>

      <Dialog open={!!openArticle} onOpenChange={(open) => !open && setOpenArticleId(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          {openArticle && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-xl">{openArticle.title}</DialogTitle>
              </DialogHeader>
              {openArticle.coverImageUrl && (
                <img src={openArticle.coverImageUrl} alt="" className="max-h-64 w-full rounded-lg object-cover" />
              )}
              <p className="whitespace-pre-line leading-relaxed text-foreground">{openArticle.body}</p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
