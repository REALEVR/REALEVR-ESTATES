import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import VirtualTour from "@/components/property/VirtualTour";
import PropertyDetails from "@/components/property/PropertyDetails";
import { Button } from "@/components/ui/button";
import type { Property } from "@shared/schema";

export default function PropertyPage() {
  const [, params] = useRoute<{ id: string }>("/property/:id");
  const propertyId = params?.id ? parseInt(params.id) : 0;
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { data: property, isLoading, error } = useQuery<Property>({
    queryKey: [`/api/properties/${propertyId}`],
  });

  useEffect(() => {
    // Set page title
    if (property) {
      document.title = `${property.title} | RealEVR Estates`;
    } else {
      document.title = "Property | RealEVR Estates";
    }
  }, [property]);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-xl overflow-hidden shadow-lg animate-pulse">
          <div className="h-[400px] lg:h-[600px] bg-gray-200"></div>
          <div className="p-6">
            <div className="h-8 bg-gray-200 rounded w-3/4 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="h-20 bg-gray-200 rounded"></div>
              <div className="h-20 bg-gray-200 rounded"></div>
            </div>
            <div className="h-24 bg-gray-200 rounded mb-4"></div>
            <div className="flex justify-between">
              <div className="h-8 bg-gray-200 rounded w-1/4"></div>
              <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !property) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold text-red-500 mb-4">Property Not Found</h1>
        <p className="mb-4">The property you're looking for doesn't exist or has been removed.</p>
        <Button asChild>
          <a href="/">Return to Home</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="bg-white rounded-xl overflow-hidden shadow-lg">
        <div className="lg:flex">
          <div className="lg:w-1/2">
            <div className="h-[400px] lg:h-[600px] tour-container bg-gray-200 relative">
              <VirtualTour 
                tourUrl={property.tourUrl || "https://realevr.com/LA%20ROSE%20ROYAL%20APARTMENTS/"} 
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
          
          <div className="lg:w-1/2">
            <PropertyDetails property={property} />
          </div>
        </div>
      </div>
    </div>
  );
}
