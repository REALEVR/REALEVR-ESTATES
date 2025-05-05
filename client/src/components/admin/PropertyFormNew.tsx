import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Property, insertPropertySchema, PropertyType, Amenity } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { 
  Loader2, 
  Upload, 
  Check, 
  AlertCircle, 
  Home, 
  DollarSign, 
  Map, 
  Bed, 
  Bath,
  SquareCode,
  Eye,
  Box
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Extend the insertPropertySchema with additional validations
const propertyFormSchema = insertPropertySchema.extend({
  title: z.string().min(3, "Title must be at least 3 characters"),
  location: z.string().min(3, "Location is required"),
  price: z.coerce.number().positive("Price must be positive"),
  description: z.string().min(20, "Description must be at least 20 characters"),
  bedrooms: z.coerce.number().int().min(0, "Bedrooms must be a positive number"),
  bathrooms: z.coerce.number().min(0, "Bathrooms must be a positive number"),
  squareFeet: z.coerce.number().min(1, "Square feet must be positive"),
  amenities: z.array(z.string()).optional(),
  propertyType: z.string().min(1, "Property type is required"),
  category: z.string().min(1, "Category is required"),
  ownerContactInfo: z.string().optional(),
});

type PropertyFormValues = z.infer<typeof propertyFormSchema>;

interface PropertyFormProps {
  property?: Property;
  onSuccess?: () => void;
}

export default function PropertyFormNew({ property, onSuccess }: PropertyFormProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(property?.imageUrl || null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: propertyTypes } = useQuery<PropertyType[]>({
    queryKey: ['/api/property-types'],
  });

  const { data: amenities } = useQuery<Amenity[]>({
    queryKey: ['/api/amenities'],
  });
  
  // Get default values from existing property or use empty defaults
  const defaultValues: Partial<PropertyFormValues> = property ? {
    ...property,
    amenities: property.amenities || [],
  } : {
    title: '',
    location: '',
    price: 0,
    description: '',
    bedrooms: 0,
    bathrooms: 0,
    squareFeet: 0,
    imageUrl: '',
    rating: '0',
    reviewCount: 0,
    propertyType: '',
    category: 'rental',
    hasTour: false,
    tourUrl: '',
    isFeatured: false,
    amenities: [],
    ownerContactInfo: '',
  };

  const form = useForm<PropertyFormValues>({
    resolver: zodResolver(propertyFormSchema),
    defaultValues,
  });

  const onSubmit = async (data: PropertyFormValues) => {
    try {
      // Prepare the data
      const propertyData = {
        ...data,
        // Add image URL if it was uploaded
        imageUrl: imagePreview || data.imageUrl,
      };

      let response;
      if (property) {
        // Update existing property
        response = await apiRequest('PATCH', `/api/properties/${property.id}`, propertyData);
      } else {
        // Create new property
        response = await apiRequest('POST', '/api/properties/create', propertyData);
      }

      if (response.ok) {
        toast({
          title: property ? "Property Updated" : "Property Created",
          description: property ? "Property has been updated successfully" : "New property has been created",
        });
        
        // Invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: ['/api/properties'] });
        
        // Call onSuccess callback if provided
        if (onSuccess) {
          onSuccess();
        }
        
        if (!property) {
          // Reset form if creating a new property
          form.reset(defaultValues);
          setImagePreview(null);
        }
      } else {
        const errorData = await response.json();
        toast({
          title: "Error",
          description: errorData.message || "Failed to save property",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save property",
        variant: "destructive",
      });
    }
  };

  const handleImageUpload = async () => {
    const fileInput = fileInputRef.current;
    
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      toast({
        title: "Error",
        description: "Please select an image file to upload",
        variant: "destructive",
      });
      return;
    }
    
    const image = fileInput.files[0];
    
    // Check if file is an image
    if (!image.type.startsWith('image/')) {
      toast({
        title: "Error",
        description: "Please upload an image file",
        variant: "destructive",
      });
      return;
    }
    
    // Check file size (max 5MB)
    if (image.size > 5 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "Image file is too large. Maximum allowed size is 5MB",
        variant: "destructive",
      });
      return;
    }
    
    setIsUploading(true);
    setUploadSuccess(false);
    setUploadError("");
    
    try {
      // Create FormData
      const formData = new FormData();
      formData.append('image', image);
      
      // Upload the image
      const response = await fetch('/api/upload/property-image', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      const result = await response.json();
      
      if (response.ok && result.status === 'success') {
        setUploadSuccess(true);
        setImagePreview(result.imagePath);
        
        // Update form with the returned image URL
        form.setValue('imageUrl', result.imagePath);
        
        toast({
          title: "Success",
          description: "Image uploaded successfully",
        });
      } else {
        setUploadError(result.message || "Failed to upload image");
        
        toast({
          title: "Error",
          description: result.message || "Failed to upload image",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      setUploadError(error.message || "Failed to upload image");
      
      toast({
        title: "Error",
        description: "Failed to upload image: " + (error.message || "Unknown error"),
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const [tourUploading, setTourUploading] = useState(false);
  const [tourUploadSuccess, setTourUploadSuccess] = useState(false);
  const [tourUploadError, setTourUploadError] = useState("");
  const [tourPreviewUrl, setTourPreviewUrl] = useState<string | null>(property?.tourUrl || null);
  const [tourDebugInfo, setTourDebugInfo] = useState<any>(null);
  const tourFileInputRef = useRef<HTMLInputElement>(null);

  const handleTourUpload = async () => {
    const fileInput = tourFileInputRef.current;
    
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      toast({
        title: "Error",
        description: "Please select a ZIP file to upload",
        variant: "destructive",
      });
      return;
    }
    
    if (!property?.id) {
      toast({
        title: "Error",
        description: "Please save the property first before uploading a tour",
        variant: "destructive",
      });
      return;
    }
    
    const file = fileInput.files[0];
    
    // Check if file is a zip
    if (!file.name.endsWith('.zip')) {
      toast({
        title: "Error",
        description: "Please upload a ZIP file (3D Vista tour export)",
        variant: "destructive",
      });
      return;
    }
    
    // Check file size (max 100MB)
    if (file.size > 100 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "File is too large. Maximum allowed size is 100MB",
        variant: "destructive",
      });
      return;
    }
    
    setTourUploading(true);
    setTourUploadSuccess(false);
    setTourUploadError("");
    
    try {
      // Create FormData
      const formData = new FormData();
      formData.append('tourZip', file);
      
      // Upload the virtual tour zip
      const response = await fetch(`/api/upload/virtual-tour/${property.id}`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      const result = await response.json();
      
      // Store debug info regardless of success/failure
      setTourDebugInfo(result);
      console.log('Tour upload response:', result);
      
      if (response.ok && result.status === 'success') {
        setTourUploadSuccess(true);
        setTourPreviewUrl(result.tourUrl);
        
        toast({
          title: "Success",
          description: "Virtual tour uploaded and extracted successfully",
        });
        
        // Refresh the property data
        queryClient.invalidateQueries({ queryKey: ['/api/properties'] });
      } else {
        const errorMsg = result.message || "Failed to upload virtual tour";
        setTourUploadError(errorMsg);
        
        toast({
          title: "Error",
          description: errorMsg,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      setTourUploadError(error.message || "Failed to upload virtual tour");
      
      toast({
        title: "Error",
        description: "Failed to upload virtual tour: " + (error.message || "Unknown error"),
        variant: "destructive",
      });
    } finally {
      setTourUploading(false);
    }
  };

  // Helper function to safely use localStorage
  const getLocalStorageItem = (key: string, defaultValue: string) => {
    try {
      if (typeof window !== 'undefined') {
        const value = localStorage.getItem(key);
        return value || defaultValue;
      }
    } catch (e) {
      console.error('LocalStorage error:', e);
    }
    return defaultValue;
  };

  const setLocalStorageItem = (key: string, value: string) => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(key, value);
      }
    } catch (e) {
      console.error('LocalStorage error:', e);
    }
  };

  // Reset the tab to details if we're showing a new property
  useEffect(() => {
    if (!property?.id) {
      setLocalStorageItem('propertyFormTab', 'details');
    }
    
    // Add event listener for custom tab change event
    const handleTabChange = (e: any) => {
      if (e.detail === 'details' || e.detail === 'tour') {
        setLocalStorageItem('propertyFormTab', e.detail);
      }
    };
    
    window.addEventListener('tab-change', handleTabChange);
    
    return () => {
      window.removeEventListener('tab-change', handleTabChange);
    };
  }, [property]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">
        {property ? "Edit Property" : "Create New Property"}
      </h1>
      
      <Tabs 
        value={getLocalStorageItem('propertyFormTab', 'details')}
        defaultValue="details"
        className="w-full" 
        onValueChange={(value) => {
          setLocalStorageItem('propertyFormTab', value);
        }}
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="details">Property Details</TabsTrigger>
          <TabsTrigger value="tour">Virtual Tour</TabsTrigger>
        </TabsList>
        
        <TabsContent value="details" className="mt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-6">
                  {/* Basic Information */}
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Property Title</FormLabel>
                        <FormControl>
                          <div className="flex items-center">
                            <Home className="mr-2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Luxury Villa in Kampala" {...field} />
                          </div>
                        </FormControl>
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
                          <div className="flex items-center">
                            <Map className="mr-2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Kampala, Uganda" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Describe the property in detail" 
                            className="min-h-[120px]"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="price"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Price (UGX)</FormLabel>
                          <FormControl>
                            <div className="flex items-center">
                              <DollarSign className="mr-2 h-4 w-4 text-muted-foreground" />
                              <Input type="number" placeholder="1000000" {...field} />
                            </div>
                          </FormControl>
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
                          <Select 
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="rental">Rental Unit</SelectItem>
                              <SelectItem value="bnb">BnB</SelectItem>
                              <SelectItem value="sale">For Sale</SelectItem>
                              <SelectItem value="bank-sale">Bank Sale</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="bedrooms"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bedrooms</FormLabel>
                          <FormControl>
                            <div className="flex items-center">
                              <Bed className="mr-2 h-4 w-4 text-muted-foreground" />
                              <Input type="number" min="0" {...field} />
                            </div>
                          </FormControl>
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
                            <div className="flex items-center">
                              <Bath className="mr-2 h-4 w-4 text-muted-foreground" />
                              <Input type="number" min="0" step="0.5" {...field} />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="squareFeet"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Sq. Feet</FormLabel>
                          <FormControl>
                            <div className="flex items-center">
                              <SquareCode className="mr-2 h-4 w-4 text-muted-foreground" />
                              <Input type="number" min="0" {...field} />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="propertyType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Property Type</FormLabel>
                        <Select 
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select property type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {propertyTypes?.map(type => (
                              <SelectItem key={type.id} value={type.name}>
                                {type.name}
                              </SelectItem>
                            )) || (
                              <>
                                <SelectItem value="Apartment">Apartment</SelectItem>
                                <SelectItem value="House">House</SelectItem>
                                <SelectItem value="Villa">Villa</SelectItem>
                                <SelectItem value="Condo">Condo</SelectItem>
                                <SelectItem value="Townhouse">Townhouse</SelectItem>
                              </>
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="ownerContactInfo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Owner Contact Information</FormLabel>
                        <FormDescription>
                          This will only be visible to users who have paid the required fees
                        </FormDescription>
                        <FormControl>
                          <Textarea 
                            placeholder="Name: John Doe, Phone: +256 700 123456, Email: john@example.com"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="space-y-6">
                  {/* Featured property switch */}
                  <FormField
                    control={form.control}
                    name="isFeatured"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Featured Property</FormLabel>
                          <FormDescription>
                            Mark this property as featured to display it on the homepage
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value as boolean}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  {/* Image upload section */}
                  <div className="border rounded-lg p-4 space-y-4">
                    <h3 className="text-lg font-medium">Property Image</h3>
                    <FormDescription>
                      Upload a high-quality image of the property (max 5MB)
                    </FormDescription>
                    
                    <div className="flex items-center space-x-2">
                      <Input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="flex-1"
                      />
                      <Button 
                        type="button" 
                        onClick={handleImageUpload}
                        disabled={isUploading}
                      >
                        {isUploading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Upload className="mr-2 h-4 w-4" />
                            Upload
                          </>
                        )}
                      </Button>
                    </div>
                    
                    {uploadSuccess && (
                      <Alert className="mt-2 bg-green-50 border-green-300">
                        <Check className="h-4 w-4 text-green-500" />
                        <AlertTitle>Image uploaded successfully!</AlertTitle>
                      </Alert>
                    )}
                    
                    {uploadError && (
                      <Alert className="mt-2" variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Upload Error</AlertTitle>
                        <AlertDescription>
                          {uploadError}
                        </AlertDescription>
                      </Alert>
                    )}
                    
                    {imagePreview && (
                      <div className="mt-4">
                        <p className="text-sm mb-2 font-medium">Image Preview:</p>
                        <div className="aspect-video bg-gray-100 relative rounded-md overflow-hidden">
                          <img 
                            src={imagePreview} 
                            alt="Property preview" 
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Amenities Section */}
                  <div className="border rounded-lg p-4 space-y-4">
                    <h3 className="text-lg font-medium">Amenities</h3>
                    <FormDescription>
                      Select the amenities available at this property
                    </FormDescription>
                    
                    <div className="grid grid-cols-2 gap-4">
                      {amenities?.map((amenity) => (
                        <FormField
                          key={amenity.id}
                          control={form.control}
                          name="amenities"
                          render={({ field }) => {
                            return (
                              <FormItem
                                key={amenity.id}
                                className="flex flex-row items-start space-x-3 space-y-0"
                              >
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(amenity.name)}
                                    onCheckedChange={(checked) => {
                                      return checked
                                        ? field.onChange([...field.value || [], amenity.name])
                                        : field.onChange(
                                            field.value?.filter(
                                              (value) => value !== amenity.name
                                            )
                                          )
                                    }}
                                  />
                                </FormControl>
                                <FormLabel className="font-normal">
                                  {amenity.name}
                                </FormLabel>
                              </FormItem>
                            )
                          }}
                        />
                      )) || (
                        <p className="text-muted-foreground text-sm">No amenities available</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-end space-x-4 mt-8">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Property'
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </TabsContent>
        
        <TabsContent value="tour" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Virtual Tour Management</CardTitle>
              <CardDescription>
                Upload and manage 3D Vista virtual tours for this property. 
                The ZIP file should be an exported tour from 3D Vista.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {!property?.id ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Save the property first</AlertTitle>
                  <AlertDescription>
                    Please save the property details first before uploading a virtual tour.
                    Switch to the "Property Details" tab, fill in the required fields, and click "Save Property".
                  </AlertDescription>
                  <div className="mt-4">
                    <Button 
                      variant="secondary" 
                      onClick={() => {
                        setLocalStorageItem('propertyFormTab', 'details');
                        // Force tab change
                        const event = new CustomEvent('tab-change', { detail: 'details' });
                        window.dispatchEvent(event);
                      }}
                    >
                      Switch to Property Details
                    </Button>
                  </div>
                </Alert>
              ) : (
                <>
                  <div className="border rounded-lg p-4 bg-muted/20">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium">Property:</p>
                        <p className="text-lg font-bold">{property.title}</p>
                        <p className="text-sm text-muted-foreground">{property.location}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">Current Tour Status:</p>
                        {property.hasTour ? (
                          <div className="flex items-center text-green-600">
                            <Check className="mr-2 h-4 w-4" />
                            <span>Virtual tour available</span>
                          </div>
                        ) : (
                          <div className="flex items-center text-amber-600">
                            <AlertCircle className="mr-2 h-4 w-4" />
                            <span>No virtual tour uploaded</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="rounded-lg border bg-card p-4">
                    <h3 className="text-lg font-semibold mb-2">Upload Virtual Tour</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Upload a 3D Vista tour export (ZIP file). This will extract the tour files and make them available 
                      for viewing. Maximum file size: 100MB.
                    </p>
                    
                    <div className="flex items-center space-x-2 mt-2">
                      <Input
                        ref={tourFileInputRef}
                        type="file"
                        accept=".zip"
                        className="flex-1"
                      />
                      <Button 
                        type="button" 
                        onClick={handleTourUpload}
                        disabled={tourUploading}
                      >
                        {tourUploading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Upload className="mr-2 h-4 w-4" />
                            Upload
                          </>
                        )}
                      </Button>
                    </div>
                    
                    {tourUploadSuccess && (
                      <Alert className="mt-4 bg-green-50 border-green-300">
                        <Check className="h-4 w-4 text-green-500" />
                        <AlertTitle>Success!</AlertTitle>
                        <AlertDescription>
                          Virtual tour uploaded and extracted successfully.
                        </AlertDescription>
                      </Alert>
                    )}
                    
                    {tourUploadError && (
                      <Alert className="mt-4" variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Upload Error</AlertTitle>
                        <AlertDescription>
                          {tourUploadError}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                  
                  {/* Tour preview section */}
                  {(tourPreviewUrl || property?.tourUrl) && (
                    <div className="border rounded-lg p-4">
                      <h3 className="text-lg font-semibold mb-2">Virtual Tour Preview</h3>
                      <div className="space-y-4">
                        <div className="aspect-video bg-gray-100 rounded-md overflow-hidden">
                          <iframe 
                            src={tourPreviewUrl || property?.tourUrl || ""} 
                            className="w-full h-full"
                            title={`Virtual tour of ${property?.title}`}
                            sandbox="allow-same-origin allow-scripts allow-forms"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button 
                            variant="outline" 
                            onClick={() => window.open(tourPreviewUrl || property?.tourUrl || "", '_blank')}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            Open in New Tab
                          </Button>
                          
                          <div className="flex-1"></div>
                          
                          <Button 
                            variant="secondary" 
                            onClick={() => {
                              // Check if iframe is accessible by trying to access its document
                              const iframe = document.querySelector('iframe');
                              try {
                                if (iframe) {
                                  // Just accessing this property will throw if cross-origin issues
                                  const iframeDoc = iframe.contentDocument;
                                  if (iframeDoc) {
                                    toast({
                                      title: "Tour Access Check",
                                      description: "Tour file is accessible. If you still see issues, there may be a problem with the tour file structure.",
                                    });
                                  }
                                }
                              } catch (e) {
                                toast({
                                  title: "Tour Access Check",
                                  description: "There seems to be a cross-origin issue with the tour. Please check the server logs.",
                                  variant: "destructive",
                                });
                              }
                            }}
                          >
                            <FileSearch className="mr-2 h-4 w-4" />
                            Check Tour Access
                          </Button>
                        </div>
                        
                        <div className="text-xs text-muted-foreground">
                          <p>Tour URL: <code className="bg-muted px-1 py-0.5 rounded">{tourPreviewUrl || property?.tourUrl}</code></p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Debug info section - Hidden by default, shown on demand or when there's an error */}
                  {(tourDebugInfo || tourUploadError) && (
                    <div className="border rounded-lg p-4 bg-muted/30">
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button variant="outline" size="sm" className="w-full flex justify-between">
                            <span>Tour Upload Debug Information</span>
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="p-2">
                          {tourDebugInfo && (
                            <div className="text-xs">
                              <h4 className="font-semibold mb-1">Server Response:</h4>
                              <pre className="bg-muted p-2 rounded overflow-auto max-h-[200px]">
                                {JSON.stringify(tourDebugInfo, null, 2)}
                              </pre>
                              
                              {tourDebugInfo.directoryContents && (
                                <div className="mt-2">
                                  <h4 className="font-semibold mb-1">Extracted Files:</h4>
                                  <ul className="list-disc list-inside">
                                    {tourDebugInfo.directoryContents.map((item: string, index: number) => (
                                      <li key={index} className="truncate">{item}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                          
                          {tourUploadError && (
                            <div className="mt-2 text-xs">
                              <h4 className="font-semibold mb-1 text-destructive">Error:</h4>
                              <pre className="bg-destructive/10 p-2 rounded text-destructive">
                                {tourUploadError}
                              </pre>
                              
                              <div className="mt-2 space-y-1">
                                <h4 className="font-semibold">Common Solutions:</h4>
                                <ul className="list-disc list-inside">
                                  <li>Make sure your ZIP file is a proper 3D Vista export</li>
                                  <li>Check that the ZIP file contains an index.htm file</li>
                                  <li>The ZIP file structure should have index.htm at the root or in a single subdirectory</li>
                                  <li>Try creating a fresh export from 3D Vista</li>
                                </ul>
                              </div>
                            </div>
                          )}
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  )}
                </>
              )}
            </CardContent>
            <CardFooter className="flex justify-between">
              <p className="text-sm text-muted-foreground">
                Note: Upload only 3D Vista tour exports for optimal compatibility
              </p>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}