import { Switch, Route } from 'wouter'
import { MotionConfig } from 'framer-motion'
import { queryClient } from './lib/queryClient'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/toaster'
import { TooltipProvider } from '@/components/ui/tooltip'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import AnimatedLayout from '@/components/layout/AnimatedLayout'
import Home from '@/pages/Home'
import PropertyPage from '@/pages/PropertyPage'
import MembershipPage from '@/pages/MembershipPage'
import BnBsPage from '@/pages/BnBsPage'
import RentalUnitsPage from '@/pages/RentalUnitsPage'
import ForSalePage from '@/pages/ForSalePage'
import BankSalesPage from '@/pages/BankSalesPage'
import NotFound from '@/pages/not-found'
import PrivacyPolicy from '@/pages/PrivacyPolicy'
import TermsOfService from '@/pages/TermsOfService'
import HostResponsibly from '@/pages/HostResponsibly'
import PropertyManager from '@/pages/PropertyManager'
import AdminUserManager from '@/pages/AdminUserManager'
import AuthPage from '@/pages/auth-page'
import FeaturedPropertiesPage from '@/pages/FeaturedPropertiesPage'
import ProfilePage from '@/pages/ProfilePage'
import TestPage from '@/pages/TestPage' // Added test page
import { AgentDashboard } from '@/pages/AgentDashboard'
import { UserDashboard } from '@/pages/UserDashboard'
import AgentRegistrationPage from '@/pages/AgentRegistrationPage'
import AboutUsPage from '@/pages/AboutUsPage'
import HowItWorksPage from '@/pages/HowItWorksPage'
import HelpCenterPage from '@/pages/HelpCenterPage'
import ContactUsPage from '@/pages/ContactUsPage'
import TrustSafetyPage from '@/pages/TrustSafetyPage'
import VerifyEmailPage from '@/pages/VerifyEmailPage'
import { AuthProvider } from '@/hooks/use-auth'
import { PaymentProvider } from '@/contexts/PaymentContext'
import VirtualTourManager from '@/components/admin/VirtualTourManager'
import { ProtectedAdminRoute } from './lib/protected-admin-route'
import Hero from './components/home/Hero'
import ScrollToTop from './components/ui/ScrollToTop'
import IoTecGateway, { IoTecGatewayLight } from './components/payment/io-tech/layoutGate'
import { useEffect, useState } from 'react'
import { paymentEmitter } from './lib/iotec-paymentpatch'
import IotechMetricCounterPaymentHandle from './components/payment/sio-iotech'
import AgentLauncher from './components/agent/AgentLauncher'
import ListYourPropertyPage from '@/pages/ListYourPropertyPage'
import AdminPayoutApprovals from '@/pages/AdminPayoutApprovals'
import AdminBoostConfirmations from '@/pages/AdminBoostConfirmations'
import AdminAnalytics from '@/pages/AdminAnalytics'
import AdminBroadcast from '@/pages/AdminBroadcast'
import WhatsAppFab from '@/components/whatsapp/WhatsAppFab'
import BrokerOnlinePresence from '@/components/broker/BrokerOnlinePresence'

