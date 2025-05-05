import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Link } from 'wouter';
import { Property } from '@shared/schema';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Edit,
  Plus,
  Trash2,
  Box,  // Replacing Cube3d with Box
  Eye,
  Search,
  Building,
  Home,
  Hotel,
  Landmark,
  BadgePercent, // Using BadgePercent instead of Bank
  Check
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PropertyForm from '@/components/admin/PropertyFormNew';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';

export default function PropertyManager() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isAddPropertyOpen, setIsAddPropertyOpen] = useState(false);
  const [isEditPropertyOpen, setIsEditPropertyOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const { toast } = useToast();

  const { data: properties, isLoading } = useQuery<Property[]>({
    queryKey: ['/api/properties'],
  });

  const filteredProperties = properties?.filter(property => {
    // Filter by search query
    const matchesSearch = !searchQuery || 
      property.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      property.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      property.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Filter by selected category
    const matchesCategory = !selectedCategory || property.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const handleOpenEditDialog = (property: Property) => {
    setSelectedProperty(property);
    setIsEditPropertyOpen(true);
  };

  const handleDeleteProperty = async (propertyId: number) => {
    if (!confirm('Are you sure you want to delete this property? This action cannot be undone.')) {
      return;
    }
    
    try {
      const response = await apiRequest('DELETE', `/api/properties/${propertyId}`);
      
      if (response.ok) {
        toast({
          title: "Property Deleted",
          description: "The property has been successfully deleted",
        });
        
        // Refresh the properties list
        queryClient.invalidateQueries({ queryKey: ['/api/properties'] });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to delete property");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete property",
        variant: "destructive",
      });
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'rental':
        return <Building className="w-4 h-4 mr-1" />;
      case 'bnb':
        return <Hotel className="w-4 h-4 mr-1" />;
      case 'sale':
        return <Home className="w-4 h-4 mr-1" />;
      case 'bank-sale':
        return <BadgePercent className="w-4 h-4 mr-1" />;
      default:
        return <Landmark className="w-4 h-4 mr-1" />;
    }
  };

  const getCategoryBadge = (category: string) => {
    let variant = "outline";
    let label = "";
    
    switch (category) {
      case 'rental':
        variant = "secondary";
        label = "Rental Unit";
        break;
      case 'bnb':
        variant = "default";
        label = "BnB";
        break;
      case 'sale':
        variant = "outline";
        label = "For Sale";
        break;
      case 'bank-sale':
        variant = "destructive";
        label = "Bank Sale";
        break;
      default:
        label = category;
    }
    
    return (
      <Badge variant={variant as any} className="capitalize flex items-center">
        {getCategoryIcon(category)}
        {label}
      </Badge>
    );
  };

  const renderPropertyTable = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      );
    }

    if (!filteredProperties || filteredProperties.length === 0) {
      return (
        <div className="text-center py-8">
          <p className="text-gray-500">No properties found. Add a new property to get started.</p>
        </div>
      );
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Price (UGX)</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Virtual Tour</TableHead>
            <TableHead>Featured</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredProperties.map(property => (
            <TableRow key={property.id}>
              <TableCell className="font-medium">{property.title}</TableCell>
              <TableCell>{property.location}</TableCell>
              <TableCell>{property.price.toLocaleString()}</TableCell>
              <TableCell>{getCategoryBadge(property.category)}</TableCell>
              <TableCell>
                {property.hasTour ? (
                  <Badge variant="outline" className="bg-green-100 text-green-800 hover:bg-green-200">
                    <Check className="w-3 h-3 mr-1" />
                    Available
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-gray-500">
                    Not Available
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                {property.isFeatured ? (
                  <Badge variant="outline" className="bg-amber-100 text-amber-800 hover:bg-amber-200">
                    Featured
                  </Badge>
                ) : (
                  <span className="text-gray-500">-</span>
                )}
              </TableCell>
              <TableCell className="text-right space-x-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleOpenEditDialog(property)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                {property.hasTour ? (
                  <Button 
                    variant="outline" 
                    size="sm"
                    asChild
                  >
                    <a href={property.tourUrl || "#"} target="_blank" rel="noopener noreferrer">
                      <Eye className="h-4 w-4" />
                    </a>
                  </Button>
                ) : (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      // Set tab selection first, then open dialog
                      try {
                        if (typeof window !== 'undefined') {
                          window.localStorage.setItem('propertyFormTab', 'tour');
                        }
                      } catch (e) {
                        console.error('LocalStorage error:', e);
                      }
                      // Open the edit dialog after setting tab preference
                      handleOpenEditDialog(property);
                    }}
                  >
                    <Box className="h-4 w-4" />
                  </Button>
                )}
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => handleDeleteProperty(property.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Property Manager</h1>
      
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-6">
        <div className="flex items-center w-full md:w-auto">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
            <Input
              placeholder="Search properties..."
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center md:ml-auto w-full md:w-auto">
          <Button variant="outline" onClick={() => setSelectedCategory(null)} className={!selectedCategory ? 'bg-primary/10' : ''}>
            All Properties
          </Button>
          <Button variant="outline" onClick={() => setSelectedCategory('rental')} className={selectedCategory === 'rental' ? 'bg-primary/10' : ''}>
            <Building className="mr-2 h-4 w-4" />
            Rentals
          </Button>
          <Button variant="outline" onClick={() => setSelectedCategory('bnb')} className={selectedCategory === 'bnb' ? 'bg-primary/10' : ''}>
            <Hotel className="mr-2 h-4 w-4" />
            BnBs
          </Button>
          <Button variant="outline" onClick={() => setSelectedCategory('sale')} className={selectedCategory === 'sale' ? 'bg-primary/10' : ''}>
            <Home className="mr-2 h-4 w-4" />
            For Sale
          </Button>
          <Button variant="outline" onClick={() => setSelectedCategory('bank-sale')} className={selectedCategory === 'bank-sale' ? 'bg-primary/10' : ''}>
            <BadgePercent className="mr-2 h-4 w-4" />
            Bank Sales
          </Button>
          
          <Button onClick={() => setIsAddPropertyOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Property
          </Button>
        </div>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>All Properties</CardTitle>
          <CardDescription>
            Manage your property listings
          </CardDescription>
        </CardHeader>
        <CardContent>
          {renderPropertyTable()}
        </CardContent>
        <CardFooter className="flex justify-between">
          <p className="text-sm text-gray-500">
            {filteredProperties?.length || 0} properties found
          </p>
        </CardFooter>
      </Card>
      
      {/* Add Property Dialog */}
      <Dialog open={isAddPropertyOpen} onOpenChange={setIsAddPropertyOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Property</DialogTitle>
            <DialogDescription>
              Create a new property listing with all details
            </DialogDescription>
          </DialogHeader>
          <PropertyForm 
            onSuccess={() => {
              // Clear localStorage tab selection when done
              try {
                if (typeof window !== 'undefined') {
                  window.localStorage.removeItem('propertyFormTab');
                }
              } catch (e) {
                console.error('LocalStorage error:', e);
              }
              setIsAddPropertyOpen(false);
              queryClient.invalidateQueries({ queryKey: ['/api/properties'] });
            }} 
          />
        </DialogContent>
      </Dialog>
      
      {/* Edit Property Dialog */}
      <Dialog open={isEditPropertyOpen} onOpenChange={setIsEditPropertyOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Property</DialogTitle>
            <DialogDescription>
              Update the property details
            </DialogDescription>
          </DialogHeader>
          {selectedProperty && (
            <PropertyForm 
              property={selectedProperty}
              onSuccess={() => {
                // Clear localStorage tab selection when done
                try {
                  if (typeof window !== 'undefined') {
                    window.localStorage.removeItem('propertyFormTab');
                  }
                } catch (e) {
                  console.error('LocalStorage error:', e);
                }
                setIsEditPropertyOpen(false);
                setSelectedProperty(null);
                queryClient.invalidateQueries({ queryKey: ['/api/properties'] });
              }} 
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}