import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function HowItWorksPage() {
  return (
    <div className="container mx-auto px-6 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8">How RealEVR Estates Works</h1>
        
        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl text-accent">For Property Seekers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-accent text-accent-foreground rounded-full flex items-center justify-center font-bold flex-shrink-0">
                    1
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-2">Browse Properties</h3>
                    <p className="text-gray-600">
                      Explore our extensive collection of properties across Uganda. Use filters to 
                      find exactly what you're looking for - from apartments to luxury homes.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-accent text-accent-foreground rounded-full flex items-center justify-center font-bold flex-shrink-0">
                    2
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-2">Take Virtual Tours</h3>
                    <p className="text-gray-600">
                      Experience properties in immersive 360° virtual tours. For rental properties, 
                      a small fee of 15,000 UGX gives you access to detailed virtual tours.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-accent text-accent-foreground rounded-full flex items-center justify-center font-bold flex-shrink-0">
                    3
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-2">Connect with Agents</h3>
                    <p className="text-gray-600">
                      Once you find a property you like, connect directly with verified agents or 
                      property owners for more information and scheduling viewings.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-accent text-accent-foreground rounded-full flex items-center justify-center font-bold flex-shrink-0">
                    4
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-2">Make Your Decision</h3>
                    <p className="text-gray-600">
                      With all the information at your fingertips, make informed decisions about 
                      your property investment or rental choice.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-2xl text-accent">For Property Owners & Agents</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-accent text-accent-foreground rounded-full flex items-center justify-center font-bold flex-shrink-0">
                    1
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-2">Register as an Agent</h3>
                    <p className="text-gray-600">
                      Sign up for an agent account and choose from our subscription plans: Basic, 
                      Professional, or Enterprise to access our platform features.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-accent text-accent-foreground rounded-full flex items-center justify-center font-bold flex-shrink-0">
                    2
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-2">Add Your Properties</h3>
                    <p className="text-gray-600">
                      Upload detailed property information, high-quality photos, and create 
                      immersive virtual tours to showcase your properties effectively.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-accent text-accent-foreground rounded-full flex items-center justify-center font-bold flex-shrink-0">
                    3
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-2">Manage Inquiries</h3>
                    <p className="text-gray-600">
                      Receive and manage property inquiries from potential buyers and renters 
                      through our integrated messaging system.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-accent text-accent-foreground rounded-full flex items-center justify-center font-bold flex-shrink-0">
                    4
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-2">Track Performance</h3>
                    <p className="text-gray-600">
                      Monitor your property views, inquiries, and performance metrics through 
                      our comprehensive dashboard.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-2xl text-accent">Subscription Plans</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="border border-gray-200 rounded-lg p-6 text-center">
                  <h3 className="font-bold text-xl mb-2">Basic</h3>
                  <p className="text-3xl font-bold text-accent mb-4">Free</p>
                  <ul className="text-sm text-gray-600 space-y-2">
                    <li>• Limited property views</li>
                    <li>• Basic search features</li>
                    <li>• Standard support</li>
                  </ul>
                </div>
                
                <div className="border border-accent rounded-lg p-6 text-center bg-accent/5">
                  <h3 className="font-bold text-xl mb-2">Professional</h3>
                  <p className="text-3xl font-bold text-accent mb-4">50K UGX</p>
                  <p className="text-sm text-gray-500 mb-4">per month</p>
                  <ul className="text-sm text-gray-600 space-y-2">
                    <li>• Unlimited property views</li>
                    <li>• Advanced search filters</li>
                    <li>• Priority support</li>
                    <li>• Virtual tour access</li>
                  </ul>
                </div>
                
                <div className="border border-gray-200 rounded-lg p-6 text-center">
                  <h3 className="font-bold text-xl mb-2">Enterprise</h3>
                  <p className="text-3xl font-bold text-accent mb-4">100K UGX</p>
                  <p className="text-sm text-gray-500 mb-4">per month</p>
                  <ul className="text-sm text-gray-600 space-y-2">
                    <li>• All Professional features</li>
                    <li>• Analytics dashboard</li>
                    <li>• Dedicated support</li>
                    <li>• Custom integrations</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-2xl text-accent">Payment & Security</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold text-lg mb-2">Secure Payments</h3>
                  <p className="text-gray-600">
                    All payments are processed securely through Flutterwave, supporting multiple 
                    payment methods including cards, mobile money, and bank transfers.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-2">Data Protection</h3>
                  <p className="text-gray-600">
                    Your personal information and payment details are protected with industry-standard 
                    encryption and security measures.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
} 