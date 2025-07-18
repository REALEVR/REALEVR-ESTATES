import { useState } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

interface ExploreFiltersDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ExploreFiltersDialog({ isOpen, onClose }: ExploreFiltersDialogProps) {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("type");

  // Property types with their routes
  const propertyTypes = [
    { name: "Rental Units", icon: "home", route: "/rental-units", description: "Unfurnished apartments and houses for long-term rent" },
    { name: "BnBs", icon: "couch", route: "/bnbs", description: "Furnished properties for short stays, daily rates" },
    { name: "Properties For Sale", icon: "tag", route: "/for-sale", description: "Houses, apartments and land available for purchase" },
    { name: "Bank Sales", icon: "landmark", route: "/bank-sales", description: "Foreclosed properties on auction from banks" }
  ];

  // Areas
  const popularAreas = [
    "Kololo", "Nakasero", "Bugolobi", "Muyenga", "Ntinda", 
    "Munyonyo", "Naguru", "Kira", "Lubowa", "Entebbe"
  ];

  // Price ranges for filtering
  const priceRanges = [
    { label: "Budget (Under 500,000 UGX)", value: "low" },
    { label: "Mid-range (500K - 1.5M UGX)", value: "medium" },
    { label: "Luxury (Above 1.5M UGX)", value: "high" }
  ];

  // Property features
  const features = [
    "Pool", "Gym", "Security", "Parking", "Balcony", 
    "Garden", "Servants Quarter", "Solar Power", "Borehole", "Furnished"
  ];

  const handleBrowseCategory = (route: string) => {
    setLocation(route);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Explore Properties</DialogTitle>
          <DialogDescription>
            Choose from our collection of properties or filter by your specific preferences.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="type" value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="mb-4">
            <TabsTrigger value="type">Property Type</TabsTrigger>
            <TabsTrigger value="area">Area</TabsTrigger>
            <TabsTrigger value="price">Price Range</TabsTrigger>
            <TabsTrigger value="features">Features</TabsTrigger>
          </TabsList>
          
          <TabsContent value="type" className="space-y-4">
            <p className="mb-2 text-muted-foreground">Select property type to browse:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {propertyTypes.map((type, index) => (
                <div 
                  key={index}
                  className="flex items-center p-4 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => handleBrowseCategory(type.route)}
                >
                  <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center mr-4">
                    <i className={`fas fa-${type.icon} text-gray-600`}></i>
                  </div>
                  <div>
                    <h3 className="font-medium">{type.name}</h3>
                    <p className="text-sm text-gray-500">{type.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
          
          <TabsContent value="area" className="space-y-4">
            <p className="mb-2 text-muted-foreground">Browse properties by area:</p>
            <div className="flex flex-wrap gap-2 mb-6">
              {popularAreas.map((area, index) => (
                <Badge 
                  key={index}
                  variant="outline"
                  className="cursor-pointer hover:bg-gray-50 px-4 py-2 text-base"
                  onClick={() => {
                    // Redirect to a filtered view, we can use any category for now
                    setLocation(`/rental-units?area=${area.toLowerCase()}`);
                    onClose();
                  }}
                >
                  {area}
                </Badge>
              ))}
            </div>
            
            <div className="mt-4">
              <Label htmlFor="custom-area">Search for a specific area:</Label>
              <div className="flex gap-2 mt-2">
                <Input 
                  id="custom-area" 
                  placeholder="E.g., Kampala, Entebbe, etc."
                  className="flex-1"
                />
                <Button>Search</Button>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="price" className="space-y-4">
            <p className="mb-2 text-muted-foreground">Filter properties by price range:</p>
            <div className="space-y-4">
              {priceRanges.map((range, index) => (
                <div 
                  key={index}
                  className="flex items-center p-4 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => {
                    // Redirect to a filtered view
                    setLocation(`/rental-units?price=${range.value}`);
                    onClose();
                  }}
                >
                  <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center mr-4">
                    {index === 0 && <i className="fas fa-dollar-sign text-gray-600"></i>}
                    {index === 1 && <i className="fas fa-dollar-sign text-gray-600"></i>}
                    {index === 2 && <i className="fas fa-dollar-sign text-gray-600"></i>}
                  </div>
                  <div>
                    <h3 className="font-medium">{range.label}</h3>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-medium mb-2">Custom Price Range</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="min-price">Minimum (UGX)</Label>
                  <Input 
                    id="min-price" 
                    placeholder="Min price"
                    type="number"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="max-price">Maximum (UGX)</Label>
                  <Input 
                    id="max-price" 
                    placeholder="Max price"
                    type="number"
                    className="mt-1"
                  />
                </div>
              </div>
              <Button className="mt-4 w-full">Apply Price Filter</Button>
            </div>
          </TabsContent>
          
          <TabsContent value="features" className="space-y-4">
            <p className="mb-2 text-muted-foreground">Find properties with specific features:</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {features.map((feature, index) => (
                <div 
                  key={index}
                  className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => {
                    // Redirect to a filtered view
                    setLocation(`/rental-units?feature=${feature.toLowerCase()}`);
                    onClose();
                  }}
                >
                  <div className="mr-2">
                    <i className="fas fa-check text-green-500"></i>
                  </div>
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        <Separator className="my-4" />
        
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div>
            <h3 className="font-medium text-lg">Can't find what you're looking for?</h3>
            <p className="text-sm text-gray-500">Browse all our available properties</p>
          </div>
          <Button className="bg-[#FF5A5F] hover:bg-[#FF7478]" onClick={() => {
            setLocation("/rental-units"); // Default to rental units as a starting point
            onClose();
          }}>
            View All Properties
          </Button>
        </div>

        <DialogFooter className="flex justify-between items-center mt-4">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <div className="text-sm text-gray-500">
            <i className="fas fa-info-circle mr-1"></i>
            Browse our collections of RealEVR Estates properties
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}