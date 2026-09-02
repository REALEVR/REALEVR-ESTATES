import { useState, useEffect, useMemo } from "react";
import { useRoute } from "wouter";
import VirtualTour from "@/components/property/VirtualTour";
import VRBadge from "@/components/property/VRBadge";
import { Headset } from "lucide-react";
import PropertyDetails from "@/components/property/PropertyDetails";
import { Button } from "@/components/ui/button";
import { useProperty, trackPropertyView } from "@/hooks/usePropertyData";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { logAgentSignal } from "@/hooks/useAgent";
import type { Property } from "@shared/schema";
import { PageSeo } from "@/components/seo/PageSeo";
import {
  absolutePropertyImageUrl,
  buildPropertyJsonLd,
  buildPropertyMetaDescription,
  buildPropertyPageTitle,
} from "@/lib/propertySeo";

export default function PropertyPage() {
  const [, params] = useRoute<{ id: string }>("/property/:id");
  const propertyId = params?.id ? parseInt(params.id) : 0;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { user } = useAuth();

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
          const analyticsResponse = await fetch('/api/analytics/track-view', {
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
          await fetch('/api/user/tours', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              tourId: propertyId,
              propertyId: propertyId,
              price: 0,
            })
          });
        } catch (e) {
          console.error('Failed to record user tour:', e);
        }
      };
      recordUserTour();

      // Log this view for the user's personal agent (signed-in users only;
      // best-effort, never blocks or throws — see hooks/useAgent.ts).
      if (user) {
        logAgentSignal(propertyId, "viewed");
      }
    }
  }, [propertyId, user]);
  
  const { data: property, isLoading, error } = useProperty(propertyId);

  const propertyPath = `/property/${propertyId}`;

  const propertySeo = useMemo(() => {
    if (!property) return null;
    const p = property as Property;
    return {
      title: buildPropertyPageTitle(p),
      description: buildPropertyMetaDescription(p),
      image: absolutePropertyImageUrl(p) || undefined,
      jsonLd: buildPropertyJsonLd(p, propertyPath),
    };
  }, [property, propertyPath]);

  if (isLoading) {
    return (
      <div className="container mx-auto px-6 py-8">
        <PageSeo title="Property | RealEVR Estates" canonicalPath={propertyPath} />
        <div className="bg-card rounded-xl overflow-hidden shadow-lg animate-pulse">
          <div className="h-[400px] lg:h-[600px] bg-muted"></div>
          <div className="p-6">
            <div className="h-8 bg-muted rounded w-3/4 mb-4"></div>
            <div className="h-4 bg-muted rounded w-1/2 mb-4"></div>
            <div className="h-4 bg-muted rounded w-3/4 mb-4"></div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="h-20 bg-muted rounded"></div>
              <div className="h-20 bg-muted rounded"></div>
            </div>
            <div className="h-24 bg-muted rounded mb-4"></div>
            <div className="flex justify-between">
              <div className="h-8 bg-muted rounded w-1/4"></div>
              <div className="h-8 bg-muted rounded w-1/3"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !property) {
    return (
      <div className="container mx-auto px-6 py-8 text-center">
        <PageSeo
          title="Property not found | RealEVR Estates"
          description="This listing may have been removed or the link is incorrect."
          canonicalPath={propertyPath}
        />
        <h1 className="text-2xl font-display font-medium text-destructive mb-4">Property Not Found</h1>
        <p className="mb-4">The property you're looking for doesn't exist or has been removed.</p>
        <Button asChild>
          <a href="/">Return to Home</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-8">
      {propertySeo ? (
        <PageSeo
          title={propertySeo.title}
          description={propertySeo.description}
          canonicalPath={propertyPath}
          image={propertySeo.image}
          imageAlt={(property as Property).title}
          jsonLd={propertySeo.jsonLd}
        />
      ) : null}
      <div className="bg-card rounded-xl overflow-hidden shadow-lg">
        <div className="lg:flex">
          <div className="lg:w-1/2">
            {(property as Property).hasTour && (
              <div className="flex items-center justify-between gap-2 bg-background px-4 py-2.5 border-b border-border">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Headset className="h-4 w-4" />
                  Experience this home in VR
                </div>
                <VRBadge size="sm" />
              </div>
            )}
            <div className="h-[400px] lg:h-[600px] tour-container bg-muted relative vr-glow-ring">
              <VirtualTour
                tourUrl={(property as Property).tourUrl || "https://realevr.com/LA%20ROSE%20ROYAL%20APARTMENTS/"}
                isFullscreen={isFullscreen}
              />

              <div className="absolute bottom-4 right-4 bg-card/80 backdrop-blur-sm rounded-lg p-2 shadow-lg">
                <div className="flex space-x-3">
                  <button className="p-2 hover:bg-card rounded-full" title="Zoom in">
                    <i className="fas fa-plus"></i>
                  </button>
                  <button className="p-2 hover:bg-card rounded-full" title="Zoom out">
                    <i className="fas fa-minus"></i>
                  </button>
                  <button 
                    className="p-2 hover:bg-card rounded-full" 
                    title="Fullscreen"
                    onClick={() => setIsFullscreen(!isFullscreen)}
                  >
                    <i className={`fas fa-${isFullscreen ? 'compress' : 'expand'}`}></i>
                  </button>
                  <button className="p-2 hover:bg-card rounded-full" title="Floor plan">
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
