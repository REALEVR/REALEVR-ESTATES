import { useEffect, useMemo, useState } from 'react'
import { Link } from 'wouter'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Hero from '@/components/home/Hero'
import MotionBackground from '@/components/motion/MotionBackground'
import Reveal from '@/components/motion/Reveal'
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
import { CATEGORY_PAGE_META, SITE_NAME } from '@shared/seo'

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
        return [
            {
                '@context': 'https://schema.org',
                '@type': 'WebSite',
                name: SITE_NAME,
                url: `${site}/`,
                description: CATEGORY_PAGE_META.home.description,
            },
            {
                '@context': 'https://schema.org',
                '@type': 'Organization',
                name: SITE_NAME,
                url: `${site}/`,
                logo: `${site}/favicon.png`,
                areaServed: 'UG',
            },
        ]
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
                title={CATEGORY_PAGE_META.home.title}
                description={CATEGORY_PAGE_META.home.description}
                canonicalPath="/"
                jsonLd={homeJsonLd}
            />
            <Hero videoUrl={heroVideoUrl} />

            {/* Agent Registration Call-to-Action */}
            <section className="relative overflow-hidden py-16 bg-gradient-to-r from-accent/10 via-secondary to-accent/10 -mx-4 sm:-mx-6 lg:-mx-8">
                <MotionBackground tone="warm" />
                <div className="relative z-10 container mx-auto px-6">
                    <div className="max-w-4xl mx-auto text-center">
                        <h2 className="text-3xl md:text-4xl font-display font-medium text-foreground mb-4">
                            Become a RealEVR broker today
                        </h2>
                        <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
                            Join RealEVR Estates as a professional agent/dotcom and start listing properties with
                            virtual tours. Get access to premium features and reach more clients.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Button
                                asChild
                                className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-3 text-lg font-semibold"
                            >
                                <Link href="/agent/register">Become an Agent</Link>
                            </Button>
                            <Button
                                asChild
                                variant="outline"
                                className="border-accent text-accent hover:bg-accent hover:text-accent-foreground px-8 py-3 text-lg font-semibold"
                            >
                                <Link href="/list-your-property">List a Property, Earn 1,000 UGX</Link>
                            </Button>
                        </div>
                    </div>
                </div>
            </section>

            <Reveal><FeaturedTour /></Reveal>
            <Reveal><FeaturedProperties /></Reveal>
            <Reveal><PopularProperties /></Reveal>
            <Reveal><RecentProperties /></Reveal>

            {/* Property Listings */}
            <Reveal><section className="py-10">
                <div className="container mx-auto px-6">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl md:text-3xl font-display font-medium text-foreground">Browse Properties</h2>
                        <div className="flex items-center">
                            <span className="text-muted-foreground mr-2">Sort by:</span>
                            <Select defaultValue="recommended">
                                <SelectTrigger className="border border-border rounded-lg px-3 py-2 bg-card focus:outline-none focus:ring-2 focus:ring-accent">
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
                                    className="bg-card rounded-xl overflow-hidden shadow-md animate-pulse"
                                >
                                    <div className="h-52 bg-muted"></div>
                                    <div className="p-4">
                                        <div className="h-5 bg-muted rounded w-3/4 mb-2"></div>
                                        <div className="h-4 bg-muted rounded w-1/2 mb-2"></div>
                                        <div className="h-4 bg-muted rounded w-3/4 mb-4"></div>
                                        <div className="flex justify-between">
                                            <div className="h-6 bg-muted rounded w-1/4"></div>
                                            <div className="h-6 bg-muted rounded w-1/4"></div>
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
                                                <p className="text-muted-foreground">No properties found in this category.</p>
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
                                    className="px-6 py-3 bg-card border border-border rounded-lg font-medium hover:bg-secondary"
                                >
                                    Load More Properties
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </section></Reveal>

            <Reveal><AmenitiesHighlight /></Reveal>
            <Reveal><HowItWorks /></Reveal>
            <Reveal><DownloadApp /></Reveal>
        </>
    )
}
