import { Property } from "@shared/schema";
import PropertyCard from "./PropertyCard";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import useEmblaCarousel from 'embla-carousel-react';
import { useCallback, useEffect, useRef, useState } from "react";
import { useFeaturedProperties } from "@/hooks/usePropertyData";
import { queryClient } from "@/lib/queryClient";

export default function FeaturedProperties() {
  // Force refetch featured properties on mount to ensure fresh data
  const [key, setKey] = useState(0);
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/properties/featured"] });
    queryClient.refetchQueries({ queryKey: ["/api/properties/featured"] });
    setKey(prev => prev + 1);
  }, []);
  
  const { data: featuredProperties, isLoading, error } = useFeaturedProperties();

  // Setup carousel
  const [emblaRef, emblaApi] = useEmblaCarousel({ 
    loop: true, 
    align: 'start',
    skipSnaps: false,
    dragFree: true,
  });
  
  // Autoplay functionality
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const stopAutoplay = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startAutoplay = useCallback(() => {
    stopAutoplay();
    if (emblaApi) {
      intervalRef.current = setInterval(() => {
        emblaApi.scrollNext();
      }, 5000); // Scroll every 5 seconds
    }
  }, [emblaApi, stopAutoplay]);
  
  // Navigation functions
  const scrollPrev = useCallback(() => {
    if (emblaApi) {
      emblaApi.scrollPrev();
      startAutoplay(); // Reset autoplay timer on manual navigation
    }
  }, [emblaApi, startAutoplay]);
  
  const scrollNext = useCallback(() => {
    if (emblaApi) {
      emblaApi.scrollNext();
      startAutoplay(); // Reset autoplay timer on manual navigation
    }
  }, [emblaApi, startAutoplay]);
  
  // Initialize autoplay
  useEffect(() => {
    if (emblaApi) {
      startAutoplay();
      emblaApi.on('pointerDown', stopAutoplay);
      emblaApi.on('settle', startAutoplay);
    
      return () => {
        stopAutoplay();
        emblaApi.off('pointerDown', stopAutoplay);
        emblaApi.off('settle', startAutoplay);
      };
    }
  }, [emblaApi, startAutoplay, stopAutoplay]);

  if (isLoading) {
    return (
      <section className="py-10 bg-white">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl md:text-3xl font-bold">Featured Properties</h2>
            <Button variant="link" asChild>
              <Link href="/explore" className="flex items-center">
                View all <ChevronRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(4)].map((_, index) => (
              <div key={index} className="bg-white rounded-xl overflow-hidden shadow-md animate-pulse">
                <div className="h-52 bg-gray-200"></div>
                <div className="p-4">
                  <div className="h-5 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
                  <div className="flex justify-between">
                    <div className="h-6 bg-gray-200 rounded w-1/4"></div>
                    <div className="h-6 bg-gray-200 rounded w-1/4"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (error || !featuredProperties || featuredProperties.length === 0) {
    return null; // Don't show the section if there are no featured properties
  }

  return (
    <section className="py-10 bg-white">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl md:text-3xl font-bold">Featured Properties</h2>
          <Button variant="link" asChild>
            <Link href="/featured-properties" className="flex items-center">
              View all <ChevronRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </div>
        
        <div className="relative">
          {/* Carousel controls */}
          <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10">
            <Button 
              variant="outline" 
              className="rounded-full h-10 w-10 p-2 bg-white/80 hover:bg-white shadow-md" 
              onClick={scrollPrev}
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
          </div>
          <div className="absolute right-0 top-1/2 -translate-y-1/2 z-10">
            <Button 
              variant="outline" 
              className="rounded-full h-10 w-10 p-2 bg-white/80 hover:bg-white shadow-md" 
              onClick={scrollNext}
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          </div>
          
          {/* Carousel container */}
          <div className="overflow-hidden" ref={emblaRef}>
            <div className="flex">
              {featuredProperties.map((property) => (
                <div key={property.id} className="flex-[0_0_100%] sm:flex-[0_0_50%] lg:flex-[0_0_33.333%] xl:flex-[0_0_25%] px-3">
                  <PropertyCard property={property} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}