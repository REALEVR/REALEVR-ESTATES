import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Property } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { Loader2, Upload, Check, AlertCircle, Globe, FileUp } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface VirtualTourFormValues {
  propertyId: number;
  tourUrl: string;
  tourProvider: string;
  isPublic: boolean;
  notes: string;
}

const tourFormSchema = z.object({
  propertyId: z.number().min(1, "Property selection is required"),
  tourUrl: z.string().optional(),
  tourProvider: z.string().min(1, "Provider is required"),
  isPublic: z.boolean().default(true),
  notes: z.string().optional(),
});

export default function VirtualTourManager() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [uploadMethod, setUploadMethod] = useState<'file' | 'url'>('file');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: properties, isLoading: propertiesLoading } = useQuery<Property[]>({
    queryKey: ['/api/properties'],
  });

  const form = useForm<VirtualTourFormValues>({
    resolver: zodResolver(tourFormSchema),
    defaultValues: {
      propertyId: 0,
      tourUrl: '',
      tourProvider: '3D Vista',
      isPublic: true,
      notes: '',
    },
  });

  const onSubmit = async (data: VirtualTourFormValues) => {
    if (uploadMethod === 'url') {
      try {
        // Update property with external tour URL
        const response = await apiRequest('PATCH', `/api/properties/${data.propertyId}`, {
          hasTour: true,
          tourUrl: data.tourUrl,
          tourProvider: data.tourProvider,
          isPublic: data.isPublic,
        });

        if (response.ok) {
          toast({
            title: "Success",
            description: "Virtual tour URL added successfully",
            variant: "default",
          });
          
          // Invalidate property cache to refresh data
          queryClient.invalidateQueries({ queryKey: ['/api/properties'] });
          queryClient.invalidateQueries({ queryKey: ['/api/properties', data.propertyId] });
          
          form.reset();
        } else {
          toast({
            title: "Error",
            description: "Failed to add virtual tour URL",
            variant: "destructive",
          });
        }
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to add virtual tour URL",
          variant: "destructive",
        });
      }
    }
  };

  const handleFileUpload = async () => {
    const fileInput = fileInputRef.current;
    const propertyId = form.getValues('propertyId');
    
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      toast({
        title: "Error",
        description: "Please select a tour zip file to upload",
        variant: "destructive",
      });
      return;
    }
    
    if (!propertyId || propertyId <= 0) {
      toast({
        title: "Error",
        description: "Please select a property for this tour",
        variant: "destructive",
      });
      return;
    }
    
    const tourZip = fileInput.files[0];
    
    // Check if file is a zip
    if (!tourZip.name.endsWith('.zip')) {
      toast({
        title: "Error",
        description: "Please upload a zip file containing your 3D Vista tour",
        variant: "destructive",
      });
      return;
    }
    
    // Check file size (max 100MB)
    if (tourZip.size > 100 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "Tour file is too large. Maximum allowed size is 100MB",
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
      formData.append('tourZip', tourZip);
      
      // Upload the tour zip file
      const response = await fetch(`/api/upload/virtual-tour/${propertyId}`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      const result = await response.json();
      
      if (response.ok && result.status === 'success') {
        setUploadSuccess(true);
        
        // Update form with the returned tour URL
        form.setValue('tourUrl', result.tourUrl);
        
        // Update the property in the UI
        if (result.property) {
          // Find and update the property in the list
          queryClient.invalidateQueries({ queryKey: ['/api/properties'] });
          queryClient.invalidateQueries({ queryKey: ['/api/properties', propertyId] });
        }
        
        toast({
          title: "Success",
          description: "Virtual tour uploaded and processed successfully",
          variant: "default",
        });
      } else {
        setUploadError(result.message || "Failed to upload virtual tour");
        
        toast({
          title: "Error",
          description: result.message || "Failed to upload virtual tour",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      setUploadError(error.message || "Failed to upload virtual tour");
      
      toast({
        title: "Error",
        description: "Failed to upload virtual tour: " + (error.message || "Unknown error"),
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handlePropertyChange = (value: string) => {
    const propertyId = parseInt(value);
    form.setValue('propertyId', propertyId);
    
    const property = properties?.find(p => p.id === propertyId) || null;
    setSelectedProperty(property);
  };

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Virtual Tour Manager</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Add Virtual Tour</CardTitle>
            <CardDescription>
              Upload 3D Vista virtual tours or link to external tour providers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-4 mb-6">
              <Button 
                variant={uploadMethod === 'file' ? "default" : "outline"} 
                onClick={() => setUploadMethod('file')}
              >
                <FileUp className="mr-2 h-4 w-4" />
                Upload Tour File
              </Button>
              <Button 
                variant={uploadMethod === 'url' ? "default" : "outline"} 
                onClick={() => setUploadMethod('url')}
              >
                <Globe className="mr-2 h-4 w-4" />
                External Tour URL
              </Button>
            </div>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="propertyId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Select Property</FormLabel>
                      <Select 
                        onValueChange={handlePropertyChange}
                        defaultValue={field.value.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a property" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {propertiesLoading ? (
                            <SelectItem value="loading" disabled>Loading properties...</SelectItem>
                          ) : (
                            properties?.map(property => (
                              <SelectItem key={property.id} value={property.id.toString()}>
                                {property.title} ({property.location})
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {uploadMethod === 'file' ? (
                  <div className="space-y-4">
                    <FormItem>
                      <FormLabel>Upload Virtual Tour (ZIP file)</FormLabel>
                      <FormDescription>
                        Upload a 3D Vista exported tour folder (ZIP file up to 100MB)
                      </FormDescription>
                      <div className="flex items-center space-x-2">
                        <Input
                          ref={fileInputRef}
                          type="file"
                          accept=".zip"
                          className="flex-1"
                        />
                        <Button 
                          type="button" 
                          onClick={handleFileUpload}
                          disabled={isUploading || !form.getValues('propertyId')}
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
                    </FormItem>
                    
                    {uploadSuccess && (
                      <Alert className="bg-green-50 border-green-300">
                        <Check className="h-4 w-4 text-green-500" />
                        <AlertTitle>Success!</AlertTitle>
                        <AlertDescription>
                          Virtual tour uploaded and processed successfully.
                        </AlertDescription>
                      </Alert>
                    )}
                    
                    {uploadError && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Upload Error</AlertTitle>
                        <AlertDescription>
                          {uploadError}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                ) : (
                  <FormField
                    control={form.control}
                    name="tourUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>External Tour URL</FormLabel>
                        <FormDescription>
                          Link to an external virtual tour (Matterport, etc.)
                        </FormDescription>
                        <FormControl>
                          <Input placeholder="https://..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                
                <FormField
                  control={form.control}
                  name="tourProvider"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tour Provider</FormLabel>
                      <Select 
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a provider" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="3D Vista">3D Vista</SelectItem>
                          <SelectItem value="Matterport">Matterport</SelectItem>
                          <SelectItem value="RealEVR">RealEVR</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="isPublic"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Public Visibility
                        </FormLabel>
                        <FormDescription>
                          Make this tour visible to the public
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Add any additional notes about this tour"
                          className="min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {uploadMethod === 'url' && (
                  <Button type="submit" className="w-full">
                    Add External Tour
                  </Button>
                )}
              </form>
            </Form>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Property Preview</CardTitle>
            <CardDescription>
              Selected property information
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedProperty ? (
              <div className="space-y-4">
                <div className="aspect-video rounded-lg overflow-hidden bg-gray-100">
                  {selectedProperty.imageUrl ? (
                    <img 
                      src={selectedProperty.imageUrl} 
                      alt={selectedProperty.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      No image available
                    </div>
                  )}
                </div>
                <h3 className="text-xl font-semibold">{selectedProperty.title}</h3>
                <p className="text-sm text-gray-500">{selectedProperty.location}</p>
                <div className="flex justify-between text-sm">
                  <span>Price: ${selectedProperty.price.toLocaleString()}</span>
                  <span>{selectedProperty.bedrooms} bd | {selectedProperty.bathrooms} ba</span>
                </div>
                
                {selectedProperty.hasTour && selectedProperty.tourUrl && (
                  <div className="pt-4 border-t">
                    <p className="text-sm font-semibold mb-2">Existing Virtual Tour:</p>
                    <a 
                      href={selectedProperty.tourUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-sm break-all"
                    >
                      {selectedProperty.tourUrl}
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center text-gray-500">
                Select a property to see preview
              </div>
            )}
          </CardContent>
          {selectedProperty && (
            <CardFooter className="flex justify-center">
              {selectedProperty.hasTour && selectedProperty.tourUrl ? (
                <Button variant="outline" asChild>
                  <a 
                    href={selectedProperty.tourUrl} 
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View Existing Tour
                  </a>
                </Button>
              ) : (
                <p className="text-sm text-amber-600">This property has no virtual tour yet</p>
              )}
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
}