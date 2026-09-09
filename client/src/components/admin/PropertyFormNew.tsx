import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Property, insertPropertySchema, PropertyType, Amenity } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import LocationPinPicker from '@/components/admin/LocationPinPicker';
import DirectS3TourUpload from '@/components/admin/DirectS3TourUpload';
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
  ChevronDown,
  Sparkles,
  Camera
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

// Square meters, year of construction, and building age used to live here
// (as a squareFeet proxy field plus two raw inputs) but were dropped from
// this form — agents found them more friction than they were worth, and
// nothing downstream (search, SEO) ever depended on them. Existing listings
// that already have real values keep displaying them; new ones just don't
// collect any.
const propertyFormSchema = insertPropertySchema
  .omit({ squareMeters: true, yearOfConstruction: true, buildingAge: true })
  .extend({
    title: z.string().min(3, "Title must be at least 3 characters"),
    location: z.string().min(3, "Location is required"),
    price: z.coerce.number().positive("Price must be positive"),
    currency: z.string().default("UGX"),
    description: z.string().min(20, "Description must be at least 20 characters"),
    bedrooms: z.coerce.number().int().min(0, "Bedrooms must be a positive number"),
    bathrooms: z.coerce.number().min(0, "Bathrooms must be a positive number"),
    amenities: z.array(z.string()).optional(),
    propertyType: z.string().min(1, "Property type is required"),
    category: z.string().min(1, "Category is required"),
    monthlyPrice: z.coerce.number().optional(),
    // Property contact/manager - who a prospective tenant/buyer actually reaches.
    ownerContactInfo: z.string().optional(),
    // Who uploaded this listing - defaults to the signed-in agent's own
    // name, editable for the "uploading on someone else's behalf" case.
    uploaderName: z.string().optional(),
    propertyCondition: z.string().optional(),
    auctionStart: z.string().optional(),
    auctionEnd: z.string().optional(),
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
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();

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
    // Falls back to the signed-in agent's own name if this older listing
    // never had one recorded.
    uploaderName: property.uploaderName || user?.fullName || '',
    propertyCondition: property.propertyCondition === null ? '' : property.propertyCondition,
    auctionStart: property.auctionStart === null ? '' : property.auctionStart,
    auctionEnd: property.auctionEnd === null ? '' : property.auctionEnd,
  } as Partial<PropertyFormValues> : {
    title: '',
    location: '',
    latitude: null,
    longitude: null,
    price: 0,
    currency: 'UGX',
    description: '',
    bedrooms: 0,
    bathrooms: 0,
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
    // Pre-filled from whoever's signed in - the common case is uploading
    // your own listing - but editable for the "on someone else's behalf" case.
    uploaderName: user?.fullName || '',
    propertyCondition: '',
    auctionStart: '',
    auctionEnd: '',
    hostName: '',
    hostPhone: '',
    landlordName: '',
    landlordPhone: '',
  };

  const form = useForm<PropertyFormValues>({
    resolver: zodResolver(propertyFormSchema),
    defaultValues,
  });

  // AI-assisted listing description, backed by the server-side /api/ai/generate-description
  // proxy so the Gemini API key never reaches the browser. `silent` skips the
  // "fill in title/location" nudge - used by the auto-generate effect below,
  // which only ever calls this once those two are already filled in.
  const handleGenerateDescription = async (silent = false) => {
    // Guards against the auto-generate effect below and a manual button
    // click racing each other into two overlapping requests.
    if (isGeneratingDescription) return;

    const title = form.getValues('title');
    const location = form.getValues('location');
    const propertyType = form.getValues('propertyType');

    if (!title || !location) {
      if (!silent) {
        toast({
          title: 'Title and location required',
          description: 'Please fill in the title and location before generating a description.',
          variant: 'destructive',
        });
      }
      return;
    }

    setIsGeneratingDescription(true);
    try {
      const res = await apiRequest('POST', '/api/ai/generate-description', { title, location, propertyType });
      const data = await res.json();
      if (data.description) {
        form.setValue('description', data.description, { shouldValidate: true, shouldDirty: true });
      }
    } catch (error: any) {
      // Shown even when called silently (the auto-generate effect) - a real
      // failure (rate limit, misconfiguration) is worth surfacing so the
      // agent isn't left wondering why the description stayed blank; only
      // the "fill in title/location first" nudge above is skipped silently,
      // since the auto-effect never calls this until both are already set.
      toast({
        title: 'AI generation failed',
        description: error.message?.replace(/^\d+:\s*/, '') || 'Please try again or write the description manually.',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingDescription(false);
    }
  };

  // Auto-generate: the moment a NEW listing (never an edit, so an agent's
  // own writing is never silently overwritten) has a title and location and
  // its description is still untouched, write a first draft automatically -
  // "Generate with AI" stays as a button too, for regenerating or nudging it
  // in a different direction. Debounced so it fires once the agent pauses,
  // not on every keystroke.
  const watchedTitle = form.watch('title');
  const watchedLocation = form.watch('location');
  const watchedPropertyType = form.watch('propertyType');
  const autoGeneratedRef = useRef(false);
  useEffect(() => {
    if (property) return; // never touch an existing listing's description
    if (autoGeneratedRef.current) return; // only ever auto-fire once per session
    if (form.getFieldState('description').isDirty) return; // agent already wrote/edited it
    if (!watchedTitle || watchedTitle.trim().length < 3) return;
    if (!watchedLocation || watchedLocation.trim().length < 3) return;

    const timer = setTimeout(() => {
      if (form.getFieldState('description').isDirty) return; // re-check after the debounce
      autoGeneratedRef.current = true;
      handleGenerateDescription(true);
    }, 1200);
    return () => clearTimeout(timer);
  }, [watchedTitle, watchedLocation, watchedPropertyType, property]);


  
// Was previously two divergent code paths: updates went through a normal
// fetch (apiRequest PATCH), but creation built a hidden <form>, posted it
// into a hidden <iframe>, and scraped the response back out of the iframe's
// DOM - a workaround for some now-forgotten issue, but one that also meant
// creating a property skipped this form's own zod validation entirely, and
// silently broke if the browser ever denied same-origin access to the
// iframe's document. Both paths now go through the same plain JSON
// request - exactly how every other form in this app already talks to its
// API - since /api/properties/create has always accepted (and mostly
// ignored the string-vs-number distinction on) a normal JSON body.
const onSubmit = async (data: PropertyFormValues) => {
  const safeNumber = (value: any, defaultValue: number = 0): number => {
    if (value === null || value === undefined || value === '') {
      return defaultValue;
    }
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
  };

  const propertyData: any = {
    ...data,
    price: safeNumber(data.price, 0),
    bedrooms: safeNumber(data.bedrooms, 0),
    bathrooms: safeNumber(data.bathrooms, 0),
    monthlyPrice: data.monthlyPrice !== undefined ? safeNumber(data.monthlyPrice) : undefined,
    imageUrl: imagePreview || data.imageUrl,
    rating: data.rating || '0',
    reviewCount: safeNumber(data.reviewCount, 0),
    hasTour: data.hasTour || false,
    isFeatured: data.isFeatured || false,
  };

  try {
    const response = property
      ? await apiRequest('PATCH', `/api/properties/${property.id}`, propertyData)
      : await apiRequest('POST', '/api/properties/create', propertyData);
    const savedProperty: Property = await response.json();

    setProperty(savedProperty);
    if (savedProperty.imageUrl) {
      setImagePreview(savedProperty.imageUrl);
    }

    const wasCreate = !property;
    if (wasCreate) {
      // Newly created - clear the form and move straight to the tour
      // upload step, which needs the property's own ID and so can't
      // happen any earlier than this.
      form.reset();
      setLocalStorageItem('propertyFormTab', 'tour');
      setTabValue('tour');
    }

    toast({
      title: wasCreate ? 'Property Created' : 'Property Updated',
      description: wasCreate
        ? "New property has been created — now add a virtual tour, or click \"Skip for now\" to finish without one."
        : 'Property has been updated successfully',
    });

    queryClient.invalidateQueries();
    // Only an UPDATE closes the parent dialog here (via onSuccess) — a
    // fresh CREATE deliberately keeps it open on the tour tab above, so
    // the agent lands on the upload step instead of the dialog vanishing
    // out from under them the instant the property record exists. The
    // tour tab's own "Finish"/"Skip for now" buttons call onSuccess once
    // the agent is actually done (see below).
    if (!wasCreate && onSuccess) {
      onSuccess();
    }
  } catch (error: any) {
    console.error('Error saving property:', error);
    toast({
      title: 'Error',
      description: error.message || 'Failed to save property',
      variant: 'destructive',
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
      console.log("WillCreateFormDataForImage",image)
      // Create FormData
      const formData = new FormData();
      formData.append('image', image);

      console.log("DidCreateFormDataForImage",formData)

      console.log("WillMakeImageResponsePost")

      // Upload the image
      const response = await fetch('/api/upload/property-image', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      console.log("WillMakeImageResponsePost")


      const result = await response.json();

      console.log("DidGetImageResponseResult",result)

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

  // Only tourUploadSuccess/tourPreviewUrl remain here - the rest of this
  // form's own upload state (progress, extraction stage, debug info) was
  // handleTourUpload's, which owned the classic upload path. That path is
  // gone (see DirectS3TourUpload.tsx's own doc comment for why - it was
  // strictly worse on speed, resilience, and server load once the direct-
  // to-S3 path existed), and DirectS3TourUpload tracks its own progress
  // internally now; this form only needs to know the end result.
  const [tourUploadSuccess, setTourUploadSuccess] = useState(false);
  const [tourPreviewUrl, setTourPreviewUrl] = useState<string | null>(property?.tourUrl || null);

  // DirectS3TourUpload's onSuccess callback: flip the local preview state,
  // and invalidate/refetch every cached list the newly uploaded tour could
  // appear in so it shows up across the site without a manual refresh.
  const handleTourUploadSuccess = (tourUrl: string) => {
    setTourUploadSuccess(true);
    setTourPreviewUrl(tourUrl);
    queryClient.invalidateQueries();
    queryClient.invalidateQueries();
    queryClient.invalidateQueries({ queryKey: ['/api/properties/featured'] });
    queryClient.invalidateQueries({ queryKey: ['/api/properties/category'] });
    queryClient.invalidateQueries({ queryKey: ['/api/properties/popular'] });
    queryClient.invalidateQueries({ queryKey: [`/api/properties/${property?.id}`] });
    queryClient.invalidateQueries({ queryKey: ['/api/properties/category/for_sale'] });
    queryClient.invalidateQueries({ queryKey: ['/api/properties/category/rental_units'] });
    queryClient.invalidateQueries({ queryKey: ['/api/properties/category/furnished_houses'] });
    queryClient.invalidateQueries({ queryKey: ['/api/properties/category/bank_sales'] });
    queryClient.removeQueries({ queryKey: ['/api/properties'] });
    queryClient.removeQueries({ queryKey: ['/api/properties/featured'] });
    queryClient.removeQueries({ queryKey: ['/api/properties/category'] });
    queryClient.removeQueries({ queryKey: ['/api/properties/popular'] });
    queryClient.removeQueries({ queryKey: [`/api/properties/${property?.id}`] });
    queryClient.refetchQueries({ queryKey: ['/api/properties'] });
    queryClient.refetchQueries({ queryKey: ['/api/properties/featured'] });
    queryClient.refetchQueries({ queryKey: [`/api/properties/${property?.id}`] });
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
            {/* Wired to the same validated onSubmit the "Save Property" button
                below calls directly - this only actually fires on a native
                submit trigger (e.g. pressing Enter in a text field), but it's
                the same save either way, not a second, different one. */}
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

                  <LocationPinPicker
                    latitude={form.watch('latitude')}
                    longitude={form.watch('longitude')}
                    onChange={(lat, lng) => {
                      form.setValue('latitude', lat, { shouldDirty: true });
                      form.setValue('longitude', lng, { shouldDirty: true });
                    }}
                  />

                  <FormField
                    control={form.control}
                    name="uploaderName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Uploaded By</FormLabel>
                        <FormDescription>
                          Pre-filled with your own name - change it if you're listing this on someone else's behalf.
                        </FormDescription>
                        <FormControl>
                          <Input placeholder="Your name" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* --- NEW PROPERTY FIELDS (FLEX) --- */}
                  <div className="flex flex-col gap-4">
                    <FormField
                      control={form.control}
                      name="propertyCondition"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Property Condition</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value || ""}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select property condition" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="excellent">Excellent</SelectItem>
                              <SelectItem value="very-good">Very Good</SelectItem>
                              <SelectItem value="good">Good</SelectItem>
                              <SelectItem value="fair">Fair</SelectItem>
                              <SelectItem value="needs-renovation">Needs Renovation</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {form.watch('category') === 'bank_sales' && (
                      <div className="flex flex-col md:flex-row gap-4">
                        <FormField
                          control={form.control}
                          name="auctionStart"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Auction Start Date</FormLabel>
                              <FormControl>
                                <Input type="datetime-local" {...field} value={field.value || ''} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="auctionEnd"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Auction End Date</FormLabel>
                              <FormControl>
                                <Input type="datetime-local" {...field} value={field.value || ''} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}
                  </div>
                  {/* --- END NEW PROPERTY FIELDS (FLEX) --- */}

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>Description</FormLabel>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleGenerateDescription()}
                            disabled={isGeneratingDescription}
                          >
                            {isGeneratingDescription ? (
                              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            ) : (
                              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                            )}
                            {isGeneratingDescription ? 'Generating...' : 'Generate with AI'}
                          </Button>
                        </div>
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
                            onValueChange={(value: string) => {
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
                                    onChange={(e: { target: { value: string; }; }) => {
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

                  <div className="grid grid-cols-2 gap-4">
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
                            {propertyTypes?.map((type: { id: any; name: any; }) => (
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
                        <FormLabel>Property Contact / Manager</FormLabel>
                        <FormDescription>
                          Who a prospective tenant or buyer actually reaches about this property - only visible to users who have paid the required fees
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

                  {/* BnB host contact - shown to viewers instead of the
                      agent's own number (see hostName/hostPhone's own
                      comment in shared/schema.ts): a BnB's real point of
                      contact is whoever is hosting the stay. Masked to
                      all-but-the-last-4-digits until the viewer pays the
                      booking deposit. */}
                  {form.watch('category') === 'furnished_houses' && (
                    <div className="rounded-lg border bg-card p-4 space-y-4">
                      <div>
                        <h4 className="text-sm font-semibold">Host details</h4>
                        <p className="text-xs text-muted-foreground">
                          Shown to guests (phone masked until they pay the booking deposit) instead of your own agent contact above.
                        </p>
                      </div>
                      <FormField
                        control={form.control}
                        name="hostName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Host Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Who guests will actually be staying with" {...field} value={field.value || ''} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="hostPhone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Host Phone Number</FormLabel>
                            <FormControl>
                              <Input placeholder="+256 700 123456" {...field} value={field.value || ''} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  {/* Rental unit landlord/manager contact - who rent
                      payments actually go to, revealed only once a viewer
                      expresses intent to pay rent (not merely by paying to
                      view) - see landlordName/landlordPhone's own comment
                      in shared/schema.ts. */}
                  {form.watch('category') === 'rental_units' && (
                    <div className="rounded-lg border bg-card p-4 space-y-4">
                      <div>
                        <h4 className="text-sm font-semibold">Landlord / Manager details</h4>
                        <p className="text-xs text-muted-foreground">
                          Who rent payments are meant to go to. Only revealed to a viewer once they say they intend to pay rent for this property - not shown just from viewing or paying to view.
                        </p>
                      </div>
                      <FormField
                        control={form.control}
                        name="landlordName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Landlord / Manager Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Who actually receives the rent" {...field} value={field.value || ''} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="landlordPhone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Landlord / Manager Phone Number</FormLabel>
                            <FormControl>
                              <Input placeholder="+256 700 123456" {...field} value={field.value || ''} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
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
                      {amenities?.map((amenity: { id: any; name: any; }) => (
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
                                    onCheckedChange={(checked: any) => {
                                      return checked
                                        ? field.onChange([...field.value || [], amenity.name])
                                        : field.onChange(
                                            field.value?.filter(
                                              (value: any) => value !== amenity.name
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
                    type="button"
                    size="lg"
                    disabled={form.formState.isSubmitting}
                    className="min-w-[150px]"
                    onClick={() => {
                      console.log('Save Property button clicked');
                      
                      // Check for form validation errors first
                      const formData = form.getValues();
                      console.log('Current form values:', formData);
                      console.log('Form errors:', form.formState.errors);
                      console.log('Form is valid:', form.formState.isValid);
                      
                      // Try to trigger validation
                      form.trigger().then((isValid) => {
                        console.log('Validation result:', isValid);
                        if (!isValid) {
                          console.log('Form validation failed:', form.formState.errors);
                          // Show validation errors to user
                          const errorMessages = Object.entries(form.formState.errors)
                            .map(([field, error]: [string, any]) => `${field}: ${error.message}`)
                            .join('\n');
                          alert('Please fix the following errors:\n' + errorMessages);
                          return;
                        }
                        
                        try {
                          console.log('Calling onSubmit directly since validation passed');
                          onSubmit(formData);
                        } catch (e) {
                          console.error('Error calling onSubmit:', e);
                          alert('Error when submitting form: ' + (e as Error).message);
                        }
                      }).catch((e) => {
                        console.error('Error during validation:', e);
                        alert('Error during form validation: ' + e.message);
                      });
                    }}
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
                        {property.hasTour && property.tourUrl ? (
                          <div className="space-y-2">
                            <div className="flex items-center text-green-600">
                              <Check className="mr-2 h-4 w-4" />
                              <span>Virtual tour available</span>
                            </div>
                            <div className="bg-green-50 border border-green-200 rounded-md p-2">
                              <p className="text-xs font-medium text-green-800 mb-1">Tour URL:</p>
                              <p className="text-xs text-green-700 font-mono break-all">{property.tourUrl}</p>
                            </div>
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

                  {/* No dedicated 360 camera? Don't own 3D Vista? — the
                      guided phone-capture flow (compass-guided room-by-room
                      photo/video capture, quality-checked server-side, see
                      docs/GUIDED_360_UPLOAD.md) lives on the full Virtual
                      Tour Manager page, not duplicated inline here. This is
                      the entry point into "the upload process" the phone
                      capture was asked to be part of. */}
                  <div className="rounded-lg border-2 border-accent/30 bg-accent/5 p-4">
                    <div className="flex items-start gap-3">
                      <Camera className="h-6 w-6 text-accent shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold mb-1">Don't have a 360 camera or 3D Vista?</h3>
                        <p className="text-sm text-muted-foreground mb-3">
                          Capture a tour right from your phone instead — walk each room while the app guides you with a
                          compass overlay, no special equipment needed.
                        </p>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            window.location.href = `/admin/virtual-tour-manager?propertyId=${property.id}`;
                          }}
                        >
                          <Camera className="mr-2 h-4 w-4" />
                          Capture with your phone
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border bg-card p-4">
                    <h3 className="text-lg font-semibold mb-2">Or upload a 3D Vista export</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Upload a 3D Vista tour export (ZIP file). This will extract the tour files and make them available
                      for viewing. Maximum file size: 5GB.
                    </p>

                    {/* One upload path: straight to S3 from the browser in
                        parallel parts (our server only ever sees a small S3
                        key) - see DirectS3TourUpload.tsx's own doc comment
                        for why the earlier relay-through-our-server path was
                        retired instead of kept around as a second option. */}
                    {property?.id ? (
                      <DirectS3TourUpload
                        propertyId={property.id}
                        onSuccess={handleTourUploadSuccess}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Please save the property first before uploading a tour.
                      </p>
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

                </>
              )}
            </CardContent>
            <CardFooter className="flex flex-col sm:flex-row justify-between items-center gap-4">
              <p className="text-sm text-muted-foreground">
                Note: Upload only 3D Vista tour exports for optimal compatibility
              </p>

              {!(tourPreviewUrl || property?.tourUrl) && property?.id && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onSuccess?.()}
                >
                  Skip for now — add a tour later
                </Button>
              )}

              {(tourPreviewUrl || property?.tourUrl) && (
                <Button
                  type="button"
                  onClick={() => {
                    // Mark property as completed with virtual tour
                    if (property?.id && !property.hasTour) {
                      // Update property to mark hasTour as true
                      apiRequest('PATCH', `/api/properties/${property.id}`, { hasTour: true })
                        .then(response => {
                          if (response && response.ok) {
                            toast({
                              title: "Success",
                              description: "Property has been updated with virtual tour"
                            });
                            // Refresh data
                            queryClient.invalidateQueries();
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
