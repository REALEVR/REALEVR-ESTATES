import { useEffect, useMemo, useState } from 'react'
import { Link } from 'wouter'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Hero from '@/components/home/Hero'
import ListFreeHero from '@/components/home/ListFreeHero'
import { usePlace } from '@/lib/place'
import Reveal from '@/components/motion/Reveal'
import FilterBar from '@/components/home/FilterBar'
import FeaturedTour from '@/components/home/FeaturedTour'
import FeaturedProperties from '@/components/home/FeaturedProperties'
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
import FaqSection from "@/components/seo/FaqSection";

import bungalowBg from '@/assets/images/hero-house.webp';
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
    // Defaults to the house background image; an admin-configured video (set via
    // /admin/properties) overrides it once /api/video-settings resolves.
    const [heroVideoUrl, setHeroVideoUrl] = useState('')

    const { data: properties, isLoading, error } = useProperties()
    const { abroad } = usePlace()

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
                contactPoint: {
                    '@type': 'ContactPoint',
                    email: 'support@realevr.com',
                    contactType: 'customer support',
                    areaServed: 'UG',
                },
            },
        ]
        // Note: no `sameAs` social profile URLs here — Footer.tsx's social
        // icons are still placeholder `#` links (no real accounts connected
        // yet), and inventing URLs for schema.org would be a fabricated
        // claim search engines and answer engines could pick up as fact.
        // Add real profile URLs here the moment real accounts exist — see
        // the AI employee agent system's "content agents" section in
        // GENE_PLATFORM.md for the same gap noted from the other direction.
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
            {/* The Africa real estate news/live-listings panel (real Africa
                property news when NEWS_API_KEY is configured, plus this
                platform's own live listing photos) now lives *inside* Hero
                itself, as the second of 2 slides sharing the tour video's
                container — see Hero.tsx's heroSlide state and
                HeroNewsSlide.tsx. Used to be its own section rendered here,
                below the hero. */}
            {abroad ? <ListFreeHero /> : <Hero videoUrl={heroVideoUrl} />}

            {/* Design-review fix (round 2): the agent/broker recruitment CTA
                used to sit here, immediately after the hero — the very next
                thing a demand-side visitor (a renter/buyer, the large
                majority of homepage traffic) saw was a supply-side "become
                an agent" pitch, ahead of a single property. Moved below the
                Browse Properties grid (see near the bottom of this file) so
                property content keeps the momentum coming out of the hero's
                search bar, and agent recruitment reaches the audience it's
                actually for without blocking everyone else's path first. */}

            <Reveal><FeaturedProperties /></Reveal>
            <Reveal><RecentProperties /></Reveal>

            {/* Property Listings — "All Properties", the 3rd of the 3
                top-level browsing destinations (see FilterBar.tsx). Popular
                Properties (sorted by view count) used to be its own section
                here too, but that's the same "most viewed" idea this
                section's own "Newest" sort option already covers — removed
                as redundant rather than kept as a 4th thing to maintain. */}
            <Reveal><section className="py-8 md:py-12">
                <div className="mx-auto max-w-[1500px] px-0 md:px-8">
                    {/* Design pass: a small uppercase "kicker" label above each
                        major homepage heading — a section now visually
                        announces itself before the headline lands, the same
                        editorial hierarchy pattern the Hero's VR badge already
                        establishes at the top of the page. Purely a Home.tsx
                        presentation change — FeaturedTour/FeaturedProperties/
                        RecentProperties and every other shared component are
                        untouched, so nothing outside the front page moves. */}
                    <div className="mb-4 md:mb-6">
                        <h2 className="section-title">Homes near you</h2>
                        <p className="mt-1 text-sm text-muted-foreground">Ordered by where you are, closest first.</p>
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
                                {/* Mobile: a horizontally-scrollable pill row (Airbnb's category-filter
                                    pattern, same hide-scrollbar utility FilterBar already uses) instead
                                    of 5 equal-width grid columns squeezing "Furnished Houses" into ~70px.
                                    md+: reverts to the original centered grid. */}
                                {/* Design-review fix (round 2): labels now match FilterBar's
                                    "Browse by" row exactly ("For Rent" / "BnBs", not "Rental
                                    Units" / "Furnished Houses") — a visitor filtering by icon
                                    in the hero and then scrolling to this tab bar was seeing
                                    two different label sets for the same four categories. */}
                                <TabsList className="flex md:grid md:grid-cols-5 w-full mb-8 overflow-x-auto hide-scrollbar justify-start md:justify-center gap-1 md:gap-0">
                                    <TabsTrigger value="all" className="flex-shrink-0">All Properties</TabsTrigger>
                                    <TabsTrigger value="rental_units" className="flex-shrink-0">For Rent</TabsTrigger>
                                    <TabsTrigger value="furnished_houses" className="flex-shrink-0">BnBs</TabsTrigger>
                                    <TabsTrigger value="for_sale" className="flex-shrink-0">For Sale</TabsTrigger>
                                    <TabsTrigger value="bank_sales" className="flex-shrink-0">Bank Sales</TabsTrigger>
                                </TabsList>

                                {Object.entries(propertyCategories).map(([category, categoryProperties]) => (
                                    <TabsContent value={category} key={category}>
                                        {categoryProperties.length === 0 ? (
                                            <div className="text-center py-8">
                                                <p className="text-muted-foreground">No properties found in this category.</p>
                                            </div>
                                        ) : (
                                            <div className="rail">
                                                {categoryProperties.map((property) => (
                                                    <PropertyCard key={property.id} property={property} />
                                                ))}
                                            </div>
                                        )}
                                    </TabsContent>
                                ))}
                            </Tabs>

                            <div className="mt-8 text-center md:mt-12">
                                <Button asChild variant="outline" className="h-12 rounded-full px-8 font-semibold hover:shadow-md">
                                    <Link href="/properties">Show all homes</Link>
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </section></Reveal>

            {/* Agent Registration Call-to-Action — moved here from right after
                the hero, see the comment near <Hero> above. */}
            <Reveal><section className="py-10 md:py-16">
                <div className="surface-invert relative overflow-hidden rounded-[2rem] px-6 py-12 md:rounded-[2.75rem] md:px-16 md:py-16">
                    <img src={bungalowBg} alt="" aria-hidden="true" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover object-[50%_35%]" />
                    <div className="absolute inset-0 bg-gradient-to-r from-[hsl(240_6%_6%/0.95)] via-[hsl(240_6%_6%/0.82)] to-[hsl(240_6%_6%/0.58)]" />
                    <div className="relative z-10 flex flex-col items-start justify-between gap-8 md:flex-row md:items-center md:gap-12">
                        <div className="max-w-2xl">
                            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[hsl(var(--gold))]">For agents and brokers</p>
                            <h2 className="font-display text-3xl font-bold leading-tight tracking-[-0.03em] text-foreground md:text-5xl">
                                Become a RealEVR broker today
                            </h2>
                            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
                                Join RealEVR Estates as a professional agent/dotcom and start listing properties with virtual tours. Get access
                                to premium features and reach more clients.
                            </p>
                        </div>
                        <div className="flex w-full flex-col gap-3 sm:w-auto sm:shrink-0">
                            <Button
                                asChild
                                className="shine h-auto rounded-full px-8 py-3 text-lg font-semibold hover:opacity-95"
                            >
                                <Link href="/agent/register">Become an Agent</Link>
                            </Button>
                            <Button
                                asChild
                                variant="outline"
                                className="h-auto rounded-full border-foreground/50 bg-background/10 px-8 backdrop-blur-sm py-3 text-lg font-semibold text-foreground hover:bg-foreground hover:text-background"
                            >
                                <Link href="/list-your-property">List a Property</Link>
                            </Button>
                        </div>
                    </div>
                </div>
            </section></Reveal>

            {/* The long-form featured tour sits after the feed: on a phone the homes come first. */}
            <Reveal><FeaturedTour /></Reveal>
            <Reveal><AmenitiesHighlight /></Reveal>
            <Reveal><HowItWorks /></Reveal>
            <Reveal><FaqSection page="home" className="px-4 sm:px-6" /></Reveal>
            <Reveal><DownloadApp /></Reveal>
        </>
    )
}
