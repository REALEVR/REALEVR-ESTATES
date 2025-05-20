import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format, isPast, parseISO } from "date-fns";
import { Property } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CalendarIcon, Clock, MapPin, Home, BedDouble, Bath, Maximize } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function BankSalesPage() {
  const [activeBankTab, setActiveBankTab] = useState<string>("all");
  const { toast } = useToast();
  
  // Get all bank sales properties
  const { data: allProperties, isLoading, error } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });
  
  // Filter for only bank sales properties
  const bankSalesProperties = allProperties?.filter(property => 
    property.category === "bank_sales"
  ) || [];
  
  // Get unique bank names
  const banks = Array.from(new Set(bankSalesProperties.map(prop => prop.bankName || "")
    .filter(bank => bank !== ""))); // Filter out empty banks and convert to string array
  
  // Group properties by bank name
  const propertiesByBank = bankSalesProperties.reduce((acc, property) => {
    if (property.bankName) {
      if (!acc[property.bankName]) {
        acc[property.bankName] = [];
      }
      acc[property.bankName].push(property);
    }
    return acc;
  }, {} as Record<string, Property[]>);

  // Handle placing a bid
  const handlePlaceBid = (property: Property) => {
    if (!property.currentBid || !property.bidIncrement) {
      return;
    }
    
    const newBid = property.currentBid + property.bidIncrement;
    
    toast({
      title: "Bid Placed",
      description: `Your bid of UGX ${newBid.toLocaleString()} has been placed for ${property.title}`,
    });
  };
  
  // Format auction status including time remaining
  const formatAuctionStatus = (property: Property) => {
    if (!property.auctionDate || !property.auctionStatus) {
      return "No auction scheduled";
    }
    
    const auctionDate = parseISO(property.auctionDate);
    const isAuctionPast = isPast(auctionDate);
    
    if (isAuctionPast) {
      return property.auctionStatus === "active" ? "Auction in progress" : "Auction ended";
    }
    
    return `Auction on ${format(auctionDate, "MMM dd, yyyy 'at' h:mm a")}`;
  };
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Bank Property Auctions</h1>
        <p className="text-gray-600 max-w-3xl">
          Browse bank-owned properties available at auction. These properties represent excellent value and 
          investment opportunities. Participate in auctions held by Uganda's leading banks.
        </p>
      </div>
      
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[...Array(8)].map((_, index) => (
            <div key={index} className="animate-pulse bg-white rounded-xl shadow-md overflow-hidden">
              <div className="h-48 bg-gray-300"></div>
              <div className="p-4">
                <div className="h-6 bg-gray-300 rounded mb-2"></div>
                <div className="h-4 bg-gray-300 rounded w-2/3 mb-4"></div>
                <div className="h-4 bg-gray-300 rounded mb-2"></div>
                <div className="h-10 bg-gray-300 rounded mt-4"></div>
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="p-8 text-center">
          <p className="text-red-500">Error loading properties. Please try again later.</p>
        </div>
      ) : (
        <Tabs defaultValue="all" onValueChange={setActiveBankTab}>
          <TabsList className="mb-6 flex overflow-x-auto space-x-1 pb-1">
            <TabsTrigger value="all" className="px-4 py-2">All Banks</TabsTrigger>
            {banks.map(bank => (
              <TabsTrigger key={bank} value={bank} className="px-4 py-2 whitespace-nowrap">
                {bank}
              </TabsTrigger>
            ))}
          </TabsList>
          
          <TabsContent value="all">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {bankSalesProperties.map(property => (
                <AuctionPropertyCard 
                  key={property.id} 
                  property={property} 
                  onPlaceBid={handlePlaceBid} 
                />
              ))}
            </div>
          </TabsContent>
          
          {banks.map(bank => (
            <TabsContent key={bank} value={bank}>
              <div className="mb-6">
                <h2 className="text-2xl font-bold mb-2">{bank} Auctions</h2>
                <p className="text-gray-600">
                  Properties being auctioned by {bank}. Each property has its own auction schedule and bidding requirements.
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {propertiesByBank[bank]?.map(property => (
                  <AuctionPropertyCard 
                    key={property.id} 
                    property={property} 
                    onPlaceBid={handlePlaceBid} 
                  />
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}

interface AuctionPropertyCardProps {
  property: Property;
  onPlaceBid: (property: Property) => void;
}

function AuctionPropertyCard({ property, onPlaceBid }: AuctionPropertyCardProps) {
  const auctionDate = property.auctionDate ? parseISO(property.auctionDate) : null;
  const isAuctionActive = auctionDate && !isPast(auctionDate) && property.auctionStatus === "active";
  const isAuctionUpcoming = auctionDate && !isPast(auctionDate);
  const isAuctionEnded = auctionDate && isPast(auctionDate) && property.auctionStatus !== "active";

  return (
    <Card className="overflow-hidden transition-all hover:shadow-lg">
      <div className="relative h-48 overflow-hidden">
        <img 
          src={property.imageUrl} 
          alt={property.title}
          className="w-full h-full object-cover transition-transform hover:scale-105"
        />
        <Badge className="absolute top-3 left-3 bg-black/70 text-white">
          {property.propertyType}
        </Badge>
        
        {isAuctionActive && (
          <Badge className="absolute bottom-3 right-3 bg-green-600 text-white">
            Bidding Open
          </Badge>
        )}
        
        {isAuctionUpcoming && (
          <Badge className="absolute bottom-3 right-3 bg-blue-600 text-white">
            Upcoming Auction
          </Badge>
        )}
        
        {isAuctionEnded && (
          <Badge className="absolute bottom-3 right-3 bg-red-600 text-white">
            Auction Ended
          </Badge>
        )}
      </div>
      
      <CardHeader className="pb-2">
        <CardTitle className="text-xl font-bold line-clamp-1">{property.title}</CardTitle>
        <CardDescription className="flex items-center text-sm">
          <MapPin className="h-4 w-4 mr-1 text-gray-500" />
          {property.location}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="pb-3">
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="flex flex-col items-center p-2 bg-gray-50 rounded-md">
            <BedDouble className="h-4 w-4 text-gray-500 mb-1" />
            <span className="text-sm">{property.bedrooms} {property.bedrooms === 1 ? 'Bed' : 'Beds'}</span>
          </div>
          <div className="flex flex-col items-center p-2 bg-gray-50 rounded-md">
            <Bath className="h-4 w-4 text-gray-500 mb-1" />
            <span className="text-sm">{property.bathrooms} {property.bathrooms === 1 ? 'Bath' : 'Baths'}</span>
          </div>
          <div className="flex flex-col items-center p-2 bg-gray-50 rounded-md">
            <Maximize className="h-4 w-4 text-gray-500 mb-1" />
            <span className="text-sm">{property.squareFeet} sqft</span>
          </div>
        </div>
        
        <div className="mt-3 space-y-2">
          <div className="flex items-center text-sm text-gray-600">
            <Home className="h-4 w-4 mr-2 text-gray-500" />
            <span>Bank: {property.bankName}</span>
          </div>
          <div className="flex items-center text-sm text-gray-600">
            <CalendarIcon className="h-4 w-4 mr-2 text-gray-500" />
            <span>
              {property.auctionDate ? format(parseISO(property.auctionDate), "MMM dd, yyyy 'at' h:mm a") : "TBA"}
            </span>
          </div>
        </div>
        
        <div className="mt-4 p-3 bg-gray-50 rounded-md">
          <div className="flex justify-between mb-2">
            <div className="text-sm text-gray-600">Starting Bid</div>
            <div className="font-semibold">UGX {property.startingBid?.toLocaleString()}</div>
          </div>
          <div className="flex justify-between">
            <div className="text-sm text-gray-600">Current Bid</div>
            <div className="font-bold text-green-600">UGX {property.currentBid?.toLocaleString()}</div>
          </div>
        </div>
      </CardContent>
      
      <CardFooter className="pt-0 flex justify-between">
        <Link href={`/property/${property.id}`}>
          <Button variant="outline" size="sm">View Details</Button>
        </Link>
        <Button 
          onClick={() => onPlaceBid(property)} 
          disabled={!isAuctionActive}
          className="bg-amber-600 hover:bg-amber-700 text-white"
          size="sm"
        >
          Place Bid
        </Button>
      </CardFooter>
    </Card>
  );
}