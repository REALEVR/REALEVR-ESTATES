import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckIcon, Loader2 } from "lucide-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { insertUserSchema } from "@shared/schema";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";

// Remove confirmPassword from the final submitted data
type FormValues = z.infer<typeof insertUserSchema>;

export default function MembershipPage() {
  const [, setLocation] = useLocation();
  const { user, registerMutation } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  
  const form = useForm<FormValues>({
    resolver: zodResolver(insertUserSchema),
    defaultValues: {
      username: "",
      password: "",
      confirmPassword: "",
      email: "",
      fullName: "",
      membershipPlan: selectedPlan || "",
    },
  });

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      setLocation("/");
    }
  }, [user, setLocation]);

  useEffect(() => {
    document.title = "Become a Member | RealEVR Estates";
  }, []);

  useEffect(() => {
    // Update form value when plan changes
    if (selectedPlan) {
      form.setValue("membershipPlan", selectedPlan);
    }
  }, [selectedPlan, form]);

  const openPlanSignup = (plan: string) => {
    setSelectedPlan(plan);
    setShowRegisterModal(true);
  };

  const onSubmit = (data: FormValues) => {
    // Exclude confirmPassword from data sent to API
    const { confirmPassword, ...registerData } = data;
    registerMutation.mutate(registerData);
  };

  const planFeatures = {
    basic: ["5 property listings", "Basic virtual tour", "30-day listing", "Email support"],
    professional: [
      "20 property listings",
      "Premium virtual tours",
      "60-day listing",
      "Priority support",
      "Property analytics",
      "Featured listings"
    ],
    enterprise: [
      "Unlimited property listings",
      "Custom virtual tours",
      "Unlimited listing duration",
      "24/7 dedicated support",
      "Advanced analytics",
      "Featured listings",
      "Custom branding",
      "API access"
    ]
  };

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">Join RealEVR Estates</h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Become a member to list your properties with virtual tours and expand your reach to potential clients.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
        {/* Basic Plan */}
        <Card className="border-2 hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="text-2xl">Basic</CardTitle>
            <CardDescription>Perfect for individual agents</CardDescription>
            <div className="mt-4">
              <span className="text-4xl font-bold">$29</span>
              <span className="text-gray-500">/month</span>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {planFeatures.basic.map((feature) => (
                <li key={feature} className="flex items-center gap-2">
                  <CheckIcon className="h-5 w-5 text-green-500" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Button 
              className="w-full"
              onClick={() => openPlanSignup("basic")}
            >
              Sign Up Now
            </Button>
          </CardFooter>
        </Card>

        {/* Professional Plan */}
        <Card className="border-2 border-black relative hover:shadow-lg transition-shadow">
          <div className="absolute top-0 left-0 right-0 bg-black text-white py-1 text-center text-sm">
            Most Popular
          </div>
          <CardHeader className="pt-8">
            <CardTitle className="text-2xl">Professional</CardTitle>
            <CardDescription>Ideal for real estate teams</CardDescription>
            <div className="mt-4">
              <span className="text-4xl font-bold">$79</span>
              <span className="text-gray-500">/month</span>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {planFeatures.professional.map((feature) => (
                <li key={feature} className="flex items-center gap-2">
                  <CheckIcon className="h-5 w-5 text-green-500" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Button 
              className="w-full bg-black hover:bg-gray-800"
              onClick={() => openPlanSignup("professional")}
            >
              Sign Up Now
            </Button>
          </CardFooter>
        </Card>

        {/* Enterprise Plan */}
        <Card className="border-2 hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="text-2xl">Enterprise</CardTitle>
            <CardDescription>For large agencies and brokerages</CardDescription>
            <div className="mt-4">
              <span className="text-4xl font-bold">$199</span>
              <span className="text-gray-500">/month</span>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {planFeatures.enterprise.map((feature) => (
                <li key={feature} className="flex items-center gap-2">
                  <CheckIcon className="h-5 w-5 text-green-500" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Button 
              className="w-full"
              onClick={() => openPlanSignup("enterprise")}
            >
              Contact Sales
            </Button>
          </CardFooter>
        </Card>
      </div>

      <div className="mt-16 text-center">
        <h2 className="text-2xl font-bold mb-4">Not ready to commit?</h2>
        <p className="text-gray-600 mb-6">
          Try our free 14-day trial with all Professional features included.
        </p>
        <Button asChild variant="outline" className="mr-4">
          <Link href="/">Return Home</Link>
        </Button>
        <Button onClick={() => openPlanSignup("trial")}>
          Start Free Trial
        </Button>
      </div>

      {/* Registration Dialog */}
      <Dialog open={showRegisterModal} onOpenChange={setShowRegisterModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl">Create Your Account</DialogTitle>
            <DialogDescription>
              {selectedPlan === "trial" 
                ? "Sign up for a 14-day free trial with Professional features."
                : `Complete your registration for the ${selectedPlan?.charAt(0).toUpperCase()}${selectedPlan?.slice(1)} plan.`}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="john.doe@example.com" {...field} />
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
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input placeholder="johndoe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
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
                    <FormLabel>Confirm Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end pt-4">
                <Button type="button" variant="outline" className="mr-2" onClick={() => setShowRegisterModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={registerMutation.isPending}>
                  {registerMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Registering...
                    </>
                  ) : (
                    "Complete Registration"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}