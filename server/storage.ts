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
    return Array.from(this.properties.values()).filter(property => property.isFeatured);
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
