import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import ExploreFiltersDialog from "./ExploreFiltersDialog";

export default function Hero() {
  const [isExploreDialogOpen, setIsExploreDialogOpen] = useState(false);

  return (
    <section className="relative">
      <div className="h-[450px] overflow-hidden">
        <img 
          src="https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1920&q=80" 
          alt="Modern apartment living room with large windows" 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"></div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-6 md:p-12 text-white">
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-2">Experience Kampala Properties Virtually</h1>
        <p className="text-lg md:text-xl mb-6">Explore Uganda's finest homes and apartments with immersive 360° tours</p>
        <div className="flex flex-wrap gap-3">
          <Button 
            variant="secondary"
            className="bg-white text-gray-800 hover:bg-gray-100 transition-colors"
            onClick={() => setIsExploreDialogOpen(true)}
          >
            Explore Properties
          </Button>
          <Button asChild>
            <Link href="#featured" className="bg-[#FF5A5F] hover:bg-[#FF7478] text-white transition-colors">
              Featured Properties
            </Link>
          </Button>
        </div>
      </div>

      {/* Explore Properties Dialog */}
      <ExploreFiltersDialog 
        isOpen={isExploreDialogOpen} 
        onClose={() => setIsExploreDialogOpen(false)} 
      />
    </section>
  );
}
