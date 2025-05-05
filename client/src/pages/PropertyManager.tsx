import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useProperties } from "@/hooks/usePropertyData";
import PropertyForm from "@/components/admin/PropertyForm";
import VirtualTourManager from "@/components/admin/VirtualTourManager";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Building, Camera, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PropertyManager() {
  const [activeTab, setActiveTab] = useState("properties");
  const [editingProperty, setEditingProperty] = useState<number | null>(null);
  const [showNewPropertyForm, setShowNewPropertyForm] = useState(false);
  const { data: properties = [], isLoading, refetch } = useProperties();
  const { user } = useAuth();
  
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setEditingProperty(null);
    setShowNewPropertyForm(false);
  };
  
  const handleAddNewClick = () => {
    setEditingProperty(null);
    setShowNewPropertyForm(true);
  };
  
  const handleEditClick = (propertyId: number) => {
    setEditingProperty(propertyId);
    setShowNewPropertyForm(false);
  };
  
  const handleFormSuccess = () => {
    refetch();
    setEditingProperty(null);
    setShowNewPropertyForm(false);
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Property Management</h1>
          <p className="text-gray-600 mt-2">
            Manage your properties and virtual tours in one place.
          </p>
          <div className="flex items-center mt-4 text-sm">
            <span className="text-gray-600">Logged in as:</span>
            <span className="font-semibold ml-2">{user?.fullName || user?.username}</span>
            <span className="ml-2 bg-gray-100 text-gray-800 px-2 py-0.5 rounded-full capitalize">
              {user?.role || "Property Manager"}
            </span>
          </div>
        </div>
        
        <Tabs defaultValue="properties" onValueChange={handleTabChange} value={activeTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="properties" className="flex items-center">
              <Building className="h-4 w-4 mr-2" />
              Properties
            </TabsTrigger>
            <TabsTrigger value="virtual-tours" className="flex items-center">
              <Camera className="h-4 w-4 mr-2" />
              Virtual Tours
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="properties">
            <div className="mb-6">
              <Button onClick={handleAddNewClick} className="flex items-center">
                <Plus className="h-4 w-4 mr-2" />
                Add New Property
              </Button>
            </div>
            
            {showNewPropertyForm && (
              <div className="mb-8">
                <Card>
                  <CardHeader>
                    <CardTitle>Add New Property</CardTitle>
                    <CardDescription>
                      Fill in the details to add a new property to the platform.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <PropertyForm onSuccess={handleFormSuccess} />
                  </CardContent>
                </Card>
              </div>
            )}
            
            {editingProperty !== null && (
              <div className="mb-8">
                <Card>
                  <CardHeader>
                    <CardTitle>Edit Property</CardTitle>
                    <CardDescription>
                      Update the details of this property.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <PropertyForm 
                      property={properties.find(p => p.id === editingProperty)} 
                      onSuccess={handleFormSuccess}
                    />
                  </CardContent>
                </Card>
              </div>
            )}
            
            {!showNewPropertyForm && editingProperty === null && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {properties.map(property => (
                  <Card key={property.id} className="overflow-hidden h-full flex flex-col">
                    <div className="aspect-video relative">
                      <img 
                        src={property.imageUrl} 
                        alt={property.title}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    </div>
                    <CardContent className="flex-1 flex flex-col p-4">
                      <h3 className="text-lg font-semibold line-clamp-1">{property.title}</h3>
                      <p className="text-gray-500 text-sm mb-2">{property.location}</p>
                      <p className="text-gray-600 text-sm line-clamp-3 mb-4">{property.description}</p>
                      
                      <div className="mt-auto flex items-center justify-between">
                        <div className="text-sm">
                          <span className="font-semibold">{property.bedrooms}</span> beds · 
                          <span className="font-semibold ml-1">{property.bathrooms}</span> baths
                        </div>
                        <div className="text-sm font-bold">
                          {new Intl.NumberFormat('en-UG', { 
                            style: 'currency',
                            currency: 'UGX',
                            maximumFractionDigits: 0 
                          }).format(property.price)}
                        </div>
                      </div>
                      
                      <div className="mt-4 flex space-x-2">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="flex-1"
                          onClick={() => handleEditClick(property.id)}
                        >
                          Edit
                        </Button>
                        {property.hasTour ? (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="flex-1"
                            onClick={() => {
                              setActiveTab('virtual-tours');
                            }}
                          >
                            Manage Tour
                          </Button>
                        ) : (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="flex-1"
                            onClick={() => {
                              setActiveTab('virtual-tours');
                            }}
                          >
                            Add Tour
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                
                {properties.length === 0 && (
                  <div className="col-span-full text-center py-12 bg-gray-50 rounded-lg border">
                    <Building className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900">No properties yet</h3>
                    <p className="mt-1 text-gray-500">Get started by adding your first property.</p>
                    <Button 
                      onClick={handleAddNewClick} 
                      className="mt-4"
                    >
                      Add New Property
                    </Button>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="virtual-tours">
            <VirtualTourManager />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}