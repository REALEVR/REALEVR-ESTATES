import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Property } from "@shared/schema";
import { Button } from "@/components/ui/button";

export default function TestPage() {
  const [cadenzaProperty, setCadenzaProperty] = useState<Property | null>(null);
  const [allForSaleProperties, setAllForSaleProperties] = useState<Property[]>([]);
  
  // Get all properties 
  const { data: properties, isLoading, error } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });
  
  useEffect(() => {
    if (properties) {
      // Find Cadenza specifically
      const cadenza = properties.find(p => 
        p.title.toLowerCase().includes("cadenza")
      );
      
      if (cadenza) {
        setCadenzaProperty(cadenza);
        console.log("Found Cadenza property:", cadenza);
      } else {
        console.log("Cadenza property not found");
      }
      
      // Find all for_sale properties
      const forSaleProps = properties.filter(p => p.category === "for_sale");
      setAllForSaleProperties(forSaleProps);
      console.log("For sale properties count:", forSaleProps.length);
      console.log("For sale properties:", forSaleProps);
    }
  }, [properties]);
  
  const refreshData = () => {
    window.location.reload();
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Test Page - Finding Cadenza</h1>
      
      <div className="mb-6">
        <Button onClick={refreshData} className="mb-4">Refresh Data</Button>
      </div>
      
      {isLoading ? (
        <p>Loading properties...</p>
      ) : error ? (
        <p className="text-red-500">Error loading properties</p>
      ) : (
        <div className="space-y-8">
          <div className="p-6 border rounded-lg">
            <h2 className="text-xl font-bold mb-4">Database Status</h2>
            <p>Total properties in database: {properties?.length || 0}</p>
            <p>Properties with category "for_sale": {allForSaleProperties.length}</p>
          </div>
          
          <div className="p-6 border rounded-lg">
            <h2 className="text-xl font-bold mb-4">Cadenza Property</h2>
            {cadenzaProperty ? (
              <div>
                <p><strong>Title:</strong> {cadenzaProperty.title}</p>
                <p><strong>ID:</strong> {cadenzaProperty.id}</p>
                <p><strong>Category:</strong> {cadenzaProperty.category}</p>
                <p><strong>Location:</strong> {cadenzaProperty.location}</p>
                <p><strong>Price:</strong> {cadenzaProperty.price} {cadenzaProperty.currency}</p>
                <p><strong>Is Featured:</strong> {cadenzaProperty.isFeatured ? "Yes" : "No"}</p>
              </div>
            ) : (
              <p className="text-red-500">Cadenza property not found in database</p>
            )}
          </div>
          
          <div className="p-6 border rounded-lg">
            <h2 className="text-xl font-bold mb-4">All "for_sale" Properties</h2>
            <div className="space-y-4">
              {allForSaleProperties.length > 0 ? (
                allForSaleProperties.map(property => (
                  <div key={property.id} className="p-4 border rounded">
                    <p><strong>ID {property.id}:</strong> {property.title}</p>
                    <p><strong>Category:</strong> {property.category}</p>
                  </div>
                ))
              ) : (
                <p className="text-orange-500">No properties with category "for_sale" found</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}