import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  useMyAgentPortfolio,
  useSaveAgentPortfolio,
  useCreateAgentArticle,
  useUpdateAgentArticle,
  useDeleteAgentArticle,
  type AgentArticle,
} from "@/hooks/useAgentPortfolio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, Copy, MessageCircle, Facebook, Twitter, ExternalLink, Pencil, Trash2, Plus, ImagePlus } from "lucide-react";

/**
 * Uploads to the existing POST /api/upload/property-image route (already
 * S3-backed, already gated to admin/agent/property_manager) — reused as a
 * generic "give me an image URL" endpoint rather than building a second
 * upload pipeline just for portfolio images. See PropertyFormNew.tsx for
 * the identical pattern this mirrors.
 */
async function uploadImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("image", file);
  const res = await fetch("/api/upload/property-image", { method: "POST", body: formData, credentials: "include" });
  const result = await res.json();
  if (!res.ok || result.status !== "success") throw new Error(result.message || "Image upload failed");
  return result.imagePath as string;
}

function ImageUploadField({
  label,
  value,
  onChange,
  aspect = "aspect-video",
}: {
  label: string;
  value: string | undefined;
  onChange: (url: string) => void;
  aspect?: string;
}) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file);
      onChange(url);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className={`relative ${aspect} w-full max-w-sm overflow-hidden rounded-lg border border-dashed border-border bg-muted/40`}>
        {value ? (
          <img src={value} alt={label} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
            <ImagePlus className="h-6 w-6" />
            <span className="text-xs">No image yet</span>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="h-5 w-5 animate-spin text-white" />
          </div>
        )}
        <label className="absolute inset-0 cursor-pointer">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">Tap the box to upload a photo.</p>
    </div>
  );
}

function ShareCard({ shareUrl }: { shareUrl: string }) {
  const { toast } = useToast();
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({ title: "Link copied", description: "Paste it anywhere to promote your profile." });
    } catch {
      toast({ title: "Couldn't copy", description: shareUrl, variant: "destructive" });
    }
  };
  const whatsappShare = `https://wa.me/?text=${encodeURIComponent(`Check out my RealEVR Estates profile: ${shareUrl}`)}`;
  const facebookShare = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
  const twitterShare = `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent("Check out my listings on RealEVR Estates")}`;

  return (
    <div className="rounded-xl border border-accent/40 bg-accent/5 p-4">
      <p className="flex items-center gap-1.5 font-medium text-foreground">
        <ExternalLink className="h-4 w-4 text-accent" /> Your public portfolio
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Share this link anywhere — WhatsApp, Facebook, a business card QR code — so anyone can see your listings,
        reviews, and articles without needing an account.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input readOnly value={shareUrl} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={copyLink} className="gap-1.5">
            <Copy className="h-3.5 w-3.5" /> Copy
          </Button>
          <Button type="button" variant="outline" size="sm" asChild>
            <a href={shareUrl} target="_blank" rel="noopener noreferrer">
              View
            </a>
          </Button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" className="gap-1.5 bg-[#25D366] text-white hover:bg-[#1ebe57]" asChild>
          <a href={whatsappShare} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="h-3.5 w-3.5" fill="white" strokeWidth={0} /> WhatsApp
          </a>
        </Button>
        <Button type="button" size="sm" variant="outline" className="gap-1.5" asChild>
          <a href={facebookShare} target="_blank" rel="noopener noreferrer">
            <Facebook className="h-3.5 w-3.5" /> Facebook
          </a>
        </Button>
        <Button type="button" size="sm" variant="outline" className="gap-1.5" asChild>
          <a href={twitterShare} target="_blank" rel="noopener noreferrer">
            <Twitter className="h-3.5 w-3.5" /> X
          </a>
        </Button>
      </div>
    </div>
  );
}

