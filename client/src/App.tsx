import { Switch, Route, useLocation } from 'wouter'
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
import BnBsPage from '@/pages/BnBsPage'
import RentalUnitsPage from '@/pages/RentalUnitsPage'
import ForSalePage from '@/pages/ForSalePage'
import BankSalesPage from '@/pages/BankSalesPage'
import NotFound from '@/pages/not-found'
import AuthPage from '@/pages/auth-page'
import TestPage from '@/pages/TestPage' // Added test page
import { AuthProvider, useAuth } from '@/hooks/use-auth'
import { PaymentProvider } from '@/contexts/PaymentContext'
import { ProtectedAdminRoute } from './lib/protected-admin-route'
import Hero from './components/home/Hero'
import ScrollToTop from './components/ui/ScrollToTop'
import IoTecGateway, { IoTecGatewayLight } from './components/payment/io-tech/layoutGate'
import { Suspense, lazy, useEffect, useState } from 'react'
import { paymentEmitter } from './lib/iotec-paymentpatch'
import IotechMetricCounterPaymentHandle from './components/payment/sio-iotech'
import FxRoot from './components/fx/FxRoot'
import ErrorBoundary from '@/components/layout/ErrorBoundary'
import CookieConsentBanner from '@/components/layout/CookieConsentBanner'
import PlaceBar from '@/components/PlaceBar'
import { PlaceProvider } from '@/lib/place'
import MobileTabBar from '@/components/layout/MobileTabBar'

