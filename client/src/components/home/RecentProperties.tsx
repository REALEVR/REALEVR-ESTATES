import { useState } from 'react'
import { Property } from '@shared/schema'
import { useIsMobile } from '@/hooks/use-mobile'
import { useProperties } from '@/hooks/usePropertyData'
import PropertyCard from './PropertyCard'
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel'
import { Button } from '@/components/ui/button'
import { ChevronRight } from 'lucide-react'
import { Link } from 'wouter'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function RecentProperties() {
    const [activeTab, setActiveTab] = useState('all')
    const isMobile = useIsMobile()

    const { data: allProperties, isLoading: isLoadingProperties, isError: isErrorProperties } = useProperties()

    // Sort properties by viewCount and take top 8
    const mostViewedProperties = allProperties
        ? [...allProperties]
              .filter((p) => p.title && p.title.trim() !== '') // Filter out properties with no title
              .sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0)) // Sort by viewCount descending
              .slice(0, 8) // Take top 8
        : []

    // Debug logging

    if (isLoadingProperties) {
        return (
            <div className="container mx-auto mt-8 mb-12">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold">Most Viewed Properties</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="bg-gray-100 rounded-xl overflow-hidden animate-pulse h-96" />
                    ))}
                </div>
            </div>
        )
    }

    // mostViewedProperties is already filtered, so we can use it directly
    const filteredProperties = mostViewedProperties

    if (isErrorProperties) {
        console.error('MostViewedProperties error:', isErrorProperties)
        return (
            <div className="container mx-auto px-6 mt-10 mb-12">
                <div className="text-center py-8 text-red-500">
                    <p>Error loading most viewed properties. Please try again later.</p>
                </div>
            </div>
        )
    }

    // If no filtered properties, show empty state instead of returning null
    if (!filteredProperties || filteredProperties.length === 0) {
        return (
            <div className="container mx-auto px-6 mt-10 mb-12">
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold">Most Viewed Properties</h2>
                    <div className="flex items-center space-x-2 mt-2 md:mt-0">
                        <Link href="/featured-properties">
                            <Button variant="outline" className="flex items-center">
                                View All <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                        </Link>
                    </div>
                </div>
                <div className="text-center py-12 text-gray-500">
                    <p className="text-lg mb-2">No properties to display</p>
                    <p className="text-sm">Properties with more views will appear here.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="container mx-auto px-6 mt-10 mb-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">Most Viewed Properties</h2>
                <div className="flex items-center space-x-2 mt-2 md:mt-0">
                    <Link href="/featured-properties">
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
