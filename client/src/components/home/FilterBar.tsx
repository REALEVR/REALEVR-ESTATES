import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";

type CategoryType = {
  name: string;
  icon: string;
  slug: string;
  isActive?: boolean;
};

export default function FilterBar() {
  const [location, setLocation] = useLocation();
  
  const [categories, setCategories] = useState<CategoryType[]>([
    { name: "For Rent", icon: "home", slug: "rental_units", isActive: false },
    { name: "Furnished", icon: "couch", slug: "furnished_houses", isActive: false },
    { name: "For Sale", icon: "tag", slug: "for_sale", isActive: false },
    { name: "Bank Sales", icon: "landmark", slug: "bank_sales", isActive: false }
  ]);

  // Set the active category based on the current URL if it contains the category
  useEffect(() => {
    if (location.includes("/category/")) {
      const categorySlug = location.split("/category/")[1];
      const newCategories = [...categories];
      
      newCategories.forEach(cat => {
        cat.isActive = (cat.slug === categorySlug);
      });
      
      setCategories(newCategories);
    }
  }, [location]);

  const toggleCategory = (index: number) => {
    const newCategories = [...categories];
    
    // Deactivate all categories first
    newCategories.forEach(cat => {
      cat.isActive = false;
    });
    
    // Activate the selected category
    newCategories[index].isActive = true;
    setCategories(newCategories);
    
    // Navigate to the category page
    setLocation(`/category/${newCategories[index].slug}`);
  };

  return (
    <section className="py-4 border-b border-gray-200 overflow-x-auto whitespace-nowrap hide-scrollbar px-4">
      <div className="container mx-auto flex items-center space-x-6">
        <h2 className="font-bold text-lg mr-4">Browse by:</h2>
        {categories.map((category, index) => (
          <button 
            key={category.name}
            onClick={() => toggleCategory(index)}
            className={`flex flex-col items-center opacity-70 hover:opacity-100 transition-opacity pb-2 border-b-2 ${
              category.isActive 
                ? 'border-gray-800 opacity-100' 
                : 'border-transparent hover:border-gray-800'
            } focus:outline-none`}
          >
            <i className={`fas fa-${category.icon} mb-1`}></i>
            <span className="text-sm">{category.name}</span>
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
