import type { ReactNode } from "react";
import { Link } from "wouter";
import { PageSeo } from "@/components/seo/PageSeo";

/** The shared frame of the legal pages: title, date, readable column, links to the rest of the legal set. */
export default function LegalPage({
  title,
  updated,
  path,
  description,
  children,
}: {
  title: string;
  updated: string;
  path: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="container mx-auto px-4 py-12">
      <PageSeo title={`${title} | RealEVR Estates`.length > 65 ? title : `${title} | RealEVR Estates`} description={description} canonicalPath={path} />
      <div className="mx-auto max-w-4xl rounded-lg bg-card p-8 shadow-sm">
        <h1 className="mb-2 font-display text-3xl font-bold">{title}</h1>
        <p className="mb-8 text-sm text-muted-foreground">Last updated: {updated}</p>
        <div className="legal-prose max-w-none space-y-4 leading-relaxed text-foreground/90 [&_a]:text-accent [&_a]:underline [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mt-5 [&_h3]:font-semibold [&_li]:ml-1 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
          {children}
        </div>
        <div className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-6 text-sm">
          <Link href="/legal" className="text-accent hover:underline">All legal information</Link>
          <Link href="/terms" className="text-accent hover:underline">Terms</Link>
          <Link href="/auction-terms" className="text-accent hover:underline">Auction terms</Link>
          <Link href="/bidder-vetting" className="text-accent hover:underline">Bidder vetting</Link>
          <Link href="/privacy" className="text-accent hover:underline">Privacy</Link>
          <Link href="/" className="ml-auto text-accent hover:underline">&larr; Back to homepage</Link>
        </div>
      </div>
    </div>
  );
}