function Router() {
    return (
        <Switch>
            <Route path="/" component={Home} />
            <Route path="/property/:id" component={PropertyPage} />
            <Route path="/membership" component={MembershipPage} />
            <Route path="/bnbs" component={BnBsPage} />
            <Route path="/bank-sales" component={BankSalesPage} />
            <Route path="/rental-units" component={RentalUnitsPage} />
            <Route path="/for-sale" component={ForSalePage} />
            <Route path="/featured-properties" component={FeaturedPropertiesPage} />

            {/* Legal and Information Pages */}
            <Route path="/privacy" component={PrivacyPolicy} />
            <Route path="/terms" component={TermsOfService} />
            <Route path="/host-responsibly" component={HostResponsibly} />

            {/* Footer Pages */}
            <Route path="/about" component={AboutUsPage} />
            <Route path="/how-it-works" component={HowItWorksPage} />
            <Route path="/help" component={HelpCenterPage} />
            <Route path="/contact" component={ContactUsPage} />
            <Route path="/trust-safety" component={TrustSafetyPage} />

            {/* Authentication and User Pages */}
            <Route path="/auth" component={AuthPage} />
            <Route path="/verify-email" component={VerifyEmailPage} />
            <Route path="/profile" component={ProfilePage} />
            <Route path="/test-page" component={TestPage} />
            <Route path="/agent/register" component={AgentRegistrationPage} />
            <Route path="/agent/dashboard" component={AgentDashboard} />
            <Route path="/list-your-property" component={ListYourPropertyPage} />

            <Route path="/dashboard" component={UserDashboard} />

            {/* Admin routes - protected by role */}
            <ProtectedAdminRoute
                path="/admin/virtual-tours"
                component={VirtualTourManager}
                allowedRoles={['admin', 'agent']}
            />
            <ProtectedAdminRoute
                path="/admin/virtual-tour-manager"
                component={VirtualTourManager}
                allowedRoles={['admin', 'agent']}
            />

            <ProtectedAdminRoute
                path="/admin/properties"
                component={PropertyManager}
                allowedRoles={['admin', 'agent']}
            />

            <ProtectedAdminRoute path="/admin/users" component={AdminUserManager} allowedRoles={['admin']} />
            {/* Strictly admin-only (not agents) — see server/gene/admin-guard.ts's
                requireStrictAdmin, which the underlying APIs actually enforce;
                this route gate is the matching client-side check. */}
            <ProtectedAdminRoute path="/admin/payout-approvals" component={AdminPayoutApprovals} allowedRoles={['admin']} />
            {/* Boost confirmations are money coming IN with no payout
                conflict-of-interest — matches the backend's shared
                adminMiddleware (admin OR agent), unlike the strict
                admin-only payout-approvals route above. */}
            <ProtectedAdminRoute
                path="/admin/boost-confirmations"
                component={AdminBoostConfirmations}
                allowedRoles={['admin', 'agent']}
            />
            {/* Strictly admin-only — platform-wide user PII / mass
                messaging, same reasoning as payout-approvals above. */}
            <ProtectedAdminRoute path="/admin/analytics" component={AdminAnalytics} allowedRoles={['admin']} />
            <ProtectedAdminRoute path="/admin/broadcast" component={AdminBroadcast} allowedRoles={['admin']} />

            <Route
                path="/category/:categorySlug"
                component={() => (
                    <div className="container mx-auto px-4 py-8">
                        <h1 className="text-3xl font-bold mb-4">Property Category</h1>
                        <p className="mb-8 text-gray-600">Browse properties in this category.</p>
                        {/* Generic category page */}
                    </div>
                )}
            />
            <Route component={NotFound} />
        </Switch>
    )
}

function App() {
    const [gateway, setGateway] = useState<{ accessToken: string; amount: string; source: string } | null>(null)

    useEffect(() => {
        const handler = (data: { accessToken: string; amount: string; source: string }) => {

            console.log("DidReceivedPaymentGateWayIntializationEvent")
            setGateway(data)
            console.log(`DidSetPaymentGateWayDaya : ${data.accessToken} amount:${data.amount} and source of:${data.source} `)

        }

        paymentEmitter.on('OPEN_PAYMENT_GATEWAY', handler)
        return () => {
            paymentEmitter.off('OPEN_PAYMENT_GATEWAY', handler)
        }
    }, [])

    return (
        <QueryClientProvider client={queryClient}>
            {/* reducedMotion="user": every framer-motion animation in the app
                (existing components and the new motion/ primitives alike)
                automatically disables transform/scale animation for anyone
                with the OS "reduce motion" setting on — one place to get this
                right instead of every component checking it individually. */}
            <MotionConfig reducedMotion="user">
                <AuthProvider>
                    <PaymentProvider>
                        <TooltipProvider>
                            <div className="flex flex-col min-h-screen">
                                <Header />
                                <main className="flex-grow px-4 sm:px-6 lg:px-8">
                                    <AnimatedLayout>
                                        <Router />
                                    </AnimatedLayout>
                                </main>
                                {/* <IotechMetricCounterPaymentHandle/> */}
                                {gateway && (
                                    <IoTecGatewayLight
                                        source={gateway.source}
                                        accessToken={gateway.accessToken}
                                        amount={gateway.amount}
                                        onClose={() => setGateway(null)}
                                    />
                                )}
                                <Footer />
                            </div>
                            <AgentLauncher />
                            <WhatsAppFab />
                            <BrokerOnlinePresence />
                            <ScrollToTop />
                            <Toaster />
                        </TooltipProvider>
                    </PaymentProvider>
                </AuthProvider>
            </MotionConfig>
        </QueryClientProvider>
    )
}

export default App
