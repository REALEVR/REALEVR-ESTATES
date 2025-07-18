import { AlertCircle, Phone, Mail, User, MapPin, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { Property } from "@shared/schema";

interface OwnerContactDetailsProps {
  property: Property;
  bookingConfirmed: boolean;
}

export default function OwnerContactDetails({ property, bookingConfirmed }: OwnerContactDetailsProps) {
  if (!bookingConfirmed) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Contact details hidden</AlertTitle>
        <AlertDescription>
          The owner's contact details are only revealed after you book this property with a 20% deposit. 
          Click "Book Now" to secure your stay.
        </AlertDescription>
      </Alert>
    );
  }

  // These would normally come from the property or user data
  // Showing fake data for demonstration purposes
  const ownerDetails = {
    name: "Sarah Johnson",
    phone: "+256 705 123456",
    email: "sarah.johnson@example.com",
    address: "Kampala, Uganda",
    responseTime: "Usually responds within 1 hour",
    verificationStatus: "Identity verified",
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center mb-4">
            <div className="h-16 w-16 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden mr-4">
              <User className="h-10 w-10 text-gray-500" />
            </div>
            <div>
              <h4 className="text-lg font-semibold">{ownerDetails.name}</h4>
              <p className="text-gray-500 text-sm">{ownerDetails.responseTime}</p>
              <div className="flex items-center text-green-600 text-sm mt-1">
                <Shield className="h-3 w-3 mr-1" />
                <span>{ownerDetails.verificationStatus}</span>
              </div>
            </div>
          </div>
          
          <div className="space-y-4 mt-6">
            <div className="flex items-center">
              <Phone className="h-5 w-5 mr-3 text-gray-500" />
              <div>
                <p className="text-sm text-gray-500">Phone</p>
                <p className="font-medium">{ownerDetails.phone}</p>
              </div>
            </div>
            
            <div className="flex items-center">
              <Mail className="h-5 w-5 mr-3 text-gray-500" />
              <div>
                <p className="text-sm text-gray-500">Email</p>
                <p className="font-medium">{ownerDetails.email}</p>
              </div>
            </div>
            
            <div className="flex items-center">
              <MapPin className="h-5 w-5 mr-3 text-gray-500" />
              <div>
                <p className="text-sm text-gray-500">Address</p>
                <p className="font-medium">{ownerDetails.address}</p>
              </div>
            </div>
          </div>
          
          <div className="flex space-x-3 mt-6">
            <Button className="w-full" variant="outline">
              <Phone className="h-4 w-4 mr-2" />
              Call
            </Button>
            <Button className="w-full" variant="default">
              <Mail className="h-4 w-4 mr-2" />
              Email
            </Button>
          </div>
        </CardContent>
      </Card>
      
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertTitle>Safety Notice</AlertTitle>
        <AlertDescription>
          Your booking is protected by our Secure Payment Policy. We recommend keeping all communication and payments within our platform.
        </AlertDescription>
      </Alert>
    </div>
  );
}