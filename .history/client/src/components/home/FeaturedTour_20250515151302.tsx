import { useState } from "react";
import { Button } from "@/components/ui/button";
import VirtualTour from "@/components/property/VirtualTour";
import BookingCalendarModal from "../property/BookingCalendarModal";
import SharePropertyModal from "../property/SharePropertyModal";
import { useQuery } from "@tanstack/react-query";
import type { Property } from "@shared/schema";

export default function FeaturedTour() {
  // Get all properties and select the one with the most reviews (most viewed)
  const { data: properties, isLoading, error } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });
  
  // Find the property with the highest review count (most viewed)
  const featuredProperty = properties?.sort((a, b) => b.reviewCount - a.reviewCount)[0];

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  if (isLoading) {
    return (
      <section id="featured" className="py-10 bg-gray-50">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold mb-6">Featured Virtual Tour</h2>
          <div className="h-[400px] bg-gray-200 animate-pulse rounded-xl"></div>
        </div>
      </section>
    );
  }

  if (error || !featuredProperty) {
    return (
      <section id="featured" className="py-10 bg-gray-50">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold mb-6">Featured Virtual Tour</h2>
          <div className="bg-white rounded-xl p-8 text-center">
            <p>Unable to load featured tour. Please try again later.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="featured" className="py-10 bg-gray-50">
      <div className="container mx-auto px-4">
        <h2 className="text-2xl md:text-3xl font-bold mb-6">Featured Virtual Tour</h2>
        <div className="bg-white rounded-xl overflow-hidden shadow-lg">
          <div className="lg:flex">
            <div className="lg:w-1/2">
              <div className="h-[400px] lg:h-[600px] tour-container bg-gray-200 relative">
                <VirtualTour 
                  tourUrl={featuredProperty.tourUrl || "https://realevr.com/LA%20ROSE%20ROYAL%20APARTMENTS/"} 
                  isFullscreen={isFullscreen}
                />
                
                <div className="absolute bottom-4 right-4 bg-white/80 backdrop-blur-sm rounded-lg p-2 shadow-lg">
                  <div className="flex space-x-3">
                    <button className="p-2 hover:bg-white rounded-full" title="Zoom in">
                      <i className="fas fa-plus"></i>
                    </button>
                    <button className="p-2 hover:bg-white rounded-full" title="Zoom out">
                      <i className="fas fa-minus"></i>
                    </button>
                    <button 
                      className="p-2 hover:bg-white rounded-full" 
                      title="Fullscreen"
                      onClick={() => setIsFullscreen(!isFullscreen)}
                    >
                      <i className={`fas fa-${isFullscreen ? 'compress' : 'expand'}`}></i>
                    </button>
                    <button className="p-2 hover:bg-white rounded-full" title="Floor plan">
                      <i className="fas fa-map"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="lg:w-1/2 p-6 lg:p-8">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-2xl font-bold">{featuredProperty.title}</h3>
                  <p className="text-gray-500 mb-2">{featuredProperty.location}</p>
                  <div className="flex items-center mb-4">
                    <i className="fas fa-star text-[#FFB400]"></i>
                    <span className="ml-1 font-medium">{featuredProperty.rating}</span>
                    <span className="mx-1">·</span>
                    <span className="text-gray-500 underline">{featuredProperty.reviewCount} reviews</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    className="p-2 hover:bg-gray-100 rounded-full"
                    onClick={() => setIsShareModalOpen(true)}
                    title="Share this property"
                  >
                    <i className="fas fa-share-alt text-xl"></i>
                  </button>
                  <button 
                    className="p-2 hover:bg-gray-100 rounded-full"
                    title="Save to favorites"
                  >
                    <i className="far fa-heart text-xl"></i>
                  </button>
                </div>
              </div>
              
              <div className="border-t border-b border-gray-200 py-6 my-6">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold mb-1">Property Details</h4>
                    <ul className="space-y-2 text-gray-500">
                      <li className="flex items-center">
                        <i className="fas fa-bed w-6"></i>
                        <span>{featuredProperty.bedrooms} Bedrooms</span>
                      </li>
                      <li className="flex items-center">
                        <i className="fas fa-bath w-6"></i>
                        <span>{featuredProperty.bathrooms} Bathrooms</span>
                      </li>
                      <li className="flex items-center">
                        <i className="fas fa-vector-square w-6"></i>
                        <span>{featuredProperty.squareFeet} sq ft</span>
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">Amenities</h4>
                    <ul className="space-y-2 text-gray-500">
                      {featuredProperty.amenities && featuredProperty.amenities.map((amenity, index) => (
                        <li key={index} className="flex items-center">
                          <i className={`fas fa-${
                            amenity.includes("Pool") ? "swimming-pool" : 
                            amenity.includes("Fitness") ? "dumbbell" : 
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
                <p className="text-gray-500">{featuredProperty.description}</p>
              </div>
              
              <div className="flex flex-col md:flex-row md:items-center justify-between">
                <div className="mb-4 md:mb-0">
                  <span className="text-2xl font-bold">${featuredProperty.price}</span>
                  <span className="text-gray-500"> / month</span>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-3">
                    <Button 
                      variant="outline" 
                      className="border-gray-800"
                      onClick={() => setIsBookingModalOpen(true)}
                    >
                      <i className="far fa-calendar-alt mr-2"></i>
                      Schedule Visit
                    </Button>
                    <Button asChild className="bg-[#FF5A5F] hover:bg-[#FF7478]">
                      <a 
                        href="tel:+256771891323" 
                        className="flex items-center"
                      >
                        <i className="fas fa-phone mr-2"></i> Call Agent
                      </a>
                    </Button>
                  </div>
                  
                  <div className="flex flex-wrap gap-3">
                    <Button asChild variant="outline" className="border-gray-800 border-green-500 text-green-500 hover:bg-green-50">
                      <a 
                        href="https://wa.me/256771891323?text=Hello%2C%20I'm%20interested%20in%20the%20property%20I%20saw%20on%20RealEVR%20Estates.%20Can%20you%20provide%20more%20details%3F" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center"
                      >
                        <i className="fab fa-whatsapp mr-2"></i> WhatsApp Agent 1
                      </a>
                    </Button>
                    <Button asChild variant="outline" className="border-gray-800 border-green-500 text-green-500 hover:bg-green-50">
                      <a 
                        href="https://wa.me/256702742333?text=Hello%2C%20I'm%20interested%20in%20the%20property%20I%20saw%20on%20RealEVR%20Estates.%20Can%20you%20provide%20more%20details%3F" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center"
                      >
                        <i className="fab fa-whatsapp mr-2"></i> WhatsApp Agent 2
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Modals */}
      <BookingCalendarModal
        isOpen={isBookingModalOpen}
        onClose={() => setIsBookingModalOpen(false)}
        propertyId={featuredProperty.id}
        propertyTitle={featuredProperty.title}
      />
      
      <SharePropertyModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        propertyId={featuredProperty.id}
        propertyTitle={featuredProperty.title}
      />
    </section>
  );
}
