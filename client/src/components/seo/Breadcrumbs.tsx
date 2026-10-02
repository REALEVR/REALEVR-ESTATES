import { Link } from 'wouter'
import { getSiteUrl } from '@/lib/siteUrl'

/** A visible trail (also an internal-link path back up the site) and its structured data. */
export default function Breadcrumbs({ trail }: { trail: Array<{ label: string; path?: string }> }) {
    const base = getSiteUrl()
    const ld = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: trail.map((t, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: t.label,
            ...(t.path ? { item: `${base}${t.path}` } : {}),
        })),
    }
    return (
        <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
            <ol className="flex flex-wrap items-center gap-1.5">
                {trail.map((t, i) => (
                    <li key={t.label} className="flex items-center gap-1.5">
                        {t.path ? <Link href={t.path} className="hover:underline">{t.label}</Link> : <span aria-current="page" className="text-foreground">{t.label}</span>}
                        {i < trail.length - 1 && <span aria-hidden="true">/</span>}
                    </li>
                ))}
            </ol>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
        </nav>
    )
}
