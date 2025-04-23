import { useState } from "react";
import { Link } from "wouter";
import type { Property } from "@shared/schema";

interface PropertyCardProps {
  property: Property;
}

export default function PropertyCard({ property }: PropertyCardProps) {
  const [isFavorite, setIsFavorite] = useState(false);

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsFavorite(!isFavorite);
  };

  return (
    <div className="property-card bg-white rounded-xl overflow-hidden shadow-md hover:shadow-lg">
      <div className="relative">
        <img 
          src={property.imageUrl} 
          alt={property.title} 
          className="w-full h-52 object-cover"
        />
        <button 
          className="absolute top-3 right-3 p-2 bg-white/80 rounded-full hover:bg-white"
          onClick={handleFavoriteClick}
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <i className={`${isFavorite ? 'fas text-[#FF5A5F]' : 'far'} fa-heart`}></i>
        </button>
        {property.hasTour && (
          <span className="absolute bottom-3 left-3 bg-black/50 text-white px-2 py-1 rounded-md text-sm font-medium">
            360° Tour Available
          </span>
        )}
      </div>
      <div className="p-4">
        <div className="flex justify-between items-start">
          <h3 className="font-bold">{property.title}</h3>
          <div className="flex items-center">
            <i className="fas fa-star text-[#FFB400] text-sm"></i>
            <span className="ml-1 text-sm font-medium">{property.rating}</span>
          </div>
        </div>
        <p className="text-gray-500 text-sm mb-2">{property.location}</p>
        <p className="text-gray-500 text-sm mb-3">
          {property.bedrooms} bed • {property.bathrooms} bath • {property.squareFeet} sq ft
        </p>
        <div className="flex justify-between items-center">
          <div>
            <span className="font-bold">${property.price}</span>
            <span className="text-gray-500 text-sm"> / month</span>
          </div>
          <Link 
            href={`/property/${property.id}`} 
            className="text-[#00A699] hover:underline text-sm font-medium"
          >
            View Tour
          </Link>
        </div>
      </div>
    </div>
  );
}
