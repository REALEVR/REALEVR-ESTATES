import { useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckIcon } from "lucide-react";

export default function MembershipPage() {
  useEffect(() => {
    document.title = "Become a Member | RealEVR Estates";
  }, []);

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
              {["5 property listings", "Basic virtual tour", "30-day listing", "Email support"].map((feature) => (
                <li key={feature} className="flex items-center gap-2">
                  <CheckIcon className="h-5 w-5 text-green-500" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Button className="w-full">Sign Up Now</Button>
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
              {[
                "20 property listings",
                "Premium virtual tours",
                "60-day listing",
                "Priority support",
                "Property analytics",
                "Featured listings"
              ].map((feature) => (
                <li key={feature} className="flex items-center gap-2">
                  <CheckIcon className="h-5 w-5 text-green-500" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Button className="w-full bg-black hover:bg-gray-800">Sign Up Now</Button>
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
              {[
                "Unlimited property listings",
                "Custom virtual tours",
                "Unlimited listing duration",
                "24/7 dedicated support",
                "Advanced analytics",
                "Featured listings",
                "Custom branding",
                "API access"
              ].map((feature) => (
                <li key={feature} className="flex items-center gap-2">
                  <CheckIcon className="h-5 w-5 text-green-500" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Button className="w-full">Contact Sales</Button>
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
        <Button>Start Free Trial</Button>
      </div>
    </div>
  );
}