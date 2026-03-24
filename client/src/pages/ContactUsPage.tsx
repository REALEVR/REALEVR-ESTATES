import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShareButton } from "@/components/ui/ShareButton";
import { Textarea } from "@/components/ui/textarea";

export default function ContactUsPage() {
  return (
    <div className="container mx-auto px-6 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8">Contact Us</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl text-[#FF5A5F]">Get in Touch</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-[#FF5A5F]/10 rounded-full flex items-center justify-center">
                      <i className="fas fa-envelope text-[#FF5A5F]"></i>
                    </div>
                    <div>
                      <p className="font-semibold">Email</p>
                      <p className="text-gray-600">info@realevr.com</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-[#FF5A5F]/10 rounded-full flex items-center justify-center">
                      <i className="fas fa-phone text-[#FF5A5F]"></i>
                    </div>
                    <div>
                      <p className="font-semibold">Phone</p>
                      <p className="text-gray-600">+256 771 891 323</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-[#FF5A5F]/10 rounded-full flex items-center justify-center">
                      <i className="fas fa-map-marker-alt text-[#FF5A5F]"></i>
                    </div>
                    <div>
                      <p className="font-semibold">Address</p>
                      <p className="text-gray-600">Kampala, Uganda</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-[#FF5A5F]/10 rounded-full flex items-center justify-center">
                      <i className="fas fa-clock text-[#FF5A5F]"></i>
                    </div>
                    <div>
                      <p className="font-semibold">Business Hours</p>
                      <p className="text-gray-600">Mon-Fri: 8AM-6PM EAT</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-2xl text-[#FF5A5F]">Follow Us</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex space-x-4">
                  <Button variant="outline" size="icon" className="w-12 h-12">
                    <i className="fab fa-facebook-f"></i>
                  </Button>
                  <Button variant="outline" size="icon" className="w-12 h-12">
                    <i className="fab fa-twitter"></i>
                  </Button>
                  <Button variant="outline" size="icon" className="w-12 h-12">
                    <i className="fab fa-instagram"></i>
                  </Button>
                  <Button variant="outline" size="icon" className="w-12 h-12">
                    <i className="fab fa-linkedin-in"></i>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-2xl text-[#FF5A5F]">Send us a Message</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">First Name</label>
                    <Input placeholder="Enter your first name" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Last Name</label>
                    <Input placeholder="Enter your last name" />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Email</label>
                  <Input type="email" placeholder="Enter your email" />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Phone</label>
                  <Input placeholder="Enter your phone number" />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Subject</label>
                  <select className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#FF5A5F]">
                    <option>General Inquiry</option>
                    <option>Property Listing</option>
                    <option>Technical Support</option>
                    <option>Payment Issue</option>
                    <option>Partnership</option>
                    <option>Other</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Message</label>
                  <Textarea 
                    placeholder="Tell us how we can help you..."
                    rows={5}
                  />
                </div>
                
                <Button type="submit" className="w-full bg-[#FF5A5F] hover:bg-[#FF7478]">
                  <i className="fas fa-paper-plane mr-2"></i>
                  Send Message
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="mt-12">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl text-[#FF5A5F]">Frequently Asked Questions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold mb-2">How quickly will you respond?</h3>
                  <p className="text-gray-600 text-sm">
                    We typically respond to all inquiries within 24 hours during business days.
                  </p>
                </div>
                
                <div>
                  <h3 className="font-semibold mb-2">Can I schedule a call?</h3>
                  <p className="text-gray-600 text-sm">
                    Yes! We're happy to schedule a call to discuss your specific needs in detail.
                  </p>
                </div>
                
                <div>
                  <h3 className="font-semibold mb-2">Do you offer support in local languages?</h3>
                  <p className="text-gray-600 text-sm">
                    Currently, we provide support in English, but we're working on adding local languages.
                  </p>
                </div>
                
                <div>
                  <h3 className="font-semibold mb-2">What information should I include?</h3>
                  <p className="text-gray-600 text-sm">
                    Please include your name, contact details, and a detailed description of your inquiry.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <ShareButton title="Contact Us - REALEVR Estates" />
    </div>
  );
} 