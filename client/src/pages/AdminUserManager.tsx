import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { Redirect } from 'wouter'
import { User, Property } from '@shared/schema'
import type { Review } from '../../../shared/schemas/review'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
    Star,
    Home,
    Users,
    UserPlus,
    UserMinus,
    Shield,
    UserCheck,
    BarChart3,
    TrendingUp,
    Eye,
    Building,
    Activity,
    Calendar,
    DollarSign,
    CreditCard,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import TourPaymentsDashboard from '@/components/admin/TourPaymentsDashboard'

interface AdminAnalytics {
    totalProperties: number
    totalUsers: number
    totalViews: number
    topAgents: Array<{ agentId: number; agentName: string; propertyCount: number; totalViews: number }>
    topProperties: Array<{ propertyId: number; title: string; viewCount: number; ownerName: string }>
    viewsByCategory: Array<{ category: string; count: number }>
    recentActivity: Array<{ type: string; description: string; timestamp: string }>
}

interface AgentSubscription {
    agentId: number
    agentName: string
    email: string
    companyName?: string
    phoneNumber?: string
    licenseNumber?: string
    subscriptionPlan: string
    subscriptionStatus: string
    membershipStartDate: string
    membershipEndDate: string
    subscriptionPaymentId?: string
    propertyCount: number
    totalViews: number
    isExpired: boolean
    daysUntilExpiry: number
}

interface AgentProperty {
    propertyId: number
    title: string
    location: string
    price: number
    category: string
    viewCount: number
    createdAt: string
    isAvailable: boolean
}

