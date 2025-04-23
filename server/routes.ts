import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Get all properties
  app.get("/api/properties", async (req, res) => {
    try {
      const properties = await storage.getAllProperties();
      res.json(properties);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch properties" });
    }
  });
  
  // Get a specific property by ID
  app.get("/api/properties/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid property ID" });
      }
      
      const property = await storage.getProperty(id);
      if (!property) {
        return res.status(404).json({ message: "Property not found" });
      }
      
      res.json(property);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch property" });
    }
  });
  
  // Get featured properties
  app.get("/api/properties/featured", async (req, res) => {
    try {
      const featuredProperties = await storage.getFeaturedProperties();
      res.json(featuredProperties);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch featured properties" });
    }
  });
  
  // Search properties
  app.get("/api/properties/search", async (req, res) => {
    try {
      const query = req.query.q as string || "";
      const properties = await storage.searchProperties(query);
      res.json(properties);
    } catch (error) {
      res.status(500).json({ message: "Failed to search properties" });
    }
  });
  
  // Get all property types
  app.get("/api/property-types", async (req, res) => {
    try {
      const propertyTypes = await storage.getAllPropertyTypes();
      res.json(propertyTypes);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch property types" });
    }
  });
  
  // Get all amenities
  app.get("/api/amenities", async (req, res) => {
    try {
      const amenities = await storage.getAllAmenities();
      res.json(amenities);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch amenities" });
    }
  });
  
  // Filter properties
  app.post("/api/properties/filter", async (req, res) => {
    try {
      const filterSchema = z.object({
        propertyType: z.string().optional(),
        minPrice: z.number().optional(),
        maxPrice: z.number().optional(),
        bedrooms: z.number().optional(),
        bathrooms: z.number().optional(),
        amenities: z.array(z.string()).optional(),
        hasTour: z.boolean().optional()
      });
      
      const parseResult = filterSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid filter parameters" });
      }
      
      const filters = parseResult.data;
      
      // Apply filters to properties
      let properties = await storage.getAllProperties();
      
      if (filters.propertyType) {
        properties = properties.filter(p => p.propertyType === filters.propertyType);
      }
      
      if (filters.minPrice !== undefined) {
        properties = properties.filter(p => p.price >= filters.minPrice!);
      }
      
      if (filters.maxPrice !== undefined) {
        properties = properties.filter(p => p.price <= filters.maxPrice!);
      }
      
      if (filters.bedrooms !== undefined) {
        properties = properties.filter(p => p.bedrooms >= filters.bedrooms!);
      }
      
      if (filters.bathrooms !== undefined) {
        properties = properties.filter(p => p.bathrooms >= filters.bathrooms!);
      }
      
      if (filters.hasTour !== undefined) {
        properties = properties.filter(p => p.hasTour === filters.hasTour);
      }
      
      if (filters.amenities && filters.amenities.length > 0) {
        properties = properties.filter(p => 
          filters.amenities!.every(amenity => 
            p.amenities.includes(amenity)
          )
        );
      }
      
      res.json(properties);
    } catch (error) {
      res.status(500).json({ message: "Failed to filter properties" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
