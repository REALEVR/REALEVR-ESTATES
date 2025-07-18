import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function HelpCenterPage() {
  return (
    <div className="container mx-auto px-6 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8">Help Center</h1>
        
        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl text-[#FF5A5F]">Frequently Asked Questions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="border-b border-gray-200 pb-4">
                  <h3 className="font-semibold text-lg mb-2">How do I view a virtual tour?</h3>
                  <p className="text-gray-600">
                    Click on any property card and then click "View Tour". For rental properties, 
                    you'll need to pay a small fee of 15,000 UGX to access the virtual tour. 
                    Other property types are free to view.
                  </p>
                </div>
                
                <div className="border-b border-gray-200 pb-4">
                  <h3 className="font-semibold text-lg mb-2">How do I register as an agent?</h3>
                  <p className="text-gray-600">
                    Visit our agent registration page and choose a subscription plan. You'll need 
                    to provide your license information and company details. Once approved, you can 
                    start adding properties.
                  </p>
                </div>
                
                <div className="border-b border-gray-200 pb-4">
                  <h3 className="font-semibold text-lg mb-2">What payment methods do you accept?</h3>
                  <p className="text-gray-600">
                    We accept all major credit cards, mobile money (MTN, Airtel), and bank transfers 
                    through our secure payment partner Flutterwave.
                  </p>
                </div>
                
                <div className="border-b border-gray-200 pb-4">
                  <h3 className="font-semibold text-lg mb-2">How do I contact a property owner?</h3>
                  <p className="text-gray-600">
                    After viewing a property, you can use the "Contact Agent" button to get in touch 
                    with the property owner or agent. For BnB properties, you may need to book first.
                  </p>
                </div>
                
                <div className="border-b border-gray-200 pb-4">
                  <h3 className="font-semibold text-lg mb-2">Can I schedule a physical viewing?</h3>
                  <p className="text-gray-600">
                    Yes! Use the "Schedule Visit" button on any property to arrange a physical viewing 
                    with the property owner or agent.
                  </p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-lg mb-2">How do I reset my password?</h3>
                  <p className="text-gray-600">
                    If you've forgotten your password, please contact our support team at 
                    support@realevr.com and we'll help you reset it.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-2xl text-[#FF5A5F]">Contact Support</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold text-lg mb-4">Get in Touch</h3>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <i className="fas fa-envelope text-[#FF5A5F]"></i>
                      <span className="text-gray-600">support@realevr.com</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <i className="fas fa-phone text-[#FF5A5F]"></i>
                      <span className="text-gray-600">+256 700 000 000</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <i className="fas fa-clock text-[#FF5A5F]"></i>
                      <span className="text-gray-600">Mon-Fri: 8AM-6PM EAT</span>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h3 className="font-semibold text-lg mb-4">Quick Actions</h3>
                  <div className="space-y-3">
                    <Button variant="outline" className="w-full justify-start">
                      <i className="fas fa-user-plus mr-2"></i>
                      Register as Agent
                    </Button>
                    <Button variant="outline" className="w-full justify-start">
                      <i className="fas fa-question-circle mr-2"></i>
                      Report an Issue
                    </Button>
                    <Button variant="outline" className="w-full justify-start">
                      <i className="fas fa-lightbulb mr-2"></i>
                      Suggest Feature
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-2xl text-[#FF5A5F]">User Guides</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="w-12 h-12 bg-[#FF5A5F]/10 rounded-lg flex items-center justify-center mb-4">
                    <i className="fas fa-search text-[#FF5A5F] text-xl"></i>
                  </div>
                  <h3 className="font-semibold mb-2">Finding Properties</h3>
                  <p className="text-gray-600 text-sm mb-3">
                    Learn how to search and filter properties to find exactly what you're looking for.
                  </p>
                  <Button variant="link" className="p-0 h-auto text-[#FF5A5F]">
                    Read Guide →
                  </Button>
                </div>
                
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="w-12 h-12 bg-[#FF5A5F]/10 rounded-lg flex items-center justify-center mb-4">
                    <i className="fas fa-vr-cardboard text-[#FF5A5F] text-xl"></i>
                  </div>
                  <h3 className="font-semibold mb-2">Virtual Tours</h3>
                  <p className="text-gray-600 text-sm mb-3">
                    Everything you need to know about experiencing properties through virtual tours.
                  </p>
                  <Button variant="link" className="p-0 h-auto text-[#FF5A5F]">
                    Read Guide →
                  </Button>
                </div>
                
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="w-12 h-12 bg-[#FF5A5F]/10 rounded-lg flex items-center justify-center mb-4">
                    <i className="fas fa-credit-card text-[#FF5A5F] text-xl"></i>
                  </div>
                  <h3 className="font-semibold mb-2">Payments & Billing</h3>
                  <p className="text-gray-600 text-sm mb-3">
                    Understanding our payment system and subscription plans for agents.
                  </p>
                  <Button variant="link" className="p-0 h-auto text-[#FF5A5F]">
                    Read Guide →
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-2xl text-[#FF5A5F]">Still Need Help?</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <p className="text-gray-600 mb-6">
                  Can't find what you're looking for? Our support team is here to help!
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button className="bg-[#FF5A5F] hover:bg-[#FF7478]">
                    <i className="fas fa-envelope mr-2"></i>
                    Email Support
                  </Button>
                  <Button variant="outline">
                    <i className="fas fa-phone mr-2"></i>
                    Call Us
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
} 