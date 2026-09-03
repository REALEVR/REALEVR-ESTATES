import { useAuth } from '@/hooks/use-auth'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { Redirect, Route } from 'wouter'
import AdminDashboardLayout from '@/components/admin/AdminDashboardLayout'

export function ProtectedAdminRoute({
    path,
    component: Component,
    allowedRoles = ['admin'],
}: {
    path: string
    component: () => React.JSX.Element
    allowedRoles?: string[]
}) {
    const { user, isLoading } = useAuth()

    if (isLoading) {
        return (
            <Route path={path}>
                <div className="flex items-center justify-center min-h-screen">
                    <Loader2 className="h-8 w-8 animate-spin text-border" />
                </div>
            </Route>
        )
    }

    if (!user) {
        return (
            <Route path={path}>
                <Redirect to="/membership" />
            </Route>
        )
    }

    // Check if user has the required role
    if (!allowedRoles.includes(user.role)) {
        return (
            <Route path={path}>
                <div className="container mx-auto py-12 px-4">
                    <div className="max-w-2xl mx-auto text-center">
                        <h1 className="text-3xl font-bold mb-6">Access Restricted</h1>
                        <p className="mb-8 text-gray-600">
                            You don't have permission to access this page. This area is reserved for administrators and
                            property managers.
                        </p>
                        <div className="flex justify-center">{/* <Redirect to="/" /> */}</div>
                    </div>
                </div>
            </Route>
        )
    }

    // Every admin page gets the same sidebar+topbar chrome (see
    // AdminDashboardLayout's doc comment) — the dropdown menu of separate,
    // chrome-less pages this replaced is gone; every destination it used to
    // hold is a sidebar item there instead.
    return (
        <Route path={path}>
            <AdminDashboardLayout>
                <Component />
            </AdminDashboardLayout>
        </Route>
    )
}
