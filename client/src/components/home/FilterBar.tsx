import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { AnimatedContainer, AnimatedItem } from "@/components/ui/animated-components";
import ExploreFiltersDialog from "./ExploreFiltersDialog";

type CategoryType = {
  name: string;
  icon: string;
  slug: string;
  isActive?: boolean;
};

export default function FilterBar() {
  const [location, setLocation] = useLocation();
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);
  
  const [categories, setCategories] = useState<CategoryType[]>([
    { name: "For Rent", icon: "home", slug: "rental_units", isActive: false },
    { name: "BnBs", icon: "couch", slug: "furnished_houses", isActive: false },
    { name: "For Sale", icon: "tag", slug: "for_sale", isActive: false },
    { name: "Bank Sales", icon: "landmark", slug: "bank_sales", isActive: false }
  ]);

  // Set the active category based on the current URL route
  useEffect(() => {
    // Map routes to category slugs
    const routeMap: Record<string, string> = {
      '/rental-units': 'rental_units',
      '/bnbs': 'furnished_houses',
      '/for-sale': 'for_sale',
      '/bank-sales': 'bank_sales'
    };
    
    let categorySlug = '';
    
    // Check if location matches one of our defined routes
    if (routeMap[location]) {
      categorySlug = routeMap[location];
    } 
    // Check if it's a category URL
    else if (location.includes("/category/")) {
      categorySlug = location.split("/category/")[1];
    }
    
    if (categorySlug) {
      const newCategories = [...categories];
      
      newCategories.forEach(cat => {
        cat.isActive = (cat.slug === categorySlug);
      });
      
      setCategories(newCategories);
    }
  }, [location, categories]);

  const toggleCategory = (index: number) => {
    const newCategories = [...categories];
    
    // Deactivate all categories first
    newCategories.forEach(cat => {
      cat.isActive = false;
    });
    
    // Activate the selected category
    newCategories[index].isActive = true;
    setCategories(newCategories);
    
    // Map category slugs to specific routes
    const routeMap: Record<string, string> = {
      'rental_units': '/rental-units',
      'furnished_houses': '/bnbs',
      'for_sale': '/for-sale',
      'bank_sales': '/bank-sales'
    };
    
    // Navigate to the appropriate category page
    const route = routeMap[newCategories[index].slug] || `/category/${newCategories[index].slug}`;
    setLocation(route);
  };

  return (
    <section className="py-4 border-b border-gray-200 overflow-x-auto whitespace-nowrap hide-scrollbar px-4">
      <AnimatedContainer className="container mx-auto flex items-center space-x-6">
        <AnimatedItem>
          <h2 className="font-bold text-lg mr-4">Browse by:</h2>
        </AnimatedItem>
        {categories.map((category, index) => (
          <AnimatedItem key={category.name} delay={index * 0.1}>
            <button 
              onClick={() => toggleCategory(index)}
              className={`flex flex-col items-center opacity-70 hover:opacity-100 transition-all duration-300 pb-2 border-b-2 ${
                category.isActive 
                  ? 'border-gray-800 opacity-100' 
                  : 'border-transparent hover:border-gray-800'
              } focus:outline-none`}
            >
              <i className={`fas fa-${category.icon} mb-1`}></i>
              <span className="text-sm">{category.name}</span>
            </button>
          </AnimatedItem>
        ))}
        <AnimatedItem delay={0.4}>
          <Button 
            variant="outline" 
            className="bg-white border border-gray-200 rounded-lg px-4 py-2 ml-4 flex items-center hover:bg-gray-50 transition-colors"
            onClick={() => setIsFilterDialogOpen(true)}
          >
            <i className="fas fa-sliders-h mr-2"></i>
            <span>Filters</span>
          </Button>
        </AnimatedItem>
      </AnimatedContainer>
      
      {/* Filters Dialog */}
      <ExploreFiltersDialog 
        isOpen={isFilterDialogOpen} 
        onClose={() => setIsFilterDialogOpen(false)} 
      />
    </section>
  );
}
