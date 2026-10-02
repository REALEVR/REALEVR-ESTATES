import { Link } from "wouter";
import { PageSeo } from "@/components/seo/PageSeo";
import Breadcrumbs from "@/components/seo/Breadcrumbs";
import { COMPARISONS } from "@shared/compare";

export default function CompareIndexPage() {
  return (
    <div className="container mx-auto px-6 py-10">
      <PageSeo
        title="RealEVR Estates vs Other Property Sites: Comparisons"
        description="How RealEVR Estates compares with Lamudi, BuyRentKenya, Property24 and Airbnb, and when each is the better choice for renting, buying or booking."
        canonicalPath="/compare"
      />
      <div className="mx-auto max-w-3xl">
        <Breadcrumbs trail={[{ label: "Home", path: "/" }, { label: "Compare" }]} />
        <h1 className="mb-3 font-display text-3xl font-bold">RealEVR Estates compared with other property sites</h1>
        <p className="mb-8 text-muted-foreground">Which site fits you depends on what you need. These pages say plainly where each one is the better choice.</p>
        <ul className="space-y-5">
          {COMPARISONS.map((c) => (
            <li key={c.slug}>
              <h2 className="text-xl font-semibold">
                <Link href={`/compare/${c.slug}`} className="hover:underline">RealEVR Estates vs {c.other}</Link>
              </h2>
              <p className="mt-1 text-muted-foreground">{c.description}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
