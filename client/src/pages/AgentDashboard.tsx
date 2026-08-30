import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { Redirect } from 'wouter'
import { Property } from '@shared/schema'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Building,
    Eye,
    Upload,
    Plus,
    BarChart3,
    Users,
    Calendar,
    TrendingUp,
    MapPin,
    DollarSign,
    Trash2,
    ToggleLeft,
    MessageCircle,
    Star,
    Loader2,
    Download,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import PropertyFormNew from '@/components/admin/PropertyFormNew'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useLandlordInbox, useLandlordReviews } from '@/hooks/useLandlordHub'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'

interface PropertyWithViews extends Property {
    viewCount: number
    recentViews?: number
    ownerId?: number
}

export function AgentDashboard() {
    const { user } = useAuth()
    const { toast } = useToast()
    const [properties, setProperties] = useState<PropertyWithViews[]>([])
    const [loading, setLoading] = useState(true)
    const [isAddPropertyOpen, setIsAddPropertyOpen] = useState(false)
    const [stats, setStats] = useState({
        totalProperties: 0,
        totalViews: 0,
        thisMonthViews: 0,
        activeListings: 0,
    })

    // Redirect if not an agent
    if (!user || user.role !== 'agent') {
        return <Redirect to="/auth" />
    }

    // Hoisted out of useEffect (was previously nested there, unreachable from
    // the JSX below that calls it — a pre-existing bug fixed incidentally
    // while wiring in the availability toggle, which also needs to refresh
    // this list after a successful toggle).
    const fetchAgentData = useCallback(async () => {
        try {
            setLoading(true)

            const propertiesResponse = await fetch('/api/agent/properties', {
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
            })
            if (propertiesResponse.ok) {
                const agentProperties = await propertiesResponse.json()
                setProperties(agentProperties)

                // Calculate stats
                const totalViews = agentProperties.reduce(
                    (sum: number, p: PropertyWithViews) => sum + (p.viewCount || 0),
                    0
                )
                const activeListings = agentProperties.filter((p: Property) => p.isAvailable).length

                setStats({
                    totalProperties: agentProperties.length,
                    totalViews,
                    thisMonthViews: Math.floor(totalViews * 0.3), // Mock data
                    activeListings,
                })
            } else {
                console.error(
                    'Failed to fetch properties:',
                    propertiesResponse.status,
                    propertiesResponse.statusText
                )
                toast({
                    title: 'Error',
                    description: `Failed to load properties: ${propertiesResponse.status}`,
                    variant: 'destructive',
                })
            }
        } catch (error) {
            console.error('Error fetching agent data:', error)
            toast({
                title: 'Error',
                description: 'Failed to load dashboard data',
                variant: 'destructive',
            })
        } finally {
            setLoading(false)
        }
    }, [toast])

    const handleDeleteProperty = useCallback(
        async (propertyId: number) => {
            if (!confirm('Are you sure you want to delete this property? This action cannot be undone.')) {
                return
            }

            try {
                const response = await fetch(`/api/agent/properties/${propertyId}`, {
                    method: 'DELETE',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                })

                if (response.ok) {
                    toast({
                        title: 'Property Deleted',
                        description: 'The property has been successfully deleted',
                    })
                    fetchAgentData()
                } else {
                    const errorData = await response.json()
                    throw new Error(errorData.message || 'Failed to delete property')
                }
            } catch (error: any) {
                toast({
                    title: 'Error',
                    description: error.message || 'Failed to delete property',
                    variant: 'destructive',
                })
            }
        },
        [toast, fetchAgentData]
    )

    // Availability toggle — reuses the existing admin/agent-gated
    // /api/properties/:id/toggle-availability route (server/routes.ts), the
    // same one the WhatsApp concierge's owner-checked toggle mirrors for
    // landlords texting "available <id>" / "unavailable <id>".
    const handleToggleAvailability = useCallback(
        async (propertyId: number) => {
            try {
                const response = await fetch(`/api/properties/${propertyId}/toggle-availability`, {
                    method: 'POST',
                    credentials: 'include',
                })
                if (!response.ok) {
                    throw new Error('Failed to update availability')
                }
                const updated = await response.json()
                setProperties((prev) =>
                    prev.map((p) => (p.id === propertyId ? { ...p, isAvailable: updated.isAvailable } : p))
                )
                toast({
                    title: 'Availability updated',
                    description: `"${updated.title}" is now ${updated.isAvailable ? 'available' : 'unavailable'}.`,
                })
            } catch (error: any) {
                toast({
                    title: 'Error',
                    description: error.message || 'Failed to update availability',
                    variant: 'destructive',
                })
            }
        },
        [toast]
    )

    useEffect(() => {
        fetchAgentData()
    }, [fetchAgentData])

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
                <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Agent Dashboard</h1>
                        <p className="text-gray-600 mt-2">Manage your properties and track performance</p>
                    </div>
                    <InstallAppButton />
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Total Properties</CardTitle>
                            <Building className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.totalProperties}</div>
                            <p className="text-xs text-muted-foreground">Active listings</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Total Views</CardTitle>
                            <Eye className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.totalViews}</div>
                            <p className="text-xs text-muted-foreground">All time views</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">This Month</CardTitle>
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.thisMonthViews}</div>
                            <p className="text-xs text-muted-foreground">Views this month</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Active Listings</CardTitle>
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.activeListings}</div>
                            <p className="text-xs text-muted-foreground">Available properties</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Main Content */}
                <Tabs defaultValue="properties" className="space-y-6">
                    <TabsList>
                        <TabsTrigger value="properties">My Properties</TabsTrigger>
                        <TabsTrigger value="analytics">Analytics</TabsTrigger>
                        <TabsTrigger value="tours">Virtual Tours</TabsTrigger>
                        <TabsTrigger value="inbox">Inbox</TabsTrigger>
                        <TabsTrigger value="reviews">Reviews</TabsTrigger>
                    </TabsList>

                    <TabsContent value="properties" className="space-y-6">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl font-semibold">My Properties</h2>
                            <Button onClick={() => setIsAddPropertyOpen(true)}>
                                <Plus className="mr-2 h-4 w-4" />
                                Add Property
                            </Button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {properties && properties.length > 0
                                ? properties.map((property) => (
                                      <Card key={property.id} className="hover:shadow-lg transition-shadow">
                                          <CardHeader>
                                              <div className="flex justify-between items-start">
                                                  <div>
                                                      <CardTitle className="text-lg">{property.title}</CardTitle>
                                                      <CardDescription className="flex items-center mt-1">
                                                          <MapPin className="h-3 w-3 mr-1" />
                                                          {property.location}
                                                      </CardDescription>
                                                  </div>
                                                  <Badge variant={property.isAvailable ? 'default' : 'secondary'}>
                                                      {property.isAvailable ? 'Available' : 'Unavailable'}
                                                  </Badge>
                                              </div>
                                          </CardHeader>
                                          <CardContent>
                                              <div className="space-y-3">
                                                  <div className="flex justify-between text-sm">
                                                      <span className="text-muted-foreground">Price:</span>
                                                      <span className="font-medium">
                                                          {property.currency}{' '}
                                                          {property.price ? property.price.toLocaleString() : 'N/A'}
                                                      </span>
                                                  </div>
                                                  <div className="flex justify-between text-sm">
                                                      <span className="text-muted-foreground">Views:</span>
                                                      <span className="font-medium">{property.viewCount || 0}</span>
                                                  </div>
                                                  <div className="flex justify-between text-sm">
                                                      <span className="text-muted-foreground">Type:</span>
                                                      <span className="font-medium">{property.propertyType}</span>
                                                  </div>
                                              </div>

                                              <div className="flex gap-2 mt-4">
                                                  <Button
                                                      variant="outline"
                                                      size="sm"
                                                      className="flex-1"
                                                      onClick={() =>
                                                          (window.location.href = `/property/${property.id}`)
                                                      }
                                                  >
                                                      <Eye className="mr-1 h-3 w-3" />
                                                      View
                                                  </Button>
                                                  <Button
                                                      variant="outline"
                                                      size="sm"
                                                      className="flex-1"
                                                      onClick={() => {
                                                          // Set tab selection to 'tour' and open edit dialog
                                                          try {
                                                              if (typeof window !== 'undefined') {
                                                                  window.localStorage.setItem('propertyFormTab', 'tour')
                                                              }
                                                          } catch (e) {
                                                              console.error('LocalStorage error:', e)
                                                          }
                                                          // Open property form for editing tour
                                                          setIsAddPropertyOpen(true)
                                                      }}
                                                  >
                                                      <Upload className="mr-1 h-3 w-3" />
                                                      Upload Tour
                                                  </Button>
                                                  <Button
                                                      variant="destructive"
                                                      size="sm"
                                                      className="flex-1"
                                                      onClick={() => handleDeleteProperty(property.id)}
                                                  >
                                                      <Trash2 className="mr-1 h-3 w-3" />
                                                      Delete
                                                  </Button>
                                              </div>
                                              <Button
                                                  variant={property.isAvailable ? 'outline' : 'default'}
                                                  size="sm"
                                                  className="mt-2 w-full"
                                                  onClick={() => handleToggleAvailability(property.id)}
                                              >
                                                  <ToggleLeft className="mr-1 h-3 w-3" />
                                                  Mark as {property.isAvailable ? 'Unavailable' : 'Available'}
                                              </Button>
                                          </CardContent>
                                      </Card>
                                  ))
                                : null}
                        </div>

                        {properties.length === 0 && (
                            <Card>
                                <CardContent className="text-center py-12">
                                    <Building className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                    <h3 className="text-lg font-semibold mb-2">No Properties Yet</h3>
                                    <p className="text-muted-foreground mb-4">
                                        Start by adding your first property listing
                                    </p>
                                    <Button>
                                        <Plus className="mr-2 h-4 w-4" />
                                        Add Your First Property
                                    </Button>
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>

                    <TabsContent value="analytics" className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Property Performance Analytics</CardTitle>
                                <CardDescription>
                                    Detailed analytics for your properties including view trends and performance metrics
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-6">
                                    {/* Overview Stats */}
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <div className="p-4 border rounded-lg text-center">
                                            <p className="text-2xl font-bold text-blue-600">{stats.totalProperties}</p>
                                            <p className="text-sm text-muted-foreground">Total Properties</p>
                                        </div>
                                        <div className="p-4 border rounded-lg text-center">
                                            <p className="text-2xl font-bold text-green-600">{stats.totalViews}</p>
                                            <p className="text-sm text-muted-foreground">Total Views</p>
                                        </div>
                                        <div className="p-4 border rounded-lg text-center">
                                            <p className="text-2xl font-bold text-purple-600">
                                                {stats.totalProperties > 0
                                                    ? Math.round(stats.totalViews / stats.totalProperties)
                                                    : 0}
                                            </p>
                                            <p className="text-sm text-muted-foreground">Avg Views/Property</p>
                                        </div>
                                        <div className="p-4 border rounded-lg text-center">
                                            <p className="text-2xl font-bold text-orange-600">{stats.thisMonthViews}</p>
                                            <p className="text-sm text-muted-foreground">This Month</p>
                                        </div>
                                    </div>

                                    {/* Property Performance */}
                                    <div className="space-y-4">
                                        <h3 className="text-lg font-semibold">Property Performance</h3>
                                        <div className="space-y-3">
                                            {properties && properties.length > 0 ? (
                                                properties.map((property) => (
                                                    <div
                                                        key={property.id}
                                                        className="flex items-center justify-between p-4 border rounded-lg"
                                                    >
                                                        <div className="flex items-center space-x-3">
                                                            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                                                            <div>
                                                                <p className="font-medium">{property.title}</p>
                                                                <p className="text-sm text-muted-foreground">
                                                                    {property.location}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="font-bold">{property.viewCount || 0}</p>
                                                            <p className="text-xs text-muted-foreground">views</p>
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-center py-8 text-muted-foreground">
                                                    No properties to analyze yet
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Quick Actions */}
                                    <div className="flex gap-2">
                                        <Button variant="outline" size="sm">
                                            <BarChart3 className="mr-2 h-4 w-4" />
                                            Export Analytics
                                        </Button>
                                        <Button variant="outline" size="sm">
                                            <TrendingUp className="mr-2 h-4 w-4" />
                                            View Trends
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="tours" className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Virtual Tour Management</CardTitle>
                                <CardDescription>Upload and manage virtual tours for your properties</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <h3 className="text-lg font-semibold">Upload New Tour</h3>
                                        <Button>
                                            <Upload className="mr-2 h-4 w-4" />
                                            Upload Tour
                                        </Button>
                                    </div>

                                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                                        <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                        <h3 className="text-lg font-semibold mb-2">Upload Virtual Tour</h3>
                                        <p className="text-muted-foreground mb-4">
                                            Drag and drop your tour files here or click to browse
                                        </p>
                                        <Button variant="outline">Choose Files</Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="inbox" className="space-y-6">
                        <InboxTab />
                    </TabsContent>

                    <TabsContent value="reviews" className="space-y-6">
                        <ReviewsTab />
                    </TabsContent>
                </Tabs>
            </div>

            {/* Add Property Dialog */}
            <Dialog open={isAddPropertyOpen} onOpenChange={setIsAddPropertyOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Add New Property</DialogTitle>
                    </DialogHeader>
                    <PropertyFormNew
                        onSuccess={() => {
                            setIsAddPropertyOpen(false)
                            // Refresh the properties list
                            fetchAgentData()
                            toast({
                                title: 'Property Added',
                                description: 'Your property has been successfully added.',
                            })
                        }}
                    />
                </DialogContent>
            </Dialog>
        </div>
    )
}

/** "Install app" button — the practical form of the "mini downloadable app"
 * for landlords: an installable PWA rather than a native app (see
 * useInstallPrompt.ts's docstring for why, and the iOS fallback below). */
function InstallAppButton() {
    const { promptable, installed, promptInstall } = useInstallPrompt()
    const isIos = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)

    if (installed) return null

    if (promptable) {
        return (
            <Button variant="outline" onClick={() => promptInstall()}>
                <Download className="mr-2 h-4 w-4" />
                Install app
            </Button>
        )
    }

    if (isIos) {
        return (
            <p className="max-w-xs text-xs text-muted-foreground">
                Install this dashboard as an app: tap the Share button in Safari, then "Add to Home Screen".
            </p>
        )
    }

    return null
}

/** Interested tenants + WhatsApp messages for the properties this landlord
 * owns (server/gene/landlord-hub.ts). */
function InboxTab() {
    const inboxQuery = useLandlordInbox(true)

    if (inboxQuery.isLoading) {
        return (
            <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    const interestedTenants = inboxQuery.data?.interestedTenants ?? []
    const messages = inboxQuery.data?.messages ?? []

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Users className="h-4 w-4" /> Interested Tenants
                    </CardTitle>
                    <CardDescription>People who viewed, saved, or inquired about your listings.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {interestedTenants.length === 0 && (
                        <p className="text-sm text-muted-foreground py-6 text-center">
                            No tenant activity yet on your properties.
                        </p>
                    )}
                    {interestedTenants.map((t, i) => (
                        <div key={i} className="flex items-center justify-between rounded-lg border p-3">
                            <div>
                                <p className="font-medium text-sm">{t.tenantName}</p>
                                <p className="text-xs text-muted-foreground">
                                    {t.propertyTitle} · {t.action}
                                </p>
                            </div>
                            <Badge variant="secondary">{new Date(t.createdAt).toLocaleDateString()}</Badge>
                        </div>
                    ))}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <MessageCircle className="h-4 w-4" /> WhatsApp Messages
                    </CardTitle>
                    <CardDescription>
                        Conversations about your properties, including availability toggles you sent by text.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {messages.length === 0 && (
                        <p className="text-sm text-muted-foreground py-6 text-center">
                            No WhatsApp activity yet. Link your number from your agent profile to toggle
                            availability by texting "available &lt;id&gt;" / "unavailable &lt;id&gt;".
                        </p>
                    )}
                    {messages.map((m) => (
                        <div key={m.id} className="rounded-lg border p-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    {m.direction === 'inbound' ? 'Received' : 'Sent'} · {m.propertyTitle ?? 'General'}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {new Date(m.createdAt).toLocaleString()}
                                </span>
                            </div>
                            <p className="mt-1 text-sm">{m.text}</p>
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    )
}

/** Reviews left on this landlord's properties (server/gene/landlord-hub.ts). */
function ReviewsTab() {
    const reviewsQuery = useLandlordReviews(true)

    if (reviewsQuery.isLoading) {
        return (
            <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    const reviews = reviewsQuery.data ?? []

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                    <Star className="h-4 w-4" /> Reviews
                </CardTitle>
                <CardDescription>What tenants and buyers are saying about your properties.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {reviews.length === 0 && (
                    <p className="text-sm text-muted-foreground py-6 text-center">No reviews yet.</p>
                )}
                {reviews.map((r) => (
                    <div key={r.id} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between">
                            <p className="font-medium text-sm">{r.propertyTitle}</p>
                            <div className="flex items-center gap-0.5">
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <Star
                                        key={i}
                                        className={`h-3.5 w-3.5 ${i < r.rating ? 'fill-current text-yellow-500' : 'text-muted-foreground/30'}`}
                                    />
                                ))}
                            </div>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{r.text}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            — {r.reviewerName}, {new Date(r.createdAt).toLocaleDateString()}
                        </p>
                    </div>
                ))}
            </CardContent>
        </Card>
    )
}
