import { navigate } from 'wouter/use-browser-location'
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from 'wouter'
import { usePayment } from '@/contexts/PaymentContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import PropertyCard from '@/components/home/PropertyCard'
import type { Property } from '@shared/schema'
import { PageSeo } from '@/components/seo/PageSeo'
import { getSiteUrl } from '@/lib/siteUrl'
import { buildBreadcrumbJsonLd, CATEGORY_PAGE_META } from '@shared/seo'
import FaqSection from "@/components/seo/FaqSection";

/** How many cards sit in one row of the listings grid (mirrors the grid-cols breakpoints below). */
function useGridColumns() {
    const [columns, setColumns] = useState(1)
    useEffect(() => {
        const read = () => {
            const w = window.innerWidth
            setColumns(w >= 1280 ? 4 : w >= 1024 ? 3 : w >= 640 ? 2 : 1)
        }
        read()
        window.addEventListener('resize', read)
        return () => window.removeEventListener('resize', read)
    }, [])
    return columns
}

const LISTINGS_GRID = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'

export default function RentalUnitsPage() {
    const { hasActiveViewingPackage, openViewingPaymentPrompt } = usePayment()
    const [location] = useLocation()
    const [searchTerm, setSearchTerm] = useState('')
    const [priceRange, setPriceRange] = useState<string>('all')
    const [areaFilter, setAreaFilter] = useState<string>('all')
    const [propertyTypeFilter, setPropertyTypeFilter] = useState<string>('all')
    const [bedroomsFilter, setBedroomsFilter] = useState<string>('all')
    const [bathroomsFilter, setBathroomsFilter] = useState<string>('all')
    const [sortBy, setSortBy] = useState<string>('default')
    const columns = useGridColumns()

    // Get all properties
    const {
        data: properties,
        isLoading,
        error,
    } = useQuery<Property[]>({
        queryKey: ['/api/properties'],
    })

    const rentalJsonLd = useMemo(() => {
        const site = getSiteUrl()
        return [
            {
                '@context': 'https://schema.org',
                '@type': 'CollectionPage',
                name: CATEGORY_PAGE_META.rentalUnits.title,
                description: CATEGORY_PAGE_META.rentalUnits.description,
                url: `${site}${CATEGORY_PAGE_META.rentalUnits.path}`,
            },
            buildBreadcrumbJsonLd(site, [
                { name: 'Home', path: '/' },
                { name: 'Rental Units', path: CATEGORY_PAGE_META.rentalUnits.path },
            ]),
        ]
    }, [])

    // Handle URL parameters from hero search
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)

        // Set filters from URL parameters
        if (params.get('location')) {
            setAreaFilter(params.get('location')!)
        }
        if (params.get('type')) {
            setPropertyTypeFilter(params.get('type')!)
        }
        if (params.get('price')) {
            setPriceRange(params.get('price')!)
        }
        if (params.get('bedrooms')) {
            setBedroomsFilter(params.get('bedrooms')!)
        }
        if (params.get('bathrooms')) {
            setBathroomsFilter(params.get('bathrooms')!)
        }
    }, [location])

    // Filter for only rental units (not furnished)
    const rentalUnits = properties?.filter(
        (property) =>
            property.propertyType === 'Apartment' ||
            property.propertyType === 'House' ||
            (property.category === 'rental_units' &&
                property.propertyType !== 'Furnished Rental' &&
                property.propertyType !== 'BnB')
    )

    // Apply search filters
    const filteredProperties = rentalUnits?.filter((property) => {
        // Search term filter (title, location, description)
        const matchesSearch =
            searchTerm === '' ||
            property.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            property.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
            property.description.toLowerCase().includes(searchTerm.toLowerCase())

        // Price range filter
        let matchesPrice = true
        if (priceRange === 'low') {
            matchesPrice = property.price < 500000
        } else if (priceRange === 'medium') {
            matchesPrice = property.price >= 500000 && property.price < 1500000
        } else if (priceRange === 'high') {
            matchesPrice = property.price >= 1500000
        }

        // Area filter
        let matchesArea = true
        if (areaFilter !== 'all') {
            matchesArea = property.location.toLowerCase().includes(areaFilter.toLowerCase())
        }

        // Property type filter
        let matchesPropertyType = true
        if (propertyTypeFilter !== 'all') {
            matchesPropertyType = property.propertyType === propertyTypeFilter
        }

        // Bedrooms filter
        let matchesBedrooms = true
        if (bedroomsFilter !== 'all') {
            if (bedroomsFilter === '5+') {
                matchesBedrooms = property.bedrooms >= 5
            } else {
                matchesBedrooms = property.bedrooms === parseInt(bedroomsFilter)
            }
        }

        // Bathrooms filter
        let matchesBathrooms = true
        if (bathroomsFilter !== 'all') {
            if (bathroomsFilter === '5+') {
                matchesBathrooms = property.bathrooms >= 5
            } else {
                matchesBathrooms = property.bathrooms === parseInt(bathroomsFilter)
            }
        }

        return (
            matchesSearch && matchesPrice && matchesArea && matchesPropertyType && matchesBedrooms && matchesBathrooms
        )
    })

    // Apply sorting
    const sortedProperties = [...(filteredProperties || [])].sort((a, b) => {
        if (sortBy === 'price-low') {
            return a.price - b.price
        } else if (sortBy === 'price-high') {
            return b.price - a.price
        } else if (sortBy === 'newest') {
            // Default sorting by id if no createdAt field is available
            return b.id - a.id
        }
        return 0 // default: no sorting
    })

    // Handler for when user tries to view properties without an active package
    const handleViewProperty = (e: React.MouseEvent, property: Property) => {
        if (!hasActiveViewingPackage) {
            e.preventDefault()
            openViewingPaymentPrompt()
        }
    }

    return (
        <div className="py-8">
            <PageSeo
                title={CATEGORY_PAGE_META.rentalUnits.title}
                description={CATEGORY_PAGE_META.rentalUnits.description}
                canonicalPath={CATEGORY_PAGE_META.rentalUnits.path}
                jsonLd={rentalJsonLd}
            />
            <div className="container mx-auto px-6">
                <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
                    <h1 className="text-3xl font-bold mb-2">Rental Units</h1>
                    <p className="text-gray-500 mb-6">
                        Browse our collection of unfurnished apartments and houses available for monthly rental in
                        Kampala and surrounding areas.
                    </p>

                    <div className="grid md:grid-cols-3 gap-4 mb-6">
                        <div>
                            <Input
                                type="text"
                                placeholder="Search properties..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full"
                            />
                        </div>

                        <div>
                            <Select value={priceRange} onValueChange={setPriceRange}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Price Range" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Prices</SelectItem>
                                    <SelectItem value="low">Under 500,000 UGX</SelectItem>
                                    <SelectItem value="medium">500,000 - 1,500,000 UGX</SelectItem>
                                    <SelectItem value="high">Above 1,500,000 UGX</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <Select value={sortBy} onValueChange={setSortBy}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Sort By" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="default">Default</SelectItem>
                                    <SelectItem value="price-low">Price: Low to High</SelectItem>
                                    <SelectItem value="price-high">Price: High to Low</SelectItem>
                                    <SelectItem value="newest">Newest First</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-6">
                        <Badge
                            variant={areaFilter === 'all' ? 'default' : 'outline'}
                            className="cursor-pointer"
                            onClick={() => setAreaFilter('all')}
                        >
                            All Areas
                        </Badge>
                        <Badge
                            variant={areaFilter === 'kololo' ? 'default' : 'outline'}
                            className="cursor-pointer"
                            onClick={() => setAreaFilter('kololo')}
                        >
                            Kololo
                        </Badge>
                        <Badge
                            variant={areaFilter === 'nakasero' ? 'default' : 'outline'}
                            className="cursor-pointer"
                            onClick={() => setAreaFilter('nakasero')}
                        >
                            Nakasero
                        </Badge>
                        <Badge
                            variant={areaFilter === 'bugolobi' ? 'default' : 'outline'}
                            className="cursor-pointer"
                            onClick={() => setAreaFilter('bugolobi')}
                        >
                            Bugolobi
                        </Badge>
                        <Badge
                            variant={areaFilter === 'ntinda' ? 'default' : 'outline'}
                            className="cursor-pointer"
                            onClick={() => setAreaFilter('ntinda')}
                        >
                            Ntinda
                        </Badge>
                        <Badge
                            variant={areaFilter === 'muyenga' ? 'default' : 'outline'}
                            className="cursor-pointer"
                            onClick={() => setAreaFilter('muyenga')}
                        >
                            Muyenga
                        </Badge>
                        <Badge
                            variant={areaFilter === 'kira' ? 'default' : 'outline'}
                            className="cursor-pointer"
                            onClick={() => setAreaFilter('kira')}
                        >
                            Kira
                        </Badge>
                    </div>
                </div>

                {isLoading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {[...Array(8)].map((_, index) => (
                            <div key={index} className="bg-white rounded-xl overflow-hidden shadow-md animate-pulse">
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
                ) : sortedProperties?.length ? (
                    <div>
                        <div className="mb-4 text-gray-500">
                            Showing {sortedProperties.length}{' '}
                            {sortedProperties.length === 1 ? 'property' : 'properties'}
                        </div>

                        {[sortedProperties.slice(0, columns), sortedProperties.slice(columns)].map((row, part) => (
                            <div key={part}>
                                {/* The viewing-package notice comes after the first row, so people see homes before the ask. */}
                                {part === 1 && !hasActiveViewingPackage && (
                                    <div className="bg-muted border border-border rounded-lg p-4 my-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <h2 className="text-foreground font-medium">Like what you see? Unlock contact details</h2>
                                            <p className="text-muted-foreground text-sm mt-1">
                                                A one-time fee of 10,000 UGX shows contact details for up to 10 rental properties, for 1 day.
                                            </p>
                                        </div>
                                        <Button className="shine shrink-0" onClick={openViewingPaymentPrompt}>
                                            Purchase Viewing
                                        </Button>
                                    </div>
                                )}
                                {row.length > 0 && (
                                    <div className={LISTINGS_GRID}>
                                        {row.map((property) => (
                                            <div
                                                key={property.id}
                                                className="cursor-pointer"
                                                onClick={(e) => {
                                                    if (!hasActiveViewingPackage) {
                                                        e.preventDefault()
                                                        openViewingPaymentPrompt()
                                                    } else {
                                                        navigate(`/property/${property.id}`)
                                                    }
                                                }}
                                            >
                                                <PropertyCard property={property} />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-12">
                        <h2 className="text-2xl font-semibold mb-2">No properties found</h2>
                        <p className="text-gray-500">Try adjusting your search criteria</p>
                    </div>
                )}
            </div>
          <FaqSection page="rentalUnits" />
        </div>
    )
}