function ArticleEditorForm({
  article,
  onSaved,
  onCancel,
}: {
  article: AgentArticle | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const createArticle = useCreateAgentArticle();
  const updateArticle = useUpdateAgentArticle();
  const [title, setTitle] = useState(article?.title ?? "");
  const [excerpt, setExcerpt] = useState(article?.excerpt ?? "");
  const [body, setBody] = useState(article?.body ?? "");
  const [coverImageUrl, setCoverImageUrl] = useState(article?.coverImageUrl);
  const [published, setPublished] = useState(article?.published ?? false);

  const isSaving = createArticle.isPending || updateArticle.isPending;

  const handleSave = async () => {
    if (!title.trim() || !body.trim()) {
      toast({ title: "Title and content are required", variant: "destructive" });
      return;
    }
    try {
      if (article) {
        await updateArticle.mutateAsync({ id: article.id, title, excerpt, body, coverImageUrl, published });
      } else {
        await createArticle.mutateAsync({ title, excerpt, body, coverImageUrl, published });
      }
      toast({ title: "Article saved" });
      onSaved();
    } catch (err: any) {
      toast({ title: "Couldn't save the article", description: err?.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-border p-4">
      <div className="space-y-1.5">
        <Label>Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="5 tips for first-time renters in Kampala" />
      </div>
      <div className="space-y-1.5">
        <Label>Short excerpt (optional)</Label>
        <Input value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="A one-line teaser shown on your profile" />
      </div>
      <ImageUploadField label="Cover image (optional)" value={coverImageUrl} onChange={setCoverImageUrl} />
      <div className="space-y-1.5">
        <Label>Content</Label>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder="Write your article, experience, or tip here…" />
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={published} onCheckedChange={setPublished} id="article-published" />
        <Label htmlFor="article-published" className="cursor-pointer font-normal">
          {published ? "Published — visible on your public page" : "Draft — only you can see this"}
        </Label>
      </div>
      <div className="flex gap-2">
        <Button type="button" onClick={handleSave} disabled={isSaving}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export default function AgentPortfolioEditor() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data, isLoading } = useMyAgentPortfolio(!!user);
  const savePortfolio = useSaveAgentPortfolio();
  const deleteArticle = useDeleteAgentArticle();

  const [tagline, setTagline] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const [coverImageUrl, setCoverImageUrl] = useState<string | undefined>();
  const [yearsExperience, setYearsExperience] = useState("");
  const [specialtiesText, setSpecialtiesText] = useState("");
  const [articleEditor, setArticleEditor] = useState<"new" | AgentArticle | null>(null);

  // Seed the form once the real data arrives — an empty dependency on
  // `data` re-running this every refetch would stomp on in-progress edits,
  // so this only fires the first time a portfolio actually loads.
  useEffect(() => {
    if (!data) return;
    setTagline(data.portfolio?.tagline ?? "");
    setBio(data.portfolio?.bio ?? "");
    setAvatarUrl(data.portfolio?.avatarUrl);
    setCoverImageUrl(data.portfolio?.coverImageUrl);
    setYearsExperience(data.portfolio?.yearsExperience != null ? String(data.portfolio.yearsExperience) : "");
    setSpecialtiesText((data.portfolio?.specialties ?? []).join(", "));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!data]);

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!user || (user.role !== "agent" && user.role !== "admin")) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        A public portfolio is available for agent and admin accounts.
      </p>
    );
  }

  const handleSave = async () => {
    try {
      await savePortfolio.mutateAsync({
        tagline,
        bio,
        avatarUrl,
        coverImageUrl,
        yearsExperience: yearsExperience.trim() ? Number(yearsExperience) : undefined,
        specialties: specialtiesText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      toast({ title: "Portfolio saved", description: "Your public page is up to date." });
    } catch (err: any) {
      toast({ title: "Couldn't save", description: err?.message, variant: "destructive" });
    }
  };

  const handleDeleteArticle = async (id: number) => {
    if (!confirm("Delete this article? This can't be undone.")) return;
    try {
      await deleteArticle.mutateAsync(id);
      toast({ title: "Article deleted" });
    } catch (err: any) {
      toast({ title: "Couldn't delete", description: err?.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-8">
      {data?.shareUrl && <ShareCard shareUrl={data.shareUrl} />}

      <div className="space-y-4">
        <h3 className="font-display text-lg text-foreground">Your public profile</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <ImageUploadField label="Profile photo" value={avatarUrl} onChange={setAvatarUrl} aspect="aspect-square max-w-[10rem]" />
          <ImageUploadField label="Cover photo" value={coverImageUrl} onChange={setCoverImageUrl} />
        </div>
        <div className="space-y-1.5">
          <Label>Tagline</Label>
          <Input value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={140} placeholder="Helping you find home in Kampala since 2019" />
        </div>
        <div className="space-y-1.5">
          <Label>Bio</Label>
          <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={5} placeholder="Tell tenants and buyers about your experience, what you specialize in, and why they should work with you." />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Years of experience</Label>
            <Input type="number" min={0} value={yearsExperience} onChange={(e) => setYearsExperience(e.target.value)} placeholder="5" />
          </div>
          <div className="space-y-1.5">
            <Label>Specialties (comma-separated)</Label>
            <Input value={specialtiesText} onChange={(e) => setSpecialtiesText(e.target.value)} placeholder="BnBs, Bank Sales, Kampala" />
            {specialtiesText.trim() && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {specialtiesText.split(",").map((s) => s.trim()).filter(Boolean).map((s) => (
                  <Badge key={s} variant="outline">{s}</Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        <Button type="button" onClick={handleSave} disabled={savePortfolio.isPending}>
          {savePortfolio.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save profile
        </Button>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg text-foreground">Articles & experiences</h3>
          {articleEditor === null && (
            <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setArticleEditor("new")}>
              <Plus className="h-4 w-4" /> Write an article
            </Button>
          )}
        </div>

        {articleEditor === "new" && (
          <ArticleEditorForm article={null} onSaved={() => setArticleEditor(null)} onCancel={() => setArticleEditor(null)} />
        )}
        {articleEditor && articleEditor !== "new" && (
          <ArticleEditorForm article={articleEditor} onSaved={() => setArticleEditor(null)} onCancel={() => setArticleEditor(null)} />
        )}

        {(!data?.articles || data.articles.length === 0) && articleEditor === null && (
          <p className="text-sm text-muted-foreground">
            Nothing published yet — share a tip, a market update, or a moving-in guide. Articles you publish show up
            on your public profile page.
          </p>
        )}

        {articleEditor === null && data?.articles && data.articles.length > 0 && (
          <div className="space-y-2">
            {data.articles.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-foreground">{a.title}</p>
                    <Badge variant={a.published ? "default" : "secondary"}>{a.published ? "Published" : "Draft"}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(a.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button type="button" size="icon" variant="ghost" onClick={() => setArticleEditor(a)} aria-label="Edit">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" onClick={() => handleDeleteArticle(a.id)} aria-label="Delete">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
