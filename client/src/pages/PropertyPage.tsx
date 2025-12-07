import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import VirtualTour from "@/components/property/VirtualTour";
import PropertyDetails from "@/components/property/PropertyDetails";
import { Button } from "@/components/ui/button";
import { useProperty, trackPropertyView } from "@/hooks/usePropertyData";
import { queryClient } from "@/lib/queryClient";
import type { Property } from "@shared/schema";

export default function PropertyPage() {
  const [, params] = useRoute<{ id: string }>("/property/:id");
  const propertyId = params?.id ? parseInt(params.id) : 0;
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Force refetch on mount to ensure fresh data
  useEffect(() => {
    if (propertyId) {
      queryClient.invalidateQueries({ queryKey: [`/api/properties/${propertyId}`] });
      queryClient.refetchQueries({ queryKey: [`/api/properties/${propertyId}`] });
      
      // Track property view with detailed analytics
      const trackView = async () => {
        try {
          // First increment the basic view count
          const viewCountResponse = await trackPropertyView(propertyId);
          console.log(`Property ${propertyId} view tracked, new count: ${viewCountResponse}`);
          
          // Then track detailed analytics
          const analyticsResponse = await fetch(import.meta.env.VITE_BACKEND_URL +'/api/analytics/track-view', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              propertyId,
              userAgent: navigator.userAgent,
              referrer: document.referrer,
              // Note: We don't send userId here as it's not available in the frontend
              // The backend will handle user identification from the session
            })
          });
          
          if (analyticsResponse.ok) {
            console.log('Detailed analytics tracked successfully');
          }
          
          // Invalidate popular properties query to update the list when view counts change
          queryClient.invalidateQueries({ queryKey: ["/api/properties/popular"] });
        } catch (error) {
          console.error('Error tracking property view:', error);
        }
      };
      
      trackView();
      // Record this tour as viewed by the user
      const recordUserTour = async () => {
        try {
          await fetch(import.meta.env.VITE_BACKEND_URL +'/api/user/tours', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              tourId: propertyId,
              propertyId: propertyId,
              price: property?.price || 0
            })
          });
        } catch (e) {
          console.error('Failed to record user tour:', e);
        }
      };
      recordUserTour();
    }
  }, [propertyId]);
  
  const { data: property, isLoading, error } = useProperty(propertyId);

  useEffect(() => {
    // Set page title
    if (property) {
      document.title = `${(property as Property).title} | RealEVR Estates`;
    } else {
      document.title = "Property | RealEVR Estates";
    }
  }, [property]);

  if (isLoading) {
    return (
      <div className="container mx-auto px-6 py-8">
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
      <div className="container mx-auto px-6 py-8 text-center">
        <h1 className="text-2xl font-bold text-red-500 mb-4">Property Not Found</h1>
        <p className="mb-4">The property you're looking for doesn't exist or has been removed.</p>
        <Button asChild>
          <a href="/">Return to Home</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="bg-white rounded-xl overflow-hidden shadow-lg">
        <div className="lg:flex">
          <div className="lg:w-1/2">
            <div className="h-[400px] lg:h-[600px] tour-container bg-gray-200 relative">
              <VirtualTour 
                tourUrl={(property as Property).tourUrl || "https://realevr.com/LA%20ROSE%20ROYAL%20APARTMENTS/"} 
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
            <PropertyDetails property={property as Property} />
          </div>
        </div>
      </div>
    </div>
  );
}
