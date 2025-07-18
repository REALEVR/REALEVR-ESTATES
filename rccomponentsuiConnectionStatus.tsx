[33mcommit 2a0ddf700c1eaa08893dddc3e1c3e2f315925093[m[33m ([m[1;36mHEAD -> [m[1;32mmain[m[33m, [m[1;31morigin/main[m[33m)[m
Author: mRodneyMo <motokads@gmail.com>
Date:   Tue May 20 23:54:32 2025 +0300

    currency and sizes

[1mdiff --git a/.history/client/src/components/admin/PropertyFormNew_20250520234725.tsx b/.history/client/src/components/admin/PropertyFormNew_20250520234725.tsx[m
[1mnew file mode 100644[m
[1mindex 0000000..5c4ab75[m
[1m--- /dev/null[m
[1m+++ b/.history/client/src/components/admin/PropertyFormNew_20250520234725.tsx[m
[36m@@ -0,0 +1,1542 @@[m
[32m+[m[32mimport { useState, useRef, useEffect } from 'react';[m
[32m+[m[32mimport { useQuery } from '@tanstack/react-query';[m
[32m+[m[32mimport { apiRequest, queryClient } from '@/lib/queryClient';[m
[32m+[m[32mimport { Property, insertPropertySchema, PropertyType, Amenity } from '@shared/schema';[m
[32m+[m[32mimport { useToast } from '@/hooks/use-toast';[m
[32m+[m[32mimport {[m
[32m+[m[32m  Form,[m
[32m+[m[32m  FormControl,[m
[32m+[m[32m  FormDescription,[m
[32m+[m[32m  FormField,[m
[32m+[m[32m  FormItem,[m
[32m+[m[32m  FormLabel,[m
[32m+[m[32m  FormMessage,[m
[32m+[m[32m} from '@/components/ui/form';[m
[32m+[m[32mimport {[m
[32m+[m[32m  Select,[m
[32m+[m[32m  SelectContent,[m
[32m+[m[32m  SelectItem,[m
[32m+[m[32m  SelectTrigger,[m
[32m+[m[32m  SelectValue,[m
[32m+[m[32m} from '@/components/ui/select';[m
[32m+[m[32mimport { Input } from '@/components/ui/input';[m
[32m+[m[32mimport { Button } from '@/components/ui/button';[m
[32m+[m[32mimport { useForm } from 'react-hook-form';[m
[32m+[m[32mimport { zodResolver } from '@hookform/resolvers/zod';[m
[32m+[m[32mimport { z } from 'zod';[m
[32m+[m[32mimport { Switch } from '@/components/ui/switch';[m
[32m+[m[32mimport { Textarea } from '@/components/ui/textarea';[m
[32m+[m[32mimport {[m
[32m+[m[32m  Loader2,[m
[32m+[m[32m  Upload,[m
[32m+[m[32m  Check,[m
[32m+[m[32m  AlertCircle,[m
[32m+[m[32m  Home,[m
[32m+[m[32m  DollarSign,[m
[32m+[m[32m  Map,[m
[32m+[m[32m  Bed,[m
[32m+[m[32m  Bath,[m
[32m+[m[32m  SquareCode,[m
[32m+[m[32m  Eye,[m
[32m+[m[32m  Box,[m
[32m+[m[32m  FileSearch,[m
[32m+[m[32m  ChevronDown[m
[32m+[m[32m} from 'lucide-react';[m
[32m+[m
[32m+[m[32mimport {[m
[32m+[m[32m  Collapsible,[m
[32m+[m[32m  CollapsibleContent,[m
[32m+[m[32m  CollapsibleTrigger[m
[32m+[m[32m} from "@/components/ui/collapsible";[m
[32m+[m[32mimport { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';[m
[32m+[m[32mimport { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';[m
[32m+[m[32mimport { Checkbox } from '@/components/ui/checkbox';[m
[32m+[m
[32m+[m[32mimport { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';[m
[32m+[m
[32m+[m[32m// Extend the insertPropertySchema with additional validations[m
[32m+[m[32mconst propertyFormSchema = insertPropertySchema.extend({[m
[32m+[m[32m  title: z.string().min(3, "Title must be at least 3 characters"),[m
[32m+[m[32m  location: z.string().min(3, "Location is required"),[m
[32m+[m[32m  price: z.coerce.number().positive("Price must be positive"),[m
[32m+[m[32m  currency: z.string().default("UGX"),[m
[32m+[m[32m  description: z.string().min(20, "Description must be at least 20 characters"),[m
[32m+[m[32m  bedrooms: z.coerce.number().int().min(0, "Bedrooms must be a positive number"),[m
[32m+[m[32m  bathrooms: z.coerce.number().min(0, "Bathrooms must be a positive number"),[m
[32m+[m[32m  squareFeet: z.coerce.number().min(1, "Square feet must be positive"),[m
[32m+[m[32m  amenities: z.array(z.string()).optional(),[m
[32m+[m[32m  propertyType: z.string().min(1, "Property type is required"),[m
[32m+[m[32m  category: z.string().min(1, "Category is required"),[m
[32m+[m[32m  monthlyPrice: z.coerce.number().optional(),[m
[32m+[m[32m  ownerContactInfo: z.string().optional(),[m
[32m+[m[32m});[m
[32m+[m
[32m+[m[32mtype PropertyFormValues = z.infer<typeof propertyFormSchema>;[m
[32m+[m
[32m+[m[32minterface PropertyFormProps {[m
[32m+[m[32m  property?: Property;[m
[32m+[m[32m  onSuccess?: () => void;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32mexport default function PropertyForm({ property: initialProperty, onSuccess }: PropertyFormProps) {[m
[32m+[m[32m  // Use state to manage the property data so we can update it[m
[32m+[m[32m  const [property, setProperty] = useState<Property | undefined>(initialProperty);[m
[32m+[m[32m  const [isUploading, setIsUploading] = useState(false);[m
[32m+[m[32m  const [uploadSuccess, setUploadSuccess] = useState(false);[m
[32m+[m[32m  const [uploadError, setUploadError] = useState("");[m
[32m+[m[32m  const [imagePreview, setImagePreview] = useState<string | null>(property?.imageUrl || null);[m
[32m+[m[32m  const fileInputRef = useRef<HTMLInputElement>(null);[m
[32m+[m[32m  const { toast } = useToast();[m
[32m+[m
[32m+[m[32m  const { data: propertyTypes } = useQuery<PropertyType[]>({[m
[32m+[m[32m    queryKey: ['/api/property-types'],[m
[32m+[m[32m  });[m
[32m+[m
[32m+[m[32m  const { data: amenities } = useQuery<Amenity[]>({[m
[32m+[m[32m    queryKey: ['/api/amenities'],[m
[32m+[m[32m  });[m
[32m+[m
[32m+[m[32m  // Get default values from existing property or use empty defaults[m
[32m+[m[32m  const defaultValues: Partial<PropertyFormValues> = property ? {[m
[32m+[m[32m    ...property,[m
[32m+[m[32m    amenities: property.amenities || [],[m
[32m+[m[32m    monthlyPrice: property.monthlyPrice === null ? undefined : property.monthlyPrice,[m
[32m+[m[32m    ownerContactInfo: property.ownerContactInfo === null ? '' : property.ownerContactInfo,[m
[32m+[m[32m  } : {[m
[32m+[m[32m    title: '',[m
[32m+[m[32m    location: '',[m
[32m+[m[32m    price: 0,[m
[32m+[m[32m    currency: 'UGX',[m
[32m+[m[32m    description: '',[m
[32m+[m[32m    bedrooms: 0,[m
[32m+[m[32m    bathrooms: 0,[m
[32m+[m[32m    squareFeet: 0,[m
[32m+[m[32m    imageUrl: '',[m
[32m+[m[32m    rating: '0',[m
[32m+[m[32m    reviewCount: 0,[m
[32m+[m[32m    propertyType: '',[m
[32m+[m[32m    category: 'rental',[m
[32m+[m[32m    hasTour: false,[m
[32m+[m[32m    tourUrl: '',[m
[32m+[m[32m    isFeatured: false,[m
[32m+[m[32m    amenities: [],[m
[32m+[m[32m    monthlyPrice: undefined,[m
[32m+[m[32m    ownerContactInfo: '',[m
[32m+[m[32m  };[m
[32m+[m
[32m+[m[32m  const form = useForm<PropertyFormValues>({[m
[32m+[m[32m    resolver: zodResolver(propertyFormSchema),[m
[32m+[m[32m    defaultValues,[m
[32m+[m[32m  });[m
[32m+[m
[32m+[m[32mconst onSubmit = async (data: PropertyFormValues) => {[m
[32m+[m[32m  console.log('Save Property button submitted', data); // Log from onSubmit[m
[32m+[m[32m  // Coerce all numeric fields to numbers before sending to API[m
[32m+[m[32m  const propertyData = {[m
[32m+[m[32m    ...data,[m
[32m+[m[32m    price: Number(data.price),[m
[32m+[m[32m    bedrooms: Number(data.bedrooms),[m
[32m+[m[32m    bathrooms: Number(data.bathrooms),[m
[32m+[m[32m    squareMeters: Math.round(Number(data.squareFeet) * 0.093), // Convert square feet to square meters[m
[32m+[m[32m    monthlyPrice: data.monthlyPrice !== undefined ? Number(data.monthlyPrice) : undefined,[m
[32m+[m[32m    imageUrl: imagePreview || data.imageUrl,[m
[32m+[m[32m    // Add required fields that might be missing[m
[32m+[m[32m    rating: data.rating || '0',[m
[32m+[m[32m    reviewCount: Number(data.reviewCount) || 0,[m
[32m+[m[32m    hasTour: data.hasTour || false,[m
[32m+[m[32m    isFeatured: data.isFeatured || false,[m
[32m+[m[32m  };[m
[32m+[m
[32m+[m[32m  console.log('Prepared property data for API:', propertyData);[m
[32m+[m
[32m+[m
[32m+[m[32m  try {[m
[32m+[m[32m    let response: Response;[m
[32m+[m[32m    let newProperty: Property | undefined = property;[m
[32m+[m[32m    console.log('Property data:', propertyData);[m
[32m+[m
[32m+[m[32m    if (property) {[m
[32m+[m[32m      console.log('Updating existing property with ID:', property.id);[m
[32m+[m[32m      response = await apiRequest('PATCH', `/api/properties/${property.id}`, propertyData);[m
[32m+[m[32m    } else {[m
[32m+[m[32m      console.log('Creating new property with direct form submission');[m
[32m+[m
[32m+[m[32m      // Create a form and submit it directly (this approach works based on our tests)[m
[32m+[m[32m      const form = document.createElement('form');[m
[32m+[m[32m      form.method = 'POST';[m
[32m+[m[32m      form.action = '/api/properties/create';[m
[32m+[m
[32m+[m[32m      // Add all the necessary fields[m
[32m+[m[32m      const fields = {[m
[32m+[m[32m        title: data.title,[m
[32m+[m[32m        description: data.description,[m
[32m+[m[32m        location: data.location,[m
[32m+[m[32m        price: String(data.price),[m
[32m+[m[32m        bedrooms: String(data.bedrooms),[m
[32m+[m[32m        bathrooms: String(data.bathrooms),[m
[32m+[m[32m        squareMeters: String(data.squareFeet), // Map squareFeet to squareMeters for backend[m
[32m+[m[32m        imageUrl: imagePreview || data.imageUrl || '/uploads/images/default-property.jpg',[m
[32m+[m[32m        rating: data.rating || '0',[m
[32m+[m[32m        reviewCount: String(data.reviewCount || 0),[m
[32m+[m[32m        propertyType: data.propertyType || 'Apartment',[m
[32m+[m[32m        isAvailable: 'true',[m
[32m+[m[32m        isFeatured: String(data.isFeatured || false),[m
[32m+[m[32m        hasTour: String(data.hasTour || false),[m
[32m+[m[32m        category: data.category || 'for_sale',[m
[32m+[m[32m        currency: data.currency || 'UGX',[m
[32m+[m[32m        amenities: JSON.stringify(data.amenities || [])[m
[32m+[m[32m      };[m
[32m+[m
[32m+[m[32m      // Create input elements for each field[m
[32m+[m[32m      Object.entries(fields).forEach(([name, value]) => {[m
[32m+[m[32m        if (value !== undefined && value !== null) {[m
[32m+[m[32m          const input = document.createElement('input');[m
[32m+[m[32m          input.type = 'hidden';[m
[32m+[m[32m          input.name = name;[m
[32m+[m[32m          input.value = value;[m
[32m+[m[32m          form.appendChild(input);[m
[32m+[m[32m        }[m
[32m+[m[32m      });[m
[32m+[m
[32m+[m[32m      // Create a hidden iframe to submit the form to[m
[32m+[m[32m      const iframe = document.createElement('iframe');[m
[32m+[m[32m      iframe.name = 'property-submit-frame';[m
[32m+[m[32m      iframe.style.display = 'none';[m
[32m+[m[32m      document.body.appendChild(iframe);[m
[32m+[m
[32m+[m[32m      // Set up a promise to wait for the iframe to load[m
[32m+[m[32m      const formSubmitPromise = new Promise<Response>((resolve, reject) => {[m
[32m+[m[32m        iframe.onload = () => {[m
[32m+[m[32m          try {[m
[32m+[m[32m            // Try to get the response from the iframe[m
[32m+[m[32m            const iframeDocument = iframe.contentDocument || iframe.contentWindow?.document;[m
[32m+[m[32m            if (iframeDocument) {[m
[32m+[m[32m              const responseText = iframeDocument.body.innerText;[m
[32m+[m[32m              if (responseText) {[m
[32m+[m[32m                try {[m
[32m+[m[32m                  const responseData = JSON.parse(responseText);[m
[32m+[m[32m                  resolve({[m
[32m+[m[32m                    ok: true,[m
[32m+[m[32m                    status: 201,[m
[32m+[m[32m                    statusText: 'Created',[m
[32m+[m[32m                    json: () => Promise.resolve(responseData),[m
[32m+[m[32m                    text: () => Promise.resolve(responseText)[m
[32m+[m[32m                  } as Response);[m
[32m+[m[32m                } catch (e) {[m
[32m+[m[32m                  console.error('Failed to parse response:', responseText);[m
[32m+[m[32m                  reject(new Error('Failed to parse response'));[m
[32m+[m[32m                }[m
[32m+[m[32m              } else {[m
[32m+[m[32m                reject(new Error('Empty response'));[m
[32m+[m[32m              }[m
[32m+[m[32m            } else {[m
[32m+[m[32m              reject(new Error('Could not access iframe document'));[m
[32m+[m[32m            }[m
[32m+[m[32m          } catch (e) {[m
[32m+[m[32m            console.error('Error getting response from iframe:', e);[m
[32m+[m[32m            reject(e);[m
[32m+[m[32m          }[m
[32m+[m[32m        };[m
[32m+[m
[32m+[m[32m        iframe.onerror = (e) => {[m
[32m+[m[32m          console.error('Iframe error:', e);[m
[32m+[m[32m          reject(new Error('Form submission failed'));[m
[32m+[m[32m        };[m
[32m+[m[32m      });[m
[32m+[m
[32m+[m[32m      // Set the form to submit to the iframe[m
[32m+[m[32m      form.target = 'property-submit-frame';[m
[32m+[m
[32m+[m[32m      // Add the form to the document and submit it[m
[32m+[m[32m      document.body.appendChild(form);[m
[32m+[m[32m      form.submit();[m
[32m+[m
[32m+[m[32m      // Wait for the response[m
[32m+[m[32m      try {[m
[32m+[m[32m        response = await formSubmitPromise;[m
[32m+[m[32m        console.log('Property created successfully via form:', response);[m
[32m+[m
[32m+[m[32m        // Clean up[m
[32m+[m[32m        setTimeout(() => {[m
[32m+[m[32m          document.body.removeChild(form);[m
[32m+[m[32m          document.body.removeChild(iframe);[m
[32m+[m[32m        }, 1000);[m
[32m+[m[32m      } catch (error) {[m
[32m+[m[32m        console.error('Form submission error:', error);[m
[32m+[m
[32m+[m[32m        // Clean up[m
[32m+[m[32m        document.body.removeChild(form);[m
[32m+[m[32m        document.body.removeChild(iframe);[m
[32m+[m
[32m+[m[32m        throw error;[m
[32m+[m[32m      }[m
[32m+[m[32m    }[m
[32m+[m[32m    if (response.ok) {[m
[32m+[m[32m      if (!property) {[m
[32m+[m[32m        // Get the new property from the response[m
[32m+[m[32m        newProperty = await response.json();[m
[32m+[m[32m        // Update the form with the new property (including id)[m
[32m+[m[32m        if (newProperty) {[m
[32m+[m[32m          form.reset({[m
[32m+[m[32m            ...data,[m
[32m+[m[32m            ...newProperty,[m
[32m+[m[32m            amenities: newProperty.amenities || [],[m
[32m+[m[32m            monthlyPrice: newProperty.monthlyPrice === null ? undefined : newProperty.monthlyPrice,[m
[32m+[m[32m            ownerContactInfo: newProperty.ownerContactInfo === null ? '' : newProperty.ownerContactInfo,[m
[32m+[m[32m          });[m
[32m+[m[32m          setImagePreview(newProperty.imageUrl || null);[m
[32m+[m
[32m+[m[32m          // Update the property state with the new property data[m
[32m+[m[32m          // This will allow the tour tab to know the property is saved[m
[32m+[m[32m          setProperty(newProperty);[m
[32m+[m
[32m+[m[32m          // Automatically switch to the tour tab after saving[m
[32m+[m[32m          setLocalStorageItem('propertyFormTab', 'tour');[m
[32m+[m[32m          setTabValue('tour');[m
[32m+[m[32m        }[m
[32m+[m[32m      }[m
[32m+[m[32m      toast({[m
[32m+[m[32m        title: property ? "Property Updated" : "Property Created",[m
[32m+[m[32m        description: property ? "Property has been updated successfully" : "New property has been created",[m
[32m+[m[32m      });[m
[32m+[m[32m      // ...existing cache invalidation code...[m
[32m+[m[32m      if (property && onSuccess) {[m
[32m+[m[32m        onSuccess();[m
[32m+[m[32m      }[m
[32m+[m[32m    } else {[m
[32m+[m[32m      console.error('Response not OK:', response.