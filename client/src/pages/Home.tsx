import { useEffect, useMemo, useState } from 'react'
import { Link } from 'wouter'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Hero from '@/components/home/Hero'
import FilterBar from '@/components/home/FilterBar'
import FeaturedTour from '@/components/home/FeaturedTour'
import FeaturedProperties from '@/components/home/FeaturedProperties'
import PopularProperties from '@/components/home/PopularProperties'
import RecentProperties from '@/components/home/RecentProperties'
import PropertyCard from '@/components/home/PropertyCard'
import AmenitiesHighlight from '@/components/home/AmenitiesHighlight'
import HowItWorks from '@/components/home/HowItWorks'
import DownloadApp from '@/components/home/DownloadApp'
import { useProperties } from '@/hooks/usePropertyData'
import type { Property } from '@shared/schema'
import { PageSeo } from '@/components/seo/PageSeo'
import { getSiteUrl } from '@/lib/siteUrl'
import { ShareButton } from '@/components/ui/ShareButton'

// Property category labels for display
const categoryLabels = {
    rental_units: 'Rental Units',
    rental: 'Rental Units',
    furnished_houses: 'Furnished Houses (BnBs)',
    for_sale: 'Properties For Sale',
    bank_sales: 'Bank Sales',
}

export default function Home() {
    const [activeTab, setActiveTab] = useState('all')
    const [heroVideoUrl, setHeroVideoUrl] = useState('https://youtu.be/cgM6poO2JmY?t=9')

    const { data: properties, isLoading, error } = useProperties()

    // Fetch video settings
    useEffect(() => {
        const fetchVideoSettings = async () => {
            try {
                const response = await fetch('/api/video-settings')
                if (response.ok) {
                    const data = await response.json()
                    setHeroVideoUrl(data.heroVideoUrl)
                    console.log('Video URL updated:', data.heroVideoUrl)
                }
            } catch (error) {
                console.log('Using default video URL', error)
            }
        }

        fetchVideoSettings()
    }, [])

    // Debug logging for properties
   

    const homeJsonLd = useMemo(() => {
        const site = getSiteUrl()
        return {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'RealEVR Estates',
            url: `${site}/`,
            description:
                'Browse rental units, furnished BnBs, homes for sale, and bank auction properties with immersive virtual tours on RealEVR Estates.',
        }
    }, [])

    // Group properties by category, filtering out those with no name/title
    const filteredProperties = (properties || []).filter((p) => p.title && p.title.trim() !== '')
    const propertyCategories = {
        all: filteredProperties,
        rental_units: filteredProperties.filter((p) => p.category === 'rental_units' || p.category === 'rental'),
        furnished_houses: filteredProperties.filter((p) => p.category === 'furnished_houses'),
        for_sale: filteredProperties.filter((p) => p.category === 'for_sale'),
        bank_sales: filteredProperties.filter((p) => p.category === 'bank_sales'),
    }

    return (
        <>
            <PageSeo
                title="RealEVR Estates | Virtual Tours for Rentals, BnBs, For Sale & Bank Properties"
                description="Discover rental units, vacation BnBs, properties for sale, and bank sales with virtual tours. Search by location, price, and amenities on RealEVR Estates."
                canonicalPath="/"
                jsonLd={homeJsonLd}
            />
            <Hero videoUrl={heroVideoUrl} />

            {/* Agent Registration Call-to-Action */}
            <section className="py-16 bg-gradient-to-r from-blue-50 to-indigo-50 -mx-4 sm:-mx-6 lg:-mx-8">
                <div className="container mx-auto px-6">
                    <div className="max-w-4xl mx-auto text-center">
                        <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                            Become a dotCom brocker today!
                        </h2>
                        <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
                            Join RealEVR Estates as a professional agent/dotcom and start listing properties with
                            virtual tours. Get access to premium features and reach more clients.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Button
                                asChild
                                className="bg-black hover:bg-gray-800 text-white px-8 py-3 text-lg font-semibold"
                            >
                                <Link href="/agent/register">Become an Agent</Link>
                            </Button>
                            {/* <Button 
                variant="outline" 
                className="border-black text-black hover:bg-black hover:text-white px-8 py-3 text-lg font-semibold"
              >
                Learn More
              </Button> */}
                        </div>
                    </div>
                </div>
            </section>

            <FeaturedTour />
            <FeaturedProperties />
            <PopularProperties />
            <RecentProperties />

            {/* Property Listings */}
            <section className="py-10">
                <div className="container mx-auto px-6">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl md:text-3xl font-bold">Browse Properties</h2>
                        <div className="flex items-center">
                            <span className="text-gray-500 mr-2">Sort by:</span>
                            <Select defaultValue="recommended">
                                <SelectTrigger className="border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#FF5A5F]">
                                    <SelectValue placeholder="Sort by" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="recommended">Recommended</SelectItem>
                                    <SelectItem value="price_asc">Price: Low to High</SelectItem>
                                    <SelectItem value="price_desc">Price: High to Low</SelectItem>
                                    <SelectItem value="newest">Newest</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {[...Array(8)].map((_, index) => (
                                <div
                                    key={index}
                                    className="bg-white rounded-xl overflow-hidden shadow-md animate-pulse"
                                >
                                    <div className="h-52 bg-gray-200"></div>
                                    <div className="p-4">
                                        <div className="h-5 bg-gray-200 rounded w-3/4 mb-2"></div>
                                        <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                                        <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
                                        <div className="flex justify-between">
                                            <div className="h-6 bg-gray-200 rounded w-1/4"></div>
                                            <div className="h-6 bg-gray-200 rounded w-1/4"></div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : error ? (
                        <div className="text-center py-8">
                            <p className="text-red-500">Error loading properties. Please try again later.</p>
                        </div>
                    ) : (
                        <>
                            <Tabs defaultValue="all" className="w-full" onValueChange={setActiveTab}>
                                <TabsList className="grid grid-cols-5 w-full mb-8">
                                    <TabsTrigger value="all">All Properties</TabsTrigger>
                                    <TabsTrigger value="rental_units">Rental Units</TabsTrigger>
                                    <TabsTrigger value="furnished_houses">Furnished Houses</TabsTrigger>
                                    <TabsTrigger value="for_sale">For Sale</TabsTrigger>
                                    <TabsTrigger value="bank_sales">Bank Sales</TabsTrigger>
                                </TabsList>

                                {Object.entries(propertyCategories).map(([category, categoryProperties]) => (
                                    <TabsContent value={category} key={category}>
                                        {categoryProperties.length === 0 ? (
                                            <div className="text-center py-8">
                                                <p className="text-gray-500">No properties found in this category.</p>
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

                            <div className="mt-12 text-center">
                                <Button
                                    variant="outline"
                                    className="px-6 py-3 bg-white border border-gray-200 rounded-lg font-medium hover:bg-gray-50"
                                >
                                    Load More Properties
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </section>

            <AmenitiesHighlight />
            <HowItWorks />
            <DownloadApp />
            <ShareButton title="REALEVR Estates - Find Your Dream Property" />
        </>
    )
}
