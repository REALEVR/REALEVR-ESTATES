import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PropertyCard from "@/components/home/PropertyCard";
import { usePropertiesByCategory } from "@/hooks/usePropertyData";
import type { Property } from "@shared/schema";

export default function CategoryProperties() {
  const [activeCategory, setActiveCategory] = useState<string>("rental_units");
  
  const categories = [
    { id: "rental_units", label: "Rental Units", icon: "home" },
    { id: "furnished_houses", label: "Furnished Houses", icon: "couch" },
    { id: "for_sale", label: "For Sale", icon: "tag" },
    { id: "bank_sales", label: "Bank Sales", icon: "landmark" }
  ];
  
  const { data: properties, isLoading, error } = usePropertiesByCategory(activeCategory);
  
  return (
    <section className="py-10">
      <div className="container mx-auto px-4">
        <h2 className="text-2xl md:text-3xl font-bold mb-6">Browse Properties by Category</h2>
        
        <Tabs defaultValue="rental_units" onValueChange={setActiveCategory} className="w-full">
          <TabsList className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-2">
            {categories.map(category => (
              <TabsTrigger 
                key={category.id} 
                value={category.id}
                className="flex items-center justify-center py-3 px-4 data-[state=active]:bg-[#FF5A5F] data-[state=active]:text-white"
              >
                <i className={`fas fa-${category.icon} mr-2`}></i>
                <span>{category.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          
          {categories.map(category => (
            <TabsContent key={category.id} value={category.id}>
              {isLoading ? (
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
              ) : error ? (
                <div className="text-center py-8">
                  <p className="text-red-500">Error loading properties. Please try again later.</p>
                </div>
              ) : properties && properties.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {properties.map(property => (
                    <PropertyCard key={property.id} property={property} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500">No properties found in this category.</p>
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
        
        <div className="mt-8 text-center">
          <Button variant="outline" className="px-6 py-3 bg-white border border-gray-200 rounded-lg font-medium hover:bg-gray-50">
            View All Properties
          </Button>
        </div>
      </div>
    </section>
  );
}