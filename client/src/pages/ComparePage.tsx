import { Link, useRoute } from "wouter";
import { PageSeo } from "@/components/seo/PageSeo";
import Breadcrumbs from "@/components/seo/Breadcrumbs";
import RelatedLinks from "@/components/seo/RelatedLinks";
import NotFound from "@/pages/not-found";
import { COMPARE_REVIEWED, COMPARISONS, comparisonBySlug, REALEVR_FACTS } from "@shared/compare";
import { SITE_NAME } from "@shared/seo";

export default function ComparePage() {
  const [, params] = useRoute<{ slug: string }>("/compare/:slug");
  const c = params ? comparisonBySlug(params.slug) : undefined;
  if (!c) return <NotFound />;
  const title = `${SITE_NAME} vs ${c.other}: Which Should You Use in ${c.region}?`;
  const reviewed = new Date(COMPARE_REVIEWED).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return (
    <div className="container mx-auto px-6 py-10">
      <PageSeo title={`${SITE_NAME} vs ${c.other}: Which Should You Use?`} description={c.description} canonicalPath={`/compare/${c.slug}`} />
      <article className="mx-auto max-w-3xl">
        <Breadcrumbs trail={[{ label: "Home", path: "/" }, { label: "Compare", path: "/compare" }, { label: `vs ${c.other}` }]} />
        <h1 className="mb-3 font-display text-3xl font-bold leading-tight">{title}</h1>
        <p className="mb-8 text-sm text-muted-foreground">Reviewed <time dateTime={COMPARE_REVIEWED}>{reviewed}</time> by the RealEVR Estates Editorial Team.</p>

        <section className="mb-8">
          <h2 className="mb-2 font-display text-xl font-bold">What is {c.other}?</h2>
          <p className="leading-relaxed">{c.other} is {c.otherIs}. See <a href={c.otherUrl} rel="noopener noreferrer nofollow" target="_blank" className="text-accent underline">{c.other}’s own site</a> for what it offers today.</p>
        </section>

        <section className="mb-8">
          <h2 className="mb-2 font-display text-xl font-bold">What is RealEVR Estates?</h2>
          <p className="leading-relaxed">RealEVR Estates is a property platform where every listing has a 360° virtual tour. It lists rentals, BnBs, homes for sale and bank auctions, starting in Uganda and across Africa.</p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 font-display text-xl font-bold">What does RealEVR Estates offer?</h2>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">What RealEVR Estates offers</caption>
              <tbody>
                {REALEVR_FACTS.map((f) => (
                  <tr key={f.label} className="border-b border-border last:border-0">
                    <th scope="row" className="w-2/5 bg-muted/40 p-3 font-medium">{f.label}</th>
                    <td className="p-3">{f.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="mb-2 font-display text-xl font-bold">When should you choose {c.other}?</h2>
          <ul className="list-disc space-y-2 pl-6 leading-relaxed">{c.chooseOther.map((x) => <li key={x}>{x}</li>)}</ul>
        </section>

        <section className="mb-8">
          <h2 className="mb-2 font-display text-xl font-bold">When should you choose RealEVR Estates?</h2>
          <ul className="list-disc space-y-2 pl-6 leading-relaxed">{c.chooseUs.map((x) => <li key={x}>{x}</li>)}</ul>
        </section>

        <section className="mb-8">
          <h2 className="mb-2 font-display text-xl font-bold">Can you use both?</h2>
          <p className="leading-relaxed">Yes. Many people browse more than one site. Use whichever gives you what you need, and take the 360° tour on RealEVR Estates before you decide to visit.</p>
        </section>

        <p className="rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">
          Information about {c.other} is general and comes from how it describes itself. It can change, so check {c.other} directly. Names belong to their owners; RealEVR Estates is not affiliated with {c.other}.
        </p>

        <RelatedLinks
          title="Related"
          links={[
            ...COMPARISONS.filter((x) => x.slug !== c.slug).map((x) => ({ label: `RealEVR Estates vs ${x.other}`, path: `/compare/${x.slug}` })),
            { label: "Homes for sale", path: "/for-sale" },
            { label: "Rental units", path: "/rental-units" },
            { label: "How RealEVR Estates works", path: "/how-it-works" },
          ]}
        />
        <p className="mt-6 text-sm"><Link href="/guides" className="text-accent underline">Read our buying and renting guides</Link></p>
      </article>
    </div>
  );
}
