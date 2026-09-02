import { useQuery } from "@tanstack/react-query";
import type { Amenity } from "@shared/schema";

export default function AmenitiesHighlight() {
  const { data: amenities, isLoading, error } = useQuery<Amenity[]>({
    queryKey: ["/api/amenities"],
  });

  if (isLoading) {
    return (
      <section className="py-10 bg-secondary -mx-4 sm:-mx-6 lg:-mx-8">
        <div className="container mx-auto px-6 ann">
          <h2 className="text-2xl md:text-3xl font-display font-medium mb-8">Popular Amenities</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {[...Array(12)].map((_, index) => (
              <div key={index} className="bg-card p-6 rounded-xl shadow-md animate-pulse">
                <div className="h-16 bg-muted rounded-full w-16 mx-auto mb-4"></div>
                <div className="h-5 bg-muted rounded w-3/4 mx-auto mb-4"></div>
                <div className="h-4 bg-muted rounded w-full mx-auto"></div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (error || !amenities) {
    return null;
  }

  // Limit to 12 amenities for display
  const limitedAmenities = amenities.slice(0, 12);

  return (
    <section className="py-10 bg-secondary -mx-4 sm:-mx-6 lg:-mx-8">
      <div className="container mx-auto px-6 ann">
        <h2 className="text-2xl md:text-3xl font-display font-medium mb-8">Popular Amenities</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {limitedAmenities.map((amenity) => (
            <div key={amenity.id} className="bg-card p-6 rounded-xl shadow-md text-center">
              <div className="flex justify-center mb-4">
                <span className="p-3 bg-accent/10 text-accent rounded-full">
                  <i className={`fas fa-${amenity.icon} text-2xl`}></i>
                </span>
              </div>
              <h3 className="font-bold mb-2">{amenity.name}</h3>
              <p className="text-muted-foreground text-sm">{amenity.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
