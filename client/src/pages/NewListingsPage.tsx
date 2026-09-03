import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Property } from '@shared/schema'
import PropertyCard from '@/components/home/PropertyCard'
import { Loader2 } from 'lucide-react'
import { PageSeo } from '@/components/seo/PageSeo'
import { getSiteUrl } from '@/lib/siteUrl'
import { CATEGORY_PAGE_META } from '@shared/seo'

/**
 * "New Listings" — one of the 3 top-level browsing destinations (Featured /
 * All Properties / New Listings), replacing what used to be a homepage
 * section literally named RecentProperties.tsx but actually sorted by
 * viewCount ("Most Viewed Properties") — see that file's own doc comment.
 * This page (and the homepage section it backs) is genuinely sorted by
 * recency. Properties don't have a createdAt field (see shared/schema.ts),
 * so id descending — the same "newest" signal every other page in this
 * codebase already uses — is the real, honest ordering here.
 */
export default function NewListingsPage() {
    const { data: properties, isLoading, error } = useQuery<Property[]>({
        queryKey: ['/api/properties'],
    })

    const newListingsJsonLd = useMemo(() => {
        const site = getSiteUrl()
        return {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: CATEGORY_PAGE_META.newListings.title,
            description: CATEGORY_PAGE_META.newListings.description,
            url: `${site}${CATEGORY_PAGE_META.newListings.path}`,
        }
    }, [])

    const newest = (properties ?? [])
        .filter((p) => p.title && p.title.trim() !== '')
        .sort((a, b) => b.id - a.id)

    if (isLoading) {
        return (
            <div className="container mx-auto px-6 py-10 min-h-screen flex items-center justify-center">
                <PageSeo
                    title={CATEGORY_PAGE_META.newListings.title}
                    description={CATEGORY_PAGE_META.newListings.description}
                    canonicalPath={CATEGORY_PAGE_META.newListings.path}
                    jsonLd={newListingsJsonLd}
                />
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    if (error || newest.length === 0) {
        return (
            <div className="container mx-auto px-6 py-10 min-h-screen">
                <PageSeo
                    title={CATEGORY_PAGE_META.newListings.title}
                    description={CATEGORY_PAGE_META.newListings.description}
                    canonicalPath={CATEGORY_PAGE_META.newListings.path}
                    jsonLd={newListingsJsonLd}
                />
                <h1 className="text-3xl font-bold mb-6">New Listings</h1>
                <p className="text-gray-500">No listings found.</p>
            </div>
        )
    }

    return (
        <div className="container mx-auto px-6 py-10">
            <PageSeo
                title={CATEGORY_PAGE_META.newListings.title}
                description={CATEGORY_PAGE_META.newListings.description}
                canonicalPath={CATEGORY_PAGE_META.newListings.path}
                jsonLd={newListingsJsonLd}
            />
            <h1 className="text-3xl font-bold mb-6">New Listings</h1>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {newest.map((property) => (
                    <PropertyCard key={property.id} property={property} />
                ))}
            </div>
        </div>
    )
}
