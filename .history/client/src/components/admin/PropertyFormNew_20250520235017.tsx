import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Property, insertPropertySchema, PropertyType, Amenity } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';
import { sqftToSqm } from '@/lib/utils';
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
  Box,
  FileSearch,
  ChevronDown
} from 'lucide-react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@/components/ui/collapsible";
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Extend the insertPropertySchema with additional validations
const propertyFormSchema = insertPropertySchema.extend({
  title: z.string().min(3, "Title must be at least 3 characters"),
  location: z.string().min(3, "Location is required"),
  price: z.coerce.number().positive("Price must be positive"),
  currency: z.string().default("UGX"),
  description: z.string().min(20, "Description must be at least 20 characters"),
  bedrooms: z.coerce.number().int().min(0, "Bedrooms must be a positive number"),
  bathrooms: z.coerce.number().min(0, "Bathrooms must be a positive number"),
  squareFeet: z.coerce.number().min(1, "Square feet must be positive"),
  amenities: z.array(z.string()).optional(),
  propertyType: z.string().min(1, "Property type is required"),
  category: z.string().min(1, "Category is required"),
  monthlyPrice: z.coerce.number().optional(),
  ownerContactInfo: z.string().optional(),
});

type PropertyFormValues = z.infer<typeof propertyFormSchema>;

interface PropertyFormProps {
  property?: Property;
  onSuccess?: () => void;
}

export default function PropertyForm({ property: initialProperty, onSuccess }: PropertyFormProps) {
  // Use state to manage the property data so we can update it
  const [property, setProperty] = useState<Property | undefined>(initialProperty);
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
    monthlyPrice: property.monthlyPrice === null ? undefined : property.monthlyPrice,
    ownerContactInfo: property.ownerContactInfo === null ? '' : property.ownerContactInfo,
  } : {
    title: '',
    location: '',
    price: 0,
    currency: 'UGX',
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
    monthlyPrice: undefined,
    ownerContactInfo: '',
  };

  const form = useForm<PropertyFormValues>({
    resolver: zodResolver(propertyFormSchema),
    defaultValues,
  });

