import { Link, useRoute } from "wouter";
import { PageSeo } from "@/components/seo/PageSeo";
import Breadcrumbs from "@/components/seo/Breadcrumbs";
import RelatedLinks from "@/components/seo/RelatedLinks";
import NotFound from "@/pages/not-found";
import { getSiteUrl } from "@/lib/siteUrl";
import { guideBySlug, GUIDE_AUTHOR } from "@shared/guides";
import AdSlot from "@/components/ads/AdSlot";
import { DEFAULT_OG_IMAGE_PATH, SITE_NAME } from "@shared/seo";

const fmt = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export default function GuideArticlePage() {
  const [, params] = useRoute<{ slug: string }>("/guides/:slug");
  const guide = params ? guideBySlug(params.slug) : undefined;
  if (!guide) return <NotFound />;
  const base = getSiteUrl();
  const path = `/guides/${guide.slug}`;
  return (
    <div className="container mx-auto px-6 py-10">
      <PageSeo
        title={`${guide.title} | ${SITE_NAME}`.length > 65 ? guide.title : `${guide.title} | ${SITE_NAME}`}
        description={guide.description}
        canonicalPath={path}
        type="article"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: guide.title,
          description: guide.description,
          image: `${base}${DEFAULT_OG_IMAGE_PATH}`,
          datePublished: guide.published,
          dateModified: guide.updated,
          author: { "@type": "Organization", name: GUIDE_AUTHOR.name, url: `${base}${GUIDE_AUTHOR.path}` },
          publisher: { "@type": "Organization", name: SITE_NAME, url: base || undefined },
          mainEntityOfPage: `${base}${path}`,
        }}
      />
      <article className="mx-auto max-w-3xl">
        <Breadcrumbs trail={[{ label: "Home", path: "/" }, { label: "Guides", path: "/guides" }, { label: guide.title }]} />
        <h1 className="mb-3 font-display text-3xl font-bold leading-tight">{guide.title}</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          By <Link href={GUIDE_AUTHOR.path} className="underline">{GUIDE_AUTHOR.name}</Link> · Published <time dateTime={guide.published}>{fmt(guide.published)}</time>
          {guide.updated !== guide.published && <> · Updated <time dateTime={guide.updated}>{fmt(guide.updated)}</time></>}
        </p>
        <p className="mb-8 rounded-2xl bg-muted/60 p-4 text-base font-medium leading-relaxed">{guide.summary}</p>
        {guide.sections.map((s) => (
          <section key={s.heading} className="mb-8">
            <h2 className="mb-3 font-display text-xl font-bold">{s.heading}</h2>
            {s.paras?.map((p) => <p key={p} className="mb-3 leading-relaxed text-foreground/90">{p}</p>)}
            {s.steps && <ol className="mb-3 list-decimal space-y-2 pl-6 leading-relaxed">{s.steps.map((x) => <li key={x}>{x}</li>)}</ol>}
            {s.bullets && <ul className="mb-3 list-disc space-y-2 pl-6 leading-relaxed">{s.bullets.map((x) => <li key={x}>{x}</li>)}</ul>}
          </section>
        ))}
        <RelatedLinks links={[...guide.related, { label: "All guides", path: "/guides" }]} />
      </article>
      <AdSlot />
    </div>
  );
}