// Pages are fetched when someone goes to them, so the first visit downloads only what it needs.
const MembershipPage = lazy(() => import('@/pages/MembershipPage'))
const PrivacyPolicy = lazy(() => import('@/pages/PrivacyPolicy'))
const TermsOfService = lazy(() => import('@/pages/TermsOfService'))
const CookiePolicy = lazy(() => import('@/pages/CookiePolicy'))
const RefundPolicy = lazy(() => import('@/pages/RefundPolicy'))
const ComingSoonPage = lazy(() => import('@/pages/ComingSoonPage'))
const RentRail = lazy(() => import('@/pages/RentRail'))
const RentRailCallback = lazy(() => import('@/pages/RentRailCallback'))
const HostResponsibly = lazy(() => import('@/pages/HostResponsibly'))
const PropertyManager = lazy(() => import('@/pages/PropertyManager'))
const AdminUserManager = lazy(() => import('@/pages/AdminUserManager'))
const FeaturedPropertiesPage = lazy(() => import('@/pages/FeaturedPropertiesPage'))
const AllPropertiesPage = lazy(() => import('@/pages/AllPropertiesPage'))
const NewListingsPage = lazy(() => import('@/pages/NewListingsPage'))
const ProfilePage = lazy(() => import('@/pages/ProfilePage'))
const AgentDashboard = lazy(() => import('@/pages/AgentDashboard').then((m) => ({ default: m.AgentDashboard })))
const UserDashboard = lazy(() => import('@/pages/UserDashboard').then((m) => ({ default: m.UserDashboard })))
const AgentRegistrationPage = lazy(() => import('@/pages/AgentRegistrationPage'))
const AgentPortfolioPage = lazy(() => import('@/pages/AgentPortfolioPage'))
const AboutUsPage = lazy(() => import('@/pages/AboutUsPage'))
const HowItWorksPage = lazy(() => import('@/pages/HowItWorksPage'))
const HelpCenterPage = lazy(() => import('@/pages/HelpCenterPage'))
const ContactUsPage = lazy(() => import('@/pages/ContactUsPage'))
const TrustSafetyPage = lazy(() => import('@/pages/TrustSafetyPage'))
const VerifyEmailPage = lazy(() => import('@/pages/VerifyEmailPage'))
const SignupNudgeGate = lazy(() => import('@/components/auth/SignupNudgeGate'))
const WhatsAppNumberPrompt = lazy(() => import('@/components/auth/WhatsAppNumberPrompt'))
const VirtualTourManager = lazy(() => import('@/components/admin/VirtualTourManager'))
const AgentLauncher = lazy(() => import('./components/agent/AgentLauncher'))
const KevinOrb = lazy(() => import('./components/kevin/KevinOrb'))
const ListYourPropertyPage = lazy(() => import('@/pages/ListYourPropertyPage'))
const AdminPayoutApprovals = lazy(() => import('@/pages/AdminPayoutApprovals'))
const AdminRentRailPayouts = lazy(() => import('@/pages/AdminRentRailPayouts'))
const AdminBoostConfirmations = lazy(() => import('@/pages/AdminBoostConfirmations'))
const AdminRoomCaptures = lazy(() => import('@/pages/AdminRoomCaptures'))
const AdminKevinLeads = lazy(() => import('@/pages/AdminKevinLeads'))
const AdminTourHealth = lazy(() => import('@/pages/AdminTourHealth'))
const AdminAuctions = lazy(() => import('@/pages/AdminAuctions'))
const AdminPayments = lazy(() => import('@/pages/AdminPayments'))
const AdminCryptoBuyers = lazy(() => import('@/pages/AdminCryptoBuyers'))
const GuidesPage = lazy(() => import('@/pages/GuidesPage'))
const GuideArticlePage = lazy(() => import('@/pages/GuideArticlePage'))
const CompareIndexPage = lazy(() => import('@/pages/CompareIndexPage'))
const ComparePage = lazy(() => import('@/pages/ComparePage'))
const AcceptableUse = lazy(() => import('@/pages/AcceptableUse'))
const AmlSanctions = lazy(() => import('@/pages/AmlSanctions'))
const LegalRegions = lazy(() => import('@/pages/LegalRegions'))
const DataRights = lazy(() => import('@/pages/DataRights'))
const PartnerTerms = lazy(() => import('@/pages/PartnerTerms'))
const FeesPage = lazy(() => import('@/pages/FeesPage'))
const BecomeAPartner = lazy(() => import('@/pages/BecomeAPartner'))
const CareersPage = lazy(() => import('@/pages/CareersPage'))
const AdminPartners = lazy(() => import('@/pages/AdminPartners'))
const AdminDataRequests = lazy(() => import('@/pages/AdminDataRequests'))
const AuctionApplyPage = lazy(() => import('@/pages/AuctionApplyPage'))
const AuctionTerms = lazy(() => import('@/pages/AuctionTerms'))
const BidderVetting = lazy(() => import('@/pages/BidderVetting'))
const LegalCenter = lazy(() => import('@/pages/LegalCenter'))
const PartnersPage = lazy(() => import('@/pages/PartnersPage'))
const AdminRecommendations = lazy(() => import('@/pages/AdminRecommendations'))
const PlaceHomesPage = lazy(() => import('@/pages/PlaceHomesPage'))
const RecommendPlacePage = lazy(() => import('@/pages/RecommendPlacePage'))
const AdminAnalytics = lazy(() => import('@/pages/AdminAnalytics'))
const AdminBroadcast = lazy(() => import('@/pages/AdminBroadcast'))
const AdminDashboardHome = lazy(() => import('@/pages/AdminDashboardHome'))
const AdminBrokerApplications = lazy(() => import('@/pages/AdminBrokerApplications'))
const AdminMessages = lazy(() => import('@/pages/AdminMessages'))
const WhatsAppFab = lazy(() => import('@/components/whatsapp/WhatsAppFab'))
const AmbientSoundToggle = lazy(() => import('@/components/AmbientSoundToggle'))

