import { useState } from "react";
import { Link } from "wouter";
import type { Property } from "@shared/schema";
import SharePropertyModal from "../property/SharePropertyModal";
import BookingCalendarModal from "../property/BookingCalendarModal";
import PaymentModal from "../property/PaymentModal";
import { usePropertyViews } from "@/hooks/usePropertyViews";
import { Button } from "@/components/ui/button";

interface PropertyCardProps {
  property: Property;
}

export default function PropertyCard({ property }: PropertyCardProps) {
  const [isFavorite, setIsFavorite] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsFavorite(!isFavorite);
  };

  const handleShareClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsShareModalOpen(true);
  };

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
const { viewedProperties, hasValidPayment } = usePropertyViews();

const handlePropertyView = (e: React.MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
  
  if (!hasValidPayment && property.category === 'rental_units' && viewedProperties >= 5) {
    setIsPaymentModalOpen(true);
    return;
  }
  
  window.location.href = `/property/${property.id}`;
};

const handleScheduleClick = (e: React.MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
  setIsBookingModalOpen(true);
};

const handlePaymentConfirm = async () => {
  try {
    // TODO: Implement actual payment processing
    setIsPaymentModalOpen(false);
    window.location.href = `/property/${property.id}`;
  } catch (error) {
    console.error('Payment failed:', error);
  }
};

  return (
    <>
      <div className="property-card bg-white rounded-xl overflow-hidden shadow-md hover:shadow-lg">
        <div className="relative">
          <img 
            src={property.imageUrl} 
            alt={property.title} 
            className="w-full h-52 object-cover"
          />
          <div className="absolute top-3 right-3 flex space-x-2">
            <button 
              className="p-2 bg-white/80 backdrop-blur-sm rounded-full hover:bg-white"
              onClick={handleShareClick}
              aria-label="Share this property"
              title="Share this property"
            >
              <i className="fas fa-share-alt"></i>
            </button>
            <button 
              className="p-2 bg-white/80 backdrop-blur-sm rounded-full hover:bg-white"
              onClick={handleFavoriteClick}
              aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
              title={isFavorite ? "Remove from favorites" : "Add to favorites"}
            >
              <i className={`${isFavorite ? 'fas text-[#FF5A5F]' : 'far'} fa-heart`}></i>
            </button>
          </div>
          {property.hasTour && (
            <span className="absolute bottom-3 left-3 bg-black/50 text-white px-2 py-1 rounded-md text-sm font-medium">
              360° Tour Available
            </span>
          )}
        </div>
        <div className="p-4">
          <div className="flex justify-between items-start">
            <h3 className="font-bold">{property.title}</h3>
            <div className="flex items-center">
              <i className="fas fa-star text-[#FFB400] text-sm"></i>
              <span className="ml-1 text-sm font-medium">{property.rating}</span>
            </div>
          </div>
          <p className="text-gray-500 text-sm mb-2">{property.location}</p>
          <p className="text-gray-500 text-sm mb-3">
            {property.bedrooms} bed • {property.bathrooms} bath • {property.squareFeet} sq ft
          </p>
          <div className="flex justify-between items-center mb-3">
            <div>
              <span className="font-bold">${property.price}</span>
              <span className="text-gray-500 text-sm"> / month</span>
            </div>
            <Link 
              href={`/property/${property.id}`} 
              className="text-[#00A699] hover:underline text-sm font-medium"
            >
              View Tour
            </Link>
          </div>
          <Button 
            variant="outline" 
            className="w-full text-sm h-8 border-[#FF5A5F] text-[#FF5A5F] hover:bg-[#FF5A5F]/5"
            onClick={handleScheduleClick}
          >
            <i className="far fa-calendar-alt mr-2"></i>
            Schedule Visit
          </Button>
        </div>
      </div>

      {/* Modals */}
      <SharePropertyModal 
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        propertyId={property.id}
        propertyTitle={property.title}
      />

      <BookingCalendarModal
        isOpen={isBookingModalOpen}
        onClose={() => setIsBookingModalOpen(false)}
        propertyId={property.id}
        propertyTitle={property.title}
      />
      
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        onConfirm={handlePaymentConfirm}
      />
    </>
  );
}
