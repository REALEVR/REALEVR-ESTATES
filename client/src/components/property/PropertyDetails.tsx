import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { Property } from "@shared/schema";

interface PropertyDetailsProps {
  property: Property;
}

export default function PropertyDetails({ property }: PropertyDetailsProps) {
  const [isFavorite, setIsFavorite] = useState(false);
  const { toast } = useToast();

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

  const handleContactAgent = () => {
    toast({
      title: "Agent contacted",
      description: "An agent will reach out to you shortly regarding this property.",
      duration: 3000,
    });
  };

  const handleScheduleVisit = () => {
    toast({
      title: "Visit scheduled",
      description: "You'll receive a confirmation email for your visit shortly.",
      duration: 3000,
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
      
      <div className="flex flex-col md:flex-row md:items-center justify-between">
        <div className="mb-4 md:mb-0">
          <span className="text-2xl font-bold">${property.price}</span>
          <span className="text-gray-500"> / month</span>
        </div>
        <div className="flex space-x-3">
          <Button 
            variant="outline" 
            className="border-gray-800"
            onClick={handleScheduleVisit}
          >
            Schedule Visit
          </Button>
          <Button 
            variant="default" 
            className="bg-[#FF5A5F] hover:bg-[#FF7478]"
            onClick={handleContactAgent}
          >
            Contact Agent
          </Button>
        </div>
      </div>
    </div>
  );
}
