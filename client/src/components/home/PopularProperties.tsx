import { useState } from "react";
import { Link } from "wouter";
import { usePopularProperties } from "@/hooks/usePropertyData";
import type { Property } from "@shared/schema";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import PropertyCard from "@/components/home/PropertyCard";

interface PopularPropertiesProps {
  limit?: number;
}

export default function PopularProperties({ limit = 4 }: PopularPropertiesProps) {
  const { data: properties, isLoading, error } = usePopularProperties(limit);
  
  if (isLoading) {
    return (
      <section className="py-8">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-display font-medium">Popular Properties</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(limit)].map((_, index) => (
              <div key={index} className="bg-card rounded-xl overflow-hidden shadow animate-pulse">
                <div className="h-48 bg-muted"></div>
                <div className="p-4">
                  <div className="h-6 bg-muted rounded w-3/4 mb-2"></div>
                  <div className="h-4 bg-muted rounded w-1/2 mb-4"></div>
                  <div className="flex justify-between items-center">
                    <div className="h-6 bg-muted rounded w-1/3"></div>
                    <div className="h-6 bg-muted rounded w-1/4"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }
  
  // Filter out properties with no title/name
  const filteredProperties = (properties || []).filter(p => p.title && p.title.trim() !== '');
  if (error || !filteredProperties || filteredProperties.length === 0) {
    return null;
  }
  
  return (
    <section className="py-8">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-display font-medium">
            <span className="flex items-center gap-2">
              <Eye className="h-6 w-6 text-primary" />
              Popular Properties
            </span>
          </h2>
          <Link href="/properties/popular">
            <Button variant="outline">View All</Button>
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {filteredProperties.map((property) => (
            <PropertyCard key={property.id} property={property} />
          ))}
        </div>
      </div>
    </section>
  );
}