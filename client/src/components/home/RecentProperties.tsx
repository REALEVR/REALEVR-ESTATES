import { useIsMobile } from '@/hooks/use-mobile'
import { useProperties } from '@/hooks/usePropertyData'
import PropertyCard from './PropertyCard'
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel'
import { Button } from '@/components/ui/button'
import { ChevronRight } from 'lucide-react'
import { Link } from 'wouter'

export default function RecentProperties() {
    const isMobile = useIsMobile()

    const { data: allProperties, isLoading: isLoadingProperties, isError: isErrorProperties } = useProperties()

    // Sort properties by recency (newest first) and take top 8. Properties
    // have no createdAt field (see shared/schema.ts) so id descending — the
    // same "newest" signal every other page in this codebase already uses
    // for sorting — is the real, honest ordering here. This component used
    // to be sorted by viewCount and titled "Most Viewed Properties" despite
    // its filename saying "Recent" — fixed to actually match its name, now
    // that it's the "New Listings" destination (see FilterBar.tsx).
    const newestProperties = allProperties
        ? [...allProperties]
              .filter((p) => p.title && p.title.trim() !== '') // Filter out properties with no title
              .sort((a, b) => b.id - a.id) // Sort by id descending (newest first)
              .slice(0, 8) // Take top 8
        : []

    // Debug logging

    if (isLoadingProperties) {
        return (
            <div className="container mx-auto mt-8 mb-12">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-display font-medium">New Listings</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="bg-secondary rounded-xl overflow-hidden animate-pulse h-96" />
                    ))}
                </div>
            </div>
        )
    }

    // newestProperties is already filtered, so we can use it directly
    const filteredProperties = newestProperties

    if (isErrorProperties) {
        console.error('NewListings error:', isErrorProperties)
        return (
            <div className="container mx-auto px-6 mt-10 mb-12">
                <div className="text-center py-8 text-red-500">
                    <p>Error loading new listings. Please try again later.</p>
                </div>
            </div>
        )
    }

    // If no filtered properties, show empty state instead of returning null
    if (!filteredProperties || filteredProperties.length === 0) {
        return (
            <div className="container mx-auto px-6 mt-10 mb-12">
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
                    <h2 className="text-2xl font-display font-medium">New Listings</h2>
                    <div className="flex items-center space-x-2 mt-2 md:mt-0">
                        <Link href="/new-listings">
                            <Button variant="outline" className="flex items-center">
                                View All <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                        </Link>
                    </div>
                </div>
                <div className="text-center py-12 text-muted-foreground">
                    <p className="text-lg mb-2">No properties to display</p>
                    <p className="text-sm">Newly added listings will appear here.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="container mx-auto px-6 mt-10 mb-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
                <h2 className="text-2xl font-display font-medium">New Listings</h2>
                <div className="flex items-center space-x-2 mt-2 md:mt-0">
                    <Link href="/new-listings">
                        <Button variant="outline" className="flex items-center">
                            View All <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                    </Link>
                </div>
            </div>

            {isMobile ? (
                <Carousel>
                    <CarouselContent>
                        {filteredProperties.map((property) => (
                            <CarouselItem key={property.id} className="basis-full md:basis-1/2 lg:basis-1/3">
                                <PropertyCard property={property} />
                            </CarouselItem>
                        ))}
                    </CarouselContent>
                    <div className="flex justify-center mt-4">
                        <CarouselPrevious className="mr-2" />
                        <CarouselNext />
                    </div>
                </Carousel>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {filteredProperties.map((property) => (
                        <PropertyCard key={property.id} property={property} />
                    ))}
                </div>
            )}
        </div>
    )
}