const onSubmit = async (data: PropertyFormValues) => {
  console.log('Save Property button submitted', data); // Log from onSubmit
  // Coerce all numeric fields to numbers before sending to API
  const propertyData = {
    ...data,
    price: Number(data.price),
    bedrooms: Number(data.bedrooms),
    bathrooms: Number(data.bathrooms),
    squareMeters: sqftToSqm(Number(data.squareFeet)), // Convert square feet to square meters
    monthlyPrice: data.monthlyPrice !== undefined ? Number(data.monthlyPrice) : undefined,
    imageUrl: imagePreview || data.imageUrl,
    // Add required fields that might be missing
    rating: data.rating || '0',
    reviewCount: Number(data.reviewCount) || 0,
    hasTour: data.hasTour || false,
    isFeatured: data.isFeatured || false,
  };

  console.log('Prepared property data for API:', propertyData);


  try {
    let response: Response;
    let newProperty: Property | undefined = property;
    console.log('Property data:', propertyData);

    if (property) {
      console.log('Updating existing property with ID:', property.id);
      response = await apiRequest('PATCH', `/api/properties/${property.id}`, propertyData);
    } else {
      console.log('Creating new property with direct form submission');

      // Create a form and submit it directly (this approach works based on our tests)
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = '/api/properties/create';

      // Add all the necessary fields
      const fields = {
        title: data.title,
        description: data.description,
        location: data.location,
        price: String(data.price),
        bedrooms: String(data.bedrooms),
        bathrooms: String(data.bathrooms),
        squareMeters: String(Math.round(Number(data.squareFeet) * 0.093)), // Convert square feet to square meters
        imageUrl: imagePreview || data.imageUrl || '/uploads/images/default-property.jpg',
        rating: data.rating || '0',
        reviewCount: String(data.reviewCount || 0),
        propertyType: data.propertyType || 'Apartment',
        isAvailable: 'true',
        isFeatured: String(data.isFeatured || false),
        hasTour: String(data.hasTour || false),
        category: data.category || 'for_sale',
        currency: data.currency || 'UGX',
        amenities: JSON.stringify(data.amenities || [])
      };

      // Create input elements for each field
      Object.entries(fields).forEach(([name, value]) => {
        if (value !== undefined && value !== null) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = name;
          input.value = value;
          form.appendChild(input);
        }
      });

      // Create a hidden iframe to submit the form to
      const iframe = document.createElement('iframe');
      iframe.name = 'property-submit-frame';
      iframe.style.display = 'none';
      document.body.appendChild(iframe);

      // Set up a promise to wait for the iframe to load
      const formSubmitPromise = new Promise<Response>((resolve, reject) => {
        iframe.onload = () => {
          try {
            // Try to get the response from the iframe
            const iframeDocument = iframe.contentDocument || iframe.contentWindow?.document;
            if (iframeDocument) {
              const responseText = iframeDocument.body.innerText;
              if (responseText) {
                try {
                  const responseData = JSON.parse(responseText);
                  resolve({
                    ok: true,
                    status: 201,
                    statusText: 'Created',
                    json: () => Promise.resolve(responseData),
                    text: () => Promise.resolve(responseText)
                  } as Response);
                } catch (e) {
                  console.error('Failed to parse response:', responseText);
                  reject(new Error('Failed to parse response'));
                }
              } else {
                reject(new Error('Empty response'));
              }
            } else {
              reject(new Error('Could not access iframe document'));
            }
          } catch (e) {
            console.error('Error getting response from iframe:', e);
            reject(e);
          }
        };

        iframe.onerror = (e) => {
          console.error('Iframe error:', e);
          reject(new Error('Form submission failed'));
        };
      });

      // Set the form to submit to the iframe
      form.target = 'property-submit-frame';

      // Add the form to the document and submit it
      document.body.appendChild(form);
      form.submit();

      // Wait for the response
      try {
        response = await formSubmitPromise;
        console.log('Property created successfully via form:', response);

        // Clean up
        setTimeout(() => {
          document.body.removeChild(form);
          document.body.removeChild(iframe);
        }, 1000);
      } catch (error) {
        console.error('Form submission error:', error);

        // Clean up
        document.body.removeChild(form);
        document.body.removeChild(iframe);

        throw error;
      }
    }
    if (response.ok) {
      if (!property) {
        // Get the new property from the response
        newProperty = await response.json();
        // Update the form with the new property (including id)
        if (newProperty) {
          form.reset({
            ...data,
            ...newProperty,
            amenities: newProperty.amenities || [],
            monthlyPrice: newProperty.monthlyPrice === null ? undefined : newProperty.monthlyPrice,
            ownerContactInfo: newProperty.ownerContactInfo === null ? '' : newProperty.ownerContactInfo,
          });
          setImagePreview(newProperty.imageUrl || null);

          // Update the property state with the new property data
          // This will allow the tour tab to know the property is saved
          setProperty(newProperty);

          // Automatically switch to the tour tab after saving
          setLocalStorageItem('propertyFormTab', 'tour');
          setTabValue('tour');
        }
      }
      toast({
        title: property ? "Property Updated" : "Property Created",
        description: property ? "Property has been updated successfully" : "New property has been created",
      });
      // ...existing cache invalidation code...
      if (property && onSuccess) {
        onSuccess();
      }
    } else {
      console.error('Response not OK:', response.status, response.statusText);
      let errorData;
      try {
        errorData = await response.json();
        console.error('Error data:', errorData);
      } catch (jsonError) {
        console.error('Failed to parse error response as JSON:', jsonError);
        const textResponse = await response.text();
        console.error('Raw error response:', textResponse);
        errorData = { message: textResponse || response.statusText };
      }

      toast({
        title: "Error",
        description: errorData.message || "Failed to save property",
        variant: "destructive",
      });
      // Extra logging for debugging
      console.error('Property creation failed:', errorData);
      alert('Property creation failed: ' + (errorData.message || JSON.stringify(errorData)));
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

    // Check file size (max 5GB)
    if (file.size > 5 * 1024 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "File is too large. Maximum allowed size is 5GB",
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

        // Ultra aggressive cache invalidation for tour upload
        console.log("Performing ultra-aggressive cache invalidation after tour upload...");

        // First invalidate all related queries with a more aggressive approach
        queryClient.invalidateQueries(); // Invalidate everything to be completely safe

        // Then explicitly invalidate each specific endpoint
        queryClient.invalidateQueries({ queryKey: ['/api/properties'] });
        queryClient.invalidateQueries({ queryKey: ['/api/properties/featured'] });
        queryClient.invalidateQueries({ queryKey: ['/api/properties/category'] });
        queryClient.invalidateQueries({ queryKey: ['/api/properties/popular'] });
        queryClient.invalidateQueries({ queryKey: [`/api/properties/${property.id}`] });

        // Also invalidate all category-specific endpoints
        queryClient.invalidateQueries({ queryKey: ['/api/properties/category/for_sale'] });
        queryClient.invalidateQueries({ queryKey: ['/api/properties/category/rental_units'] });
        queryClient.invalidateQueries({ queryKey: ['/api/properties/category/furnished_houses'] });
        queryClient.invalidateQueries({ queryKey: ['/api/properties/category/bank_sales'] });

        // Then remove all property queries from cache completely
        queryClient.removeQueries({ queryKey: ['/api/properties'] });
        queryClient.removeQueries({ queryKey: ['/api/properties/featured'] });
        queryClient.removeQueries({ queryKey: ['/api/properties/category'] });
        queryClient.removeQueries({ queryKey: ['/api/properties/popular'] });
        queryClient.removeQueries({ queryKey: [`/api/properties/${property.id}`] });

        // Immediate and delayed refetches
        queryClient.refetchQueries({ queryKey: ['/api/properties'] });
        queryClient.refetchQueries({ queryKey: ['/api/properties/featured'] });
        queryClient.refetchQueries({ queryKey: [`/api/properties/${property.id}`] });

        // Multiple delayed refetches
        setTimeout(() => {
          console.log("Delayed refetch after tour upload...");
          queryClient.refetchQueries({ queryKey: ['/api/properties'] });
          queryClient.refetchQueries({ queryKey: ['/api/properties/featured'] });
          queryClient.refetchQueries({ queryKey: [`/api/properties/${property.id}`] });
        }, 1000);
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

  // Use React state for tab value
  const [tabValue, setTabValue] = useState(() => getLocalStorageItem('propertyFormTab', 'details'));

  // Sync tabValue to localStorage
  useEffect(() => {
    setLocalStorageItem('propertyFormTab', tabValue);
  }, [tabValue]);

  // Listen for custom tab-change events
  useEffect(() => {
    const handleTabChange = (e: any) => {
      if (e.detail === 'details' || e.detail === 'tour') {
        setTabValue(e.detail);
      }
    };
    window.addEventListener('tab-change', handleTabChange);
    return () => {
      window.removeEventListener('tab-change', handleTabChange);
    };
  }, []);

  // Reset the tab to details if we're showing a new property
  useEffect(() => {
    if (!property?.id) {
      setTabValue('details');
    }
  }, [property]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">
        {property ? "Edit Property" : "Create New Property"}
      </h1>

      <Tabs
        value={tabValue}
        defaultValue="details"
        className="w-full"
        onValueChange={setTabValue}
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="details">Property Details</TabsTrigger>
          <TabsTrigger value="tour">Virtual Tour</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-6">
          <Form {...form}>
            <form onSubmit={(e) => {
              e.preventDefault(); // Prevent default form submission
              console.log('Save Property button submitted (form onSubmit event)', form.getValues());

              // Get the form values directly
              const formValues = form.getValues();

              // Create a form and submit it directly (this approach works based on our tests)
              const directForm = document.createElement('form');
              directForm.method = 'POST';
              directForm.action = '/api/properties/create';

              // Add all the necessary fields
              const fields = {
                title: formValues.title,
                description: formValues.description,
                location: formValues.location,
                price: String(formValues.price),
                bedrooms: String(formValues.bedrooms),
                bathrooms: String(formValues.bathrooms),
                squareMeters: String(formValues.squareFeet), // Map squareFeet to squareMeters for backend
                imageUrl: imagePreview || formValues.imageUrl || '/uploads/images/default-property.jpg',
                rating: formValues.rating || '0',
                reviewCount: String(formValues.reviewCount || 0),
                propertyType: formValues.propertyType || 'Apartment',
                isAvailable: 'true',
                isFeatured: String(formValues.isFeatured || false),
                hasTour: String(formValues.hasTour || false),
                category: formValues.category || 'for_sale',
                currency: formValues.currency || 'UGX',
                amenities: JSON.stringify(formValues.amenities || [])
              };

              console.log('Submitting property with fields:', fields);

              // Create input elements for each field
              Object.entries(fields).forEach(([name, value]) => {
                if (value !== undefined && value !== null) {
                  const input = document.createElement('input');
                  input.type = 'hidden';
                  input.name = name;
                  input.value = value;
                  directForm.appendChild(input);
                }
              });

              // Create a hidden iframe to submit the form to
              const iframe = document.createElement('iframe');
              iframe.name = 'property-submit-frame';
              iframe.style.display = 'none';
              document.body.appendChild(iframe);

              // Set the form to submit to the iframe
              directForm.target = 'property-submit-frame';

              // Add the form to the document and submit it
              document.body.appendChild(directForm);

              // Set up a handler for the iframe load event
              iframe.onload = () => {
                console.log('Iframe loaded - checking response');
                try {
                  // Try to get the response from the iframe
                  const iframeDocument = iframe.contentDocument || iframe.contentWindow?.document;
                  console.log('Got iframe document:', iframeDocument ? 'yes' : 'no');

                  if (iframeDocument) {
                    console.log('Iframe document HTML:', iframeDocument.documentElement.outerHTML);
                    const responseText = iframeDocument.body.innerText;
                    console.log('Response text from iframe:', responseText);

                    if (responseText) {
                      try {
                        const responseData = JSON.parse(responseText);
                        console.log('Property created successfully:', responseData);

                        // Show success message
                        toast({
                          title: "Property Created",
                          description: "New property has been created successfully",
                        });

                        // Show an alert with the property ID

                        // Don't reload the page, just update the form with the new property
                        if (responseData && responseData.id) {
                          // Update the form with the new property data
                          form.reset({
                            ...formValues,
                            ...responseData,
                            amenities: responseData.amenities || [],
                            monthlyPrice: responseData.monthlyPrice === null ? undefined : responseData.monthlyPrice,
                            ownerContactInfo: responseData.ownerContactInfo === null ? '' : responseData.ownerContactInfo,
                          });

                          // Update image preview if available
                          if (responseData.imageUrl) {
                            setImagePreview(responseData.imageUrl);
                          }

                          // Update the property state with the new property data
                          // This will allow the tour tab to know the property is saved
                          setProperty(responseData);

                          // Automatically switch to the tour tab after saving
                          setLocalStorageItem('propertyFormTab', 'tour');
                          setTabValue('tour');

                          // Invalidate queries to refresh data
                          queryClient.invalidateQueries({ queryKey: ['/api/properties'] });
                        }
                      } catch (e) {
                        console.error('Failed to parse response:', responseText);
                        alert('Property created but could not parse response: ' + responseText);
                      }
                    } else {
                      console.log('No response text in iframe body');
                      // Try to get the HTML content
                      const htmlContent = iframeDocument.body.innerHTML;
                      console.log('HTML content of iframe body:', htmlContent);

                      // If we have HTML content but no text, the property might have been created
                      if (htmlContent) {
                        alert('Property may have been created, but could not get confirmation. Please check the property list.');
                      }
                    }
                  } else {
                    console.log('Could not access iframe document - security restriction');
                    // If we can't access the iframe document, it might be due to cross-origin restrictions
                    // In this case, assume the property was created
                    alert('Property may have been created, but could not get confirmation due to security restrictions. Please check the property list.');
                  }
                } catch (error) {
                  const e = error as Error;
                  console.error('Error getting response from iframe:', e);
                  // Even if there's an error, the property might have been created
                  alert('Property may have been created, but encountered an error: ' + e.message + '. Please check the property list.');
                }

                // Clean up
                setTimeout(() => {
                  document.body.removeChild(directForm);
                  document.body.removeChild(iframe);
                }, 1000);
              };

              // Handle iframe errors
              iframe.onerror = (e) => {
                console.error('Iframe error:', e);
                alert('Form submission failed');

                // Clean up
                document.body.removeChild(directForm);
                document.body.removeChild(iframe);
              };

              // Submit the form
              directForm.submit();
              console.log('Form submitted');

              // Show a loading toast to indicate that the form is being submitted
              toast({
                title: "Creating Property",
                description: "Please wait while the property is being created...",
              });

              // Also show an alert to make sure the user knows the form is being submitted
              // setTimeout(() => {
              //   alert('Property creation in progress. Please wait for confirmation...');
              // }, 500);
            }} className="space-y-8">
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
                          <Input placeholder="Luxury Villa in Kampala" {...field} />
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
                          <Input placeholder="Kampala, Uganda" {...field} />
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
                          <Textarea placeholder="Describe the property in detail" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category</FormLabel>
                          <Select
                            onValueChange={(value) => {
                              field.onChange(value);
                              // If changing to "for_sale" or "bank_sales", clear the monthly price field
                              if (value === "for_sale" || value === "bank_sales") {
                                form.setValue('monthlyPrice', undefined);
                              }
                            }}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="rental_units">Rental Unit</SelectItem>
                              <SelectItem value="furnished_houses">BnB</SelectItem>
                              <SelectItem value="for_sale">For Sale</SelectItem>
                              <SelectItem value="bank_sales">Bank Sale</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Price with currency selector */}
                    <div className="space-y-6">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <FormField
                            control={form.control}
                            name="price"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Price</FormLabel>
                                <FormControl>
                                  <Input type="number" placeholder="1000000" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-1">
                          <FormField
                            control={form.control}
                            name="currency"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Currency</FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  defaultValue={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="UGX" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="UGX">UGX</SelectItem>
                                    <SelectItem value="USD">USD</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

                      {/* Monthly price field - only for rental categories */}
                      {form.watch('category') === 'rental_units' && (
                        <FormField
                          control={form.control}
                          name="monthlyPrice"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Monthly Price</FormLabel>
                              <FormControl>
                                <div className="flex items-center">
                                  <DollarSign className="mr-2 h-4 w-4 text-muted-foreground" />
                                  <Input
                                    type="number"
                                    placeholder="Monthly rent amount"
                                    {...field}
                                    value={field.value === undefined ? '' : field.value}
                                    onChange={(e) => {
                                      const value = e.target.value === '' ? undefined : Number(e.target.value);
                                      field.onChange(value);
                                    }}
                                  />
                                </div>
                              </FormControl>
                              <FormDescription>
                                Monthly rental amount for this property
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="bedrooms"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bedrooms</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" {...field} />
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
                            <Input type="number" min="0" step="0.5" {...field} />
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
                          <FormLabel>Sq. Feet (will be converted to sq m)</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" {...field} />
                          </FormControl>
                          <FormDescription>
                            Enter size in square feet. This will be converted to square meters for display.
                          </FormDescription>
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

              <div className="flex flex-col sm:flex-row justify-between gap-4 mt-8">
                <div>
                  {!property && (
                    <FormDescription className="text-sm">
                      Save the property details first before adding a virtual tour
                    </FormDescription>
                  )}
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                  >
                    Cancel
                  </Button>

                  <Button
                    type="submit"
                    size="lg"
                    disabled={form.formState.isSubmitting}
                    className="min-w-[150px]"
                  >
                    {form.formState.isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Check className="mr-2 h-4 w-4" />
                        Save Property
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {property && (
                <div className="flex justify-end mt-4">
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full sm:w-auto"
                    onClick={() => {
                      // Change to tour tab after saving
                      setLocalStorageItem('propertyFormTab', 'tour');
                      // Force tab change
                      const event = new CustomEvent('tab-change', { detail: 'tour' });
                      window.dispatchEvent(event);
                    }}
                  >
                    <Box className="mr-2 h-4 w-4" />
                    Continue to Virtual Tour
                  </Button>
                </div>
              )}
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
                      for viewing. Maximum file size: 5GB.
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
                            className="w-full h-full tour-preview-section"
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
            <CardFooter className="flex flex-col sm:flex-row justify-between items-center gap-4">
              <p className="text-sm text-muted-foreground">
                Note: Upload only 3D Vista tour exports for optimal compatibility
              </p>

              {(tourPreviewUrl || property?.tourUrl) && (
                <Button
                  type="button"
                  onClick={() => {
                    // Mark property as completed with virtual tour
                    if (property?.id && !property.hasTour) {
                      // Update property to mark hasTour as true
                      apiRequest('PATCH', `/api/properties/${property.id}`, { hasTour: true })
                        .then(response => {
                          if (response.ok) {
                            toast({
                              title: "Success",
                              description: "Property has been updated with virtual tour"
                            });
                            // Refresh data
                            queryClient.invalidateQueries({ queryKey: ['/api/properties'] });
                            // If onSuccess callback exists, call it to close the form
                            if (onSuccess) {
                              onSuccess();
                            }
                          }
                        })
                        .catch(err => {
                          toast({
                            title: "Error",
                            description: "Failed to update property: " + err.message,
                            variant: "destructive"
                          });
                        });
                    } else if (onSuccess) {
                      // If property already has tour, just call onSuccess
                      onSuccess();
                    }
                  }}
                  size="lg"
                  className="min-w-[150px]"
                  variant="default"
                >
                  <Check className="mr-2 h-4 w-4" />
                  Finish
                </Button>
              )}
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
