import { useQuery } from "@tanstack/react-query";
import type { Amenity } from "@shared/schema";

export default function AmenitiesHighlight() {
  const { data: amenities, isLoading, error } = useQuery<Amenity[]>({
    queryKey: ["/api/amenities"],
  });

  if (isLoading) {
    return (
      <section className="py-10 bg-gray-50">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold mb-8">Popular Amenities</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[...Array(4)].map((_, index) => (
              <div key={index} className="bg-white p-6 rounded-xl shadow-md animate-pulse">
                <div className="h-16 bg-gray-200 rounded-full w-16 mx-auto mb-4"></div>
                <div className="h-5 bg-gray-200 rounded w-3/4 mx-auto mb-4"></div>
                <div className="h-4 bg-gray-200 rounded w-full mx-auto"></div>
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

  return (
    <section className="py-10 bg-gray-50">
      <div className="container mx-auto px-4">
        <h2 className="text-2xl md:text-3xl font-bold mb-8">Popular Amenities</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {amenities.map((amenity) => (
            <div key={amenity.id} className="bg-white p-6 rounded-xl shadow-md text-center">
              <div className="flex justify-center mb-4">
                <span className="p-3 bg-[#00A699]/10 text-[#00A699] rounded-full">
                  <i className={`fas fa-${amenity.icon} text-2xl`}></i>
                </span>
              </div>
              <h3 className="font-bold mb-2">{amenity.name}</h3>
              <p className="text-gray-500 text-sm">{amenity.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
