import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { CalendarDays, Mail, MapPin, Phone } from "lucide-react";
import { Property } from "@shared/schema";
import { usePayment } from "@/contexts/PaymentContext";
import BookingCalendarModal from "./BookingCalendarModal";

interface OwnerContactDetailsProps {
  property: Property;
  bookingConfirmed: boolean;
}

export default function OwnerContactDetails({ property, bookingConfirmed }: OwnerContactDetailsProps) {
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const { openDepositPaymentPrompt } = usePayment();
  
  // Mock property owner data (in a real app this would come from the backend)
  const owner = {
    name: "John Doe",
    phone: "+256 700 123456",
    email: "johndoe@example.com",
    responseTime: "Usually responds within 1 hour",
    joinedDate: "April 2022"
  };

  if (!bookingConfirmed) {
    return (
      <Card className="w-full p-4 bg-gray-50 border border-gray-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold">Contact Information Hidden</CardTitle>
          <CardDescription>
            Owner contact details are only available after confirming your booking with a deposit.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0 pb-2">
          <div className="flex items-center">
            <CalendarDays className="h-4 w-4 mr-2 text-gray-500" />
            <span className="text-sm text-gray-500">Book this property to view contact details</span>
          </div>
        </CardContent>
        <CardFooter className="pt-2">
          <Button 
            onClick={() => setIsBookingModalOpen(true)}
            className="w-full"
          >
            Book Now
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Owner Contact Information</CardTitle>
        <CardDescription>
          You've successfully booked this property. Contact the owner for any questions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div>
            <Label className="text-base font-medium">{owner.name}</Label>
            <p className="text-sm text-gray-500">Property Owner</p>
          </div>
          
          <Separator />
          
          <div className="flex items-center">
            <Phone className="h-4 w-4 mr-2 text-gray-500" />
            <span>{owner.phone}</span>
          </div>
          
          <div className="flex items-center">
            <Mail className="h-4 w-4 mr-2 text-gray-500" />
            <span>{owner.email}</span>
          </div>
          
          <div className="flex items-center">
            <MapPin className="h-4 w-4 mr-2 text-gray-500" />
            <span>{property.location}</span>
          </div>
          
          <Separator />
          
          <div className="text-sm text-gray-500">
            <p>{owner.responseTime}</p>
            <p>Member since {owner.joinedDate}</p>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <div className="text-xs text-gray-400 w-full">
          Note: Please be respectful of the owner's time and contact during reasonable hours.
        </div>
      </CardFooter>
      
      {/* Booking Calendar Modal */}
      <BookingCalendarModal 
        isOpen={isBookingModalOpen}
        onClose={() => setIsBookingModalOpen(false)}
        propertyId={property.id}
        propertyTitle={property.title}
        propertyCategory="BnB"
        propertyPrice={property.price}
      />
    </Card>
  );
}