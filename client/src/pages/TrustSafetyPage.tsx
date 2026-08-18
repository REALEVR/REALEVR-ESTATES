import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShareButton } from "@/components/ui/ShareButton";

export default function TrustSafetyPage() {
  return (
    <div className="container mx-auto px-6 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8">Trust & Safety</h1>
        
        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl text-[#FF5A5F]">Our Commitment to Safety</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 leading-relaxed mb-4">
                At RealEVR Estates, your safety and trust are our top priorities. We've implemented 
                comprehensive security measures and verification processes to ensure a safe and 
                reliable platform for all users.
              </p>
              <p className="text-gray-600 leading-relaxed">
                Whether you're searching for your dream home or listing properties as an agent, 
                you can trust that we're working behind the scenes to protect your interests and 
                maintain the highest standards of security.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-2xl text-[#FF5A5F]">Agent Verification</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold text-lg mb-3">License Verification</h3>
                  <ul className="text-gray-600 space-y-2">
                    <li>• All agents must provide valid real estate licenses</li>
                    <li>• Licenses are verified with regulatory authorities</li>
                    <li>• Regular license renewal checks</li>
                    <li>• Suspension of accounts with expired licenses</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-3">Identity Verification</h3>
                  <ul className="text-gray-600 space-y-2">
                    <li>• Government-issued ID verification</li>
                    <li>• Business registration verification</li>
                    <li>• Phone number and email verification</li>
                    <li>• Background checks for premium agents</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-2xl text-[#FF5A5F]">Property Verification</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="flex items-start space-x-4">
                  <div className="w-12 h-12 bg-[#FF5A5F]/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <i className="fas fa-check text-[#FF5A5F]"></i>
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-2">Property Ownership Verification</h3>
                    <p className="text-gray-600">
                      We verify property ownership through title deeds and land registry checks 
                      to ensure all listed properties are legitimate and properly owned.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-4">
                  <div className="w-12 h-12 bg-[#FF5A5F]/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <i className="fas fa-camera text-[#FF5A5F]"></i>
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-2">Photo Verification</h3>
                    <p className="text-gray-600">
                      All property photos are reviewed to ensure they accurately represent the 
                      actual property and meet our quality standards.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-4">
                  <div className="w-12 h-12 bg-[#FF5A5F]/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <i className="fas fa-map-marker-alt text-[#FF5A5F]"></i>
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-2">Location Verification</h3>
                    <p className="text-gray-600">
                      Property locations are verified using GPS coordinates and address validation 
                      to ensure accurate location information.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-2xl text-[#FF5A5F]">Payment Security</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="w-16 h-16 bg-[#FF5A5F]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i className="fas fa-shield-alt text-2xl text-[#FF5A5F]"></i>
                  </div>
                  <h3 className="font-semibold mb-2">SSL Encryption</h3>
                  <p className="text-gray-600 text-sm">
                    All payment transactions are protected with industry-standard SSL encryption.
                  </p>
                </div>
                
                <div className="text-center">
                  <div className="w-16 h-16 bg-[#FF5A5F]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i className="fas fa-credit-card text-2xl text-[#FF5A5F]"></i>
                  </div>
                  <h3 className="font-semibold mb-2">Secure Payment Gateway</h3>
                  <p className="text-gray-600 text-sm">
                    We use Flutterwave, a trusted payment processor with PCI DSS compliance.
                  </p>
                </div>
                
                <div className="text-center">
                  <div className="w-16 h-16 bg-[#FF5A5F]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i className="fas fa-lock text-2xl text-[#FF5A5F]"></i>
                  </div>
                  <h3 className="font-semibold mb-2">Fraud Protection</h3>
                  <p className="text-gray-600 text-sm">
                    Advanced fraud detection systems monitor all transactions for suspicious activity.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-2xl text-[#FF5A5F]">User Protection</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold text-lg mb-3">Privacy Protection</h3>
                  <ul className="text-gray-600 space-y-2">
                    <li>• Your personal information is never shared without consent</li>
                    <li>• Secure data storage with encryption</li>
                    <li>• Regular security audits and updates</li>
                    <li>• Compliance with data protection regulations</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-3">Dispute Resolution</h3>
                  <ul className="text-gray-600 space-y-2">
                    <li>• Dedicated support team for dispute resolution</li>
                    <li>• Clear refund policies for virtual tour payments</li>
                    <li>• Escalation process for complex issues</li>
                    <li>• Regular review of user complaints</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-2xl text-[#FF5A5F]">Reporting & Monitoring</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-gray-600">
                  We actively monitor our platform for any suspicious activity and encourage users 
                  to report any concerns they may have.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 border border-gray-200 rounded-lg">
                    <h4 className="font-semibold mb-2">Report Suspicious Activity</h4>
                    <p className="text-gray-600 text-sm mb-3">
                      If you encounter any suspicious listings or behavior, please report it immediately.
                    </p>
                    <button className="text-[#FF5A5F] text-sm font-medium hover:underline">
                      Report Issue →
                    </button>
                  </div>
                  
                  <div className="p-4 border border-gray-200 rounded-lg">
                    <h4 className="font-semibold mb-2">Safety Guidelines</h4>
                    <p className="text-gray-600 text-sm mb-3">
                      Learn about best practices for safe property viewing and transactions.
                    </p>
                    <button className="text-[#FF5A5F] text-sm font-medium hover:underline">
                      Read Guidelines →
                    </button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-2xl text-[#FF5A5F]">Contact Trust & Safety Team</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <p className="text-gray-600 mb-4">
                  Have a safety concern or need to report an issue? Our dedicated Trust & Safety team 
                  is here to help.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button className="px-6 py-3 bg-[#FF5A5F] text-white rounded-lg hover:bg-[#FF7478] transition-colors">
                    <i className="fas fa-exclamation-triangle mr-2"></i>
                    Report Safety Issue
                  </button>
                  <button className="px-6 py-3 border border-[#FF5A5F] text-[#FF5A5F] rounded-lg hover:bg-[#FF5A5F]/5 transition-colors">
                    <i className="fas fa-envelope mr-2"></i>
                    Contact Safety Team
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <ShareButton title="Trust &amp; Safety - REALEVR Estates" />
    </div>
  );
} 