function Router() {
    return (
        <Suspense fallback={<div className="min-h-[60vh]" aria-busy="true" />}>
        <Switch>
            <Route path="/" component={Home} />
            <Route path="/property/:id" component={PropertyPage} />
            <Route path="/membership" component={MembershipPage} />
            <Route path="/bnbs" component={BnBsPage} />
            <Route path="/bank-sales" component={BankSalesPage} />
            <Route path="/rental-units" component={RentalUnitsPage} />
            <Route path="/for-sale" component={ForSalePage} />
            <Route path="/guides" component={GuidesPage} />
            <Route path="/guides/:slug" component={GuideArticlePage} />
            <Route path="/compare" component={CompareIndexPage} />
            <Route path="/compare/:slug" component={ComparePage} />
            <Route path="/featured-properties" component={FeaturedPropertiesPage} />
            <Route path="/properties" component={AllPropertiesPage} />
            <Route path="/new-listings" component={NewListingsPage} />

            {/* RentRail — pay any landlord's mobile money number directly,
                not tied to a RealEVR listing. See server/gene/rentrail.ts. */}
            <Route path="/rentrail" component={RentRail} />
            <Route path="/rentrail/callback" component={RentRailCallback} />

            {/* Legal and Information Pages */}
            <Route path="/privacy" component={PrivacyPolicy} />
            <Route path="/terms" component={TermsOfService} />
            <Route path="/cookies" component={CookiePolicy} />
            <Route path="/refund-policy" component={RefundPolicy} />
            <Route path="/auction-terms" component={AuctionTerms} />
            <Route path="/bidder-vetting" component={BidderVetting} />
            <Route path="/legal" component={LegalCenter} />
            <Route path="/legal/regions" component={LegalRegions} />
            <Route path="/acceptable-use" component={AcceptableUse} />
            <Route path="/aml-sanctions" component={AmlSanctions} />
            <Route path="/data-rights" component={DataRights} />
            <Route path="/partner-terms" component={PartnerTerms} />
            <Route path="/fees" component={FeesPage} />
            <Route path="/become-a-partner" component={BecomeAPartner} />
            <Route path="/become-a-partner/:country" component={BecomeAPartner} />
            <Route path="/partners" component={PartnersPage} />
            <Route path="/auctions/apply" component={AuctionApplyPage} />
            {/* Footer previously linked these three at "#" — no real content
                exists for them yet (no job listings, investor materials, or
                news articles to show honestly), so each gets a real,
                non-fabricated "not live yet, here's how to reach us" page
                instead of a dead link. */}
            <Route path="/careers" component={CareersPage} />
            <Route path="/investors">
                <ComingSoonPage
                    title="Investors"
                    description="Investor materials aren't published here yet. Get in touch and we'll share what's relevant directly."
                    canonicalPath="/investors"
                />
            </Route>
            <Route path="/news">
                <ComingSoonPage
                    title="News"
                    description="We haven't started publishing news here yet. Check back later, or contact us for anything time-sensitive."
                    canonicalPath="/news"
                />
            </Route>
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
            {/* Public, shareable agent portfolio — must come after the two
                literal /agent/* routes above, since wouter matches routes
                in declaration order and this would otherwise swallow
                "register"/"dashboard" as a :username value. */}
            <Route path="/agent/:username" component={AgentPortfolioPage} />
            <Route path="/list-your-property" component={ListYourPropertyPage} />
            <Route path="/recommend-a-place" component={RecommendPlacePage} />
            <Route path="/homes/:country/:city?" component={PlaceHomesPage} />

            <Route path="/dashboard" component={UserDashboard} />

            {/* Admin routes - protected by role. All wrapped in
                AdminDashboardLayout inside ProtectedAdminRoute itself — see
                that file — so every page below shares one sidebar/topbar. */}
            <ProtectedAdminRoute path="/admin" component={AdminDashboardHome} allowedRoles={['admin']} />
            <ProtectedAdminRoute
                path="/admin/broker-applications"
                component={AdminBrokerApplications}
                allowedRoles={['admin']}
            />
            <ProtectedAdminRoute path="/admin/messages" component={AdminMessages} allowedRoles={['admin']} />
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
            <ProtectedAdminRoute path="/admin/rentrail-payouts" component={AdminRentRailPayouts} allowedRoles={['admin']} />
            {/* Boost confirmations are money coming IN with no payout
                conflict-of-interest — matches the backend's shared
                adminMiddleware (admin OR agent), unlike the strict
                admin-only payout-approvals route above. */}
            <ProtectedAdminRoute
                path="/admin/boost-confirmations"
                component={AdminBoostConfirmations}
                allowedRoles={['admin', 'agent']}
            />
            {/* Strictly admin-only — spans every agent's in-progress room
                captures, matching the strict guard on its own API route. */}
            <ProtectedAdminRoute
                path="/admin/room-captures"
                component={AdminRoomCaptures}
                allowedRoles={['admin']}
            />
            {/* Strictly admin-only — visitors' personal details, see server/gene/kevin-leads.ts. */}
            <ProtectedAdminRoute path="/admin/kevin-leads" component={AdminKevinLeads} allowedRoles={['admin']} />
            <ProtectedAdminRoute path="/admin/tour-health" component={AdminTourHealth} allowedRoles={['admin']} />
            <ProtectedAdminRoute path="/admin/auctions" component={AdminAuctions} allowedRoles={['admin', 'agent']} />
            <ProtectedAdminRoute path="/admin/payments" component={AdminPayments} allowedRoles={['admin']} />
            <ProtectedAdminRoute path="/admin/crypto-buyers" component={AdminCryptoBuyers} allowedRoles={['admin']} />
            <ProtectedAdminRoute path="/admin/partners" component={AdminPartners} allowedRoles={['admin']} />
            <ProtectedAdminRoute path="/admin/data-requests" component={AdminDataRequests} allowedRoles={['admin']} />
            {/* Strictly admin-only — phone numbers and point redemptions, see server/gene/building-recommendations.ts. */}
            <ProtectedAdminRoute path="/admin/recommendations" component={AdminRecommendations} allowedRoles={['admin']} />
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
        </Suspense>
    )
}

