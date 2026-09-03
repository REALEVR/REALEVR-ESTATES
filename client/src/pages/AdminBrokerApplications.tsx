import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, UserPlus } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import type { User } from '@shared/schema'

/**
 * Admin view of everyone who's registered as a broker/agent
 * (AgentRegistrationPage.tsx, POST /api/register with role "agent") — the
 * "add that information to the admin dashboard as well for those interested
 * in joining" half of restoring the broker registration page. Read-only:
 * role changes (promote/demote) already live in AdminUserManager
 * (/admin/users) — this page is specifically "who applied," newest first,
 * not a duplicate of user management.
 */
export default function AdminBrokerApplications() {
    const { toast } = useToast()
    const [loading, setLoading] = useState(true)
    const [agents, setAgents] = useState<User[]>([])

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const res = await fetch('/api/admin/overview', { credentials: 'include' })
                if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || 'Failed to load')
                const data = await res.json()
                const allUsers: User[] = data.users ?? []
                const sorted = allUsers
                    .filter((u) => u.role === 'agent')
                    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
                if (!cancelled) setAgents(sorted)
            } catch (err: any) {
                if (!cancelled) toast({ title: "Couldn't load broker applications", description: err?.message, variant: 'destructive' })
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [toast])

    if (loading) {
        return (
            <div className="flex justify-center py-24">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
                    <UserPlus className="h-6 w-6 text-accent" /> Broker Applications
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Everyone who has registered as an agent/broker via /agent/register, newest first. Manage roles from
                    User Management.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">{agents.length} broker{agents.length === 1 ? '' : 's'} registered</CardTitle>
                </CardHeader>
                <CardContent>
                    {agents.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-6 text-center">No broker registrations yet.</p>
                    ) : (
                        <div className="divide-y divide-border">
                            {agents.map((agent) => (
                                <div key={agent.id} className="py-3 flex items-center justify-between gap-4">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-foreground truncate">{agent.fullName}</p>
                                        <p className="text-xs text-muted-foreground truncate">
                                            {agent.email} {agent.companyName ? `· ${agent.companyName}` : ''}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        {agent.membershipPlan && (
                                            <Badge variant="secondary" className="capitalize">
                                                {agent.membershipPlan}
                                            </Badge>
                                        )}
                                        <span className="text-xs text-muted-foreground">
                                            {agent.createdAt ? new Date(agent.createdAt).toLocaleDateString() : '—'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
