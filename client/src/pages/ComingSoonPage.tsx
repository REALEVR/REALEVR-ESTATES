import { Link } from 'wouter'
import { Button } from '@/components/ui/button'
import { PageSeo } from '@/components/seo/PageSeo'

interface ComingSoonPageProps {
    title: string
    description: string
    canonicalPath: string
}

/** A handful of footer links (Careers, Investors, News) previously pointed
 * at "#" — dead links with no real content behind them yet. Rather than
 * inventing job listings, investor materials, or news articles that don't
 * exist, this is an honest placeholder: says plainly that the page isn't
 * live yet and gives a real way to reach the company in the meantime. Each
 * of the three routes below renders this with its own title/description. */
export default function ComingSoonPage({ title, description, canonicalPath }: ComingSoonPageProps) {
    return (
        <div className="container mx-auto px-4 py-16">
            <PageSeo title={`${title} — RealEVR Estates`} description={description} canonicalPath={canonicalPath} />
            <div className="max-w-xl mx-auto text-center bg-white p-10 rounded-lg shadow-sm">
                <h1 className="text-2xl font-display font-bold mb-3">{title}</h1>
                <p className="text-muted-foreground mb-8">{description}</p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button asChild>
                        <Link href="/contact">Contact Us</Link>
                    </Button>
                    <Button asChild variant="outline">
                        <Link href="/">Back to Homepage</Link>
                    </Button>
                </div>
            </div>
        </div>
    )
}
