import { AlertCircle, Phone, Mail, User, MapPin, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { Property, User as UserType } from "@shared/schema";
import { maskPhoneNumber } from "@/lib/phone-mask";

interface OwnerContactDetailsProps {
  property: Property;
  bookingConfirmed: boolean;
  owner?: Omit<UserType, "password" | "emailVerificationToken"> | null;
}

export default function OwnerContactDetails({ property, bookingConfirmed, owner }: OwnerContactDetailsProps) {
  if (!bookingConfirmed) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Contact details hidden</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            The host's contact details are only revealed after you book this property with a 20% deposit. Click
            "Book Now" to secure your stay.
          </p>
          {/* A real number, visibly attached to a real host, without being
              directly callable pre-payment - proof this listing has an
              actual person behind it rather than just a "pay first, trust
              us" wall. */}
          {property.hostPhone && (
            <p className="flex items-center gap-1.5 text-foreground">
              <Phone className="h-3.5 w-3.5" />
              <span className="font-mono">{maskPhoneNumber(property.hostPhone)}</span>
              <span className="text-xs text-muted-foreground">(full number after booking)</span>
            </p>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  // A BnB's real point of contact is whoever is actually hosting the stay
  // (hostName/hostPhone, captured on the upload form) - prefer that over
  // the uploading agent's own contact, which is who ownerContactInfo/owner
  // below would otherwise show.
  const ownerDetails = {
    name: property.hostName || owner?.fullName || owner?.username || "RealEVR Estates Agent",
    phone: property.hostPhone || owner?.phoneNumber || property.ownerContactInfo || "Contact via platform messaging",
    email: owner?.email || "Available after booking",
    address: property.location,
    responseTime: "Usually responds within 1 hour",
    verificationStatus: owner ? "Identity verified" : "Verification pending",
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
            <Button
              className="w-full"
              variant="outline"
              disabled={!property.hostPhone && !owner?.phoneNumber && !property.ownerContactInfo}
              onClick={() => window.open(`tel:${ownerDetails.phone}`, "_self")}
            >
              <Phone className="h-4 w-4 mr-2" />
              Call
            </Button>
            <Button
              className="w-full"
              variant="default"
              disabled={!owner?.email}
              onClick={() => window.open(`mailto:${ownerDetails.email}`, "_self")}
            >
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
