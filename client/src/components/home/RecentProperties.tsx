import { useState } from 'react';
import { Property } from '@shared/schema';
import { useIsMobile } from '@/hooks/use-mobile';
import { useRecentProperties } from '@/hooks/usePropertyData';
import PropertyCard from './PropertyCard';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { Button } from '@/components/ui/button';
import { ChevronRight } from 'lucide-react';
import { Link } from 'wouter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function RecentProperties() {
  const [activeTab, setActiveTab] = useState('all');
  const isMobile = useIsMobile();
  
  const { 
    data: recentProperties, 
    isLoading: isLoadingRecent,
    isError: isErrorRecent,
  } = useRecentProperties();
  
  if (isLoadingRecent) {
    return (
      <div className="container mx-auto mt-8 mb-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Recently Added Properties</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-gray-100 rounded-xl overflow-hidden animate-pulse h-96" />
          ))}
        </div>
      </div>
    );
  }
  
  if (isErrorRecent || !recentProperties) {
    return null;
  }
  
  return (
    <div className="container mx-auto mt-10 mb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Recently Added Properties</h2>
        <div className="flex items-center space-x-2 mt-2 md:mt-0">
          <Link href="/featured-properties">
            <Button variant="outline" className="flex items-center">
              View All <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>
      </div>
      
      {isMobile ? (
        <Carousel>
          <CarouselContent>
            {recentProperties.map((property) => (
              <CarouselItem key={property.id} className="basis-full md:basis-1/2 lg:basis-1/3">
                <PropertyCard property={property} />
              </CarouselItem>
            ))}
          </CarouselContent>
          <div className="flex justify-center mt-4">
            <CarouselPrevious className="mr-2" />
            <CarouselNext />
          </div>
        </Carousel>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {recentProperties.map((property) => (
            <PropertyCard key={property.id} property={property} />
          ))}
        </div>
      )}
    </div>
  );
}