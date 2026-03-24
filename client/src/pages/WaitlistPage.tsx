import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useLocation } from 'wouter'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
    Building2,
    Users,
    MapPin,
    CheckCircle2,
    ArrowRight,
    ArrowLeft,
    Loader2,
    Star,
    Home,
    TrendingUp,
    Shield,
    Clock,
    ChevronDown,
    ChevronUp,
} from 'lucide-react'

// ─── Zod Schemas per step ─────────────────────────────────────────────────────

const Step1Schema = z.object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    email: z.string().email('Please enter a valid email address'),
    phoneNumber: z.string().optional(),
    heardAbout: z.enum(['social-media', 'referral', 'search', 'ad', 'other'], {
        required_error: 'Please select how you heard about us',
    }),
    referralCode: z.string().optional(),
})

const Step2Schema = z.object({
    propertyType: z.enum(['residential', 'commercial', 'land', 'mixed'], {
        required_error: 'Please select a property type',
    }),
    propertyCount: z.coerce.number().int().min(1, 'Must have at least 1 property').optional(),
    location: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    interest: z.enum(['quick-sale', 'long-term-rent', 'short-term-rent', 'all'], {
        required_error: 'Please select your primary interest',
    }),
    estimatedPropertyValue: z.string().optional(),
})

const Step3Schema = z.object({
    businessDescription: z.string().optional(),
    website: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
    instagramHandle: z.string().optional(),
    facebookHandle: z.string().optional(),
    linkedinHandle: z.string().optional(),
})

const Step4Schema = z.object({
    agreeToTerms: z.boolean().refine((v) => v === true, 'You must agree to the terms'),
})

type Step1Data = z.infer<typeof Step1Schema>
type Step2Data = z.infer<typeof Step2Schema>
type Step3Data = z.infer<typeof Step3Schema>
type Step4Data = z.infer<typeof Step4Schema>

// ─── FAQ Data ─────────────────────────────────────────────────────────────────

const faqs = [
    {
        question: 'How long is the waitlist?',
        answer:
            'Wait times vary depending on your location and property type. Most applicants receive their invite within 2–8 weeks.',
    },
    {
        question: 'What happens after I register?',
        answer:
            'After registering, verify your email. Our team will review your application and send you an exclusive invite when ready.',
    },
    {
        question: 'What documents do I need?',
        answer:
            'Initially none! Once invited, you will need property ownership documents or management agreements.',
    },
    {
        question: 'How are properties verified?',
        answer:
            'Our team conducts a digital review and may request a virtual property walkthrough to ensure listing quality.',
    },
    {
        question: 'What are the listing fees?',
        answer:
            'REALEVR operates on a success-based model. There are no upfront listing fees — we earn a small commission on successful transactions.',
    },
    {
        question: 'Can I list commercial properties?',
        answer: 'Yes! We support residential, commercial, land, and mixed-use properties.',
    },
]

// ─── Testimonials ─────────────────────────────────────────────────────────────

