import { useState } from "react";
import { Button } from "@/components/ui/button";

type PropertyType = {
  name: string;
  icon: string;
  isActive?: boolean;
};

export default function FilterBar() {
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>([
    { name: "Apartments", icon: "building" },
    { name: "Houses", icon: "home" },
    { name: "Luxury", icon: "hotel" },
    { name: "Urban", icon: "city" },
    { name: "Beachfront", icon: "water" },
    { name: "Mountain", icon: "mountain" },
    { name: "Modern", icon: "building" }
  ]);

  const togglePropertyType = (index: number) => {
    const newPropertyTypes = [...propertyTypes];
    newPropertyTypes[index].isActive = !newPropertyTypes[index].isActive;
    setPropertyTypes(newPropertyTypes);
  };

  return (
    <section className="py-4 border-b border-gray-200 overflow-x-auto whitespace-nowrap hide-scrollbar px-4">
      <div className="container mx-auto flex items-center space-x-6">
        {propertyTypes.map((type, index) => (
          <button 
            key={type.name}
            onClick={() => togglePropertyType(index)}
            className={`flex flex-col items-center opacity-70 hover:opacity-100 transition-opacity pb-2 border-b-2 ${
              type.isActive 
                ? 'border-gray-800 opacity-100' 
                : 'border-transparent hover:border-gray-800'
            } focus:outline-none`}
          >
            <i className={`fas fa-${type.icon} mb-1`}></i>
            <span className="text-sm">{type.name}</span>
          </button>
        ))}
        <Button variant="outline" className="bg-white border border-gray-200 rounded-lg px-4 py-2 ml-4 flex items-center">
          <i className="fas fa-sliders-h mr-2"></i>
          <span>Filters</span>
        </Button>
      </div>
    </section>
  );
}
