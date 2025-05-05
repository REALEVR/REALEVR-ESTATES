import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Loader2, Save, Eye, ExternalLink, Plus, AlertCircle, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useForm } from "react-hook-form";
import { useProperties } from "@/hooks/usePropertyData";
import { apiRequest } from "@/lib/queryClient";
import VirtualTourModal from "../property/VirtualTourModal";

interface VirtualTourFormValues {
  propertyId: number;
  tourUrl: string;
  tourProvider: string;
  isPublic: boolean;
  notes: string;
}

export default function VirtualTourManager() {
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null);
  const { toast } = useToast();
  const { data: properties = [] } = useProperties();
  
  const form = useForm<VirtualTourFormValues>({
    defaultValues: {
      propertyId: 0,
      tourUrl: "",
      tourProvider: "realevr",
      isPublic: true,
      notes: ""
    }
  });
  
  const tourProviders = [
    { value: "realevr", label: "RealEVR" },
    { value: "matterport", label: "Matterport" },
    { value: "lapentor", label: "Lapentor" },
    { value: "custom", label: "Custom URL" }
  ];
  
  useEffect(() => {
    if (selectedProperty) {
      const property = properties.find(p => p.id.toString() === selectedProperty);
      if (property) {
        form.setValue("propertyId", property.id);
        
        // If the property already has a tour URL, populate it
        if (property.tourUrl) {
          form.setValue("tourUrl", property.tourUrl);
        }
      }
    }
  }, [selectedProperty, properties, form]);
  
  const handlePropertyChange = (value: string) => {
    setSelectedProperty(value);
  };
  
  const onSubmit = async (data: VirtualTourFormValues) => {
    setIsLoading(true);
    setSuccess(false);
    
    try {
      // Here you would normally call an API endpoint to save the tour details
      // We'll simulate it for now
      console.log("Saving tour details:", data);
      
      // Simulating API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // In a real app, you would update the property with the new tour URL
      /*
      await apiRequest("PATCH", `/api/properties/${data.propertyId}`, {
        tourUrl: data.tourUrl
      });
      */
      
      setSuccess(true);
      toast({
        title: "Virtual tour details saved",
        description: "The virtual tour has been successfully linked to the property.",
        duration: 5000,
      });
    } catch (error) {
      console.error("Error saving tour details:", error);
      toast({
        title: "Error saving tour details",
        description: "There was a problem saving the virtual tour information. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handlePreview = () => {
    const url = form.getValues("tourUrl");
    if (url) {
      setPreviewUrl(url);
    } else {
      toast({
        title: "No URL provided",
        description: "Please enter a virtual tour URL to preview.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Virtual Tour Manager</h1>
      
      <Tabs defaultValue="add" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="add">Add/Edit Tour</TabsTrigger>
          <TabsTrigger value="manage">Manage Tours</TabsTrigger>
        </TabsList>
        
        <TabsContent value="add">
          <Card>
            <CardHeader>
              <CardTitle>Add Virtual Tour to Property</CardTitle>
              <CardDescription>
                Link a virtual tour to an existing property. Supported providers: RealEVR, Matterport, Lapentor, and custom URLs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {success && (
                <Alert className="mb-6 border-green-500 text-green-700 bg-green-50">
                  <Check className="h-4 w-4" />
                  <AlertTitle>Success!</AlertTitle>
                  <AlertDescription>
                    Virtual tour has been successfully linked to the property.
                  </AlertDescription>
                </Alert>
              )}
              
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="propertyId"
                      render={() => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Select Property</FormLabel>
                          <Select onValueChange={handlePropertyChange} value={selectedProperty || undefined}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a property" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {properties.map((property) => (
                                <SelectItem key={property.id} value={property.id.toString()}>
                                  {property.title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Choose the property to link this virtual tour to.
                          </FormDescription>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="tourProvider"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tour Provider</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select provider" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {tourProviders.map((provider) => (
                                <SelectItem key={provider.value} value={provider.value}>
                                  {provider.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Select the platform that hosts your virtual tour.
                          </FormDescription>
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="tourUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Virtual Tour URL</FormLabel>
                        <FormControl>
                          <div className="flex items-center space-x-2">
                            <Input
                              placeholder="https://app.lapentor.com/sphere/your-tour-id"
                              {...field}
                              className="flex-grow"
                            />
                            <Button 
                              type="button" 
                              variant="outline"
                              onClick={handlePreview}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              Preview
                            </Button>
                          </div>
                        </FormControl>
                        <FormDescription>
                          Enter the complete URL of the virtual tour.
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes (Optional)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Any special instructions or notes about this tour"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Add any additional information about this virtual tour.
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                  
                  <CardFooter className="px-0 pb-0 pt-6">
                    <Button 
                      type="submit" 
                      disabled={isLoading || !selectedProperty}
                      className="mr-2"
                    >
                      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      <Save className="mr-2 h-4 w-4" />
                      Save Tour Details
                    </Button>
                    
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handlePreview}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      Preview Tour
                    </Button>
                  </CardFooter>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="manage">
          <Card>
            <CardHeader>
              <CardTitle>Manage Virtual Tours</CardTitle>
              <CardDescription>
                View and manage all properties with virtual tours.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {properties
                  .filter(property => property.tourUrl)
                  .map(property => (
                    <Card key={property.id} className="overflow-hidden">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="aspect-video relative overflow-hidden">
                          <img 
                            src={property.imageUrl} 
                            alt={property.title}
                            className="object-cover w-full h-full"
                          />
                        </div>
                        <div className="p-4 md:col-span-2">
                          <h3 className="text-lg font-semibold">{property.title}</h3>
                          <p className="text-gray-500 text-sm mb-2">{property.location}</p>
                          
                          <div className="flex items-center text-sm text-gray-600 mb-4">
                            <span className="truncate flex-grow">
                              {property.tourUrl || "No tour URL available"}
                            </span>
                          </div>
                          
                          <div className="flex space-x-2">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => setPreviewUrl(property.tourUrl || "")}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              Preview
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedProperty(property.id.toString());
                                form.setValue("tourUrl", property.tourUrl || "");
                                form.setValue("propertyId", property.id);
                                document.querySelector('[data-value="add"]')?.click();
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline" 
                              asChild
                            >
                              <a href={property.tourUrl || "#"} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Open
                              </a>
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                
                {properties.filter(property => property.tourUrl).length === 0 && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>No tours found</AlertTitle>
                    <AlertDescription>
                      No properties with virtual tours have been added yet. Add your first virtual tour using the form above.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Virtual Tour Preview Modal */}
      {previewUrl && (
        <VirtualTourModal
          isOpen={!!previewUrl}
          onClose={() => setPreviewUrl(null)}
          propertyTitle={selectedProperty 
            ? properties.find(p => p.id.toString() === selectedProperty)?.title || "Property Tour" 
            : "Property Tour"
          }
          tourUrl={previewUrl}
        />
      )}
    </div>
  );
}