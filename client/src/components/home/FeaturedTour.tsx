import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import VirtualTour from "@/components/property/VirtualTour";
import BookingCalendarModal from "../property/BookingCalendarModal";
import SharePropertyModal from "../property/SharePropertyModal";
import { useQuery } from "@tanstack/react-query";
import type { Property, User } from "@shared/schema";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Phone, User as UserIcon, Building } from "lucide-react";

interface PropertyDescriptionProps {
  description: string;
}

function PropertyDescription({ description }: PropertyDescriptionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Split description into sentences using a simpler approach
  const sentences = description.split(/[.!?]+\s+/).filter(s => s.trim().length > 0);
  
  // Show first 2 sentences by default
  const previewSentences = sentences.slice(0, 2);
  const remainingSentences = sentences.slice(2);
  
  const hasMoreContent = remainingSentences.length > 0;
  // Reconstruct the preview text with proper punctuation
  const previewText = previewSentences.map((sentence, index) => {
    // Add back punctuation if it's missing
    if (index < previewSentences.length - 1 && !sentence.match(/[.!?]$/)) {
      return sentence + '.';
    }
    return sentence;
  }).join(' ');
  const fullText = description;
  
  return (
    <div className="text-gray-500">
      <p className="leading-relaxed">
        {isExpanded ? fullText : previewText}
        {!isExpanded && hasMoreContent && '...'}
      </p>
      {hasMoreContent && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-2 text-[#FF5A5F] hover:text-[#FF7478] font-medium text-sm transition-colors"
        >
          {isExpanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
}

export default function FeaturedTour() {
  // Get all properties and select the one with the most views (most popular)
  const { data: properties, isLoading, error } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  // Find the property with the highest view count (most viewed) or highest review count as fallback
  const featuredProperty = properties?.sort((a, b) => {
    // First try to sort by view count
    const aViews = a.viewCount || 0;
    const bViews = b.viewCount || 0;
    if (aViews !== bViews) {
      return bViews - aViews;
    }
    // If view counts are equal, sort by review count
    return (b.reviewCount || 0) - (a.reviewCount || 0);
  })[0];

  // Debug logging
  console.log('FeaturedTour - Properties loaded:', properties?.length || 0);
  console.log('FeaturedTour - Featured property:', featuredProperty);
  if (featuredProperty) {
    console.log('FeaturedTour - Property details:', {
      id: featuredProperty.id,
      title: featuredProperty.title,
      price: featuredProperty.price,
      currency: featuredProperty.currency,
      category: featuredProperty.category,
      viewCount: featuredProperty.viewCount,
      reviewCount: featuredProperty.reviewCount
    });
  }

  const { toast } = useToast();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [propertyOwner, setPropertyOwner] = useState<User | null>(null);

  // Fetch property owner details
  useEffect(() => {
    const fetchPropertyOwner = async () => {
      if (featuredProperty?.ownerId) {
        try {
          const response = await fetch(`/api/users/${featuredProperty.ownerId}`);
          if (response.ok) {
            const owner = await response.json();
            setPropertyOwner(owner);
          }
        } catch (error) {
          console.error("Error fetching property owner:", error);
        }
      }
    };

    fetchPropertyOwner();
  }, [featuredProperty?.ownerId]);

  if (isLoading) {
    return (
      <section id="featured" className="py-10 bg-gray-50 -mx-4 sm:-mx-6 lg:-mx-8">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold mb-6">Featured Virtual Tour</h2>
          <div className="h-[400px] bg-gray-200 animate-pulse rounded-xl"></div>
        </div>
      </section>
    );
  }

  if (error || !featuredProperty) {
    return (
      <section id="featured" className="py-10 bg-gray-50 -mx-4 sm:-mx-6 lg:-mx-8">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold mb-6">Featured Virtual Tour</h2>
          <div className="bg-white rounded-xl p-8 text-center">
            <p>Unable to load featured tour. Please try again later.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="featured" className="py-10 bg-gray-50 -mx-4 sm:-mx-6 lg:-mx-8">
      <div className="container mx-auto px-4">
        <h2 className="text-2xl md:text-3xl font-bold mb-6">Featured Virtual Tour</h2>
        <div className="bg-white rounded-xl overflow-hidden shadow-lg">
          <div className="lg:flex">
            <div className="lg:w-1/2">
              <div className="h-[400px] lg:h-[600px] tour-container bg-gray-200 relative">
                <VirtualTour
                  tourUrl={featuredProperty.tourUrl || "https://realevr.com/LA%20ROSE%20ROYAL%20APARTMENTS/"}
                  isFullscreen={isFullscreen}
                />

                <div className="absolute bottom-4 right-4 bg-white/80 backdrop-blur-sm rounded-lg p-2 shadow-lg">
                  <div className="flex space-x-3">
                    <button className="p-2 hover:bg-white rounded-full" title="Zoom in">
                      <i className="fas fa-plus"></i>
                    </button>
                    <button className="p-2 hover:bg-white rounded-full" title="Zoom out">
                      <i className="fas fa-minus"></i>
                    </button>
                    <button
                      className="p-2 hover:bg-white rounded-full"
                      title="Fullscreen"
                      onClick={() => setIsFullscreen(!isFullscreen)}
                    >
                      <i className={`fas fa-${isFullscreen ? 'compress' : 'expand'}`}></i>
                    </button>
                    <button className="p-2 hover:bg-white rounded-full" title="Floor plan">
                      <i className="fas fa-map"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:w-1/2 p-6 lg:p-8">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-2xl font-bold">{featuredProperty.title}</h3>
                  <p className="text-gray-500 mb-2">{featuredProperty.location}</p>
                  <div className="flex items-center mb-4">
                    <i className="fas fa-star text-[#FFB400]"></i>
                    <span className="ml-1 font-medium">{featuredProperty.rating}</span>
                    <span className="mx-1">·</span>
                    <span className="text-gray-500 underline">{featuredProperty.reviewCount} reviews</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    className="p-2 hover:bg-gray-100 rounded-full"
                    onClick={() => setIsShareModalOpen(true)}
                    title="Share this property"
                  >
                    <i className="fas fa-share-alt text-xl"></i>
                  </button>
                  <button
                    className={`p-2 hover:bg-gray-100 rounded-full ${isWishlisted ? 'bg-red-100' : ''}`}
                    title={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
                    onClick={() => {
                      setIsWishlisted((prev) => !prev);
                      toast({
                        title: isWishlisted ? "Removed from Wishlist" : "Added to Wishlist",
                        description: isWishlisted
                          ? `${featuredProperty.title} has been removed from your wishlist.`
                          : `${featuredProperty.title} has been added to your wishlist.`,
                        duration: 3000,
                      });
                    }}
                  >
                    <i className={`${isWishlisted ? 'fas text-[#FF5A5F]' : 'far'} fa-heart text-xl`}></i>
                  </button>
                </div>
              </div>

              {/* Tabs for property info */}
              <Tabs defaultValue="main" className="w-full mt-4">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="main">Details</TabsTrigger>
                  <TabsTrigger value="extra">Extra Info</TabsTrigger>
                </TabsList>
                <TabsContent value="main">
                  <div className="border-t border-b border-gray-200 py-6 my-6">
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <h4 className="font-semibold mb-1">Property Details</h4>
                        <ul className="space-y-2 text-gray-500">
                          <li className="flex items-center">
                            <i className="fas fa-bed w-6"></i>
                            <span>{featuredProperty.bedrooms} Bedrooms</span>
                          </li>
                          <li className="flex items-center">
                            <i className="fas fa-bath w-6"></i>
                            <span>{featuredProperty.bathrooms} Bathrooms</span>
                          </li>
                          <li className="flex items-center">
                            <i className="fas fa-vector-square w-6"></i>
                            <span>{featuredProperty.squareMeters} sq m</span>
                          </li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-semibold mb-1">Amenities</h4>
                        <ul className="space-y-2 text-gray-500">
                          {featuredProperty.amenities && Array.isArray(featuredProperty.amenities)
                           && featuredProperty.amenities.map((amenity, index) => (
                            <li key={index} className="flex items-center">
                              <i className={`fas fa-${
                                amenity.includes("Pool Access") ? "swimming-pool" :
                                amenity.includes("Fitness Center") ? "dumbbell" :
                                amenity.includes("Parking") ? "parking" : 
                                amenity.includes("Pet Friendly") ? "paw" : "check"
                              } w-6`}></i>
                              <span>{amenity}</span>
                            </li>
                          ))}
                          {(!featuredProperty.amenities || !Array.isArray(featuredProperty.amenities) || featuredProperty.amenities.length === 0) && (
                            <li className="text-gray-400 italic">No amenities listed</li>
                          )}
                        </ul>
                      </div>
                    </div>
                  </div>
                  <div className="mb-6">
                    <h4 className="font-semibold mb-2">About this property</h4>
                    <PropertyDescription description={featuredProperty.description} />
                  </div>
                </TabsContent>
                <TabsContent value="extra">
                  {/* Action buttons at the top of Extra Info tab */}
                  <div className="flex flex-wrap gap-3 mb-6">
                    <Button
                      variant="outline"
                      className="border-gray-800"
                      onClick={() => setIsBookingModalOpen(true)}
                    >
                      <i className="far fa-calendar-alt mr-2"></i>
                      Schedule Visit
                    </Button>
                    {/* <Button asChild className="bg-[#FF5A5F] hover:bg-[#FF7478]">
                      <a
                        href="tel:+256771891323"
                        className="flex items-center"
                      >
                        <i className="fas fa-phone mr-2"></i> Call Agent
                      </a>
                    </Button> */}

                  </div>

                  {/* Property Manager/Agent Contact Information */}
                  {propertyOwner && (
                    <div className="rounded-lg p-6 mb-6 border border-blue-100">
                      <h4 className="font-semibold mb-4 text-gray-800 flex items-center">
                        <UserIcon className="mr-2 h-5 w-5 text-blue-600" />
                        Property Contact
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <div className="flex items-center mb-3">
                            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mr-4">
                              <span className="text-lg font-bold text-blue-600">
                                {propertyOwner.fullName?.charAt(0)?.toUpperCase() || 'A'}
                              </span>
                            </div>
                            <div>
                              <h5 className="font-semibold text-gray-800">{propertyOwner.fullName}</h5>
                              <p className="text-blue-600 font-medium">
                                {propertyOwner.role === 'agent' ? 'Property Agent' : 'Property Manager'}
                              </p>
                            </div>
                          </div>
                          {propertyOwner.companyName && (
                            <div className="flex items-center mb-2">
                              <Building className="h-4 w-4 text-gray-500 mr-2" />
                              <span className="text-gray-700">{propertyOwner.companyName}</span>
                            </div>
                          )}
                        </div>
                        <div>
                          {propertyOwner.phoneNumber && (
                            <div className="flex items-center mb-3">
                              <Phone className="h-4 w-4 text-green-600 mr-2" />
                              <span className="text-green-700 font-medium">{propertyOwner.phoneNumber}</span>
                            </div>
                          )}
                          <div className="flex flex-col gap-2">
                            {propertyOwner.phoneNumber && (
                              <Button asChild size="sm" className="bg-green-600 hover:bg-green-700">
                                <a href={`tel:${propertyOwner.phoneNumber}`} className="flex items-center">
                                  <Phone className="mr-2 h-4 w-4" />
                                  Call Now
                                </a>
                              </Button>
                            )}
                            {propertyOwner.phoneNumber && (
                              <Button asChild size="sm" variant="outline" className="border-green-500 text-green-600 hover:bg-green-50">
                                <a
                                  href={`https://wa.me/${propertyOwner.phoneNumber.replace(/[^0-9]/g, '')}?text=Hello%2C%20I'm%20interested%20in%20the%20property%20${encodeURIComponent(featuredProperty?.title || '')}%20I%20saw%20on%20RealEVR%20Estates.%20Can%20you%20provide%20more%20details%3F`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center"
                                >
                                  <i className="fab fa-whatsapp mr-2"></i>
                                  WhatsApp
                                </a>
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="border-t border-b border-gray-200 py-6 my-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="font-semibold mb-3">Construction & Age</h4>
                        <ul className="space-y-2 text-gray-500">
                          {featuredProperty.yearOfConstruction && (
                            <li className="flex items-center">
                              <i className="fas fa-calendar w-6"></i>
                              <span>Built in {featuredProperty.yearOfConstruction}</span>
                            </li>
                          )}
                          {featuredProperty.buildingAge && (
                            <li className="flex items-center">
                              <i className="fas fa-clock w-6"></i>
                              <span>{featuredProperty.buildingAge} years old</span>
                            </li>
                          )}
                          {featuredProperty.propertyCondition && (
                            <li className="flex items-center">
                              <i className="fas fa-star w-6"></i>
                              <span>Condition: {featuredProperty.propertyCondition.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                            </li>
                          )}
                          {!featuredProperty.yearOfConstruction && !featuredProperty.buildingAge && !featuredProperty.propertyCondition && (
                            <li className="text-gray-400 italic">No construction details available</li>
                          )}
                        </ul>
                      </div>
                      {featuredProperty.category === 'bank_sales' && (
                        <div>
                          <h4 className="font-semibold mb-3">Auction Information</h4>
                          <ul className="space-y-2 text-gray-500">
                            {featuredProperty.auctionStart && (
                              <li className="flex items-center">
                                <i className="fas fa-play w-6"></i>
                                <span>Starts: {new Date(featuredProperty.auctionStart).toLocaleDateString()}</span>
                              </li>
                            )}
                            {featuredProperty.auctionEnd && (
                              <li className="flex items-center">
                                <i className="fas fa-stop w-6"></i>
                                <span>Ends: {new Date(featuredProperty.auctionEnd).toLocaleDateString()}</span>
                              </li>
                            )}
                            {featuredProperty.auctionStatus && (
                              <li className="flex items-center">
                                <i className="fas fa-gavel w-6"></i>
                                <span>Status: {featuredProperty.auctionStatus.replace(/\b\w/g, l => l.toUpperCase())}</span>
                              </li>
                            )}
                            {!featuredProperty.auctionStart && !featuredProperty.auctionEnd && !featuredProperty.auctionStatus && (
                              <li className="text-gray-400 italic">No auction details available</li>
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <div className="flex flex-col md:flex-row md:items-center justify-between">
                <div className="mb-4 md:mb-0">
                  <span className="text-2xl font-bold">
                    {featuredProperty.price != null ? featuredProperty.price.toLocaleString() : <span className="text-gray-400">N/A</span>} {featuredProperty.currency || 'UGX'}
                  </span>
                  {featuredProperty.category === 'rental_units' && (
                    <span className="text-gray-500"> / month</span>
                  )}
                  {(featuredProperty.category === 'furnished_houses' || featuredProperty.category === 'BnB') && (
                    <span className="text-gray-500"> / day</span>
                  )}
                  {(featuredProperty.category === 'for_sale' || featuredProperty.category === 'bank_sales') && (
                    <span className="text-gray-500"> / sale</span>
                  )}
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-3">
                    {/* <Button
                      variant="outline"
                      className="border-gray-800"
                      onClick={() => setIsBookingModalOpen(true)}
                    >
                      <i className="far fa-calendar-alt mr-2"></i>
                      Schedule Visit
                    </Button> */}
                    {/* <Button asChild className="bg-[#FF5A5F] hover:bg-[#FF7478]">
                      <a
                        href="tel:+256771891323"
                        className="flex items-center"
                      >
                        <i className="fas fa-phone mr-2"></i> Call Agent
                      </a>
                    </Button> */}
                  </div>
{/* 
                  <div className="flex flex-wrap gap-3">
                    <Button asChild variant="outline" className="border-gray-800 border-green-500 text-green-500 hover:bg-green-50">
                      <a
                        href="https://wa.me/256771891323?text=Hello%2C%20I'm%20interested%20in%20the%20property%20I%20saw%20on%20RealEVR%20Estates.%20Can%20you%20provide%20more%20details%3F"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center"
                      >
                        <i className="fab fa-whatsapp mr-2"></i> WhatsApp Agent 1
                      </a>
                    </Button>
                    <Button asChild variant="outline" className="border-gray-800 border-green-500 text-green-500 hover:bg-green-50">
                      <a
                        href="https://wa.me/256702742333?text=Hello%2C%20I'm%20interested%20in%20the%20property%20I%20saw%20on%20RealEVR%20Estates.%20Can%20you%20provide%20more%20details%3F"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center"
                      >
                        <i className="fab fa-whatsapp mr-2"></i> WhatsApp Agent 2
                      </a>
                    </Button>
                  </div> */}


                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <BookingCalendarModal
        isOpen={isBookingModalOpen}
        onClose={() => setIsBookingModalOpen(false)}
        propertyId={featuredProperty.id}
        propertyTitle={featuredProperty.title}
        propertyPrice={featuredProperty.price}
        propertyCurrency={featuredProperty.currency || "UGX"}
      />

      <SharePropertyModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        propertyId={featuredProperty.id}
        propertyTitle={featuredProperty.title}
      />
    </section>
  );
}
