import React, { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { TrendingUp, CreditCard, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface GatewayStats {
    total: number
    completed: number
    failed: number
    successRate: string
    totalVolume: number
}

interface AnalyticsData {
    flutterwave: GatewayStats
    iotech: GatewayStats
    fallbacks: { total: number; rate: string }
}

interface UserPrefsData {
    flutterwave: { count: number; percentage: string }
    iotech: { count: number; percentage: string }
    total: number
}

const COLORS = ['#FF5A5F', '#3B82F6']

export function PaymentAnalytics() {
    const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
    const [userPrefs, setUserPrefs] = useState<UserPrefsData | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const fetchData = async () => {
        setLoading(true)
        setError(null)
        try {
            const [analyticsRes, prefsRes] = await Promise.all([
                fetch('/api/admin/analytics/gateway-performance'),
                fetch('/api/admin/analytics/user-preferences'),
            ])

            if (analyticsRes.ok) setAnalytics(await analyticsRes.json())
            if (prefsRes.ok) setUserPrefs(await prefsRes.json())
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [])

    const barData = analytics
        ? [
              {
                  name: 'Flutterwave',
                  completed: analytics.flutterwave.completed,
                  failed: analytics.flutterwave.failed,
              },
              {
                  name: 'iOTECT',
                  completed: analytics.iotech.completed,
                  failed: analytics.iotech.failed,
              },
          ]
        : []

    const pieData = userPrefs
        ? [
              { name: 'Flutterwave', value: userPrefs.flutterwave.count },
              { name: 'iOTECT', value: userPrefs.iotech.count },
          ]
        : []

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Payment Gateway Analytics</h2>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchData}
                    disabled={loading}
                    className="gap-2"
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                    {error}
                </div>
            )}

            {/* Stats Cards */}
            {analytics && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-gray-500">
                                Flutterwave Success Rate
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-2">
                                <CheckCircle className="h-5 w-5 text-green-500" />
                                <span className="text-2xl font-bold">{analytics.flutterwave.successRate}</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                {analytics.flutterwave.completed}/{analytics.flutterwave.total} transactions
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-gray-500">
                                iOTECT Success Rate
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-2">
                                <CheckCircle className="h-5 w-5 text-blue-500" />
                                <span className="text-2xl font-bold">{analytics.iotech.successRate}</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                {analytics.iotech.completed}/{analytics.iotech.total} transactions
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-gray-500">
                                Total Volume (UGX)
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-2">
                                <CreditCard className="h-5 w-5 text-primary" />
                                <span className="text-2xl font-bold">
                                    {(
                                        analytics.flutterwave.totalVolume + analytics.iotech.totalVolume
                                    ).toLocaleString()}
                                </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Across both gateways</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-gray-500">
                                Fallback Rate
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5 text-orange-500" />
                                <span className="text-2xl font-bold">{analytics.fallbacks.rate}</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                {analytics.fallbacks.total} gateway switches
                            </p>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Transactions by Gateway</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={barData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="completed" fill="#22c55e" name="Completed" />
                                <Bar dataKey="failed" fill="#ef4444" name="Failed" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">User Gateway Preferences</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={250}>
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="value"
                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                >
                                    {pieData.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                        {userPrefs && (
                            <div className="flex justify-center gap-6 mt-2">
                                <div className="flex items-center gap-2 text-sm">
                                    <span className="w-3 h-3 rounded-full bg-[#FF5A5F]" />
                                    Flutterwave ({userPrefs.flutterwave.percentage})
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                    <span className="w-3 h-3 rounded-full bg-[#3B82F6]" />
                                    iOTECT ({userPrefs.iotech.percentage})
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

export default PaymentAnalytics