const testimonials = [
    {
        name: 'Sarah K.',
        type: 'Residential Landlord',
        quote: 'REALEVR transformed how I manage my 12 rental units. The virtual tours bring in qualified tenants every week.',
        rating: 5,
    },
    {
        name: 'David M.',
        type: 'Commercial Property Owner',
        quote: "The platform is professional and easy to use. I've filled 3 office spaces in record time.",
        rating: 5,
    },
    {
        name: 'Grace N.',
        type: 'Real Estate Agent',
        quote: 'My clients love the 360° tours. It saves us hours of in-person showings.',
        rating: 4,
    },
]

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WaitlistPage() {
    const [, setLocation] = useLocation()
    const { toast } = useToast()
    const [currentStep, setCurrentStep] = useState(1)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [successData, setSuccessData] = useState<{
        waitlistId: string
        position: number
        total: number
    } | null>(null)
    const [openFaq, setOpenFaq] = useState<number | null>(null)

    // Check if returning from email verification
    const searchParams = new URLSearchParams(window.location.search)
    const isVerified = searchParams.get('verified') === 'true'

    // Accumulated form data across steps
    const [formData, setFormData] = useState<Partial<Step1Data & Step2Data & Step3Data>>({})

    // ─── Step Forms ───────────────────────────────────────────────────────────

    const step1Form = useForm<Step1Data>({
        resolver: zodResolver(Step1Schema),
        defaultValues: {
            firstName: '',
            lastName: '',
            email: '',
            phoneNumber: '',
            heardAbout: undefined,
            referralCode: '',
        },
    })

    const step2Form = useForm<Step2Data>({
        resolver: zodResolver(Step2Schema),
        defaultValues: {
            propertyType: undefined,
            propertyCount: undefined,
            location: '',
            city: '',
            state: '',
            country: '',
            interest: undefined,
            estimatedPropertyValue: '',
        },
    })

    const step3Form = useForm<Step3Data>({
        resolver: zodResolver(Step3Schema),
        defaultValues: {
            businessDescription: '',
            website: '',
            instagramHandle: '',
            facebookHandle: '',
            linkedinHandle: '',
        },
    })

    const step4Form = useForm<Step4Data>({
        resolver: zodResolver(Step4Schema),
        defaultValues: { agreeToTerms: false },
    })

    // ─── Step Handlers ────────────────────────────────────────────────────────

    const handleStep1Submit = (data: Step1Data) => {
        setFormData((prev) => ({ ...prev, ...data }))
        setCurrentStep(2)
    }

    const handleStep2Submit = (data: Step2Data) => {
        setFormData((prev) => ({ ...prev, ...data }))
        setCurrentStep(3)
    }

    const handleStep3Submit = (data: Step3Data) => {
        setFormData((prev) => ({ ...prev, ...data }))
        setCurrentStep(4)
    }

    const handleStep4Submit = async (_data: Step4Data) => {
        setIsSubmitting(true)
        try {
            const payload = {
                ...formData,
                socialMedia: {
                    instagram: formData.instagramHandle || undefined,
                    facebook: formData.facebookHandle || undefined,
                    linkedin: formData.linkedinHandle || undefined,
                },
            }
            // Remove individual social media fields
            delete (payload as any).instagramHandle
            delete (payload as any).facebookHandle
            delete (payload as any).linkedinHandle

            const response = await fetch('/api/waitlist/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })

            const result = await response.json()

            if (response.ok && result.success) {
                setSuccessData({
                    waitlistId: result.waitlistId,
                    position: result.position,
                    total: result.total,
                })
            } else {
                toast({
                    title: 'Registration failed',
                    description: result.message || 'Please try again.',
                    variant: 'destructive',
                })
            }
        } catch {
            toast({
                title: 'Connection error',
                description: 'Unable to connect. Please try again.',
                variant: 'destructive',
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    // ─── Success View ─────────────────────────────────────────────────────────

    if (successData) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white py-16 px-4">
                <div className="max-w-lg mx-auto text-center">
                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle2 className="w-12 h-12 text-green-500" />
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-4">You're on the list! 🎉</h1>
                    <p className="text-gray-600 mb-6">
                        Thank you for registering. Please check your email to verify your address and secure your spot.
                    </p>
                    <div className="bg-purple-50 rounded-xl p-6 mb-6">
                        <p className="text-sm text-gray-500 mb-1">Your waitlist position</p>
                        <p className="text-5xl font-bold text-purple-600">#{successData.position}</p>
                        <p className="text-sm text-gray-500 mt-1">of {successData.total} applicants</p>
                    </div>
                    <div className="space-y-3 text-left bg-white rounded-xl p-5 border border-gray-100 shadow-sm mb-6">
                        <p className="font-semibold text-gray-700">What happens next:</p>
                        <div className="flex items-start gap-3">
                            <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-sm font-bold flex-shrink-0">1</span>
                            <p className="text-gray-600">Verify your email address (check your inbox)</p>
                        </div>
                        <div className="flex items-start gap-3">
                            <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-sm font-bold flex-shrink-0">2</span>
                            <p className="text-gray-600">Our team reviews your application</p>
                        </div>
                        <div className="flex items-start gap-3">
                            <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-sm font-bold flex-shrink-0">3</span>
                            <p className="text-gray-600">Receive your exclusive invite to join REALEVR!</p>
                        </div>
                    </div>
                    <Button onClick={() => setLocation('/')} variant="outline" className="w-full">
                        Return to Home
                    </Button>
                </div>
            </div>
        )
    }

    // ─── Email Verified Banner ────────────────────────────────────────────────

    const verifiedBanner = isVerified && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
            <p className="text-green-700 font-medium">Email verified successfully! Your application is under review.</p>
        </div>
    )

    // ─── Main Render ──────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-gradient-to-b from-purple-50 via-white to-gray-50">
            {/* Hero Section */}
            <section className="relative overflow-hidden bg-gradient-to-br from-purple-700 via-purple-600 to-indigo-600 text-white py-20 px-4">
                <div className="absolute inset-0 opacity-10">
                    <div className="absolute top-10 left-10 w-40 h-40 rounded-full bg-white" />
                    <div className="absolute bottom-10 right-10 w-60 h-60 rounded-full bg-white" />
                </div>
                <div className="relative max-w-4xl mx-auto text-center">
                    <Badge className="mb-4 bg-white/20 text-white border-white/30 hover:bg-white/30">
                        🏠 Now Accepting Property Owners
                    </Badge>
                    <h1 className="text-4xl md:text-5xl font-bold mb-4 leading-tight">
                        List Your Properties on REALEVR
                    </h1>
                    <p className="text-xl text-purple-100 mb-8 max-w-2xl mx-auto">
                        Join the waitlist and get early access to list your properties with 360° virtual tours, reach thousands of buyers and renters, and manage everything in one platform.
                    </p>
                    <div className="flex flex-wrap justify-center gap-6 mb-8">
                        <div className="flex items-center gap-2 text-purple-100">
                            <Users className="w-5 h-5" />
                            <span>2,000+ applicants</span>
                        </div>
                        <div className="flex items-center gap-2 text-purple-100">
                            <Building2 className="w-5 h-5" />
                            <span>5,000+ properties represented</span>
                        </div>
                        <div className="flex items-center gap-2 text-purple-100">
                            <MapPin className="w-5 h-5" />
                            <span>20+ cities covered</span>
                        </div>
                    </div>
                    <div className="flex flex-wrap justify-center gap-3">
                        {['No upfront fees', 'Virtual tours included', 'Verified buyers & renters', 'Analytics dashboard'].map((feature) => (
                            <span key={feature} className="bg-white/10 backdrop-blur-sm border border-white/20 px-3 py-1 rounded-full text-sm">
                                ✓ {feature}
                            </span>
                        ))}
                    </div>
                </div>
            </section>

            {/* Main Content */}
            <section className="max-w-6xl mx-auto py-16 px-4">
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-12">
                    {/* Form Column */}
                    <div className="lg:col-span-3">
                        {verifiedBanner}

                        <Card className="shadow-lg border-0">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-2xl">Register Your Interest</CardTitle>
                                <CardDescription>Step {currentStep} of 4</CardDescription>
                                {/* Progress Bar */}
                                <div className="flex gap-1 mt-3">
                                    {[1, 2, 3, 4].map((step) => (
                                        <div
                                            key={step}
                                            className={`h-1.5 flex-1 rounded-full transition-all ${step <= currentStep ? 'bg-purple-600' : 'bg-gray-200'}`}
                                        />
                                    ))}
                                </div>
                            </CardHeader>
                            <CardContent className="pt-6">
                                {/* ── Step 1: Basic Info ── */}
                                {currentStep === 1 && (
                                    <Form {...step1Form}>
                                        <form onSubmit={step1Form.handleSubmit(handleStep1Submit)} className="space-y-4">
                                            <h3 className="font-semibold text-gray-700 mb-4">Basic Information</h3>
                                            <div className="grid grid-cols-2 gap-4">
                                                <FormField
                                                    control={step1Form.control}
                                                    name="firstName"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>First Name *</FormLabel>
                                                            <FormControl>
                                                                <Input placeholder="John" {...field} />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={step1Form.control}
                                                    name="lastName"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>Last Name *</FormLabel>
                                                            <FormControl>
                                                                <Input placeholder="Doe" {...field} />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                            <FormField
                                                control={step1Form.control}
                                                name="email"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Email Address *</FormLabel>
                                                        <FormControl>
                                                            <Input type="email" placeholder="john@example.com" {...field} />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={step1Form.control}
                                                name="phoneNumber"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Phone Number</FormLabel>
                                                        <FormControl>
                                                            <Input type="tel" placeholder="+256 700 000 000" {...field} />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={step1Form.control}
                                                name="heardAbout"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>How did you hear about us? *</FormLabel>
                                                        <Select onValueChange={field.onChange} value={field.value}>
                                                            <FormControl>
                                                                <SelectTrigger>
                                                                    <SelectValue placeholder="Select an option" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                <SelectItem value="social-media">Social Media</SelectItem>
                                                                <SelectItem value="referral">Referral</SelectItem>
                                                                <SelectItem value="search">Search Engine</SelectItem>
                                                                <SelectItem value="ad">Advertisement</SelectItem>
                                                                <SelectItem value="other">Other</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={step1Form.control}
                                                name="referralCode"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Referral Code (optional)</FormLabel>
                                                        <FormControl>
                                                            <Input placeholder="Enter referral code" {...field} />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <Button type="submit" className="w-full bg-purple-600 hover:bg-purple-700">
                                                Continue <ArrowRight className="ml-2 w-4 h-4" />
                                            </Button>
                                        </form>
                                    </Form>
                                )}

                                {/* ── Step 2: Property Details ── */}
                                {currentStep === 2 && (
                                    <Form {...step2Form}>
                                        <form onSubmit={step2Form.handleSubmit(handleStep2Submit)} className="space-y-4">
                                            <h3 className="font-semibold text-gray-700 mb-4">Property Details</h3>
                                            <div className="grid grid-cols-2 gap-4">
                                                <FormField
                                                    control={step2Form.control}
                                                    name="propertyType"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>Property Type *</FormLabel>
                                                            <Select onValueChange={field.onChange} value={field.value}>
                                                                <FormControl>
                                                                    <SelectTrigger>
                                                                        <SelectValue placeholder="Select type" />
                                                                    </SelectTrigger>
                                                                </FormControl>
                                                                <SelectContent>
                                                                    <SelectItem value="residential">Residential</SelectItem>
                                                                    <SelectItem value="commercial">Commercial</SelectItem>
                                                                    <SelectItem value="land">Land</SelectItem>
                                                                    <SelectItem value="mixed">Mixed Use</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={step2Form.control}
                                                    name="propertyCount"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>Number of Properties</FormLabel>
                                                            <FormControl>
                                                                <Input type="number" min={1} placeholder="e.g. 3" {...field} />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                            <FormField
                                                control={step2Form.control}
                                                name="location"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Primary Location / Neighbourhood</FormLabel>
                                                        <FormControl>
                                                            <Input placeholder="e.g. Nakasero" {...field} />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <div className="grid grid-cols-3 gap-3">
                                                <FormField
                                                    control={step2Form.control}
                                                    name="city"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>City</FormLabel>
                                                            <FormControl>
                                                                <Input placeholder="Kampala" {...field} />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={step2Form.control}
                                                    name="state"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>State / Region</FormLabel>
                                                            <FormControl>
                                                                <Input placeholder="Central" {...field} />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={step2Form.control}
                                                    name="country"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>Country</FormLabel>
                                                            <FormControl>
                                                                <Input placeholder="Uganda" {...field} />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                            <FormField
                                                control={step2Form.control}
                                                name="interest"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Primary Interest *</FormLabel>
                                                        <Select onValueChange={field.onChange} value={field.value}>
                                                            <FormControl>
                                                                <SelectTrigger>
                                                                    <SelectValue placeholder="What are you looking to do?" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                <SelectItem value="quick-sale">Quick Sale</SelectItem>
                                                                <SelectItem value="long-term-rent">Long-term Rental</SelectItem>
                                                                <SelectItem value="short-term-rent">Short-term Rental</SelectItem>
                                                                <SelectItem value="all">All of the Above</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={step2Form.control}
                                                name="estimatedPropertyValue"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Estimated Property Value Range</FormLabel>
                                                        <Select onValueChange={field.onChange} value={field.value}>
                                                            <FormControl>
                                                                <SelectTrigger>
                                                                    <SelectValue placeholder="Select a range" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                <SelectItem value="under-50m">Under UGX 50M</SelectItem>
                                                                <SelectItem value="50m-200m">UGX 50M – 200M</SelectItem>
                                                                <SelectItem value="200m-500m">UGX 200M – 500M</SelectItem>
                                                                <SelectItem value="500m-1b">UGX 500M – 1B</SelectItem>
                                                                <SelectItem value="above-1b">Above UGX 1B</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <div className="flex gap-3">
                                                <Button type="button" variant="outline" onClick={() => setCurrentStep(1)} className="flex-1">
                                                    <ArrowLeft className="mr-2 w-4 h-4" /> Back
                                                </Button>
                                                <Button type="submit" className="flex-1 bg-purple-600 hover:bg-purple-700">
                                                    Continue <ArrowRight className="ml-2 w-4 h-4" />
                                                </Button>
                                            </div>
                                        </form>
                                    </Form>
                                )}

                                {/* ── Step 3: Business Info ── */}
                                {currentStep === 3 && (
                                    <Form {...step3Form}>
                                        <form onSubmit={step3Form.handleSubmit(handleStep3Submit)} className="space-y-4">
                                            <h3 className="font-semibold text-gray-700 mb-4">Business Information <span className="text-gray-400 font-normal text-sm">(optional)</span></h3>
                                            <FormField
                                                control={step3Form.control}
                                                name="businessDescription"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Tell us about your business</FormLabel>
                                                        <FormControl>
                                                            <Textarea
                                                                placeholder="Briefly describe your property portfolio or business..."
                                                                className="resize-none"
                                                                rows={4}
                                                                {...field}
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={step3Form.control}
                                                name="website"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Website</FormLabel>
                                                        <FormControl>
                                                            <Input type="url" placeholder="https://yourwebsite.com" {...field} />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <div className="space-y-3">
                                                <p className="text-sm font-medium text-gray-700">Social Media Handles</p>
                                                <FormField
                                                    control={step3Form.control}
                                                    name="instagramHandle"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormControl>
                                                                <div className="flex">
                                                                    <span className="inline-flex items-center px-3 text-sm text-gray-500 bg-gray-50 border border-r-0 border-gray-200 rounded-l-md">
                                                                        Instagram
                                                                    </span>
                                                                    <Input placeholder="@handle" className="rounded-l-none" {...field} />
                                                                </div>
                                                            </FormControl>
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={step3Form.control}
                                                    name="facebookHandle"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormControl>
                                                                <div className="flex">
                                                                    <span className="inline-flex items-center px-3 text-sm text-gray-500 bg-gray-50 border border-r-0 border-gray-200 rounded-l-md">
                                                                        Facebook
                                                                    </span>
                                                                    <Input placeholder="profile or page name" className="rounded-l-none" {...field} />
                                                                </div>
                                                            </FormControl>
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={step3Form.control}
                                                    name="linkedinHandle"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormControl>
                                                                <div className="flex">
                                                                    <span className="inline-flex items-center px-3 text-sm text-gray-500 bg-gray-50 border border-r-0 border-gray-200 rounded-l-md">
                                                                        LinkedIn
                                                                    </span>
                                                                    <Input placeholder="profile URL or name" className="rounded-l-none" {...field} />
                                                                </div>
                                                            </FormControl>
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                            <div className="flex gap-3">
                                                <Button type="button" variant="outline" onClick={() => setCurrentStep(2)} className="flex-1">
                                                    <ArrowLeft className="mr-2 w-4 h-4" /> Back
                                                </Button>
                                                <Button type="submit" className="flex-1 bg-purple-600 hover:bg-purple-700">
                                                    Continue <ArrowRight className="ml-2 w-4 h-4" />
                                                </Button>
                                            </div>
                                        </form>
                                    </Form>
                                )}

                                {/* ── Step 4: Confirmation ── */}
                                {currentStep === 4 && (
                                    <Form {...step4Form}>
                                        <form onSubmit={step4Form.handleSubmit(handleStep4Submit)} className="space-y-4">
                                            <h3 className="font-semibold text-gray-700 mb-4">Review & Submit</h3>
                                            <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                                                <p><strong>Name:</strong> {formData.firstName} {formData.lastName}</p>
                                                <p><strong>Email:</strong> {formData.email}</p>
                                                {formData.phoneNumber && <p><strong>Phone:</strong> {formData.phoneNumber}</p>}
                                                <p><strong>Property Type:</strong> {formData.propertyType}</p>
                                                {formData.propertyCount && <p><strong>Properties:</strong> {formData.propertyCount}</p>}
                                                {formData.city && <p><strong>Location:</strong> {[formData.location, formData.city, formData.country].filter(Boolean).join(', ')}</p>}
                                                <p><strong>Interest:</strong> {formData.interest}</p>
                                                <p><strong>Heard about us:</strong> {formData.heardAbout}</p>
                                            </div>
                                            <FormField
                                                control={step4Form.control}
                                                name="agreeToTerms"
                                                render={({ field }) => (
                                                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                                        <FormControl>
                                                            <Checkbox
                                                                checked={field.value}
                                                                onCheckedChange={field.onChange}
                                                            />
                                                        </FormControl>
                                                        <div className="space-y-1 leading-none">
                                                            <FormLabel>
                                                                I agree to the{' '}
                                                                <a href="/terms" className="text-purple-600 underline">Terms of Service</a>{' '}
                                                                and{' '}
                                                                <a href="/privacy" className="text-purple-600 underline">Privacy Policy</a>
                                                            </FormLabel>
                                                            <FormMessage />
                                                        </div>
                                                    </FormItem>
                                                )}
                                            />
                                            <div className="flex gap-3">
                                                <Button type="button" variant="outline" onClick={() => setCurrentStep(3)} className="flex-1">
                                                    <ArrowLeft className="mr-2 w-4 h-4" /> Back
                                                </Button>
                                                <Button type="submit" disabled={isSubmitting} className="flex-1 bg-purple-600 hover:bg-purple-700">
                                                    {isSubmitting ? (
                                                        <><Loader2 className="mr-2 w-4 h-4 animate-spin" /> Submitting...</>
                                                    ) : (
                                                        <>Join Waitlist <CheckCircle2 className="ml-2 w-4 h-4" /></>
                                                    )}
                                                </Button>
                                            </div>
                                        </form>
                                    </Form>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Side Column: Benefits */}
                    <div className="lg:col-span-2 space-y-6">
                        <Card className="border-0 shadow-md">
                            <CardHeader>
                                <CardTitle className="text-lg">Why Join REALEVR?</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {[
                                    { icon: TrendingUp, title: 'More Exposure', desc: 'Reach thousands of qualified buyers and renters' },
                                    { icon: Shield, title: 'Verified Inquiries', desc: 'Only serious, verified prospects contact you' },
                                    { icon: Home, title: '360° Virtual Tours', desc: 'Showcase properties without endless showings' },
                                    { icon: Clock, title: 'Faster Deals', desc: 'Close deals up to 40% faster on average' },
                                ].map(({ icon: Icon, title, desc }) => (
                                    <div key={title} className="flex items-start gap-3">
                                        <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center flex-shrink-0">
                                            <Icon className="w-5 h-5 text-purple-600" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-gray-800 text-sm">{title}</p>
                                            <p className="text-gray-500 text-xs">{desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>

                        {/* Testimonials */}
                        <Card className="border-0 shadow-md">
                            <CardHeader>
                                <CardTitle className="text-lg">What Landlords Say</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {testimonials.map((t) => (
                                    <div key={t.name} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                                        <div className="flex items-center gap-1 mb-1">
                                            {Array.from({ length: t.rating }).map((_, i) => (
                                                <Star key={i} className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                                            ))}
                                        </div>
                                        <p className="text-gray-600 text-sm italic">"{t.quote}"</p>
                                        <p className="text-gray-500 text-xs mt-1 font-medium">{t.name} · {t.type}</p>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </section>

            {/* FAQ Section */}
            <section className="max-w-3xl mx-auto py-16 px-4">
                <h2 className="text-2xl font-bold text-center text-gray-900 mb-8">Frequently Asked Questions</h2>
                <div className="space-y-3">
                    {faqs.map((faq, index) => (
                        <div key={index} className="border border-gray-200 rounded-xl overflow-hidden">
                            <button
                                className="w-full text-left px-5 py-4 flex items-center justify-between bg-white hover:bg-gray-50 transition-colors"
                                onClick={() => setOpenFaq(openFaq === index ? null : index)}
                            >
                                <span className="font-medium text-gray-800">{faq.question}</span>
                                {openFaq === index ? (
                                    <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                ) : (
                                    <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                )}
                            </button>
                            {openFaq === index && (
                                <div className="px-5 py-4 bg-gray-50 border-t border-gray-100">
                                    <p className="text-gray-600 text-sm">{faq.answer}</p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </section>

            {/* Bottom CTA */}
            <section className="bg-gradient-to-r from-purple-700 to-indigo-600 text-white py-16 px-4 text-center">
                <h2 className="text-3xl font-bold mb-4">Ready to list your properties?</h2>
                <p className="text-purple-100 mb-8 max-w-lg mx-auto">
                    Join hundreds of property owners already on the waitlist. Spots are limited — don't miss your chance.
                </p>
                <Button
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    className="bg-white text-purple-700 hover:bg-purple-50 font-semibold px-8 py-3 h-auto"
                >
                    Join the Waitlist Now
                </Button>
            </section>
        </div>
    )
}
