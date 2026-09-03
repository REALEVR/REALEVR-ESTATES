import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Property } from '@shared/schema'
import PropertyCard from '@/components/home/PropertyCard'
import { Loader2 } from 'lucide-react'
import { PageSeo } from '@/components/seo/PageSeo'
import { getSiteUrl } from '@/lib/siteUrl'
import { CATEGORY_PAGE_META } from '@shared/seo'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

/**
 * "All Properties" — the second of the 3 top-level browsing destinations
 * (Featured / All Properties / New Listings). Every property, with the
 * property-type categories (For Rent / BnBs / For Sale / Bank Sales, the 4
 * things that used to each be their own top-level nav item) available here
 * as filter tabs instead — "the rest will appear through the filters."
 */
export default function AllPropertiesPage() {
    const [activeTab, setActiveTab] = useState('all')
    const { data: properties, isLoading, error } = useQuery<Property[]>({
        queryKey: ['/api/properties'],
    })

    const allJsonLd = useMemo(() => {
        const site = getSiteUrl()
        return {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: CATEGORY_PAGE_META.allProperties.title,
            description: CATEGORY_PAGE_META.allProperties.description,
            url: `${site}${CATEGORY_PAGE_META.allProperties.path}`,
        }
    }, [])

    const live = (properties ?? []).filter((p) => p.title && p.title.trim() !== '')
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
            <h1 className="text-3xl font-bold mb-6">All Properties</h1>

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
                                <p>No properties found in this category.</p>
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
        </div>
    )
}
