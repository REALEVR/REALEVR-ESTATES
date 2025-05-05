import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Save, Image, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { apiRequest } from "@/lib/queryClient";
import { insertPropertySchema, type Property } from "@shared/schema";
import { z } from "zod";

// Extended schema with more validation
const propertyFormSchema = insertPropertySchema.extend({
  title: z.string().min(5, "Title must be at least 5 characters"),
  description: z.string().min(20, "Description must be at least 20 characters"),
  imageUrl: z.string().url("Please enter a valid URL"),
  amenities: z.array(z.string()),
});

type PropertyFormValues = z.infer<typeof propertyFormSchema>;

interface PropertyFormProps {
  property?: Property;
  onSuccess?: () => void;
}

export default function PropertyForm({ property, onSuccess }: PropertyFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const { toast } = useToast();
  
  // Define default values
  const defaultValues: Partial<PropertyFormValues> = {
    title: property?.title || "",
    location: property?.location || "",
    description: property?.description || "",
    price: property?.price || 0,
    bedrooms: property?.bedrooms || 1,
    bathrooms: property?.bathrooms || 1,
    squareFeet: property?.squareFeet || 0,
    imageUrl: property?.imageUrl || "",
    rating: property?.rating || "4.5",
    reviewCount: property?.reviewCount || 0,
    propertyType: property?.propertyType || "apartment",
    category: property?.category || "rental_units",
    isFeatured: property?.isFeatured || false,
    hasTour: property?.hasTour || false,
    tourUrl: property?.tourUrl || "",
    amenities: property?.amenities || [],
  };
  
  const form = useForm<PropertyFormValues>({
    resolver: zodResolver(propertyFormSchema),
    defaultValues,
  });
  
  const onSubmit = async (data: PropertyFormValues) => {
    setIsLoading(true);
    setSuccess(false);
    
    try {
      if (property) {
        // Update existing property
        await apiRequest("PATCH", `/api/properties/${property.id}`, data);
        toast({
          title: "Property updated",
          description: "The property has been successfully updated.",
        });
      } else {
        // Create new property
        await apiRequest("POST", "/api/properties", data);
        toast({
          title: "Property created",
          description: "The property has been successfully added to the database.",
        });
        form.reset(defaultValues); // Reset form after successful creation
      }
      setSuccess(true);
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("Error saving property:", error);
      toast({
        title: "Error saving property",
        description: "There was a problem saving the property. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{property ? "Edit Property" : "Add New Property"}</CardTitle>
        <CardDescription>
          {property 
            ? "Update the details of this property listing." 
            : "Fill in the details to add a new property to the platform."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {success && (
          <Alert className="mb-6 border-green-500 text-green-700 bg-green-50">
            <Check className="h-4 w-4" />
            <AlertTitle>Success!</AlertTitle>
            <AlertDescription>
              {property 
                ? "Property has been updated successfully." 
                : "New property has been added successfully."}
            </AlertDescription>
          </Alert>
        )}
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Property Title</FormLabel>
                    <FormControl>
                      <Input placeholder="La Rose Royal Apartments" {...field} />
                    </FormControl>
                    <FormDescription>
                      A clear, descriptive title for the property.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input placeholder="Muyenga, Kampala" {...field} />
                    </FormControl>
                    <FormDescription>
                      The physical location of the property.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="A luxurious apartment complex with modern amenities..."
                      className="min-h-32"
                      {...field} 
                    />
                  </FormControl>
                  <FormDescription>
                    Detailed description of the property and its features.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price (UGX)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        min={0}
                        placeholder="500000" 
                        {...field}
                        onChange={e => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>
                      Monthly rent or sale price.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="bedrooms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bedrooms</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        min={0}
                        placeholder="2" 
                        {...field}
                        onChange={e => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>
                      Number of bedrooms.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="bathrooms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bathrooms</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        min={0}
                        step={0.5}
                        placeholder="1.5" 
                        {...field}
                        onChange={e => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>
                      Number of bathrooms.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <FormField
                control={form.control}
                name="squareFeet"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Square Feet</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        min={0}
                        placeholder="1200" 
                        {...field}
                        onChange={e => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>
                      Property size in square feet.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="imageUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Image URL</FormLabel>
                    <FormControl>
                      <div className="flex items-center space-x-2">
                        <Input placeholder="https://example.com/image.jpg" {...field} />
                        {field.value && (
                          <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0 border">
                            <img 
                              src={field.value} 
                              alt="Preview" 
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'https://via.placeholder.com/150?text=Error';
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </FormControl>
                    <FormDescription>
                      URL to the main property image.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <FormField
                control={form.control}
                name="propertyType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Property Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select property type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="apartment">Apartment</SelectItem>
                        <SelectItem value="house">House</SelectItem>
                        <SelectItem value="villa">Villa</SelectItem>
                        <SelectItem value="condo">Condominium</SelectItem>
                        <SelectItem value="commercial">Commercial</SelectItem>
                        <SelectItem value="land">Land</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Type of property.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="rental_units">Rental Units</SelectItem>
                        <SelectItem value="for_sale">For Sale</SelectItem>
                        <SelectItem value="bnbs">BnBs</SelectItem>
                        <SelectItem value="bank_sales">Bank Sales</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Category of the property listing.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <FormField
                control={form.control}
                name="isFeatured"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Featured Property</FormLabel>
                      <FormDescription>
                        Show this property in the featured listings on the homepage.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value === true}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="hasTour"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Virtual Tour Available</FormLabel>
                      <FormDescription>
                        This property has a virtual tour available.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value === true}
                        onCheckedChange={(checked) => {
                          field.onChange(checked);
                          if (!checked) {
                            form.setValue("tourUrl", "");
                          }
                        }}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            
            {form.watch("hasTour") && (
              <FormField
                control={form.control}
                name="tourUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Virtual Tour URL</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="https://app.lapentor.com/sphere/la-rose-apartments" 
                        value={field.value || ""} 
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        ref={field.ref}
                        name={field.name}
                      />
                    </FormControl>
                    <FormDescription>
                      URL to the virtual tour. You can add more details in the Virtual Tour Manager.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            
            <FormField
              control={form.control}
              name="amenities"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amenities</FormLabel>
                  <FormDescription>
                    Select amenities available at this property.
                  </FormDescription>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
                    {[
                      "Pool", "Gym", "Parking", "Security", "Air Conditioning", 
                      "Furnished", "Balcony", "Garden", "Internet", "TV", 
                      "Washing Machine", "Dishwasher"
                    ].map((amenity) => (
                      <label 
                        key={amenity} 
                        className={`flex items-center space-x-2 border rounded-md p-2 cursor-pointer hover:bg-gray-50 ${
                          field.value?.includes(amenity) ? 'border-[#FF5A5F] bg-red-50' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          value={amenity}
                          checked={field.value?.includes(amenity)}
                          onChange={(e) => {
                            const newValue = e.target.checked
                              ? [...(field.value || []), amenity]
                              : (field.value || []).filter(item => item !== amenity);
                            field.onChange(newValue);
                          }}
                          className="h-4 w-4 text-[#FF5A5F] border-gray-300 rounded"
                        />
                        <span>{amenity}</span>
                      </label>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <CardFooter className="px-0 pb-0">
              <Button 
                type="submit" 
                disabled={isLoading}
                className="mr-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {property ? "Updating..." : "Creating..."}
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    {property ? "Update Property" : "Create Property"}
                  </>
                )}
              </Button>
              {!property && (
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={() => form.reset(defaultValues)}
                >
                  Reset Form
                </Button>
              )}
            </CardFooter>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}