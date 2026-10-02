import { Link } from "wouter";
import { PageSeo } from "@/components/seo/PageSeo";
import Breadcrumbs from "@/components/seo/Breadcrumbs";
import { GUIDES, GUIDE_AUTHOR } from "@shared/guides";
import { getSiteUrl } from "@/lib/siteUrl";

export default function GuidesPage() {
  const base = getSiteUrl();
  return (
    <div className="container mx-auto px-6 py-10">
      <PageSeo
        title="Guides: Buying, Renting and Booking in Africa | RealEVR Estates"
        description="Plain-language guides to buying a house in Uganda, renting in Kampala, avoiding property scams, bank auctions, and buying with Bitcoin."
        canonicalPath="/guides"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "RealEVR Estates guides",
          url: `${base}/guides`,
          hasPart: GUIDES.map((g) => ({ "@type": "Article", headline: g.title, url: `${base}/guides/${g.slug}` })),
        }}
      />
      <div className="mx-auto max-w-3xl">
        <Breadcrumbs trail={[{ label: "Home", path: "/" }, { label: "Guides" }]} />
        <h1 className="mb-3 font-display text-3xl font-bold">Guides to buying, renting and booking a home</h1>
        <p className="mb-8 text-muted-foreground">Short, practical answers to the questions people ask before they pay. Written by the {GUIDE_AUTHOR.name}.</p>
        <ul className="space-y-6">
          {GUIDES.map((g) => (
            <li key={g.slug}>
              <h2 className="text-xl font-semibold">
                <Link href={`/guides/${g.slug}`} className="hover:underline">{g.title}</Link>
              </h2>
              <p className="mt-1 text-muted-foreground">{g.description}</p>
              <p className="mt-1 text-xs text-muted-foreground">Updated <time dateTime={g.updated}>{new Date(g.updated).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</time></p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
