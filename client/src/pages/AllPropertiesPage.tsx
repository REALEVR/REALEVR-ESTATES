import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'wouter'
import { Property } from '@shared/schema'
import PropertyCard from '@/components/home/PropertyCard'
import { Loader2 } from 'lucide-react'
import { PageSeo } from '@/components/seo/PageSeo'
import { getSiteUrl } from '@/lib/siteUrl'
import { buildBreadcrumbJsonLd, CATEGORY_PAGE_META } from '@shared/seo'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import PropertyLocationMap from '@/components/property/PropertyLocationMap'
import AdSlot from '@/components/ads/AdSlot'
import { describeFilters, filtersFromSearch, hasFilters, matchesFilters } from '@shared/property-filters'

/**
 * "All Properties" — the second of the 3 top-level browsing destinations
 * (Featured / All Properties / New Listings). Every property, with the
 * property-type categories (For Rent / BnBs / For Sale / Bank Sales, the 4
 * things that used to each be their own top-level nav item) available here
 * as filter tabs instead — "the rest will appear through the filters."
 */
export default function AllPropertiesPage() {
    // What Kevin (or a link) asked for: /properties?loc=Kololo&max=3000000&beds=2&cat=rental_units
    const [searchParams] = useSearchParams()
    const filters = useMemo(() => filtersFromSearch(searchParams), [searchParams])
    const filtered = hasFilters(filters)
    const [activeTab, setActiveTab] = useState('all')
    // The header's search box sends people here as /properties?q=...; every word must appear in the title, place or type.
    const query = (searchParams.get('q') ?? '').trim()
    const [mapLocation, setMapLocation] = useState<string | null>(null)
    const { data: properties, isLoading, error } = useQuery<Property[]>({
        queryKey: ['/api/properties'],
    })

    const allJsonLd = useMemo(() => {
        const site = getSiteUrl()
        return [
            {
                '@context': 'https://schema.org',
                '@type': 'CollectionPage',
                name: CATEGORY_PAGE_META.allProperties.title,
                description: CATEGORY_PAGE_META.allProperties.description,
                url: `${site}${CATEGORY_PAGE_META.allProperties.path}`,
            },
            buildBreadcrumbJsonLd(site, [
                { name: 'Home', path: '/' },
                { name: 'All Properties', path: CATEGORY_PAGE_META.allProperties.path },
            ]),
        ]
    }, [])

    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    const liveAll = (properties ?? [])
        .filter((p) => p.title && p.title.trim() !== '')
        .filter((p) => !filtered || (p.isAvailable !== false && matchesFilters(p, filters)))
        .filter((p) => {
            if (!words.length) return true
            const haystack = `${p.title} ${p.location} ${p.propertyType} ${p.category}`.toLowerCase()
            return words.every((w) => haystack.includes(w))
        })
    const live = mapLocation
        ? liveAll.filter((p) => p.location?.toLowerCase().includes(mapLocation.toLowerCase()))
        : liveAll
    const byCategory: Record<string, Property[]> = {
        all: live,
        rental_units: live.filter((p) => p.category === 'rental_units'),
        furnished_houses: live.filter((p) => p.category === 'furnished_houses'),
        for_sale: live.filter((p) => p.category === 'for_sale'),
        bank_sales: live.filter((p) => p.category === 'bank_sales'),
    }

    if (isLoading) {
        return (
            <div className="container mx-auto px-6 py-10 min-h-screen flex items-center justify-center">
                <PageSeo
                    title={CATEGORY_PAGE_META.allProperties.title}
                    description={CATEGORY_PAGE_META.allProperties.description}
                    canonicalPath={CATEGORY_PAGE_META.allProperties.path}
                    jsonLd={allJsonLd}
                />
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="container mx-auto px-6 py-10 min-h-screen">
                <PageSeo
                    title={CATEGORY_PAGE_META.allProperties.title}
                    description={CATEGORY_PAGE_META.allProperties.description}
                    canonicalPath={CATEGORY_PAGE_META.allProperties.path}
                    jsonLd={allJsonLd}
                />
                <h1 className="text-3xl font-bold mb-6">All Properties</h1>
                <p className="text-red-500">Error loading properties. Please try again later.</p>
            </div>
        )
    }

    return (
        <div className="container mx-auto px-6 py-10">
            <PageSeo
                title={CATEGORY_PAGE_META.allProperties.title}
                description={CATEGORY_PAGE_META.allProperties.description}
                canonicalPath={CATEGORY_PAGE_META.allProperties.path}
                jsonLd={allJsonLd}
            />
            <h1 className="section-title mb-2 text-3xl md:text-4xl">
                {filtered ? describeFilters(filters).replace(/^./, (c) => c.toUpperCase()) : query ? `Homes matching “${query}”` : 'All Properties'}
            </h1>
            {(query || filtered) && (
                <p className="mb-5 text-sm text-muted-foreground">
                    {liveAll.length} {liveAll.length === 1 ? 'home' : 'homes'} ·{' '}
                    <Link href="/properties" className="text-accent underline-offset-2 hover:underline">
                        Clear search
                    </Link>
                </p>
            )}

            <PropertyLocationMap
                properties={liveAll}
                selectedLocation={mapLocation}
                onSelectLocation={setMapLocation}
            />

            <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="flex md:grid md:grid-cols-5 w-full mb-8 overflow-x-auto hide-scrollbar justify-start md:justify-center gap-1 md:gap-0">
                    <TabsTrigger value="all" className="flex-shrink-0">All</TabsTrigger>
                    <TabsTrigger value="rental_units" className="flex-shrink-0">For Rent</TabsTrigger>
                    <TabsTrigger value="furnished_houses" className="flex-shrink-0">BnBs</TabsTrigger>
                    <TabsTrigger value="for_sale" className="flex-shrink-0">For Sale</TabsTrigger>
                    <TabsTrigger value="bank_sales" className="flex-shrink-0">Bank Sales</TabsTrigger>
                </TabsList>
                {Object.entries(byCategory).map(([category, categoryProperties]) => (
                    <TabsContent value={category} key={category}>
                        {categoryProperties.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground">
                                <p>
                                    No properties found{mapLocation ? ` in ${mapLocation}` : ''} in this category.
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {categoryProperties.map((property) => (
                                    <PropertyCard key={property.id} property={property} />
                                ))}
                            </div>
                        )}
                    </TabsContent>
                ))}
            </Tabs>
            <AdSlot />
        </div>
    )
}
