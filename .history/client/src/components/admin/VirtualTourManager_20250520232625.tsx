import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Property } from '@shared/schema';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Box,  // Replacing Cube3d with Box
  Eye,
  Home,
  Loader2,
  Upload
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

interface VirtualTourFormValues {
  propertyId: number;
  tourUrl: string;
  tourProvider: string;
  isPublic: boolean;
  notes: string;
}

export default function VirtualTourManager() {
  const [property, setProperty] = useState<Property | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [tourPreviewUrl, setTourPreviewUrl] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [location, navigate] = useLocation();
  
  // Extract propertyId from URL search params
  const params = new URLSearchParams(window.location.search);
  const propertyId = params.get('propertyId') ? parseInt(params.get('propertyId')!) : null;
  
  // Fetch property details if propertyId is provided
  const { data: propertyData, isLoading: isLoadingProperty } = useQuery<Property>({
    queryKey: ['/api/properties', propertyId || 'none'],
    queryFn: async () => {
      if (!propertyId) return null as any;
      const res = await fetch(`/api/properties/${propertyId}`);
      if (!res.ok) throw new Error('Failed to fetch property');
      return res.json();
    },
    enabled: !!propertyId,
  });
  
  // Get all properties for selection dropdown
  const { data: properties, isLoading: isLoadingProperties } = useQuery<Property[]>({
    queryKey: ['/api/properties'],
  });
  
  // Update property state when data is loaded
  useEffect(() => {
    if (propertyData) {
      setProperty(propertyData);
      if (propertyData.tourUrl) {
        setTourPreviewUrl(propertyData.tourUrl);
      }
    }
  }, [propertyData]);
  
  const handlePropertySelect = (id: string) => {
    const selectedProperty = properties?.find(p => p.id === parseInt(id));
    if (selectedProperty) {
      setProperty(selectedProperty);
      navigate(`/admin/virtual-tours?propertyId=${id}`);
      
      if (selectedProperty.tourUrl) {
        setTourPreviewUrl(selectedProperty.tourUrl);
      } else {
        setTourPreviewUrl(null);
      }
    }
  };
  
  const handleTourUpload = async () => {
    if (!property) {
      toast({
        title: "Error",
        description: "Please select a property first",
        variant: "destructive",
      });
      return;
    }
    
    const fileInput = fileInputRef.current;
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      toast({
        title: "Error",
        description: "Please select a 3D Vista tour zip file to upload",
        variant: "destructive",
      });
      return;
    }
    
    const file = fileInput.files[0];
    
    // Check if file is a zip
    if (!file.name.endsWith('.zip')) {
      toast({
        title: "Error",
        description: "Please upload a ZIP file from 3D Vista",
        variant: "destructive",
      });
      return;
    }
    
    // Check file size (max 5GB)
    if (file.size > 5 * 1024 * 1024 * 1024) {
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
      formData.append('tourZip', file);
      
      // Upload the virtual tour zip
      const response = await fetch(`/api/upload/virtual-tour/${property.id}`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      const result = await response.json();
      
      if (response.ok && result.status === 'success') {
        setUploadSuccess(true);
        setTourPreviewUrl(result.tourUrl);
        
        toast({
          title: "Success",
          description: "Virtual tour uploaded and extracted successfully",
        });
        
        // Refresh the property data
        queryClient.invalidateQueries({ queryKey: ['/api/properties', property.id] });
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
  
  if (isLoadingProperties || (propertyId && isLoadingProperty)) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-8">
      {/* Breadcrumb navigation */}
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/admin/properties">
              <Home className="h-4 w-4 mr-2" />
              Properties
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/admin/virtual-tours">
              <Box className="h-4 w-4 mr-2" />
              Virtual Tours
            </BreadcrumbLink>
          </BreadcrumbItem>
          {property && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink>{property.title}</BreadcrumbLink>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>
      
      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Virtual Tour Manager</CardTitle>
            <CardDescription>
              Upload and manage 3D Vista virtual tours for your properties
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label htmlFor="property-select">Select Property</Label>
              <Select 
                value={property?.id?.toString() || ''} 
                onValueChange={handlePropertySelect}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a property" />
                </SelectTrigger>
                <SelectContent>
                  {properties?.map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>
                      {p.title} ({p.location})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {property && (
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
                      ref={fileInputRef}
                      type="file"
                      accept=".zip"
                      className="flex-1"
                    />
                    <Button 
                      type="button" 
                      onClick={handleTourUpload}
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
                    <Alert className="mt-4 bg-green-50 border-green-300">
                      <Check className="h-4 w-4 text-green-500" />
                      <AlertTitle>Success!</AlertTitle>
                      <AlertDescription>
                        Virtual tour uploaded and extracted successfully.
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  {uploadError && (
                    <Alert className="mt-4" variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Upload Error</AlertTitle>
                      <AlertDescription>
                        {uploadError}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
                
                {tourPreviewUrl && (
                  <div className="border rounded-lg p-4">
                    <h3 className="text-lg font-semibold mb-2">Virtual Tour Preview</h3>
                    <div className="space-y-4">
                      <div className="aspect-video bg-gray-100 rounded-md overflow-hidden">
                        <iframe 
                          src={tourPreviewUrl} 
                          className="w-full h-full"
                          title={`Virtual tour of ${property.title}`}
                          sandbox="allow-same-origin allow-scripts"
                        />
                      </div>
                      <div className="flex justify-between">
                        <Button variant="outline" onClick={() => window.open(tourPreviewUrl, '_blank')}>
                          <Eye className="mr-2 h-4 w-4" />
                          Open in New Tab
                        </Button>
                        <Button 
                          variant="default" 
                          onClick={() => {
                            navigate(`/admin/properties`);
                          }}
                        >
                          <ArrowLeft className="mr-2 h-4 w-4" />
                          Back to Properties
                        </Button>
                      </div>
                    </div>
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
      </div>
    </div>
  );
}
