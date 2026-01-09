import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { Redirect } from 'wouter'
import { Property } from '@shared/schema'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Heart,
    Eye,
    Calendar,
    MapPin,
    DollarSign,
    Star,
    Clock,
    User,
    Settings,
    Bookmark,
    ShoppingCart,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface ViewedTour {
    tourId: string
    propertyId: string
    price: number
    viewedAt: string
    property?: Property
}

interface WhitelistedProperty {
    propertyId: number
    addedAt: string
    property?: Property
}

export function UserDashboard() {
    const { user } = useAuth()
    const { toast } = useToast()
    const [viewedTours, setViewedTours] = useState<ViewedTour[]>([])
    const [whitelistedProperties, setWhitelistedProperties] = useState<WhitelistedProperty[]>([])
    const [loading, setLoading] = useState(true)
    const [stats, setStats] = useState({
        totalSpent: 0,
        totalTours: 0,
        whitelistedCount: 0,
        thisMonthSpent: 0,
    })

    useEffect(() => {
        const fetchUserData = async () => {
            try {
                setLoading(true)
                // Fetch user's viewed tours
                const toursResponse = await fetch('/api/user/tours')
                let tours = []
                if (toursResponse.ok) {
                    tours = await toursResponse.json()
                }
                // For each tour, fetch the property details (to get viewCount and other info)
                const propertyDetails = await Promise.all(
                    tours.map(async (tour: any) => {
                        try {
                            const propRes = await fetch(`/api/properties/${tour.propertyId}`)
                            if (propRes.ok) {
                                const property = await propRes.json()
                                return { ...tour, property }
                            }
                        } catch (e) {}
                        return { ...tour, property: undefined }
                    })
                )
                setViewedTours(propertyDetails)
                // Calculate stats
                const totalSpent = propertyDetails.reduce((sum, tour) => sum + (tour.price || 0), 0)
                setStats({
                    totalSpent,
                    totalTours: propertyDetails.length,
                    whitelistedCount: 0, // No real backend for this yet
                    thisMonthSpent: 0, // No real logic for this yet
                })
                // Remove mock whitelisted properties, set to empty
                setWhitelistedProperties([])
            } catch (error) {
                console.error('Error fetching user data:', error)
                toast({
                    title: 'Error',
                    description: 'Failed to load dashboard data',
                    variant: 'destructive',
                })
            } finally {
                setLoading(false)
            }
        }
        fetchUserData()
    }, [toast])

    // Redirect if not a normal user (after all hooks)
    if (!user || user.role !== 'normal') {
        return <Redirect to="/auth" />
    }

    if (loading) {
        return (
            <div className="container mx-auto py-8 px-6">
                <div className="flex justify-center items-center min-h-[400px]">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                </div>
            </div>
        )
    }

    return (
        <div className="container mx-auto py-8 px-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">My Dashboard</h1>
                    <p className="text-gray-600 mt-2">Welcome back, {user.fullName || user.username}!</p>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">UGX {stats.totalSpent.toLocaleString()}</div>
                            <p className="text-xs text-muted-foreground">All time spending</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Tours Viewed</CardTitle>
                            <Eye className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.totalTours}</div>
                            <p className="text-xs text-muted-foreground">Virtual tours</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">This Month</CardTitle>
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">UGX {stats.thisMonthSpent.toLocaleString()}</div>
                            <p className="text-xs text-muted-foreground">Spent this month</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Whitelisted</CardTitle>
                            <Heart className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.whitelistedCount}</div>
                            <p className="text-xs text-muted-foreground">Saved properties</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Main Content */}
                <Tabs defaultValue="tours" className="space-y-6">
                    <TabsList>
                        <TabsTrigger value="tours">Viewed Tours</TabsTrigger>
                        <TabsTrigger value="whitelist">Whitelist</TabsTrigger>
                        <TabsTrigger value="profile">Profile</TabsTrigger>
                    </TabsList>

                    <TabsContent value="tours" className="space-y-6">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl font-semibold">My Viewed Tours</h2>
                            <Button variant="outline">
                                <Eye className="mr-2 h-4 w-4" />
                                View All Properties
                            </Button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {viewedTours.map((tour) => (
                                <Card key={tour.tourId} className="hover:shadow-lg transition-shadow">
                                    <CardHeader>
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <CardTitle className="text-lg">
                                                    {tour.property?.title || `Property ${tour.propertyId}`}
                                                </CardTitle>
                                                <CardDescription className="flex items-center mt-1">
                                                    <MapPin className="h-3 w-3 mr-1" />
                                                    {tour.property?.location || 'Location not available'}
                                                </CardDescription>
                                            </div>
                                            <Badge variant="secondary">UGX {tour.price.toLocaleString()}</Badge>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-3">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted-foreground">Property Type:</span>
                                                <span className="font-medium">
                                                    {tour.property?.propertyType || 'Unknown'}
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted-foreground">Viewed:</span>
                                                <span className="font-medium">
                                                    {new Date(tour.viewedAt).toLocaleDateString()}
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted-foreground">Time:</span>
                                                <span className="font-medium">
                                                    {new Date(tour.viewedAt).toLocaleTimeString()}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex gap-2 mt-4">
                                            <Button variant="outline" size="sm" className="flex-1">
                                                <Eye className="mr-1 h-3 w-3" />
                                                View Again
                                            </Button>
                                            <Button variant="outline" size="sm" className="flex-1">
                                                <Heart className="mr-1 h-3 w-3" />
                                                Whitelist
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>

                        {viewedTours.length === 0 && (
                            <Card>
                                <CardContent className="text-center py-12">
                                    <Eye className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                    <h3 className="text-lg font-semibold mb-2">No Tours Viewed Yet</h3>
                                    <p className="text-muted-foreground mb-4">
                                        Start exploring properties and taking virtual tours
                                    </p>
                                    <Button>
                                        <Eye className="mr-2 h-4 w-4" />
                                        Browse Properties
                                    </Button>
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>

                    <TabsContent value="whitelist" className="space-y-6">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl font-semibold">My Whitelist</h2>
                            <Button variant="outline">
                                <Heart className="mr-2 h-4 w-4" />
                                Manage Whitelist
                            </Button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {whitelistedProperties.length === 0 && (
                                <Card>
                                    <CardContent className="text-center py-12">
                                        <Heart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                        <h3 className="text-lg font-semibold mb-2">No Whitelisted Properties</h3>
                                        <p className="text-muted-foreground mb-4">
                                            Start adding properties to your whitelist for quick access
                                        </p>
                                        <Button>
                                            <Heart className="mr-2 h-4 w-4" />
                                            Browse Properties
                                        </Button>
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="profile" className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Account Information</CardTitle>
                                <CardDescription>Manage your account settings and preferences</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Full Name</label>
                                            <p className="text-sm text-muted-foreground">{user.fullName}</p>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Username</label>
                                            <p className="text-sm text-muted-foreground">{user.username}</p>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Email</label>
                                            <p className="text-sm text-muted-foreground">{user.email}</p>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Membership Plan</label>
                                            <p className="text-sm text-muted-foreground">
                                                {user.membershipPlan || 'Basic'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex gap-2">
                                        <Button variant="outline">
                                            <Settings className="mr-2 h-4 w-4" />
                                            Edit Profile
                                        </Button>
                                        <Button variant="outline">
                                            <User className="mr-2 h-4 w-4" />
                                            Change Password
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    )
}
