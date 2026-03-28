import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { Redirect } from 'wouter'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Mail, ArrowRight } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { apiRequest, queryClient } from '../lib/queryClient'

export default function VerifyEmailPage() {
    const { user } = useAuth()
    const { toast } = useToast()
    const [token, setToken] = useState('')
    const [email, setEmail] = useState('')

    // Get email from URL params if available
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search)
        const emailParam = urlParams.get('email')
        if (emailParam) {
            setEmail(emailParam)
        }
        document.title = 'Verify Your Email | RealEVR Estates'
    }, [])

    const verifyTokenMutation = useMutation({
        mutationFn: async (verificationToken: string) => {
            const res = await apiRequest('POST', '/api/verify-token', { token: verificationToken })
            return await res.json()
        },
        onSuccess: (response) => {
            // Set user data in query cache
            queryClient.setQueryData(['/api/user'], response.user)

            toast({
                title: 'Email verified successfully!',
                description: response.message || 'Welcome to RealEVR Estates!',
            })

            // Redirect to dashboard
            window.location.href = '/'
        },
        onError: (error: Error) => {
            toast({
                title: 'Verification failed',
                description: error.message || 'Invalid or expired verification token',
                variant: 'destructive',
            })
        },
    })

    const resendEmailMutation = useMutation({
        mutationFn: async (emailAddress: string) => {
            const res = await apiRequest('POST', '/api/resend-verification', { email: emailAddress })
            return await res.json()
        },
        onSuccess: () => {
            toast({
                title: 'Verification email sent',
                description: 'Please check your email for the new verification code.',
            })
        },
        onError: (error: Error) => {
            toast({
                title: 'Failed to resend email',
                description: error.message || 'Please try again later',
                variant: 'destructive',
            })
        },
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!token.trim()) {
            toast({
                title: 'Token required',
                description: 'Please enter your verification token',
                variant: 'destructive',
            })
            return
        }
        verifyTokenMutation.mutate(token.trim())
    }

    const handleResendEmail = () => {
        if (!email.trim()) {
            toast({
                title: 'Email required',
                description: 'Please enter your email address to resend verification',
                variant: 'destructive',
            })
            return
        }
        resendEmailMutation.mutate(email.trim())
    }

    return (
        <div className="container mx-auto flex items-center justify-center min-h-screen py-16 px-6">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
                        <Mail className="h-8 w-8 text-blue-600" />
                    </div>
                    <CardTitle className="text-2xl font-bold">Verify Your Email</CardTitle>
                    <p className="text-gray-600 mt-2">
                        We've sent a verification code to your email address. Enter the code below to verify your
                        account.
                    </p>
                </CardHeader>
                <CardContent className="space-y-6">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email Address</Label>
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="your@email.com"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="token">Verification Code</Label>
                            <Input
                                id="token"
                                value={token}
                                onChange={(e) => setToken(e.target.value)}
                                placeholder="Enter verification code from email"
                                required
                                className="text-center font-mono text-lg tracking-wider"
                            />
                        </div>

                        <Button type="submit" className="w-full" disabled={verifyTokenMutation.isPending}>
                            {verifyTokenMutation.isPending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Verifying...
                                </>
                            ) : (
                                <>
                                    Verify Email
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </>
                            )}
                        </Button>
                    </form>

                    <div className="text-center space-y-2">
                        <p className="text-sm text-gray-600">Didn't receive the email?</p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleResendEmail}
                            disabled={resendEmailMutation.isPending || !email.trim()}
                        >
                            {resendEmailMutation.isPending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Sending...
                                </>
                            ) : (
                                'Resend verification email'
                            )}
                        </Button>
                    </div>

                    <div className="text-center">
                        <Button variant="ghost" size="sm" onClick={() => (window.location.href = '/auth')}>
                            Back to Login
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