// Everything that needs to know whether someone is signed in lives here, nested under
// AuthProvider so useAuth() is available. Browsing itself is NOT gated - visitors
// land straight on the real site. SignupNudgeGate handles nudging anyone not signed
// in toward AuthGate on its own schedule (see that file): a dismissible popup after
// 20s, a handful more dismissible reappearances over the next 10 minutes, then a
// final one at the 10-minute mark that behaves like the old compulsory gate and
// stays up until they actually sign in.
function AppShell() {
    const { isLoading } = useAuth()
    const [gateway, setGateway] = useState<{ accessToken: string; amount: string; source: string } | null>(null)
    const [location] = useLocation()

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

    if (isLoading) {
        // Light background matching the Airbnb-style gate/site theme below it -
        // a dark screen here used to flash before the light auth card or site
        // appeared, which read as broken rather than "loading."
        return (
            <div className="flex min-h-screen items-center justify-center bg-gray-50">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-[#FF5A5F]" />
            </div>
        )
    }

    return (
        <>
            <div className="flex flex-col min-h-screen">
                <Header />
                <PlaceBar />
                {/* pb-28 (112px), not pb-20: the tab bar itself is only 64px
                    (h-16) but adds env(safe-area-inset-bottom) on top of that
                    for the home-indicator area on notched phones (~34px) -
                    pb-20 alone would leave content peeking out from behind it
                    on exactly those devices. */}
                <main className="flex-grow px-4 sm:px-6 lg:px-8 pb-28 md:pb-0">
                    <AnimatedLayout>
                        {/* Keyed by location: a crash on one page resets this boundary's
                            state on the very next navigation, instead of the error screen
                            following the visitor to every route until a full reload. See
                            ErrorBoundary.tsx for why this exists at all - there was no
                            error boundary anywhere before, so any single render crash on
                            any page took the whole app down to a blank white screen. */}
                        <ErrorBoundary key={location}>
                            <Router />
                        </ErrorBoundary>
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
            {/* Floating helpers load after the page itself, so they never hold up the first paint. */}
            <Suspense fallback={null}>
                <AgentLauncher />
            </Suspense>
            <FxRoot />
            <Suspense fallback={null}>
                <KevinOrb />
                <WhatsAppFab />
            </Suspense>
            <ScrollToTop />
            <Suspense fallback={null}>
                <WhatsAppNumberPrompt />
                <SignupNudgeGate />
            </Suspense>
            <CookieConsentBanner />
            <MobileTabBar />
            <Suspense fallback={null}>
                <AmbientSoundToggle />
            </Suspense>
        </>
    )
}

function App() {
    return (
        <QueryClientProvider client={queryClient}>
            {/* reducedMotion="user": every framer-motion animation in the app
                (existing components and the new motion/ primitives alike)
                automatically disables transform/scale animation for anyone
                with the OS "reduce motion" setting on — one place to get this
                right instead of every component checking it individually. */}
            <MotionConfig reducedMotion="user">
                <PlaceProvider>
                    <AuthProvider>
                        <PaymentProvider>
                            <TooltipProvider>
                                <AppShell />
                                <Toaster />
                            </TooltipProvider>
                        </PaymentProvider>
                    </AuthProvider>
                </PlaceProvider>
            </MotionConfig>
        </QueryClientProvider>
    )
}

export default App
