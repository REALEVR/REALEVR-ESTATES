import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  UserPlus, 
  Loader2, 
  Building, 
  CheckIcon, 
  Star,
  Crown,
  Zap,
  Users,
  Eye,
  Calendar,
  Shield
} from "lucide-react";
import { useFlutterwave, FlutterwaveConfig } from "flutterwave-react-v3";

const AgentRegistrationSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  phoneNumber: z.string().min(10, "Phone number must be at least 10 characters"),
  companyName: z.string().optional(),
  licenseNumber: z.string().optional(),
  subscriptionPlan: z.enum(["basic", "professional", "enterprise"]),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type AgentRegistrationFormValues = z.infer<typeof AgentRegistrationSchema>;

export default function AgentRegistrationPage() {
  const [, setLocation] = useLocation();
  const { registerMutation } = useAuth();
  const { toast } = useToast();
  const [selectedPlan, setSelectedPlan] = useState<"basic" | "professional" | "enterprise">("basic");
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [registrationData, setRegistrationData] = useState<AgentRegistrationFormValues | null>(null);

  const form = useForm<AgentRegistrationFormValues>({
    resolver: zodResolver(AgentRegistrationSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
      fullName: "",
      phoneNumber: "",
      companyName: "",
      licenseNumber: "",
      subscriptionPlan: "basic",
    },
  });

  // Redirect if already logged in
  if (registerMutation.isSuccess) {
    setLocation("/agent/dashboard");
    return null;
  }

  const planDetails = {
    basic: {
      name: "Basic Agent",
      price: 50000,
      currency: "UGX",
      period: "month",
      features: [
        "List up to 10 properties",
        "Basic virtual tours",
        "Email support",
        "Property analytics",
        "30-day listing duration"
      ],
      color: "border-gray-300",
      badgeColor: "bg-gray-100 text-gray-800"
    },
    professional: {
      name: "Professional Agent",
      price: 100000,
      currency: "UGX",
      period: "month",
      features: [
        "List up to 50 properties",
        "Premium virtual tours",
        "Priority support",
        "Advanced analytics",
        "Featured listings",
        "60-day listing duration",
        "Lead management"
      ],
      color: "border-blue-300",
      badgeColor: "bg-blue-100 text-blue-800"
    },
    enterprise: {
      name: "Enterprise Agent",
      price: 200000,
      currency: "UGX",
      period: "month",
      features: [
        "Unlimited property listings",
        "Custom virtual tours",
        "24/7 dedicated support",
        "Advanced analytics dashboard",
        "Featured listings priority",
        "Unlimited listing duration",
        "Lead management system",
        "Custom branding",
        "API access",
        "Team management"
      ],
      color: "border-purple-300",
      badgeColor: "bg-purple-100 text-purple-800"
    }
  };

  const selectedPlanDetails = planDetails[selectedPlan];

  // Flutterwave configuration
  const config: FlutterwaveConfig = {
    public_key: import.meta.env.VITE_FLUTTERWAVE_PUBLIC_KEY,
    tx_ref: `agent-reg-${Date.now()}`,
    amount: selectedPlanDetails.price,
    currency: selectedPlanDetails.currency,
    payment_options: 'card,mobilemoney,ussd',
    customer: {
      email: form.watch('email') || 'agent@example.com',
      phone_number: form.watch('phoneNumber') || '',
      name: form.watch('fullName') || '',
    },
    customizations: {
      title: 'Agent Registration - RealEVR Estates',
      description: `${selectedPlanDetails.name} subscription`,
      logo: 'https://st2.depositphotos.com/1802620/7621/v/450/depositphotos_76219969-stock-illustration-real-estate-logo-template.jpg',
    },
  };

  const handleFlutterPayment = useFlutterwave(config);

  const onSubmit = async (data: AgentRegistrationFormValues) => {
    setRegistrationData(data);
    setIsPaymentModalOpen(true);
  };

  const handlePaymentSuccess = async (response: any) => {
    if (response.status === 'successful') {
      try {
        // Verify the payment with our backend
        const verificationResponse = await fetch("/api/verify-agent-subscription", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            transaction_id: response.transaction_id
          })
        });

        const verificationData = await verificationResponse.json();

        if (verificationData.status === "success") {
          await createAgentAccount(response.transaction_id, verificationData.data.expiresAt);
        } else {
          toast({
            title: "Payment Verification Failed",
            description: "Payment could not be verified. Please contact support.",
            variant: "destructive"
          });
        }
      } catch (error) {
        toast({
          title: "Registration Error",
          description: "Failed to create agent account. Please contact support.",
          variant: "destructive"
        });
      }
    } else {
      toast({
        title: "Payment Failed",
        description: "Payment was not successful. Please try again.",
        variant: "destructive"
      });
    }
  };

  const createAgentAccount = async (paymentId?: string, expiresAt?: number) => {
    try {
      // Create the agent account with subscription details
      const agentData = {
        ...registrationData!,
        role: "agent" as const,
        isVerified: false,
        membershipPlan: selectedPlan,
        membershipStartDate: new Date().toISOString(),
        membershipEndDate: expiresAt ? new Date(expiresAt).toISOString() : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        subscriptionPaymentId: paymentId || `test-${Date.now()}`,
        subscriptionStatus: "active"
      };

      // Remove confirmPassword from the data
      const { confirmPassword, ...agentDataWithoutConfirm } = agentData;
      
      registerMutation.mutate(agentDataWithoutConfirm);
      
      toast({
        title: "Registration Successful!",
        description: `Welcome to RealEVR Estates as a ${selectedPlanDetails.name}!`,
      });
      
      setIsPaymentModalOpen(false);
    } catch (error) {
      toast({
        title: "Registration Error",
        description: "Failed to create agent account. Please contact support.",
        variant: "destructive"
      });
    }
  };



  const handlePaymentClose = () => {
    setIsPaymentModalOpen(false);
  };

  const handlePayment = () => {
    handleFlutterPayment({
      callback: handlePaymentSuccess,
      onClose: handlePaymentClose,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-12">
      <div className="container mx-auto px-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Become a Real Estate Agent
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Join RealEVR Estates as a professional agent and start listing properties with virtual tours. 
              Choose a subscription plan that fits your business needs.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Registration Form */}
            <Card className="lg:order-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="h-5 w-5" />
                  Agent Registration
                </CardTitle>
                <CardDescription>
                  Create your agent account and choose your subscription plan
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="fullName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Full Name *</FormLabel>
                            <FormControl>
                              <Input placeholder="Enter your full name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="username"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Username *</FormLabel>
                            <FormControl>
                              <Input placeholder="Choose a username" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email *</FormLabel>
                            <FormControl>
                              <Input type="email" placeholder="Enter your email" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="phoneNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Phone Number *</FormLabel>
                            <FormControl>
                              <Input placeholder="Enter your phone number" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="companyName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Company Name (Optional)</FormLabel>
                            <FormControl>
                              <Input placeholder="Your company name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="licenseNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>License Number (Optional)</FormLabel>
                            <FormControl>
                              <Input placeholder="Your real estate license" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Password *</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="Create a password" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="confirmPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Confirm Password *</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="Confirm password" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <Button 
                      type="submit" 
                      className="w-full"
                      disabled={registerMutation.isPending}
                    >
                      {registerMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating Account...
                        </>
                      ) : (
                        <>
                          <UserPlus className="mr-2 h-4 w-4" />
                          Register as Agent
                        </>
                      )}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>

            {/* Subscription Plans */}
            <div className="lg:order-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Crown className="h-5 w-5" />
                    Choose Your Plan
                  </CardTitle>
                  <CardDescription>
                    Select a subscription plan that matches your business needs
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs value={selectedPlan} onValueChange={(value) => setSelectedPlan(value as any)}>
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="basic">Basic</TabsTrigger>
                      <TabsTrigger value="professional">Professional</TabsTrigger>
                      <TabsTrigger value="enterprise">Enterprise</TabsTrigger>
                    </TabsList>

                    <TabsContent value="basic" className="pt-4">
                      <div className={`rounded-lg border-2 ${planDetails.basic.color} p-6 space-y-4`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-xl font-bold">{planDetails.basic.name}</h3>
                            <Badge className={planDetails.basic.badgeColor}>Popular for Starters</Badge>
                          </div>
                          <div className="text-right">
                            <div className="text-3xl font-bold">UGX {planDetails.basic.price.toLocaleString()}</div>
                            <div className="text-sm text-gray-500">per {planDetails.basic.period}</div>
                          </div>
                        </div>
                        
                        <ul className="space-y-3">
                          {planDetails.basic.features.map((feature, index) => (
                            <li key={index} className="flex items-center gap-2">
                              <CheckIcon className="h-4 w-4 text-green-500 flex-shrink-0" />
                              <span className="text-sm">{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </TabsContent>

                    <TabsContent value="professional" className="pt-4">
                      <div className={`rounded-lg border-2 ${planDetails.professional.color} p-6 space-y-4`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-xl font-bold">{planDetails.professional.name}</h3>
                            <Badge className={planDetails.professional.badgeColor}>Most Popular</Badge>
                          </div>
                          <div className="text-right">
                            <div className="text-3xl font-bold">UGX {planDetails.professional.price.toLocaleString()}</div>
                            <div className="text-sm text-gray-500">per {planDetails.professional.period}</div>
                          </div>
                        </div>
                        
                        <ul className="space-y-3">
                          {planDetails.professional.features.map((feature, index) => (
                            <li key={index} className="flex items-center gap-2">
                              <CheckIcon className="h-4 w-4 text-green-500 flex-shrink-0" />
                              <span className="text-sm">{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </TabsContent>

                    <TabsContent value="enterprise" className="pt-4">
                      <div className={`rounded-lg border-2 ${planDetails.enterprise.color} p-6 space-y-4`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-xl font-bold">{planDetails.enterprise.name}</h3>
                            <Badge className={planDetails.enterprise.badgeColor}>Premium</Badge>
                          </div>
                          <div className="text-right">
                            <div className="text-3xl font-bold">UGX {planDetails.enterprise.price.toLocaleString()}</div>
                            <div className="text-sm text-gray-500">per {planDetails.enterprise.period}</div>
                          </div>
                        </div>
                        
                        <ul className="space-y-3">
                          {planDetails.enterprise.features.map((feature, index) => (
                            <li key={index} className="flex items-center gap-2">
                              <CheckIcon className="h-4 w-4 text-green-500 flex-shrink-0" />
                              <span className="text-sm">{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </TabsContent>
                  </Tabs>

                  <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                    <h4 className="font-semibold text-blue-900 mb-2">What's Included:</h4>
                    <ul className="space-y-1 text-sm text-blue-800">
                      <li className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        Verified agent badge
                      </li>
                      <li className="flex items-center gap-2">
                        <Eye className="h-4 w-4" />
                        Access to all properties
                      </li>
                      <li className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Monthly subscription
                      </li>
                      <li className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Direct client contact
                      </li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Payment Modal */}
          {isPaymentModalOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                <h3 className="text-lg font-semibold mb-4">Complete Registration</h3>
                <p className="text-gray-600 mb-4">
                  You're about to register as a {selectedPlanDetails.name} for UGX {selectedPlanDetails.price.toLocaleString()} per month.
                </p>
                

                
                <div className="flex gap-3">
                  <Button variant="outline" onClick={handlePaymentClose} className="flex-1">
                    Cancel
                  </Button>
                  <Button onClick={handlePayment} className="flex-1">
                    Proceed to Payment
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 