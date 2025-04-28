import { 
  users, type User, type InsertUser,
  properties, type Property, type InsertProperty,
  amenities, type Amenity, type InsertAmenity,
  propertyTypes, type PropertyType, type InsertPropertyType
} from "@shared/schema";

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Property methods
  getAllProperties(): Promise<Property[]>;
  getProperty(id: number): Promise<Property | undefined>;
  getFeaturedProperties(): Promise<Property[]>;
  getPropertiesByCategory(category: string): Promise<Property[]>;
  searchProperties(query: string): Promise<Property[]>;
  filterProperties(filters: Partial<Property>): Promise<Property[]>;
  createProperty(property: InsertProperty): Promise<Property>;
  
  // Amenity methods
  getAllAmenities(): Promise<Amenity[]>;
  getAmenity(id: number): Promise<Amenity | undefined>;
  createAmenity(amenity: InsertAmenity): Promise<Amenity>;
  
  // Property type methods
  getAllPropertyTypes(): Promise<PropertyType[]>;
  getPropertyType(id: number): Promise<PropertyType | undefined>;
  createPropertyType(propertyType: InsertPropertyType): Promise<PropertyType>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private properties: Map<number, Property>;
  private amenities: Map<number, Amenity>;
  private propertyTypes: Map<number, PropertyType>;
  
  private userCurrentId: number;
  private propertyCurrentId: number;
  private amenityCurrentId: number;
  private propertyTypeCurrentId: number;

  constructor() {
    this.users = new Map();
    this.properties = new Map();
    this.amenities = new Map();
    this.propertyTypes = new Map();
    
    this.userCurrentId = 1;
    this.propertyCurrentId = 1;
    this.amenityCurrentId = 1;
    this.propertyTypeCurrentId = 1;
    
    // Initialize with sample data
    this.initializeSampleData();
  }
  
  private initializeSampleData() {
    // Property Types
    const propertyTypeData: InsertPropertyType[] = [
      { name: "Apartments", icon: "building" },
      { name: "Houses", icon: "home" },
      { name: "Luxury", icon: "hotel" },
      { name: "Urban", icon: "city" },
      { name: "Beachfront", icon: "water" },
      { name: "Mountain", icon: "mountain" },
      { name: "Modern", icon: "building" }
    ];
    
    propertyTypeData.forEach(type => this.createPropertyType(type));
    
    // Amenities
    const amenityData: InsertAmenity[] = [
      { name: "Pool Access", icon: "swimming-pool", description: "Properties with swimming pools" },
      { name: "Fitness Center", icon: "dumbbell", description: "On-site gyms & fitness facilities" },
      { name: "Pet Friendly", icon: "paw", description: "Accommodating for your pets" },
      { name: "High-Speed Internet", icon: "wifi", description: "Fast & reliable connectivity" }
    ];
    
    amenityData.forEach(amenity => this.createAmenity(amenity));
    
    // Properties
    const propertyData: InsertProperty[] = [
      {
        title: "La Rose Royal Apartments",
        location: "Nakasero, Kampala, Uganda",
        price: 1500,
        description: "Experience luxury living at La Rose Royal Apartments in the heart of Nakasero. This elegant property offers spacious interiors, high-end finishes, and breathtaking views of Kampala. The modern architectural design combines comfort with sophisticated style, perfect for those seeking an upscale lifestyle in Uganda's capital.",
        bedrooms: 3,
        bathrooms: 2,
        squareFeet: 1850,
        imageUrl: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=600&h=400&q=80",
        rating: "4.97",
        reviewCount: 243,
        propertyType: "Luxury",
        category: "rental_units",
        isFeatured: true,
        hasTour: true,
        tourUrl: "https://realevr.com/LA%20ROSE%20ROYAL%20APARTMENTS/",
        amenities: ["Pool Access", "Fitness Center", "24/7 Security", "Underground parking"]
      },
      {
        title: "Kololo Heights Loft",
        location: "Kololo, Kampala, Uganda",
        price: 1200,
        description: "Modern loft with open floor plan and stunning views of the Kololo district, close to diplomatic missions and upscale amenities.",
        bedrooms: 2,
        bathrooms: 2,
        squareFeet: 1200,
        imageUrl: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=600&h=400&q=80",
        rating: "4.9",
        reviewCount: 156,
        propertyType: "Apartments",
        category: "furnished_houses",
        isFeatured: false,
        hasTour: true,
        tourUrl: "",
        amenities: ["Fitness Center", "High-Speed Internet", "Backup Power", "Rooftop Terrace"]
      },
      {
        title: "Lake Victoria Skies",
        location: "Munyonyo, Kampala, Uganda",
        price: 3800,
        description: "Luxurious penthouse with panoramic views of Lake Victoria and the stunning Kampala skyline. Located in the exclusive Munyonyo district.",
        bedrooms: 3,
        bathrooms: 2.5,
        squareFeet: 1850,
        imageUrl: "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=600&h=400&q=80",
        rating: "4.7",
        reviewCount: 92,
        propertyType: "Luxury",
        category: "for_sale",
        isFeatured: false,
        hasTour: true,
        tourUrl: "",
        amenities: ["Pool Access", "Fitness Center", "Concierge", "Lake View", "24/7 Security"]
      },
      {
        title: "Muyenga Hill Estate",
        location: "Muyenga, Kampala, Uganda",
        price: 2200,
        description: "Spacious estate on Muyenga Hill with panoramic views of the city and Lake Victoria. Well-established neighborhood with excellent security.",
        bedrooms: 4,
        bathrooms: 3,
        squareFeet: 3000,
        imageUrl: "https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?auto=format&fit=crop&w=600&h=400&q=80",
        rating: "4.8",
        reviewCount: 115,
        propertyType: "House",
        category: "bank_sales",
        isFeatured: false,
        hasTour: true,
        tourUrl: "",
        amenities: ["Garden", "Backup Generator", "Security System", "Servant Quarters"]
      },
      {
        title: "Naguru Skies Apartment",
        location: "Naguru, Kampala, Uganda",
        price: 1400,
        description: "Contemporary high-rise apartment with floor-to-ceiling windows offering stunning views of Kampala. Smart home technology and modern conveniences.",
        bedrooms: 2,
        bathrooms: 1,
        squareFeet: 950,
        imageUrl: "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=600&h=400&q=80",
        rating: "4.6",
        reviewCount: 78,
        propertyType: "Apartment",
        category: "rental_units",
        isFeatured: true,
        hasTour: true,
        tourUrl: "",
        amenities: ["Smart Home", "CCTV", "Home Office", "Swimming Pool"]
      },
      {
        title: "Lake Victoria Villa",
        location: "Munyonyo, Kampala, Uganda",
        price: 4500,
        description: "Stunning lakefront property with private access to Lake Victoria. Enjoy breathtaking sunsets and a serene environment just minutes from Kampala's city center.",
        bedrooms: 5,
        bathrooms: 4,
        squareFeet: 4500,
        imageUrl: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=600&h=400&q=80",
        rating: "4.9",
        reviewCount: 203,
        propertyType: "Villa",
        category: "for_sale",
        isFeatured: true,
        hasTour: true,
        tourUrl: "",
        amenities: ["Pool Access", "Private Dock", "Home Theater", "Staff Quarters"]
      },
      {
        title: "Kampala Heights Residence",
        location: "Ntinda, Kampala, Uganda",
        price: 1950,
        description: "Modern apartment in the upscale Ntinda neighborhood with panoramic views of the city. Close to shopping malls and international schools.",
        bedrooms: 2,
        bathrooms: 2,
        squareFeet: 1400,
        imageUrl: "https://images.unsplash.com/photo-1554995207-c18c203602cb?auto=format&fit=crop&w=600&h=400&q=80",
        rating: "4.7",
        reviewCount: 132,
        propertyType: "Apartment",
        category: "bank_sales",
        isFeatured: false,
        hasTour: true,
        tourUrl: "",
        amenities: ["Fitness Center", "High-Speed Internet", "24/7 Security", "Playground"]
      },
      {
        title: "Makindye Artist Loft",
        location: "Makindye, Kampala, Uganda",
        price: 1650,
        description: "Creative loft space in the artistic Makindye neighborhood, perfect for artists and entrepreneurs. Features high ceilings, natural light, and a vibrant community.",
        bedrooms: 1,
        bathrooms: 1.5,
        squareFeet: 1100,
        imageUrl: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=600&h=400&q=80",
        rating: "4.8",
        reviewCount: 95,
        propertyType: "Loft",
        category: "rental_units",
        isFeatured: false,
        hasTour: true,
        tourUrl: "",
        amenities: ["High-Speed Internet", "Art Studio Space", "Backup Power", "Security"]
      },
      {
        title: "Bugolobi Colonial Residence",
        location: "Bugolobi, Kampala, Uganda",
        price: 3200,
        description: "Colonial-era residence fully restored with modern amenities while maintaining its historic charm. Located in the quiet suburb of Bugolobi.",
        bedrooms: 4,
        bathrooms: 3.5,
        squareFeet: 3800,
        imageUrl: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=600&h=400&q=80",
        rating: "4.5",
        reviewCount: 87,
        propertyType: "House",
        category: "furnished_houses",
        isFeatured: false,
        hasTour: true,
        tourUrl: "",
        amenities: ["Garden", "Office Space", "Water Tank", "Solar Power"]
      },
      // BANK SALES Properties - Organized by Bank as auctions
      // Stanbic Bank Auctions
      {
        title: "Lubowa Foreclosure Estate",
        location: "Lubowa, Kampala, Uganda",
        price: 170000,
        description: "Bank foreclosure property in the upscale Lubowa area. This estate offers excellent value with spacious rooms and premium location at a discounted price. Being auctioned by Stanbic Bank as part of their quarterly property portfolio liquidation.",
        bedrooms: 4,
        bathrooms: 3,
        squareFeet: 3200,
        imageUrl: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=600&h=400&q=80",
        rating: "4.2",
        reviewCount: 47,
        propertyType: "Houses",
        category: "bank_sales",
        isFeatured: true,
        hasTour: true,
        tourUrl: "",
        amenities: ["Garden", "Staff Quarters", "Electric Fence", "Parking Space"],
        bankName: "Stanbic Bank Uganda",
        auctionDate: "2025-06-15T10:00:00",
        startingBid: 150000,
        currentBid: 162000,
        bidIncrement: 5000,
        auctionStatus: "active"
      },
      {
        title: "Kira Modern Townhouse",
        location: "Kira, Kampala, Uganda",
        price: 120000,
        description: "Recently repossessed modern townhouse in the rapidly developing Kira area. Excellent amenities and perfect for family living. Being auctioned by Stanbic Bank with no reserve price.",
        bedrooms: 3,
        bathrooms: 2.5,
        squareFeet: 2200,
        imageUrl: "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=600&h=400&q=80",
        rating: "4.1",
        reviewCount: 38,
        propertyType: "Houses",
        category: "bank_sales",
        isFeatured: false,
        hasTour: true,
        tourUrl: "",
        amenities: ["Kids Playground", "Security", "Backup Generator", "Parking Space"],
        bankName: "Stanbic Bank Uganda",
        auctionDate: "2025-06-15T14:00:00",
        startingBid: 100000,
        currentBid: 108000,
        bidIncrement: 2000,
        auctionStatus: "active"
      },
      
      // Centenary Bank Auctions
      {
        title: "Entebbe Road Commercial Building",
        location: "Entebbe Road, Kampala, Uganda",
        price: 350000,
        description: "Bank-owned commercial building on prime Entebbe Road location. Perfect for business headquarters or retail space with high visibility and foot traffic. Centenary Bank is auctioning this property as part of their commercial asset liquidation program.",
        bedrooms: 0,
        bathrooms: 4,
        squareFeet: 5000,
        imageUrl: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=600&h=400&q=80",
        rating: "4.0",
        reviewCount: 31,
        propertyType: "Urban",
        category: "bank_sales",
        isFeatured: false,
        hasTour: true,
        tourUrl: "",
        amenities: ["High-Speed Internet", "Backup Generator", "Security System", "Parking Lot"],
        bankName: "Centenary Bank",
        auctionDate: "2025-05-28T09:00:00",
        startingBid: 300000,
        currentBid: 325000,
        bidIncrement: 10000,
        auctionStatus: "active"
      },
      {
        title: "Nakasero Office Complex",
        location: "Nakasero, Kampala, Uganda",
        price: 420000,
        description: "Prime office complex in the heart of Kampala's business district. Recently refurbished with modern amenities and infrastructure. Being auctioned by Centenary Bank following loan default by previous owners.",
        bedrooms: 0,
        bathrooms: 6,
        squareFeet: 6500,
        imageUrl: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=600&h=400&q=80",
        rating: "4.3",
        reviewCount: 27,
        propertyType: "Urban",
        category: "bank_sales",
        isFeatured: true,
        hasTour: true,
        tourUrl: "",
        amenities: ["Conference Rooms", "Parking Garage", "Security System", "Fire Suppression"],
        bankName: "Centenary Bank",
        auctionDate: "2025-05-28T11:30:00",
        startingBid: 380000,
        currentBid: 395000,
        bidIncrement: 15000,
        auctionStatus: "active"
      },
      
      // DFCU Bank Auctions
      {
        title: "Buziga Hill Mansion",
        location: "Buziga, Kampala, Uganda",
        price: 280000,
        description: "Repossessed luxury mansion in Buziga Hill with stunning lake views. This property represents excellent value with its premium features at a significantly reduced price. Part of DFCU Bank's exclusive luxury property auction.",
        bedrooms: 5,
        bathrooms: 4.5,
        squareFeet: 4800,
        imageUrl: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=600&h=400&q=80",
        rating: "4.6",
        reviewCount: 52,
        propertyType: "Luxury",
        category: "bank_sales",
        isFeatured: true,
        hasTour: true,
        tourUrl: "",
        amenities: ["Pool Access", "Home Theater", "Wine Cellar", "Outdoor Kitchen"],
        bankName: "DFCU Bank",
        auctionDate: "2025-07-10T10:00:00",
        startingBid: 250000,
        currentBid: 265000,
        bidIncrement: 10000,
        auctionStatus: "active"
      },
      {
        title: "Kololo Heritage Estate",
        location: "Kololo, Kampala, Uganda",
        price: 390000,
        description: "Historic colonial-era estate in Kampala's most prestigious neighborhood. Recently renovated with modern amenities while preserving its architectural heritage. DFCU Bank is auctioning this rare property opportunity.",
        bedrooms: 6,
        bathrooms: 5,
        squareFeet: 5200,
        imageUrl: "https://images.unsplash.com/photo-1572120360610-d971b9d7767c?auto=format&fit=crop&w=600&h=400&q=80",
        rating: "4.8",
        reviewCount: 64,
        propertyType: "Luxury",
        category: "bank_sales",
        isFeatured: false,
        hasTour: true,
        tourUrl: "",
        amenities: ["Tennis Court", "Swimming Pool", "Staff Quarters", "Garden"],
        bankName: "DFCU Bank",
        auctionDate: "2025-07-10T14:00:00",
        startingBid: 350000,
        currentBid: 370000,
        bidIncrement: 10000,
        auctionStatus: "active"
      },
      
      // More FURNISHED HOUSES Category
      {
        title: "Naguru Designer House",
        location: "Naguru, Kampala, Uganda",
        price: 2500,
        description: "Fully furnished designer house with contemporary art pieces and custom furniture. Perfect for expatriates or those wanting a turnkey living solution.",
        bedrooms: 3,
        bathrooms: 2.5,
        squareFeet: 2400,
        imageUrl: "https://images.unsplash.com/photo-1554995207-c18c203602cb?auto=format&fit=crop&w=600&h=400&q=80",
        rating: "4.9",
        reviewCount: 76,
        propertyType: "Houses",
        category: "furnished_houses",
        isFeatured: true,
        hasTour: true,
        tourUrl: "",
        amenities: ["High-Speed Internet", "Home Office", "Smart Home", "Garden"]
      },
      {
        title: "Mbuya Family BnB",
        location: "Mbuya, Kampala, Uganda",
        price: 1800,
        description: "Beautifully furnished family home ready for immediate occupancy. Tastefully decorated with a mix of contemporary and traditional Ugandan design elements.",
        bedrooms: 4,
        bathrooms: 3,
        squareFeet: 2800,
        imageUrl: "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=600&h=400&q=80",
        rating: "4.7",
        reviewCount: 89,
        propertyType: "Houses",
        category: "furnished_houses",
        isFeatured: false,
        hasTour: true,
        tourUrl: "",
        amenities: ["Kitchen", "Outdoor Dining", "Entertainment System", "Children's Play Area"]
      },
      {
        title: "Kololo Executive Apartment",
        location: "Kololo, Kampala, Uganda",
        price: 2200,
        description: "Luxurious fully furnished executive apartment in the heart of diplomatic district. Premium furnishings and amenities with hotel-like services.",
        bedrooms: 2,
        bathrooms: 2,
        squareFeet: 1400,
        imageUrl: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=600&h=400&q=80",
        rating: "4.8",
        reviewCount: 102,
        propertyType: "Apartments",
        category: "furnished_houses",
        isFeatured: true,
        hasTour: true,
        tourUrl: "",
        amenities: ["Concierge", "Housekeeping", "Fitness Center", "Business Center"]
      },
      
      // More FOR SALE Category
      {
        title: "Kira Modern Family Home",
        location: "Kira, Kampala, Uganda",
        price: 320000,
        description: "Brand new family home in the rapidly developing Kira neighborhood. Modern design with high ceilings, open floor plan and quality finishes.",
        bedrooms: 4,
        bathrooms: 3.5,
        squareFeet: 3600,
        imageUrl: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=600&h=400&q=80",
        rating: "4.7",
        reviewCount: 34,
        propertyType: "Houses",
        category: "for_sale",
        isFeatured: false,
        hasTour: true,
        tourUrl: "",
        amenities: ["Garden", "Solar Power", "Water Tank", "Double Garage"]
      },
      {
        title: "Kampala Tower Penthouse",
        location: "Central Business District, Kampala, Uganda",
        price: 550000,
        description: "Prestigious penthouse in Kampala's premier high-rise building. Offering unparalleled views and luxury amenities in Uganda's most exclusive address.",
        bedrooms: 3,
        bathrooms: 3.5,
        squareFeet: 2800,
        imageUrl: "https://images.unsplash.com/photo-1502672023488-70e25813eb80?auto=format&fit=crop&w=600&h=400&q=80",
        rating: "5.0",
        reviewCount: 27,
        propertyType: "Luxury",
        category: "for_sale",
        isFeatured: true,
        hasTour: true,
        tourUrl: "",
        amenities: ["Private Elevator", "Sky Lounge", "Helicopter Access", "Concierge"]
      }
    ];
    
    propertyData.forEach(property => this.createProperty(property));
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userCurrentId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }
  
  // Property methods
  async getAllProperties(): Promise<Property[]> {
    return Array.from(this.properties.values());
  }
  
  async getProperty(id: number): Promise<Property | undefined> {
    return this.properties.get(id);
  }
  
  async getFeaturedProperties(): Promise<Property[]> {
    // Get all featured properties
    const allFeatured = Array.from(this.properties.values()).filter(property => property.isFeatured);
    
    // Main showcase properties - one from each category
    const mainShowcaseProperties = [];
    
    // Find one featured property from each category
    const categories = ["rental_units", "furnished_houses", "for_sale", "bank_sales"];
    
    for (const category of categories) {
      const propertyForCategory = allFeatured.find(property => property.category === category);
      if (propertyForCategory) {
        mainShowcaseProperties.push(propertyForCategory);
      }
    }
    
    // If we didn't get 4 properties (one per category), add more from other categories to reach 4
    if (mainShowcaseProperties.length < 4) {
      const remainingFeatured = allFeatured.filter(
        property => !mainShowcaseProperties.some(p => p.id === property.id)
      );
      
      mainShowcaseProperties.push(
        ...remainingFeatured.slice(0, 4 - mainShowcaseProperties.length)
      );
    }
    
    // Return exactly 4 properties or less if there aren't enough featured ones
    return mainShowcaseProperties.slice(0, 4);
  }

  async getPropertiesByCategory(category: string): Promise<Property[]> {
    return Array.from(this.properties.values()).filter(property => property.category === category);
  }
  
  async searchProperties(query: string): Promise<Property[]> {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.properties.values()).filter(property => 
      property.title.toLowerCase().includes(lowerQuery) || 
      property.location.toLowerCase().includes(lowerQuery) ||
      property.propertyType.toLowerCase().includes(lowerQuery)
    );
  }
  
  async filterProperties(filters: Partial<Property>): Promise<Property[]> {
    return Array.from(this.properties.values()).filter(property => {
      for (const [key, value] of Object.entries(filters)) {
        if (key === 'amenities' && Array.isArray(value)) {
          if (!property.amenities || !value.every(v => property.amenities!.includes(v))) {
            return false;
          }
        } else if (property[key as keyof Property] !== value) {
          return false;
        }
      }
      return true;
    });
  }
  
  async createProperty(insertProperty: InsertProperty): Promise<Property> {
    const id = this.propertyCurrentId++;
    const property: Property = { ...insertProperty, id };
    this.properties.set(id, property);
    return property;
  }
  
  // Amenity methods
  async getAllAmenities(): Promise<Amenity[]> {
    return Array.from(this.amenities.values());
  }
  
  async getAmenity(id: number): Promise<Amenity | undefined> {
    return this.amenities.get(id);
  }
  
  async createAmenity(insertAmenity: InsertAmenity): Promise<Amenity> {
    const id = this.amenityCurrentId++;
    const amenity: Amenity = { ...insertAmenity, id };
    this.amenities.set(id, amenity);
    return amenity;
  }
  
  // Property type methods
  async getAllPropertyTypes(): Promise<PropertyType[]> {
    return Array.from(this.propertyTypes.values());
  }
  
  async getPropertyType(id: number): Promise<PropertyType | undefined> {
    return this.propertyTypes.get(id);
  }
  
  async createPropertyType(insertPropertyType: InsertPropertyType): Promise<PropertyType> {
    const id = this.propertyTypeCurrentId++;
    const propertyType: PropertyType = { ...insertPropertyType, id };
    this.propertyTypes.set(id, propertyType);
    return propertyType;
  }
}

export const storage = new MemStorage();
