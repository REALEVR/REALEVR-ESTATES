import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import OwnerContactDetails from "./OwnerContactDetails";
import BookingCalendarModal from "./BookingCalendarModal";
import VirtualTourModal from "./VirtualTourModal";
import type { Property } from "@shared/schema";

interface PropertyDetailsProps {
  property: Property;
}

export default function PropertyDetails({ property }: PropertyDetailsProps) {
  const [isFavorite, setIsFavorite] = useState(false);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isTourModalOpen, setIsTourModalOpen] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const [location] = useLocation();
  const { toast } = useToast();
  
  // Check if this is a BnB property
  const isBnB = property.category === "BnB" || property.category === "furnished_houses";
  
  // Check for booking confirmation in URL
  useEffect(() => {
    if (location.includes("booking=confirmed")) {
      setBookingConfirmed(true);
      toast({
        title: "Booking Confirmed!",
        description: "Your booking has been confirmed. Owner contact details are now available.",
        duration: 5000,
      });
    }
  }, [location, toast]);

  const handleFavoriteClick = () => {
    setIsFavorite(!isFavorite);
    toast({
      title: isFavorite ? "Removed from favorites" : "Added to favorites",
      description: isFavorite 
        ? `${property.title} has been removed from your favorites.` 
        : `${property.title} has been added to your favorites.`,
      duration: 3000,
    });
  };

  const handleViewTour = () => {
    setIsTourModalOpen(true);
  };

  const handleContactAgent = () => {
    if (isBnB && !bookingConfirmed) {
      toast({
        title: "Contact Information Hidden",
        description: "You need to book this property with a deposit to view owner contact details.",
        variant: "destructive",
        duration: 4000,
      });
      return;
    }
    
    toast({
      title: "Agent contacted",
      description: "An agent will reach out to you shortly regarding this property.",
      duration: 3000,
    });
  };

  const handleScheduleVisit = () => {
    setIsBookingModalOpen(true);
  };
  
  const handleBookingSuccess = () => {
    setBookingConfirmed(true);
    toast({
      title: "Booking Successful!",
      description: "Your booking has been confirmed and deposit received. You can now view the owner's contact details.",
      duration: 5000,
    });
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">{property.title}</h1>
          <p className="text-gray-500 mb-2">{property.location}</p>
          <div className="flex items-center mb-4">
            <i className="fas fa-star text-[#FFB400]"></i>
            <span className="ml-1 font-medium">{property.rating}</span>
            <span className="mx-1">·</span>
            <span className="text-gray-500 underline">{property.reviewCount} reviews</span>
          </div>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          className="p-2 hover:bg-gray-100 rounded-full"
          onClick={handleFavoriteClick}
        >
          <i className={`${isFavorite ? 'fas text-[#FF5A5F]' : 'far'} fa-heart text-xl`}></i>
        </Button>
      </div>
      
      <div className="border-t border-b border-gray-200 py-6 my-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-semibold mb-1">Property Details</h4>
            <ul className="space-y-2 text-gray-500">
              <li className="flex items-center">
                <i className="fas fa-bed w-6"></i>
                <span>{property.bedrooms} Bedrooms</span>
              </li>
              <li className="flex items-center">
                <i className="fas fa-bath w-6"></i>
                <span>{property.bathrooms} Bathrooms</span>
              </li>
              <li className="flex items-center">
                <i className="fas fa-vector-square w-6"></i>
                <span>{property.squareFeet} sq ft</span>
              </li>
              <li className="flex items-center">
                <i className="fas fa-building w-6"></i>
                <span>{property.propertyType}</span>
              </li>
              {isBnB && (
                <li className="flex items-center text-[#FF5A5F] font-medium">
                  <i className="fas fa-calendar-check w-6"></i>
                  <span>Pay 20% deposit to book</span>
                </li>
              )}
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-1">Amenities</h4>
            <ul className="space-y-2 text-gray-500">
              {property.amenities && property.amenities.map((amenity, index) => (
                <li key={index} className="flex items-center">
                  <i className={`fas fa-${
                    amenity.includes("Pool") ? "swimming-pool" : 
                    amenity.includes("Fitness") ? "dumbbell" :
                    amenity.includes("Pet") ? "paw" :
                    amenity.includes("Internet") ? "wifi" :
                    amenity.includes("parking") ? "parking" : "check"
                  } w-6`}></i>
                  <span>{amenity}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      
      <div className="mb-6">
        <h4 className="font-semibold mb-2">About this property</h4>
        <p className="text-gray-500">{property.description}</p>
      </div>
      
      {/* Display price differently for BnBs (per night) vs other properties (per month) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
        <div className="mb-4 md:mb-0">
          <span className="text-2xl font-bold">{property.price.toLocaleString()} UGX</span>
          <span className="text-gray-500">{isBnB ? " / night" : " / month"}</span>
        </div>
        <div className="flex space-x-3">
          <Button 
            variant="outline" 
            className="border-gray-800"
            onClick={handleScheduleVisit}
          >
            {isBnB ? "Book Now" : "Schedule Visit"}
          </Button>
          <Button 
            variant="default" 
            className="bg-[#FF5A5F] hover:bg-[#FF7478]"
            onClick={isBnB ? handleViewTour : handleContactAgent}
          >
            {isBnB ? "View Virtual Tour" : "Contact Agent"}
          </Button>
        </div>
      </div>
      
      {/* Show owner contact details section for BnBs */}
      {isBnB && (
        <div className="mt-8 border-t border-gray-200 pt-8">
          <h3 className="text-xl font-semibold mb-4">Property Owner</h3>
          <OwnerContactDetails 
            property={property}
            bookingConfirmed={bookingConfirmed}
          />
        </div>
      )}
      
      {/* Booking Calendar Modal */}
      <BookingCalendarModal
        isOpen={isBookingModalOpen}
        onClose={() => setIsBookingModalOpen(false)}
        propertyId={property.id}
        propertyTitle={property.title}
        propertyCategory={isBnB ? "BnB" : property.category || "rental"}
        propertyPrice={property.price}
      />
      
      {/* Virtual Tour Modal */}
      <VirtualTourModal
        isOpen={isTourModalOpen}
        onClose={() => setIsTourModalOpen(false)}
        propertyTitle={property.title}
        tourUrl={property.tourUrl || undefined}
      />
    </div>
  );
}
