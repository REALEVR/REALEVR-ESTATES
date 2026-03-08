import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { Redirect } from 'wouter'
import { User } from '@shared/schema'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
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
    const { user } = useAuth()
    const { toast } = useToast()
    const [users, setUsers] = useState<User[]>([])
    const [loading, setLoading] = useState(true)
    const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null)
    const [agentSubscriptions, setAgentSubscriptions] = useState<AgentSubscription[]>([])
    const [selectedAgent, setSelectedAgent] = useState<AgentSubscription | null>(null)
    const [agentProperties, setAgentProperties] = useState<AgentProperty[]>([])
    const [showAgentDetails, setShowAgentDetails] = useState(false)

    // Redirect if not admin
    if (!user || user.role !== 'admin') {
        return <Redirect to="/auth" />
    }

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true)

                // Fetch users
                const usersResponse = await fetch('/api/users', {
                    credentials: 'include',
                })

                if (usersResponse.ok) {
                    const usersData = await usersResponse.json()
                    setUsers(usersData)
                }

                // Fetch admin analytics
                const analyticsResponse = await fetch('/api/analytics/admin-overview', {
                    credentials: 'include',
                })

                if (analyticsResponse.ok) {
                    const analyticsData = await analyticsResponse.json()
                    setAnalytics(analyticsData)
                }

                // Fetch agent subscriptions
                const subscriptionsResponse = await fetch('/api/admin/agent-subscriptions', {
                    credentials: 'include',
                })

                if (subscriptionsResponse.ok) {
                    const subscriptionsData = await subscriptionsResponse.json()
                    setAgentSubscriptions(subscriptionsData)
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
                <p className="text-muted-foreground">Manage users and view system analytics</p>
            </div>

            <Tabs defaultValue="users" className="space-y-6">
                <TabsList>
                    <TabsTrigger value="users">User Management</TabsTrigger>
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
                            <div className="space-y-4">
                                {users.map((user) => (
                                    <div
                                        key={user.id}
                                        className="flex items-center justify-between p-4 border rounded-lg"
                                    >
                                        <div className="flex items-center space-x-3">
                                            <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                                                <Users className="h-5 w-5 text-gray-600" />
                                            </div>
                                            <div>
                                                <p className="font-medium">{user.fullName}</p>
                                                <p className="text-sm text-muted-foreground">{user.email}</p>
                                                <p className="text-xs text-muted-foreground">@{user.username}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center space-x-3">
                                            {getRoleBadge(user.role)}
                                            <div className="flex space-x-1">
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
        </div>
    )
}
