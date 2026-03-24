import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShareButton } from "@/components/ui/ShareButton";

export default function AboutUsPage() {
  return (
    <div className="container mx-auto px-6 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8">About RealEVR Estates</h1>
        
        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl text-[#FF5A5F]">Our Mission</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 leading-relaxed">
                RealEVR Estates is revolutionizing the real estate industry in Uganda by providing 
                immersive virtual tours and seamless property discovery experiences. We believe that 
                everyone deserves to explore properties from anywhere, anytime, with just a click.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-2xl text-[#FF5A5F]">What We Do</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold text-lg mb-2">Virtual Tours</h3>
                  <p className="text-gray-600">
                    Experience properties in 360° immersive tours that let you explore every corner 
                    from the comfort of your home.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-2">Property Discovery</h3>
                  <p className="text-gray-600">
                    Find your perfect home with our advanced search filters and comprehensive 
                    property listings across Uganda.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-2">Agent Services</h3>
                  <p className="text-gray-600">
                    Connect with verified real estate agents and property owners for personalized 
                    assistance and guidance.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-2">Secure Payments</h3>
                  <p className="text-gray-600">
                    Safe and secure payment processing for property viewings and bookings with 
                    multiple payment options.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-2xl text-[#FF5A5F]">Our Story</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 leading-relaxed mb-4">
                Founded in 2024, RealEVR Estates emerged from a vision to transform how people 
                discover and experience real estate in Uganda. We recognized the challenges of 
                traditional property viewing and set out to create a solution that combines 
                cutting-edge technology with local market expertise.
              </p>
              <p className="text-gray-600 leading-relaxed">
                Today, we serve thousands of users across Uganda, helping them find their dream 
                homes, investment properties, and vacation rentals through our innovative platform. 
                Our commitment to quality, transparency, and user experience drives everything we do.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-2xl text-[#FF5A5F]">Our Values</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="w-16 h-16 bg-[#FF5A5F]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i className="fas fa-shield-alt text-2xl text-[#FF5A5F]"></i>
                  </div>
                  <h3 className="font-semibold mb-2">Trust & Security</h3>
                  <p className="text-gray-600 text-sm">
                    We prioritize the security and privacy of our users' data and transactions.
                  </p>
                </div>
                <div className="text-center">
                  <div className="w-16 h-16 bg-[#FF5A5F]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i className="fas fa-users text-2xl text-[#FF5A5F]"></i>
                  </div>
                  <h3 className="font-semibold mb-2">Community Focus</h3>
                  <p className="text-gray-600 text-sm">
                    Building strong relationships with our users, agents, and property owners.
                  </p>
                </div>
                <div className="text-center">
                  <div className="w-16 h-16 bg-[#FF5A5F]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i className="fas fa-rocket text-2xl text-[#FF5A5F]"></i>
                  </div>
                  <h3 className="font-semibold mb-2">Innovation</h3>
                  <p className="text-gray-600 text-sm">
                    Continuously improving our platform with the latest technology and features.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <ShareButton title="About REALEVR Estates" />
    </div>
  );
} 