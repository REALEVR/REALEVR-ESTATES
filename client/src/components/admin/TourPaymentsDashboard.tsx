import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
    Search,
    Filter,
    Download,
    Eye,
    User,
    Building,
    CreditCard,
    Calendar,
    DollarSign,
    TrendingUp,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface TourPayment {
    id: number
    transactionId: string
    propertyId: number
    propertyTitle: string
    propertyLocation: string
    userId?: number
    userName: string
    userEmail: string
    amount: number
    currency: string
    paymentTimestamp: string
    createdAt: string
}

export default function TourPaymentsDashboard() {
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedPayment, setSelectedPayment] = useState<TourPayment | null>(null)
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
    const { toast } = useToast()

    const {
        data: tourPayments,
        isLoading,
        error,
    } = useQuery<TourPayment[]>({
        queryKey: ['/api/admin/tour-payments'],
    })

    // Filter payments based on search term
    const filteredPayments =
        tourPayments?.filter(
            (payment) =>
                payment.propertyTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
                payment.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                payment.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
                payment.propertyLocation.toLowerCase().includes(searchTerm.toLowerCase()) ||
                payment.transactionId.toLowerCase().includes(searchTerm.toLowerCase())
        ) || []

    // Calculate statistics
    const totalRevenue = tourPayments?.reduce((sum, payment) => sum + payment.amount, 0) || 0
    const totalPayments = tourPayments?.length || 0
    const uniqueUsers = new Set(tourPayments?.map((p) => p.userId).filter(Boolean)).size
    const uniqueProperties = new Set(tourPayments?.map((p) => p.propertyId)).size

    // Get recent payments (last 7 days)
    const recentPayments =
        tourPayments?.filter((payment) => {
            const paymentDate = new Date(payment.createdAt)
            const sevenDaysAgo = new Date()
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
            return paymentDate >= sevenDaysAgo
        }) || []

    const recentRevenue = recentPayments.reduce((sum, payment) => sum + payment.amount, 0)

    const handleViewDetails = (payment: TourPayment) => {
        setSelectedPayment(payment)
        setIsDetailModalOpen(true)
    }

    const handleExportData = () => {
        if (!tourPayments) return

        const csvContent = [
            // CSV Header
            [
                'Transaction ID',
                'Property Title',
                'Property Location',
                'User Name',
                'User Email',
                'Amount',
                'Currency',
                'Payment Date',
                'Created Date',
            ].join(','),
            // CSV Data
            ...tourPayments.map((payment) =>
                [
                    payment.transactionId,
                    `"${payment.propertyTitle}"`,
                    `"${payment.propertyLocation}"`,
                    `"${payment.userName}"`,
                    payment.userEmail,
                    payment.amount,
                    payment.currency,
                    new Date(payment.paymentTimestamp).toLocaleDateString(),
                    new Date(payment.createdAt).toLocaleDateString(),
                ].join(',')
            ),
        ].join('\n')

        const blob = new Blob([csvContent], { type: 'text/csv' })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `tour-payments-${new Date().toISOString().split('T')[0]}.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)

        toast({
            title: 'Data Exported',
            description: 'Tour payments data has been exported to CSV file.',
        })
    }

    const formatCurrency = (amount: number, currency: string) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
        }).format(amount)
    }

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
                    <p className="mt-2 text-gray-600">Loading tour payments...</p>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="text-center p-8">
                <p className="text-red-600">Error loading tour payments. Please try again.</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold">Tour Payments Dashboard</h1>
                    <p className="text-gray-600">Track all virtual tour payments and revenue</p>
                </div>
                <Button onClick={handleExportData} className="flex items-center gap-2">
                    <Download className="h-4 w-4" />
                    Export Data
                </Button>
            </div>

            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Total Revenue</p>
                                <p className="text-2xl font-bold">{formatCurrency(totalRevenue, 'UGX')}</p>
                            </div>
                            <DollarSign className="h-8 w-8 text-green-600" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Total Payments</p>
                                <p className="text-2xl font-bold">{totalPayments}</p>
                            </div>
                            <CreditCard className="h-8 w-8 text-blue-600" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Unique Users</p>
                                <p className="text-2xl font-bold">{uniqueUsers}</p>
                            </div>
                            <User className="h-8 w-8 text-purple-600" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Properties Viewed</p>
                                <p className="text-2xl font-bold">{uniqueProperties}</p>
                            </div>
                            <Building className="h-8 w-8 text-orange-600" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Recent Activity */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        Recent Activity (Last 7 Days)
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 bg-green-50 rounded-lg">
                            <p className="text-sm text-green-600 font-medium">Recent Revenue</p>
                            <p className="text-xl font-bold text-green-800">{formatCurrency(recentRevenue, 'UGX')}</p>
                        </div>
                        <div className="p-4 bg-blue-50 rounded-lg">
                            <p className="text-sm text-blue-600 font-medium">Recent Payments</p>
                            <p className="text-xl font-bold text-blue-800">{recentPayments.length}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Search and Filter */}
            <Card>
                <CardHeader>
                    <CardTitle>Tour Payments</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-4 mb-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                            <Input
                                placeholder="Search by property, user, or transaction ID..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                    </div>

                    {/* Payments Table */}
                    <div className="border rounded-lg">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Transaction ID</TableHead>
                                    <TableHead>Property</TableHead>
                                    <TableHead>User</TableHead>
                                    <TableHead>Amount</TableHead>
                                    <TableHead>Payment Date</TableHead>
                                    <TableHead>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredPayments.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                                            {searchTerm
                                                ? 'No payments found matching your search.'
                                                : 'No tour payments yet.'}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredPayments.map((payment) => (
                                        <TableRow key={payment.id}>
                                            <TableCell className="font-mono text-sm">
                                                {payment.transactionId.slice(0, 8)}...
                                            </TableCell>
                                            <TableCell>
                                                <div>
                                                    <p className="font-medium">{payment.propertyTitle}</p>
                                                    <p className="text-sm text-gray-500">{payment.propertyLocation}</p>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div>
                                                    <p className="font-medium">{payment.userName}</p>
                                                    <p className="text-sm text-gray-500">{payment.userEmail}</p>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="font-mono">
                                                    {formatCurrency(payment.amount, payment.currency)}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="text-sm">
                                                    <p>{formatDate(payment.paymentTimestamp)}</p>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleViewDetails(payment)}
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Payment Details Modal */}
            <Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Payment Details</DialogTitle>
                    </DialogHeader>
                    {selectedPayment && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <h4 className="font-semibold text-sm text-gray-600">Transaction ID</h4>
                                    <p className="font-mono text-sm">{selectedPayment.transactionId}</p>
                                </div>
                                <div>
                                    <h4 className="font-semibold text-sm text-gray-600">Amount</h4>
                                    <p className="font-semibold">
                                        {formatCurrency(selectedPayment.amount, selectedPayment.currency)}
                                    </p>
                                </div>
                            </div>

                            <div>
                                <h4 className="font-semibold text-sm text-gray-600">Property</h4>
                                <div className="p-3 bg-gray-50 rounded-lg">
                                    <p className="font-medium">{selectedPayment.propertyTitle}</p>
                                    <p className="text-sm text-gray-600">{selectedPayment.propertyLocation}</p>
                                </div>
                            </div>

                            <div>
                                <h4 className="font-semibold text-sm text-gray-600">User</h4>
                                <div className="p-3 bg-gray-50 rounded-lg">
                                    <p className="font-medium">{selectedPayment.userName}</p>
                                    <p className="text-sm text-gray-600">{selectedPayment.userEmail}</p>
                                    {selectedPayment.userId && (
                                        <p className="text-xs text-gray-500">User ID: {selectedPayment.userId}</p>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <h4 className="font-semibold text-sm text-gray-600">Payment Date</h4>
                                    <p className="text-sm">{formatDate(selectedPayment.paymentTimestamp)}</p>
                                </div>
                                <div>
                                    <h4 className="font-semibold text-sm text-gray-600">Recorded Date</h4>
                                    <p className="text-sm">{formatDate(selectedPayment.createdAt)}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