export default function AdminUserManager() {
    // isLoading matters here: useAuth's /api/user query is still in flight on
    // first mount, so `user` is `undefined` for a beat even for a genuinely
    // logged-in admin. The old code checked only `!user`, which fired the
    // redirect below during that beat — bouncing real admins to /auth on
    // every load — and did it *before* the useEffect hook further down,
    // which is a Rules-of-Hooks violation (a conditional early return between
    // hooks changes how many hooks get called between renders once `user`
    // resolves). Fixed by calling every hook unconditionally first and only
    // branching on `user`/`isLoading` in the render below, once, after all
    // of them.
    const { user, isLoading: authLoading } = useAuth()
    const { toast } = useToast()
    const [users, setUsers] = useState<User[]>([])
    const [loading, setLoading] = useState(true)
    const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null)
    const [agentSubscriptions, setAgentSubscriptions] = useState<AgentSubscription[]>([])
    const [selectedAgent, setSelectedAgent] = useState<AgentSubscription | null>(null)
    const [agentProperties, setAgentProperties] = useState<AgentProperty[]>([])
    const [showAgentDetails, setShowAgentDetails] = useState(false)
    const [properties, setProperties] = useState<Property[]>([])
    const [reviews, setReviews] = useState<Review[]>([])
    const [profileUser, setProfileUser] = useState<User | null>(null)

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true)

                // One consolidated call instead of stitching several endpoints together -
                // see /api/admin/overview, which is also what an AI agent should hit for
                // the full picture in a single request.
                const overviewResponse = await fetch('/api/admin/overview', {
                    credentials: 'include',
                })

                if (overviewResponse.ok) {
                    const overview = await overviewResponse.json()
                    setUsers(overview.users)
                    setAnalytics(overview.analytics)
                    setAgentSubscriptions(overview.agentSubscriptions)
                    setProperties(overview.properties)
                    setReviews(overview.reviews)
                } else {
                    // BUG FIX: a non-2xx response (401/403/500) used to be
                    // silently ignored here — `users` etc. just stayed at
                    // their empty initial state with no error shown at all,
                    // which looks identical to "there are no users" even
                    // when the real cause is e.g. a rejected/expired
                    // session. Now it's surfaced.
                    const body = await overviewResponse.json().catch(() => ({}))
                    console.error('[AdminUserManager] /api/admin/overview failed:', overviewResponse.status, body)
                    toast({
                        title: `Couldn't load admin data (${overviewResponse.status})`,
                        description: body?.message || 'Try refreshing — if this keeps happening, your session may need a fresh sign-in.',
                        variant: 'destructive',
                    })
                }
            } catch (error) {
                console.error('Error fetching data:', error)
                toast({
                    title: 'Error',
                    description: 'Failed to load data',
                    variant: 'destructive',
                })
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [toast])

    const handleRoleUpdate = async (userId: number, newRole: string) => {
        try {
            const response = await fetch(`/api/users/${userId}/role`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ role: newRole }),
            })

            if (response.ok) {
                toast({
                    title: 'Success',
                    description: `User role updated to ${newRole}`,
                })

                // Refresh users list
                const usersResponse = await fetch('/api/users', {
                    credentials: 'include',
                })
                if (usersResponse.ok) {
                    const usersData = await usersResponse.json()
                    setUsers(usersData)
                }
            } else {
                toast({
                    title: 'Error',
                    description: 'Failed to update user role',
                    variant: 'destructive',
                })
            }
        } catch (error) {
            console.error('Error updating user role:', error)
            toast({
                title: 'Error',
                description: 'Failed to update user role',
                variant: 'destructive',
            })
        }
    }

    const getRoleBadge = (role: string) => {
        const variants = {
            admin: 'destructive',
            agent: 'default',
            normal: 'secondary',
        } as const

        return <Badge variant={variants[role as keyof typeof variants] || 'secondary'}>{role}</Badge>
    }

    const getSubscriptionStatusBadge = (status: string, isExpired: boolean) => {
        if (isExpired) {
            return <Badge variant="destructive">Expired</Badge>
        }

        const variants = {
            active: 'default',
            inactive: 'secondary',
            expired: 'destructive',
        } as const

        return (
            <Badge variant={variants[status as keyof typeof variants] || 'secondary'}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
            </Badge>
        )
    }

    const getPlanBadge = (plan: string) => {
        const variants = {
            basic: 'secondary',
            professional: 'default',
            enterprise: 'destructive',
        } as const

        return (
            <Badge variant={variants[plan as keyof typeof variants] || 'secondary'}>
                {plan.charAt(0).toUpperCase() + plan.slice(1)}
            </Badge>
        )
    }

    const handleViewAgentDetails = async (agent: AgentSubscription) => {
        try {
            setSelectedAgent(agent)

            // Fetch agent's properties
            const propertiesResponse = await fetch(`/api/admin/agent-properties/${agent.agentId}`, {
                credentials: 'include',
            })

            if (propertiesResponse.ok) {
                const propertiesData = await propertiesResponse.json()
                setAgentProperties(propertiesData)
                setShowAgentDetails(true)
            }
        } catch (error) {
            console.error('Error fetching agent properties:', error)
            toast({
                title: 'Error',
                description: 'Failed to load agent properties',
                variant: 'destructive',
            })
        }
    }

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        })
    }

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-UG', {
            style: 'currency',
            currency: 'UGX',
        }).format(amount)
    }

    // Wait for the session check itself before judging who's logged in —
    // `user` is legitimately `undefined` for a beat on first load even for a
    // real admin, and redirecting during that beat is exactly the bug this
    // page had (see the comment at the top of the component).
    if (authLoading) {
        return (
            <div className="container mx-auto px-6 py-8">
                <div className="text-center">Loading...</div>
            </div>
        )
    }

    if (!user || user.role !== 'admin') {
        return <Redirect to="/auth" />
    }

    if (loading) {
        return (
            <div className="container mx-auto px-6 py-8">
                <div className="text-center">Loading...</div>
            </div>
        )
    }

    return (
        <div className="container mx-auto px-6 py-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
                <p className="text-muted-foreground">
                    Users, properties, reviews, subscriptions, payments, and analytics — all in one place.
                </p>
            </div>

            <Tabs defaultValue="users" className="space-y-6">
                <TabsList>
                    <TabsTrigger value="users">User Management</TabsTrigger>
                    <TabsTrigger value="properties">Properties</TabsTrigger>
                    <TabsTrigger value="reviews">Reviews</TabsTrigger>
                    <TabsTrigger value="subscriptions">Agent Subscriptions</TabsTrigger>
                    <TabsTrigger value="tour-payments">Tour Payments</TabsTrigger>
                    <TabsTrigger value="analytics">System Analytics</TabsTrigger>
                </TabsList>

                <TabsContent value="users" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>User Management</CardTitle>
                            <CardDescription>Manage user roles and permissions</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {users.length === 0 ? (
                                <div className="text-center py-8">
                                    <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                    <h3 className="text-lg font-semibold mb-2">No users to show</h3>
                                    <p className="text-muted-foreground">
                                        If you expected real users here, check the toast above for a load error —
                                        an empty list and a failed request used to look identical.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {users.map((user) => (
                                        <div
                                            key={user.id}
                                            className="flex items-center justify-between p-4 border rounded-lg"
                                        >
                                            <button
                                                type="button"
                                                onClick={() => setProfileUser(user)}
                                                className="flex items-center space-x-3 text-left hover:opacity-75 transition-opacity"
                                            >
                                                <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                                                    <Users className="h-5 w-5 text-gray-600" />
                                                </div>
                                                <div>
                                                    <p className="font-medium">{user.fullName}</p>
                                                    <p className="text-sm text-muted-foreground">{user.email}</p>
                                                    <p className="text-xs text-muted-foreground">@{user.username}</p>
                                                </div>
                                            </button>
                                            <div className="flex items-center space-x-3">
                                                {getRoleBadge(user.role)}
                                                <div className="flex space-x-1">
                                                    <Button variant="outline" size="sm" onClick={() => setProfileUser(user)}>
                                                        View Profile
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleRoleUpdate(user.id, 'normal')}
                                                        disabled={user.role === 'normal'}
                                                    >
                                                        Normal
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleRoleUpdate(user.id, 'agent')}
                                                        disabled={user.role === 'agent'}
                                                    >
                                                        Agent
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleRoleUpdate(user.id, 'admin')}
                                                        disabled={user.role === 'admin'}
                                                    >
                                                        Admin
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="subscriptions" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Agent Subscriptions</CardTitle>
                            <CardDescription>
                                Track agent subscription status, properties, and performance
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {agentSubscriptions.length === 0 ? (
                                    <div className="text-center py-8">
                                        <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                        <h3 className="text-lg font-semibold mb-2">No Agent Subscriptions</h3>
                                        <p className="text-muted-foreground">No agents have registered yet.</p>
                                    </div>
                                ) : (
                                    agentSubscriptions.map((agent) => (
                                        <div
                                            key={agent.agentId}
                                            className="border rounded-lg p-6 hover:shadow-md transition-shadow"
                                        >
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="flex items-center space-x-3">
                                                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                                                        <Users className="h-6 w-6 text-blue-600" />
                                                    </div>
                                                    <div>
                                                        <h3 className="text-lg font-semibold">{agent.agentName}</h3>
                                                        <p className="text-sm text-muted-foreground">{agent.email}</p>
                                                        {agent.companyName && (
                                                            <p className="text-sm text-muted-foreground">
                                                                {agent.companyName}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    {getSubscriptionStatusBadge(
                                                        agent.subscriptionStatus,
                                                        agent.isExpired
                                                    )}
                                                    {getPlanBadge(agent.subscriptionPlan)}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                                                <div className="bg-gray-50 rounded-lg p-3">
                                                    <p className="text-sm text-muted-foreground">Properties</p>
                                                    <p className="text-xl font-bold">{agent.propertyCount}</p>
                                                </div>
                                                <div className="bg-gray-50 rounded-lg p-3">
                                                    <p className="text-sm text-muted-foreground">Total Views</p>
                                                    <p className="text-xl font-bold">
                                                        {agent.totalViews.toLocaleString()}
                                                    </p>
                                                </div>
                                                <div className="bg-gray-50 rounded-lg p-3">
                                                    <p className="text-sm text-muted-foreground">Subscription Ends</p>
                                                    <p className="text-sm font-semibold">
                                                        {formatDate(agent.membershipEndDate)}
                                                    </p>
                                                </div>
                                                <div className="bg-gray-50 rounded-lg p-3">
                                                    <p className="text-sm text-muted-foreground">Days Left</p>
                                                    <p
                                                        className={`text-sm font-semibold ${
                                                            agent.daysUntilExpiry <= 7
                                                                ? 'text-red-600'
                                                                : 'text-green-600'
                                                        }`}
                                                    >
                                                        {agent.daysUntilExpiry} days
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between">
                                                <div className="text-sm text-muted-foreground">
                                                    <p>Started: {formatDate(agent.membershipStartDate)}</p>
                                                    {agent.phoneNumber && <p>Phone: {agent.phoneNumber}</p>}
                                                    {agent.licenseNumber && <p>License: {agent.licenseNumber}</p>}
                                                </div>
                                                <Button variant="outline" onClick={() => handleViewAgentDetails(agent)}>
                                                    View Properties
                                                </Button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="tour-payments" className="space-y-6">
                    <TourPaymentsDashboard />
                </TabsContent>

                <TabsContent value="analytics" className="space-y-6">
                    {analytics && (
                        <>
                            {/* Overview Stats */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <Card>
                                    <CardContent className="p-6">
                                        <div className="flex items-center space-x-2">
                                            <Building className="h-5 w-5 text-blue-600" />
                                            <div>
                                                <p className="text-2xl font-bold">{analytics.totalProperties}</p>
                                                <p className="text-sm text-muted-foreground">Total Properties</p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardContent className="p-6">
                                        <div className="flex items-center space-x-2">
                                            <Users className="h-5 w-5 text-green-600" />
                                            <div>
                                                <p className="text-2xl font-bold">{analytics.totalUsers}</p>
                                                <p className="text-sm text-muted-foreground">Total Users</p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardContent className="p-6">
                                        <div className="flex items-center space-x-2">
                                            <Eye className="h-5 w-5 text-purple-600" />
                                            <div>
                                                <p className="text-2xl font-bold">{analytics.totalViews}</p>
                                                <p className="text-sm text-muted-foreground">Total Views</p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardContent className="p-6">
                                        <div className="flex items-center space-x-2">
                                            <Activity className="h-5 w-5 text-orange-600" />
                                            <div>
                                                <p className="text-2xl font-bold">{analytics.topAgents.length}</p>
                                                <p className="text-sm text-muted-foreground">Active Agents</p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Top Agents */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Top Performing Agents</CardTitle>
                                    <CardDescription>Agents with the most properties and views</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3">
                                        {analytics.topAgents.map((agent, index) => (
                                            <div
                                                key={agent.agentId}
                                                className="flex items-center justify-between p-3 border rounded-lg"
                                            >
                                                <div className="flex items-center space-x-3">
                                                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                                        <span className="text-sm font-bold text-blue-600">
                                                            {index + 1}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <p className="font-medium">{agent.agentName}</p>
                                                        <p className="text-sm text-muted-foreground">
                                                            {agent.propertyCount} properties
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-bold">{agent.totalViews}</p>
                                                    <p className="text-xs text-muted-foreground">total views</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Top Properties */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Most Viewed Properties</CardTitle>
                                    <CardDescription>Properties with the highest view counts</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3">
                                        {analytics.topProperties.map((property, index) => (
                                            <div
                                                key={property.propertyId}
                                                className="flex items-center justify-between p-3 border rounded-lg"
                                            >
                                                <div className="flex items-center space-x-3">
                                                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                                                        <span className="text-sm font-bold text-green-600">
                                                            {index + 1}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <p className="font-medium">{property.title}</p>
                                                        <p className="text-sm text-muted-foreground">
                                                            by {property.ownerName}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-bold">{property.viewCount}</p>
                                                    <p className="text-xs text-muted-foreground">views</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Views by Category */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Views by Property Category</CardTitle>
                                    <CardDescription>View distribution across property types</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3">
                                        {analytics.viewsByCategory.map((category) => (
                                            <div
                                                key={category.category}
                                                className="flex items-center justify-between p-3 border rounded-lg"
                                            >
                                                <div className="flex items-center space-x-3">
                                                    <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                                                    <span className="font-medium capitalize">
                                                        {category.category.replace('_', ' ')}
                                                    </span>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-bold">{category.count}</p>
                                                    <p className="text-xs text-muted-foreground">views</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </>
                    )}
                </TabsContent>

                <TabsContent value="properties" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Home className="h-5 w-5" /> Properties ({properties.length})
                            </CardTitle>
                            <CardDescription>Every listing on the platform, in one place</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Title</TableHead>
                                        <TableHead>Location</TableHead>
                                        <TableHead>Category</TableHead>
                                        <TableHead>Price</TableHead>
                                        <TableHead>Views</TableHead>
                                        <TableHead>Rating</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {properties.map((p) => (
                                        <TableRow key={p.id}>
                                            <TableCell className="font-medium">{p.title}</TableCell>
                                            <TableCell>{p.location}</TableCell>
                                            <TableCell className="capitalize">{p.category}</TableCell>
                                            <TableCell>
                                                {p.currency} {p.price.toLocaleString()}
                                            </TableCell>
                                            <TableCell>{p.viewCount ?? 0}</TableCell>
                                            <TableCell>
                                                {p.rating} ({p.reviewCount})
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={p.isAvailable ? 'default' : 'secondary'}>
                                                    {p.isAvailable ? 'Available' : 'Unavailable'}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="reviews" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Star className="h-5 w-5" /> Reviews ({reviews.length})
                            </CardTitle>
                            <CardDescription>Every review left across all properties</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {reviews.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No reviews yet.</p>
                            ) : (
                                <div className="space-y-3">
                                    {reviews.map((r) => (
                                        <div key={r.id} className="rounded-lg border p-4">
                                            <div className="flex items-center justify-between">
                                                <span className="font-medium">{r.userName}</span>
                                                <span className="flex items-center gap-1 text-sm text-amber-500">
                                                    <Star className="h-4 w-4 fill-amber-400" /> {r.rating}/5
                                                </span>
                                            </div>
                                            <p className="mt-1 text-sm text-muted-foreground">{r.comment}</p>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                Property #{r.propertyId} ·{' '}
                                                {new Date(r.createdAt).toLocaleDateString()}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Agent Details Modal */}
            {showAgentDetails && selectedAgent && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-bold">Agent Details: {selectedAgent.agentName}</h2>
                            <Button variant="outline" onClick={() => setShowAgentDetails(false)}>
                                Close
                            </Button>
                        </div>

                        {/* Agent Info */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Subscription Information</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Plan:</span>
                                        <span className="font-medium">
                                            {getPlanBadge(selectedAgent.subscriptionPlan)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Status:</span>
                                        <span>
                                            {getSubscriptionStatusBadge(
                                                selectedAgent.subscriptionStatus,
                                                selectedAgent.isExpired
                                            )}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Started:</span>
                                        <span className="font-medium">
                                            {formatDate(selectedAgent.membershipStartDate)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Ends:</span>
                                        <span className="font-medium">
                                            {formatDate(selectedAgent.membershipEndDate)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Days Left:</span>
                                        <span
                                            className={`font-medium ${
                                                selectedAgent.daysUntilExpiry <= 7 ? 'text-red-600' : 'text-green-600'
                                            }`}
                                        >
                                            {selectedAgent.daysUntilExpiry} days
                                        </span>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Contact Information</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Email:</span>
                                        <span className="font-medium">{selectedAgent.email}</span>
                                    </div>
                                    {selectedAgent.phoneNumber && (
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Phone:</span>
                                            <span className="font-medium">{selectedAgent.phoneNumber}</span>
                                        </div>
                                    )}
                                    {selectedAgent.companyName && (
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Company:</span>
                                            <span className="font-medium">{selectedAgent.companyName}</span>
                                        </div>
                                    )}
                                    {selectedAgent.licenseNumber && (
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">License:</span>
                                            <span className="font-medium">{selectedAgent.licenseNumber}</span>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        {/* Performance Stats */}
                        <Card className="mb-6">
                            <CardHeader>
                                <CardTitle>Performance Overview</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="text-center">
                                        <p className="text-2xl font-bold text-blue-600">
                                            {selectedAgent.propertyCount}
                                        </p>
                                        <p className="text-sm text-muted-foreground">Total Properties</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-2xl font-bold text-green-600">
                                            {selectedAgent.totalViews.toLocaleString()}
                                        </p>
                                        <p className="text-sm text-muted-foreground">Total Views</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-2xl font-bold text-purple-600">
                                            {selectedAgent.propertyCount > 0
                                                ? Math.round(selectedAgent.totalViews / selectedAgent.propertyCount)
                                                : 0}
                                        </p>
                                        <p className="text-sm text-muted-foreground">Avg Views per Property</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Properties List */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Properties ({agentProperties.length})</CardTitle>
                                <CardDescription>All properties listed by this agent</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {agentProperties.length === 0 ? (
                                    <div className="text-center py-8">
                                        <Building className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                        <h3 className="text-lg font-semibold mb-2">No Properties Listed</h3>
                                        <p className="text-muted-foreground">
                                            This agent hasn't listed any properties yet.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {agentProperties.map((property) => (
                                            <div
                                                key={property.propertyId}
                                                className="border rounded-lg p-4 hover:shadow-sm transition-shadow"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <h4 className="font-semibold">{property.title}</h4>
                                                        <p className="text-sm text-muted-foreground">
                                                            {property.location}
                                                        </p>
                                                        <div className="flex items-center space-x-4 mt-1">
                                                            <span className="text-sm text-muted-foreground">
                                                                {formatCurrency(property.price)}
                                                            </span>
                                                            <Badge variant="outline" className="text-xs">
                                                                {property.category.replace('_', ' ')}
                                                            </Badge>
                                                            <Badge
                                                                variant={property.isAvailable ? 'default' : 'secondary'}
                                                                className="text-xs"
                                                            >
                                                                {property.isAvailable ? 'Available' : 'Unavailable'}
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-lg font-bold text-blue-600">
                                                            {property.viewCount}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground">views</p>
                                                        <p className="text-xs text-muted-foreground mt-1">
                                                            Listed: {formatDate(property.createdAt)}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}

            {/* "I want to see their profiles" — every field the app actually
                collects for a user, in one place, reached from a "View
                Profile" button on each row above. */}
            <Dialog open={profileUser !== null} onOpenChange={(open) => !open && setProfileUser(null)}>
                <DialogContent className="max-w-lg">
                    {profileUser && (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center shrink-0">
                                        <Users className="h-5 w-5 text-gray-600" />
                                    </div>
                                    {profileUser.fullName}
                                </DialogTitle>
                                <DialogDescription>@{profileUser.username} — {getRoleBadge(profileUser.role)}</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-3 text-sm">
                                <ProfileField label="Email" value={profileUser.email} />
                                <ProfileField label="Phone" value={(profileUser as any).phoneNumber} />
                                <ProfileField label="Country code" value={(profileUser as any).countryCode} />
                                <ProfileField
                                    label="Verified"
                                    value={profileUser.isVerified ? 'Yes' : 'No'}
                                />
                                <ProfileField
                                    label="Sign-in method"
                                    value={(profileUser as any).authProvider || 'local'}
                                />
                                {profileUser.role === 'agent' && (
                                    <>
                                        <ProfileField label="Company" value={(profileUser as any).companyName} />
                                        <ProfileField label="License number" value={(profileUser as any).licenseNumber} />
                                        <ProfileField label="Membership plan" value={(profileUser as any).membershipPlan} />
                                        <ProfileField
                                            label="Subscription status"
                                            value={(profileUser as any).subscriptionStatus}
                                        />
                                    </>
                                )}
                                <ProfileField
                                    label="Joined"
                                    value={(profileUser as any).createdAt ? formatDate((profileUser as any).createdAt) : undefined}
                                />
                                {(() => {
                                    const owned = properties.filter((p) => (p as any).ownerId === profileUser.id)
                                    if (owned.length === 0) return null
                                    return (
                                        <div className="pt-2 border-t">
                                            <p className="text-muted-foreground mb-1">
                                                {owned.length} propert{owned.length === 1 ? 'y' : 'ies'} listed
                                            </p>
                                            <ul className="space-y-1">
                                                {owned.slice(0, 5).map((p) => (
                                                    <li key={p.id} className="text-xs">
                                                        {p.title} — {p.location}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )
                                })()}
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}

/** One label/value row in the profile dialog — skips rendering entirely
 * when the field is genuinely absent, rather than showing a blank or
 * "undefined" (this app has real accounts predating several of these
 * fields — see shared/schema.ts's v1.8-addition comments). */
function ProfileField({ label, value }: { label: string; value?: string | null }) {
    if (!value) return null
    return (
        <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium text-right">{value}</span>
        </div>
    )
}
