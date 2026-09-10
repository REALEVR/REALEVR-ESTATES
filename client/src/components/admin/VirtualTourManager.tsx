import { useState, useRef, useEffect } from 'react'
import { useLocation } from 'wouter'
import { useQuery } from '@tanstack/react-query'
import { Property } from '@shared/schema'
import { apiRequest, queryClient } from '@/lib/queryClient'
import { useToast } from '@/hooks/use-toast'

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import RoomCaptureGuide from './RoomCaptureGuide'
import DirectS3TourUpload from './DirectS3TourUpload'
import {
    AlertCircle,
    ArrowLeft,
    Check,
    Box, // Replacing Cube3d with Box
    Eye,
    Home,
    Loader2,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

interface VirtualTourFormValues {
    propertyId: number
    tourUrl: string
    tourProvider: string
    isPublic: boolean
    notes: string
}

export default function VirtualTourManager() {
    const [property, setProperty] = useState<Property | null>(null)
    const [uploadSuccess, setUploadSuccess] = useState(false)
    const [tourPreviewUrl, setTourPreviewUrl] = useState<string | null>(null)

    const { toast } = useToast()
    const [location, navigate] = useLocation()

    // Extract propertyId from URL search params
    const params = new URLSearchParams(window.location.search)
    const propertyId = params.get('propertyId') ? parseInt(params.get('propertyId')!) : null

    // Fetch property details if propertyId is provided
    const { data: propertyData, isLoading: isLoadingProperty } = useQuery<Property>({
        queryKey: ['/api/properties', propertyId || 'none'],
        queryFn: async () => {
            if (!propertyId) return null as any
            const res = await fetch(`/api/properties/${propertyId}`)
            if (!res.ok) throw new Error('Failed to fetch property')
            return res.json()
        },
        enabled: !!propertyId,
    })

    // Get all properties for selection dropdown
    const { data: properties, isLoading: isLoadingProperties } = useQuery<Property[]>({
        queryKey: ['/api/properties'],
    })

    // Update property state when data is loaded
    useEffect(() => {
        if (propertyData) {
            setProperty(propertyData)
            if (propertyData.tourUrl) {
                setTourPreviewUrl(propertyData.tourUrl)
            }
        }
    }, [propertyData])

    const handlePropertySelect = (id: string) => {
        const selectedProperty = properties?.find((p) => p.id === parseInt(id))
        if (selectedProperty) {
            setProperty(selectedProperty)
            navigate(`/admin/virtual-tours?propertyId=${id}`)

            if (selectedProperty.tourUrl) {
                setTourPreviewUrl(selectedProperty.tourUrl)
            } else {
                setTourPreviewUrl(null)
            }
        }
    }

    if (isLoadingProperties || (propertyId && isLoadingProperty)) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    return (
        <div className="container mx-auto py-8">
            {/* Breadcrumb navigation */}
            <Breadcrumb className="mb-6">
                <BreadcrumbList>
                    <BreadcrumbItem>
                        <BreadcrumbLink href="/admin/properties">
                            <Home className="h-4 w-4 mr-2" />
                            Properties
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbLink href="/admin/virtual-tours">
                            <Box className="h-4 w-4 mr-2" />
                            Virtual Tours
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                    {property && (
                        <>
                            <BreadcrumbSeparator />
                            <BreadcrumbItem>
                                <BreadcrumbLink>{property.title}</BreadcrumbLink>
                            </BreadcrumbItem>
                        </>
                    )}
                </BreadcrumbList>
            </Breadcrumb>

            <div className="grid grid-cols-1 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Virtual Tour Manager</CardTitle>
                        <CardDescription>Upload and manage 3D Vista virtual tours for your properties</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div>
                            <Label htmlFor="property-select">Select Property</Label>
                            <Select value={property?.id?.toString() || ''} onValueChange={handlePropertySelect}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select a property" />
                                </SelectTrigger>
                                <SelectContent>
                                    {/* Guard against a null/undefined id: unlike the
                                        Select's own value above (already optional-chained),
                                        this was calling .toString() on p.id directly - any
                                        one malformed row in the list (e.g. a property
                                        missing its id) crashed the ENTIRE page with no
                                        way to recover short of a reload, taking down tour
                                        upload access for every property, not just the bad
                                        one. Skip rows this page can't render into a valid
                                        option instead of crashing on them. */}
                                    {properties
                                        ?.filter((p) => p.id != null)
                                        .map((p) => (
                                            <SelectItem key={p.id} value={p.id.toString()}>
                                                {p.title} ({p.location})
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {property && (
                            <>
                                <div className="border rounded-lg p-4 bg-muted/20">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-sm font-medium">Property:</p>
                                            <p className="text-lg font-bold">{property.title}</p>
                                            <p className="text-sm text-muted-foreground">{property.location}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium">Current Tour Status:</p>
                                            {property.hasTour && property.tourUrl ? (
                                                <div className="space-y-2">
                                                    <div className="flex items-center text-green-600">
                                                        <Check className="mr-2 h-4 w-4" />
                                                        <span>Virtual tour available</span>
                                                    </div>
                                                    <div className="bg-green-50 border border-green-200 rounded-md p-2">
                                                        <p className="text-xs font-medium text-green-800 mb-1">
                                                            Tour URL:
                                                        </p>
                                                        <p className="text-xs text-green-700 font-mono break-all">
                                                            {property.tourUrl}
                                                        </p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex items-center text-amber-600">
                                                    <AlertCircle className="mr-2 h-4 w-4" />
                                                    <span>No virtual tour uploaded</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <Tabs defaultValue="capture" className="w-full">
                                    <TabsList className="grid w-full grid-cols-2">
                                        <TabsTrigger value="capture">Capture with your phone</TabsTrigger>
                                        <TabsTrigger value="zip">Upload 3D Vista ZIP</TabsTrigger>
                                    </TabsList>

                                    <TabsContent value="capture" className="mt-4">
                                        <RoomCaptureGuide
                                            propertyId={property.id}
                                            onPublished={(url) => {
                                                setUploadSuccess(true)
                                                setTourPreviewUrl(url)
                                                queryClient.invalidateQueries({ queryKey: ['/api/properties', property.id] })
                                                toast({ title: 'Success', description: 'Virtual tour built and published successfully' })
                                            }}
                                        />
                                    </TabsContent>

                                    <TabsContent value="zip" className="mt-4">
                                        <div className="rounded-lg border bg-card p-4">
                                            <h3 className="text-lg font-semibold mb-2">Upload Virtual Tour</h3>
                                            <p className="text-sm text-muted-foreground mb-4">
                                                Already have a tour exported from 3D Vista, Pano2VR, or similar
                                                software? Upload the ZIP file directly. Maximum file size: 5GB.
                                            </p>

                                            <DirectS3TourUpload
                                                propertyId={property.id}
                                                onSuccess={(url) => {
                                                    setUploadSuccess(true)
                                                    setTourPreviewUrl(url)
                                                    queryClient.invalidateQueries({ queryKey: ['/api/properties', property.id] })
                                                }}
                                            />
                                        </div>
                                    </TabsContent>
                                </Tabs>

                                {tourPreviewUrl && (
                                    <div className="border rounded-lg p-4">
                                        <h3 className="text-lg font-semibold mb-2">Virtual Tour Preview</h3>
                                        <div className="space-y-4">
                                            <div className="aspect-video bg-gray-100 rounded-md overflow-hidden">
                                                <iframe
                                                    src={tourPreviewUrl}
                                                    className="w-full h-full"
                                                    title={`Virtual tour of ${property.title}`}
                                                    sandbox="allow-same-origin allow-scripts"
                                                    // So an agent can actually test the VR button before
                                                    // publishing - see VirtualTourModal.tsx's identical attribute.
                                                    allow="xr-spatial-tracking; gyroscope; accelerometer; fullscreen"
                                                />
                                            </div>
                                            <div className="flex justify-between">
                                                <Button
                                                    variant="outline"
                                                    onClick={() => window.open(tourPreviewUrl, '_blank')}
                                                >
                                                    <Eye className="mr-2 h-4 w-4" />
                                                    Open in New Tab
                                                </Button>
                                                <Button
                                                    variant="default"
                                                    onClick={() => {
                                                        navigate(`/admin/properties`)
                                                    }}
                                                >
                                                    <ArrowLeft className="mr-2 h-4 w-4" />
                                                    Back to Properties
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </CardContent>
                    <CardFooter className="flex justify-between">
                        <p className="text-sm text-muted-foreground">
                            Note: Upload only 3D Vista tour exports for optimal compatibility
                        </p>
                    </CardFooter>
                </Card>
            </div>
        </div>
    )
}
