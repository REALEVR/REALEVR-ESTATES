import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { z } from "zod";
import fetch from "node-fetch";
import path from "path";
import {sseTourProgress} from './upload';

import fs from "fs";
import { createTablesIfNotExist, DynamoDBUtils, TABLES, toNumericId } from "./dynamodb";

import {
  uploadPropertyImage,
  uploadVirtualTour,
  handleUploadErrors,
  extractTourZip,
  setupStaticFileRoutes,
} from "./upload";

// Middleware to check if user is an admin or property manager
const adminMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const user = req.user;
  if (!user.role || (user.role !== "admin" && user.role !== "agent")) {
    return res.status(403).json({ message: "Unauthorized. Admin or agent role required." });
  }

  next();
};

// Middleware to check if user has active subscription (for agents)
const subscriptionMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const user = req.user;
  
  // Allow admins to access everything
  if (user.role === "admin") {
    return next();
  }

  // For agents, check subscription status
  if (user.role === "agent") {
    if (user.subscriptionStatus !== "active") {
      return res.status(403).json({ 
        message: "Subscription required. Please renew your agent subscription to access this feature." 
      });
    }

    // Check if subscription has expired
    if (user.membershipEndDate) {
      const endDate = new Date(user.membershipEndDate);
      if (endDate < new Date()) {
        return res.status(403).json({ 
          message: "Subscription expired. Please renew your agent subscription to continue." 
        });
      }
    }
  }

  // For normal users, restrict access to premium features
  if (user.role === "normal") {
    return res.status(403).json({ 
      message: "Agent subscription required. Please upgrade to an agent account to access this feature." 
    });
  }

  next();
};

// Middleware to disable caching for API responses
const noCacheMiddleware = (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
};

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication routes
  setupAuth(app);

  // Apply no-cache middleware to all API routes
  app.use('/api', noCacheMiddleware);

  // Get all properties
  app.get("/api/properties", async (req, res) => {
    try {
      const properties = await storage.getAllProperties();

      // Set cache control headers to prevent caching
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }).json(properties);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch properties" });
    }
  });

  // Get featured properties
  app.get("/api/properties/featured", async (req, res) => {
    try {
      const featuredProperties = await storage.getFeaturedProperties();

      // Set cache control headers to prevent caching
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }).json(featuredProperties);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch featured properties" });
    }
  });

  // Get popular properties (based on view count)
  app.get("/api/properties/popular", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 4;
      const popularProperties = await storage.getPopularProperties(limit);

      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }).json(popularProperties);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch popular properties" });
    }
  });

  // Get recently added properties
  app.get("/api/properties/recent", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 4;
      const recentProperties = await storage.getRecentlyAddedProperties(limit);

      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }).json(recentProperties);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch recently added properties" });
    }
  });

  // Test route to add a new property (for testing newest property logic)
  app.get("/api/test/add-new-property", async (req, res) => {
    try {
      // Create a property that matches the expected schema
      const testProperty = {
        title: "Brand New Test Property",
        description: "This is a test property added to verify it appears at the top of popular properties.",
        location: "Kampala, Uganda",
        price: 450000,
        bedrooms: 3,
        bathrooms: 2,
        squareMeters: 167, // Convert from sqft to sqm (approx)
        imageUrl: "/uploads/images/default-property.jpg",
        rating: "4.5",
        reviewCount: 0,
        propertyType: "Apartment",
        isAvailable: true,
        isFeatured: false,
        amenities: ["Pool Access", "24/7 Security", "Parking"],
        images: ["/uploads/images/default-property.jpg"],
        category: "for_sale",
        viewCount: 0,
        hasTour: false,
        tourUrl: "",
        currency: "UGX",
        mapLocation: {
          latitude: 0.347596,
          longitude: 32.582520
        }
      };

      const newProperty = await storage.createProperty(testProperty);
      console.log(`[DEBUG] Created test property: "${newProperty.title}" with ID ${newProperty.id}`);

      // Return the newly created property
      res.json(newProperty);
    } catch (error) {
      console.error("[ERROR] Failed to create test property:", error);
      res.status(500).json({ message: "Failed to create test property" });
    }
  });

  // Test route to add sample properties for featured tour testing
  app.get("/api/test/add-sample-properties", async (req, res) => {
    try {
      const sampleProperties = [
        {
          title: "La Rose Royal Apartments",
          location: "Nakasero, Kampala, Uganda",
          price: 1500000, // 1.5M UGX
          currency: "UGX",
          description: "Experience luxury living at La Rose Royal Apartments in the heart of Nakasero. This elegant property offers spacious interiors, high-end finishes, and breathtaking views of Kampala.",
          bedrooms: 3,
          bathrooms: 2,
          squareMeters: 172,
          imageUrl: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=600&h=400&q=80",
          rating: "4.97",
          reviewCount: 243,
          propertyType: "Luxury",
          category: "rental_units",
          isFeatured: true,
          hasTour: true,
          tourUrl: "https://realevr.com/LA%20ROSE%20ROYAL%20APARTMENTS/",
          amenities: ["Pool Access", "Fitness Center", "24/7 Security", "Underground parking"],
          viewCount: 150,
          isAvailable: true
        },
        {
          title: "Kololo Heights Loft",
          location: "Kololo, Kampala, Uganda",
          price: 120000, // 120K UGX per day
          currency: "UGX",
          description: "Modern loft with open floor plan and stunning views of the Kololo district, close to diplomatic missions and upscale amenities.",
          bedrooms: 2,
          bathrooms: 2,
          squareMeters: 112,
          imageUrl: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=600&h=400&q=80",
          rating: "4.9",
          reviewCount: 156,
          propertyType: "Apartments",
          category: "furnished_houses",
          isFeatured: true,
          hasTour: true,
          tourUrl: "https://app.lapentor.com/sphere/kololo-heights",
          amenities: ["Fitness Center", "High-Speed Internet", "Backup Power", "Rooftop Terrace"],
          viewCount: 89,
          isAvailable: true
        },
        {
          title: "Lake Victoria Skies",
          location: "Munyonyo, Kampala, Uganda",
          price: 380000000, // 380M UGX
          currency: "UGX",
          description: "Luxurious penthouse with panoramic views of Lake Victoria and the stunning Kampala skyline. Located in the exclusive Munyonyo district.",
          bedrooms: 3,
          bathrooms: 3,
          squareMeters: 172,
          imageUrl: "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=600&h=400&q=80",
          rating: "4.7",
          reviewCount: 92,
          propertyType: "Luxury",
          category: "for_sale",
          isFeatured: true,
          hasTour: true,
          tourUrl: "https://app.lapentor.com/sphere/lake-victoria-skies",
          amenities: ["Pool Access", "Fitness Center", "Concierge", "Lake View", "24/7 Security"],
          viewCount: 234,
          isAvailable: true
        }
      ];

      const createdProperties = [];
      for (const propertyData of sampleProperties) {
        try {
          const property = await storage.createProperty(propertyData);
          createdProperties.push(property);
          console.log(`[DEBUG] Created sample property: "${property.title}" with ID ${property.id}`);
        } catch (error) {
          console.error(`[ERROR] Failed to create property "${propertyData.title}":`, error);
        }
      }

      res.json({
        message: `Created ${createdProperties.length} sample properties`,
        properties: createdProperties
      });
    } catch (error) {
      console.error("[ERROR] Failed to create sample properties:", error);
      res.status(500).json({ message: "Failed to create sample properties" });
    }
  });

  // Get properties by category
  app.get("/api/properties/category/:category", async (req, res) => {
    try {
      const category = req.params.category;
      const properties = await storage.getPropertiesByCategory(category);

      // Set cache control headers to prevent caching
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }).json(properties);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch properties by category" });
    }
  });

  // Search properties
  app.get("/api/properties/search", async (req, res) => {
    try {
      const query = req.query.q as string || "";
      const properties = await storage.searchProperties(query);

      // Set cache control headers to prevent caching
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }).json(properties);
    } catch (error) {
      res.status(500).json({ message: "Failed to search properties" });
    }
  });

  // Get a specific property by ID - must be placed after other /api/properties/... routes
  app.get("/api/properties/:id", async (req, res) => {
    try {
      const id = toNumericId(req.params.id); // Convert to number
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid property ID" });
      }

      console.log(`[DEBUG] Getting property with ID ${id}`);
      const property = await storage.getProperty(id);
      if (!property) {
        console.log(`[DEBUG] Property with ID ${id} not found`);
        return res.status(404).json({ message: "Property not found" });
      }

      console.log(`[DEBUG] Found property ${id}: ${property.title}`);

      // Set cache control headers to prevent caching
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }).json(property);
    } catch (error) {
      console.error(`[ERROR] Failed to fetch property:`, error);
      res.status(500).json({ message: "Failed to fetch property" });
    }
  });

  // Increment property view count
  app.post("/api/properties/:id/view", async (req, res) => {
    try {
      const id = toNumericId(req.params.id); // Convert to number
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid property ID" });
      }

      console.log(`[DEBUG] Incrementing view count for property ${id}`);
      const updatedProperty = await storage.incrementPropertyViewCount(id);

      if (!updatedProperty) {
        console.log(`[DEBUG] Property with ID ${id} not found for view count increment`);
        return res.status(404).json({ message: "Property not found" });
      }

      console.log(`[DEBUG] Property ${id} view count updated to: ${updatedProperty.viewCount}`);

      res.status(200).json({
        success: true,
        viewCount: updatedProperty.viewCount
      });
    } catch (error) {
      console.error(`[ERROR] Failed to increment view count:`, error);
      res.status(500).json({ message: "Failed to increment view count" });
    }
  });

  // Get all property types
  app.get("/api/property-types", async (_req, res) => {
    try {
      const propertyTypes = await storage.getAllPropertyTypes();
      res.json(propertyTypes);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch property types" });
    }
  });

  // Get all amenities (limited to 12 for homepage)
  app.get("/api/amenities", async (req, res) => {
    try {
      const amenities = await storage.getAllAmenities();
      // Limit to 12 amenities for the homepage by default
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 12;
      const limitedAmenities = amenities.slice(0, limit);
      res.json(limitedAmenities);
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
        properties = properties.filter(p => {
          if (!p.amenities) return false;
          return filters.amenities!.every(amenity => p.amenities!.includes(amenity));
        });
      }

      // Set cache control headers to prevent caching
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }).json(properties);
    } catch (error) {
      res.status(500).json({ message: "Failed to filter properties" });
    }
  });

  // Flutterwave Payment Verification
  app.post("/api/verify-payment", async (req, res) => {
    try {
      const { transaction_id } = req.body;

      if (!transaction_id) {
        return res.status(400).json({
          status: "error",
          message: "Transaction ID is required"
        });
      }

      const flutterwaveSecretKey = process.env.FLUTTERWAVE_SECRET_KEY;

      if (!flutterwaveSecretKey) {
        return res.status(500).json({
          status: "error",
          message: "Flutterwave secret key is not configured"
        });
      }

      // Verify the transaction with Flutterwave
      const response = await fetch(
        `https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${flutterwaveSecretKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json() as {
        status: string;
        data: {
          status: string;
          amount: number;
          currency: string;
        }
      };

      // Check if the payment was successful
      if (data.status === "success" && data.data.status === "successful") {
        // For security: Verify the amount matches what you expect
        const amount = data.data.amount;
        const currency = data.data.currency;

        // Standard package is 10,000 UGX
        if (amount === 10000 && currency === "UGX") {
          return res.json({
            status: "success",
            message: "Payment verified successfully",
            data: {
              accessType: "standard",
              expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days from now
            }
          });
        }
        // Premium package is 30,000 UGX
        else if (amount === 30000 && currency === "UGX") {
          return res.json({
            status: "success",
            message: "Payment verified successfully",
            data: {
              accessType: "premium",
              expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days from now
            }
          });
        }
        // Agent Basic subscription - 50,000 UGX
        else if (amount === 50000 && currency === "UGX") {
          return res.json({
            status: "success",
            message: "Agent subscription payment verified successfully",
            data: {
              accessType: "agent_basic",
              expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days from now
            }
          });
        }
        // Agent Professional subscription - 100,000 UGX
        else if (amount === 100000 && currency === "UGX") {
          return res.json({
            status: "success",
            message: "Agent subscription payment verified successfully",
            data: {
              accessType: "agent_professional",
              expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days from now
            }
          });
        }
        // Agent Enterprise subscription - 200,000 UGX
        else if (amount === 200000 && currency === "UGX") {
          return res.json({
            status: "success",
            message: "Agent subscription payment verified successfully",
            data: {
              accessType: "agent_enterprise",
              expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days from now
            }
          });
        }
        else {
          return res.status(400).json({
            status: "error",
            message: "Invalid payment amount"
          });
        }
      } else {
        return res.status(400).json({
          status: "error",
          message: "Payment verification failed",
          data: data
        });
      }
    } catch (error: any) {
      console.error("Payment verification error:", error);
      return res.status(500).json({
        status: "error",
        message: "Error verifying payment",
        error: error.message
      });
    }
  });

  // Agent subscription payment verification
  app.post("/api/verify-agent-subscription", async (req, res) => {
    try {
      const { transaction_id } = req.body;
      
      if (!transaction_id) {
        return res.status(400).json({
          status: "error",
          message: "Transaction ID is required"
        });
      }

      const flutterwaveSecretKey = process.env.FLUTTERWAVE_SECRET_KEY;
      if (!flutterwaveSecretKey) {
        return res.status(500).json({
          status: "error",
          message: "Payment gateway not configured"
        });
      }

      const response = await fetch(
        `https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${flutterwaveSecretKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json() as {
        status: string;
        data: {
          status: string;
          amount: number;
          currency: string;
        }
      };

      // Check if the payment was successful
      if (data.status === "success" && data.data.status === "successful") {
        const amount = data.data.amount;
        const currency = data.data.currency;

        // Agent Basic subscription - 50,000 UGX
        if (amount === 50000 && currency === "UGX") {
          return res.json({
            status: "success",
            message: "Agent subscription payment verified successfully",
            data: {
              subscriptionPlan: "basic",
              expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days from now
            }
          });
        }
        // Agent Professional subscription - 100,000 UGX
        else if (amount === 100000 && currency === "UGX") {
          return res.json({
            status: "success",
            message: "Agent subscription payment verified successfully",
            data: {
              subscriptionPlan: "professional",
              expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days from now
            }
          });
        }
        // Agent Enterprise subscription - 200,000 UGX
        else if (amount === 200000 && currency === "UGX") {
          return res.json({
            status: "success",
            message: "Agent subscription payment verified successfully",
            data: {
              subscriptionPlan: "enterprise",
              expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days from now
            }
          });
        }
        else {
          return res.status(400).json({
            status: "error",
            message: "Invalid payment amount for agent subscription"
          });
        }
      } else {
        return res.status(400).json({
          status: "error",
          message: "Payment verification failed",
          data: data
        });
      }
    } catch (error: any) {
      console.error("Agent subscription payment verification error:", error);
      return res.status(500).json({
        status: "error",
        message: "Error verifying agent subscription payment",
        error: error.message
      });
    }
  });

  // Tour payment verification
  app.post("/api/verify-tour-payment", async (req, res) => {
    try {
      const { transaction_id, property_id, user_id } = req.body;
      
      if (!transaction_id || !property_id) {
        return res.status(400).json({ 
          status: "error", 
          message: "Transaction ID and property ID are required" 
        });
      }

      const flutterwaveSecretKey = process.env.FLUTTERWAVE_SECRET_KEY;
      if (!flutterwaveSecretKey) {
        return res.status(500).json({
          status: "error",
          message: "Payment gateway not configured"
        });
      }

      const response = await fetch(
        `https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${flutterwaveSecretKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json() as {
        status: string;
        data: {
          status: string;
          amount: number;
          currency: string;
        }
      };

      // Check if the payment was successful
      if (data.status === "success" && data.data.status === "successful") {
        const amount = data.data.amount;
        const currency = data.data.currency;

        // Tour payment should be 15,000 UGX
        if (amount === 15000 && currency === "UGX") {
          // Record the tour payment in the database
          try {
            await storage.recordTourPayment({
              transactionId: transaction_id,
              propertyId: property_id,
              userId: user_id,
              amount: amount,
              currency: currency,
              timestamp: new Date().toISOString()
            });
          } catch (dbError) {
            console.error('Error recording tour payment:', dbError);
            // Don't fail the verification if database recording fails
          }
          
          return res.json({
            status: "success",
            message: "Tour payment verified successfully",
            data: {
              amount: amount,
              currency: currency
            }
          });
        } else {
          return res.status(400).json({
            status: "error",
            message: "Invalid payment amount for tour access"
          });
        }
      } else {
        return res.status(400).json({
          status: "error",
          message: "Payment verification failed",
          data: data
        });
      }
    } catch (error: any) {
      console.error("Tour payment verification error:", error);
      return res.status(500).json({
        status: "error",
        message: "Error verifying tour payment",
        error: error.message
      });
    }
  });

  // Test endpoint to verify connectivity
  app.post("/api/test-endpoint", (req, res) => {
    console.log("[DEBUG] Test endpoint hit with data:", req.body);
    console.log("[DEBUG] Request headers:", req.headers);
    console.log("[DEBUG] Content-Type:", req.headers['content-type']);
    console.log("[DEBUG] Request method:", req.method);
    console.log("[DEBUG] Request URL:", req.url);

    // Express already parses the body, so we can just use req.body
    res.status(200).json({
      message: "Test endpoint reached successfully",
      receivedData: req.body
    });
  });

  // Test endpoint that creates a property directly
  app.get("/api/test-create-property", async (req, res) => {
    try {
      // Create a test property
      const testProperty = {
        title: "Test Property via Direct Endpoint",
        description: "This is a test property created via a direct endpoint to test property creation.",
        location: "Test Location",
        price: 10000,
        bedrooms: 3,
        bathrooms: 2,
        squareMeters: 150,
        imageUrl: "/uploads/images/default-property.jpg",
        rating: "4.5",
        reviewCount: 0,
        propertyType: "Apartment",
        isAvailable: true,
        isFeatured: false,
        amenities: ["Test Amenity"],
        category: "for_sale",
        viewCount: 0,
        hasTour: false,
        tourUrl: "",
        currency: "UGX"
      };

      console.log("[DEBUG] Creating test property via direct endpoint");
      const property = await storage.createProperty(testProperty);
      console.log("[DEBUG] Test property created successfully:", property);
      res.status(201).json({
        message: "Test property created successfully",
        property
      });
    } catch (error: any) {
      console.error("[ERROR] Failed to create test property:", error);
      res.status(500).json({
        message: "Failed to create test property",
        error: error.message
      });
    }
  });

  // HTML form endpoint for property creation
  app.get("/api/property-form", (req, res) => {
    // Send a simple HTML form that posts directly to the server
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Create Property Form</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          .form-group { margin-bottom: 15px; }
          label { display: block; margin-bottom: 5px; }
          input, textarea, select { width: 100%; padding: 8px; box-sizing: border-box; }
          button { padding: 10px 15px; background: #4CAF50; color: white; border: none; cursor: pointer; }
        </style>
      </head>
      <body>
        <h1>Create Property Form</h1>
        <form action="/api/properties/create" method="POST">
          <div class="form-group">
            <label for="title">Title:</label>
            <input type="text" id="title" name="title" value="Test Property" required>
          </div>
          <div class="form-group">
            <label for="description">Description:</label>
            <textarea id="description" name="description" rows="4" required>This is a test property description that is at least 20 characters long.</textarea>
          </div>
          <div class="form-group">
            <label for="location">Location:</label>
            <input type="text" id="location" name="location" value="Test Location" required>
          </div>
          <div class="form-group">
            <label for="price">Price:</label>
            <input type="number" id="price" name="price" value="10000" required>
          </div>
          <div class="form-group">
            <label for="currency">Currency:</label>
            <select id="currency" name="currency">
              <option value="UGX" selected>UGX</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div class="form-group">
            <label for="bedrooms">Bedrooms:</label>
            <input type="number" id="bedrooms" name="bedrooms" value="3" required>
          </div>
          <div class="form-group">
            <label for="bathrooms">Bathrooms:</label>
            <input type="number" id="bathrooms" name="bathrooms" value="2" required>
          </div>
          <div class="form-group">
            <label for="squareMeters">Square Meters:</label>
            <input type="number" id="squareMeters" name="squareMeters" value="150" required>
          </div>
          <div class="form-group">
            <label for="propertyType">Property Type:</label>
            <input type="text" id="propertyType" name="propertyType" value="Apartment" required>
          </div>
          <div class="form-group">
            <label for="category">Category:</label>
            <select id="category" name="category">
              <option value="for_sale" selected>For Sale</option>
              <option value="rental_units">Rental Unit</option>
              <option value="furnished_houses">BnB</option>
              <option value="bank_sales">Bank Sale</option>
            </select>
          </div>
          <div class="form-group">
            <label for="rating">Rating:</label>
            <input type="text" id="rating" name="rating" value="4.5" required>
          </div>
          <div class="form-group">
            <label for="reviewCount">Review Count:</label>
            <input type="number" id="reviewCount" name="reviewCount" value="0" required>
          </div>
          <div class="form-group">
            <label for="imageUrl">Image URL:</label>
            <input type="text" id="imageUrl" name="imageUrl" value="/uploads/images/default-property.jpg" required>
          </div>
          <input type="hidden" name="hasTour" value="false">
          <input type="hidden" name="isFeatured" value="false">
          <input type="hidden" name="isAvailable" value="true">
          <input type="hidden" name="amenities" value="[]">
          <button type="submit">Create Property</button>
        </form>
      </body>
      </html>
    `);
  });

  // Create a new property (admin only)
  app.post("/api/properties/create", subscriptionMiddleware, async (req, res) => {
    console.log("[DEBUG] Incoming property data:", req.body);
    console.log("[DEBUG] Request headers:", req.headers);
    console.log("[DEBUG] Authentication status:", req.isAuthenticated());
    if (req.user) {
      console.log("[DEBUG] User role:", req.user.role);
    } else {
      console.log("[DEBUG] No user found in request");
    }

    try {
      console.log("[DEBUG] Incoming property creation data:", JSON.stringify(req.body));

      // Parse and validate the incoming data
      const propertyData = { ...req.body };

      // Convert string fields to appropriate types
      if (typeof propertyData.price === 'string') {
        propertyData.price = parseInt(propertyData.price);
      }
      if (typeof propertyData.bedrooms === 'string') {
        propertyData.bedrooms = parseInt(propertyData.bedrooms);
      }
      if (typeof propertyData.bathrooms === 'string') {
        propertyData.bathrooms = parseInt(propertyData.bathrooms);
      }
      if (typeof propertyData.squareMeters === 'string') {
        propertyData.squareMeters = parseInt(propertyData.squareMeters);
      }
      if (typeof propertyData.reviewCount === 'string') {
        propertyData.reviewCount = parseInt(propertyData.reviewCount);
      }
      // Handle construction and age fields
      if (typeof propertyData.yearOfConstruction === 'string' && propertyData.yearOfConstruction) {
        propertyData.yearOfConstruction = parseInt(propertyData.yearOfConstruction);
      }
      if (typeof propertyData.buildingAge === 'string' && propertyData.buildingAge) {
        propertyData.buildingAge = parseInt(propertyData.buildingAge);
      }

      // Convert boolean strings to actual booleans
      if (typeof propertyData.isAvailable === 'string') {
        propertyData.isAvailable = propertyData.isAvailable === 'true';
      }
      if (typeof propertyData.isFeatured === 'string') {
        propertyData.isFeatured = propertyData.isFeatured === 'true';
      }
      if (typeof propertyData.hasTour === 'string') {
        propertyData.hasTour = propertyData.hasTour === 'true';
      }

      // Parse amenities if it's a JSON string
      if (typeof propertyData.amenities === 'string') {
        try {
          propertyData.amenities = JSON.parse(propertyData.amenities);
        } catch (e) {
          console.error("[ERROR] Failed to parse amenities:", e);
          propertyData.amenities = [];
        }
      }

      // Ensure amenities is an array
      if (!Array.isArray(propertyData.amenities)) {
        propertyData.amenities = [];
      }

      // Handle ownerId - if provided as string, convert to number
      if (typeof propertyData.ownerId === 'string') {
        propertyData.ownerId = parseInt(propertyData.ownerId);
      }

      // If no ownerId provided and user is authenticated, use the current user's ID
      if (!propertyData.ownerId && req.user) {
        propertyData.ownerId = req.user.id;
        console.log("[DEBUG] Setting ownerId to current user:", req.user.id);
      }

      // Validate required fields
      if (propertyData.price == null || isNaN(propertyData.price)) {
        return res.status(400).json({ message: "Price is required and must be a number" });
      }
      if (!propertyData.title || !propertyData.location) {
        return res.status(400).json({ message: "Title and location are required" });
      }

      console.log("[DEBUG] Processed property data:", JSON.stringify(propertyData));

      const property = await storage.createProperty(propertyData);
      console.log("[DEBUG] Property created successfully:", property);
      res.status(201).json(property);
    } catch (error: any) {
      console.error("[ERROR] Failed to create property:", error);
      res.status(400).json({ message: error.message });
    }
  });





  // Update a property (admin only)
  app.patch("/api/properties/:id", adminMiddleware, async (req, res) => {
    try {
      const id = toNumericId(req.params.id); // Convert to number
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid property ID" });
      }

      console.log(`[DEBUG] PATCH request for property ${id} with data:`, JSON.stringify(req.body));

      const updatedProperty = await storage.updateProperty(id, req.body);
      if (!updatedProperty) {
        console.log(`[DEBUG] Property with ID ${id} not found for update`);
        return res.status(404).json({ message: "Property not found" });
      }

      console.log(`[DEBUG] Property ${id} successfully updated, sending response`);

      // Set cache control headers to prevent caching
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }).json(updatedProperty);
    } catch (error: any) {
      console.error('Error updating property:', error);
      res.status(400).json({ message: error.message });
    }
  });

  // Toggle property availability (admin/property manager only)
  app.post("/api/properties/:id/toggle-availability", adminMiddleware, async (req, res) => {
    try {
      const id = toNumericId(req.params.id); // Convert to number
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid property ID" });
      }

      console.log(`[DEBUG] Toggling availability for property ${id}`);

      const updatedProperty = await storage.togglePropertyAvailability(id);
      if (!updatedProperty) {
        console.log(`[DEBUG] Property with ID ${id} not found for availability toggle`);
        return res.status(404).json({ message: "Property not found" });
      }

      console.log(`[DEBUG] Property ${id} availability toggled to: ${updatedProperty.isAvailable}`);

      // Set cache control headers to prevent caching
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }).json(updatedProperty);
    } catch (error: any) {
      console.error(`[ERROR] Failed to toggle property availability:`, error);
      res.status(500).json({ message: error.message });
    }
  });

  // Delete a property (admin only)
  app.delete("/api/properties/:id", adminMiddleware, async (req, res) => {
    try {
      const id = toNumericId(req.params.id); // Convert to number
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid property ID" });
      }

      const property = await storage.getProperty(id);
      if (!property) {
        return res.status(404).json({ message: "Property not found" });
      }

      // Remove any associated virtual tour files if they exist
      if (property.hasTour && property.tourUrl) {
        // Extract the property ID from the tourUrl
        const match = property.tourUrl.match(/property_(.+?)_tour/); // Accept any string ID
        if (match) {
          const propertyId = match[1];
          const tourPath = path.join(process.cwd(), 'uploads', 'tours', `property_${propertyId}_tour`);

          if (fs.existsSync(tourPath)) {
            try {
              fs.rmSync(tourPath, { recursive: true, force: true });
              console.log(`Deleted tour directory for property ID ${propertyId}`);
            } catch (err) {
              console.error(`Failed to delete tour directory: ${err}`);
            }
          }
        }
      }

      // Delete the property from storage
      const success = await storage.deleteProperty(id);
      if (!success) {
        return res.status(500).json({ message: "Failed to delete property" });
      }

      res.status(200).json({ message: "Property deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/agent/properties", subscriptionMiddleware, async (req, res) => {
    try {
      console.log("=== AGENT PROPERTIES ENDPOINT ===");
      console.log("Session:", req.session);
      console.log("User:", req.user);
      console.log("Headers:", req.headers);
      
      const user = req.user;
      if (!user) {
        console.log("No user found in request");
        return res.status(401).json({ message: "Not authenticated" });
      }

      console.log("User found:", user.username, "Role:", user.role);

      console.log("Fetching properties for user ID:", user.id);
      console.log("User ID type:", typeof user.id);
      console.log("User ID value:", user.id);
      
      const properties = await storage.getPropertiesByOwner(user.id);
      console.log("Properties found:", properties.length);
      console.log("Properties returned:", properties);
      res.json(properties);
    } catch (error: any) {
      console.error("Error in agent properties endpoint:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Delete agent's own property
  app.delete("/api/agent/properties/:id", async (req, res) => {
    try {
      console.log("=== AGENT DELETE PROPERTY ENDPOINT ===");
      
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Only allow agents and admins to access this endpoint
      if (user.role !== "agent" && user.role !== "admin") {
        return res.status(403).json({ message: "Unauthorized. Agent or admin role required." });
      }

      const propertyId = parseInt(req.params.id);
      if (isNaN(propertyId)) {
        return res.status(400).json({ message: "Invalid property ID" });
      }

      // Get the property to check ownership
      const property = await storage.getProperty(propertyId);
      if (!property) {
        return res.status(404).json({ message: "Property not found" });
      }

      // Only allow agents to delete their own properties, or admins to delete any property
      if (user.role === "agent" && property.ownerId !== user.id) {
        return res.status(403).json({ message: "You can only delete your own properties" });
      }

      const success = await storage.deleteProperty(propertyId);
      if (success) {
        res.json({ message: "Property deleted successfully" });
      } else {
        res.status(500).json({ message: "Failed to delete property" });
      }
    } catch (error: any) {
      console.error("Error deleting property:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Analytics endpoints for agents and admins
  app.get("/api/analytics/property-views/:propertyId", async (req, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Only allow agents and admins to access analytics
      if (user.role !== "agent" && user.role !== "admin") {
        return res.status(403).json({ message: "Unauthorized. Agent or admin role required." });
      }

      const propertyId = parseInt(req.params.propertyId);
      if (isNaN(propertyId)) {
        return res.status(400).json({ message: "Invalid property ID" });
      }

      // Get the property to check ownership (agents can only see their own properties)
      const property = await storage.getProperty(propertyId);
      if (!property) {
        return res.status(404).json({ message: "Property not found" });
      }

      if (user.role === "agent" && property.ownerId !== user.id) {
        return res.status(403).json({ message: "You can only view analytics for your own properties" });
      }

      // Get detailed view analytics for this property
      const analytics = await storage.getPropertyViewAnalytics(propertyId);
      res.json(analytics);
    } catch (error: any) {
      console.error("Error fetching property analytics:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get agent's overall analytics
  app.get("/api/analytics/agent-overview", async (req, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Only allow agents and admins to access analytics
      if (user.role !== "agent" && user.role !== "admin") {
        return res.status(403).json({ message: "Unauthorized. Agent or admin role required." });
      }

      const agentId = user.role === "agent" ? user.id : parseInt(req.query.agentId as string);
      if (user.role === "admin" && !agentId) {
        return res.status(400).json({ message: "Agent ID required for admin requests" });
      }

      // Get agent's properties and their analytics
      const properties = await storage.getPropertiesByOwner(agentId);
      const analytics = await storage.getAgentAnalytics(agentId);
      
      res.json({
        properties,
        analytics
      });
    } catch (error: any) {
      console.error("Error fetching agent analytics:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get admin overview analytics
  app.get("/api/analytics/admin-overview", async (req, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Only allow admins to access admin analytics
      if (user.role !== "admin") {
        return res.status(403).json({ message: "Unauthorized. Admin role required." });
      }

      const analytics = await storage.getAdminAnalytics();
      res.json(analytics);
    } catch (error: any) {
      console.error("Error fetching admin analytics:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get agent subscriptions for admin dashboard
  app.get("/api/admin/agent-subscriptions", adminMiddleware, async (req, res) => {
    try {
      const agentSubscriptions = await storage.getAgentSubscriptions();
      res.json(agentSubscriptions);
    } catch (error: any) {
      console.error("Error fetching agent subscriptions:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get tour payments for admin dashboard
  app.get("/api/admin/tour-payments", adminMiddleware, async (req, res) => {
    try {
      const tourPayments = await storage.getAllTourPayments();
      res.json(tourPayments);
    } catch (error: any) {
      console.error("Error fetching tour payments:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get agent properties for admin dashboard
  app.get("/api/admin/agent-properties/:agentId", adminMiddleware, async (req, res) => {
    try {
      const agentId = parseInt(req.params.agentId);
      if (isNaN(agentId)) {
        return res.status(400).json({ message: "Invalid agent ID" });
      }

      const agentProperties = await storage.getAgentPropertiesForAdmin(agentId);
      res.json(agentProperties);
    } catch (error: any) {
      console.error("Error fetching agent properties:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Track detailed property view with user info
  app.post("/api/analytics/track-view", async (req, res) => {
    try {
      const { propertyId, userId, userAgent, referrer, ipAddress } = req.body;
      
      if (!propertyId) {
        return res.status(400).json({ message: "Property ID is required" });
      }

      const viewData = {
        propertyId: parseInt(propertyId),
        userId: userId ? parseInt(userId) : null,
        userAgent: userAgent || req.headers['user-agent'],
        referrer: referrer || req.headers.referer,
        ipAddress: ipAddress || req.ip,
        timestamp: new Date().toISOString()
      };

      await storage.trackDetailedPropertyView(viewData);
      
      res.json({ success: true, message: "View tracked successfully" });
    } catch (error: any) {
      console.error("Error tracking detailed view:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/user/tours", async (req, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const tours = await storage.getUserViewedTours(user.id);
      res.json(tours);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/user/tours", async (req, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { tourId, propertyId, price } = req.body;
      const viewedTour = await storage.addUserViewedTour(user.id, tourId, propertyId, price);
      res.json(viewedTour);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get all users (admin only)
  app.get("/api/users", adminMiddleware, async (_req, res) => {
    try {
      const users = await storage.getAllUsers();

      // Remove passwords before sending to client
      const sanitizedUsers = users.map(user => {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });

      res.json(sanitizedUsers);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Update user role (admin only)
  app.patch("/api/users/:id/role", adminMiddleware, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      const { role } = req.body;
      if (!role || !["admin", "agent", "normal"].includes(role)) {
        return res.status(400).json({ message: "Invalid role. Must be 'admin', 'agent', or 'normal'" });
      }

      const updatedUser = await storage.updateUserRole(id, role);

      // Remove password before sending back to client
      const { password, ...userWithoutPassword } = updatedUser;

      res.json(userWithoutPassword);
    } catch (error: any) {
      res.status(404).json({ message: error.message });
    }
  });

  // Flutterwave Property Deposit Payment
  app.post("/api/pay-property-deposit", async (req, res) => {
    try {
      const { transaction_id, propertyId } = req.body;

      if (!transaction_id || !propertyId) {
        return res.status(400).json({
          status: "error",
          message: "Transaction ID and Property ID are required"
        });
      }

      const flutterwaveSecretKey = process.env.FLUTTERWAVE_SECRET_KEY;

      if (!flutterwaveSecretKey) {
        return res.status(500).json({
          status: "error",
          message: "Flutterwave secret key is not configured"
        });
      }

      // Get the property details
      const property = await storage.getProperty(propertyId);

      if (!property) {
        return res.status(404).json({
          status: "error",
          message: "Property not found"
        });
      }

      // Verify the transaction with Flutterwave
      const response = await fetch(
        `https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${flutterwaveSecretKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json() as {
        status: string;
        data: {
          status: string;
          amount: number;
          currency: string;
          // Add other fields as needed
        }
      };

      // Check if the payment was successful
      if (data.status === "success" && data.data.status === "successful") {
        // Calculate 5% of the property price as the deposit (or use fixed deposit amount)
        const expectedDepositAmount = property.price * 0.05;

        // Verify the amount matches the expected deposit
        const amount = data.data.amount;
        const currency = data.data.currency;

        // Allow some flexibility in the deposit amount (±5%)
        const lowerBound = expectedDepositAmount * 0.95;
        const upperBound = expectedDepositAmount * 1.05;

        if (amount >= lowerBound && amount <= upperBound && currency === "UGX") {
          // Here you would typically store this in a database
          // For this example we'll just return success
          return res.json({
            status: "success",
            message: "Deposit payment verified successfully",
            data: {
              propertyId,
              depositAmount: amount,
              timestamp: new Date().toISOString(),
              refundPolicy: "5% processing fee on refunds",
              receiptNumber: `DEP-${Date.now()}`
            }
          });
        } else {
          return res.status(400).json({
            status: "error",
            message: "Invalid deposit amount",
            expected: expectedDepositAmount,
            received: amount
          });
        }
      } else {
        return res.status(400).json({
          status: "error",
          message: "Payment verification failed",
          data: data
        });
      }
    } catch (error: any) {
      console.error("Deposit payment verification error:", error);
      return res.status(500).json({
        status: "error",
        message: "Error verifying deposit payment",
        error: error.message
      });
    }
  });

  // Test endpoint: upload a single file to FTP tour folder
  // app.post("/api/upload/test-ftp", uploadTestFileToFTP);

  // Test endpoint to add more amenities
  app.get("/api/test/add-amenities", async (req, res) => {
    try {
      const amenities = [
        { name: "WiFi", icon: "wifi", description: "High-speed internet access" },
        { name: "Parking", icon: "car", description: "Secure parking space" },
        // { name: "Pool Access", icon: "swimming-pool", description: "Swimming pool access" },
        { name: "Fitness Center", icon: "dumbbell", description: "On-site fitness facilities" },
        { name: "Air Conditioning", icon: "snowflake", description: "Central air conditioning" },
        { name: "Security", icon: "shield", description: "24/7 security system" },
        { name: "Garden", icon: "tree", description: "Private garden or balcony" },
        { name: "Pet Friendly", icon: "paw", description: "Pet-friendly accommodation" },
        { name: "Balcony", icon: "home", description: "Private balcony or terrace" },
        { name: "Elevator", icon: "arrow-up", description: "Building elevator access" },
        { name: "Storage", icon: "box", description: "Storage space available" },
        { name: "Laundry", icon: "washing-machine", description: "In-unit or shared laundry" },
        // { name: "Dishwasher", icon: "utensils", description: "Dishwasher in kitchen" },
        // { name: "Fireplace", icon: "flame", description: "Fireplace or heating" },
        // { name: "Gym", icon: "dumbbell", description: "On-site gym facilities" },
        // { name: "Spa", icon: "spa", description: "Spa or wellness facilities" },
        // { name: "Tennis Court", icon: "tennis", description: "Tennis court access" },
        // { name: "Basketball Court", icon: "basketball", description: "Basketball court access" },
        // { name: "Playground", icon: "child", description: "Children's playground" },
        // { name: "BBQ Area", icon: "grill", description: "BBQ or outdoor cooking area" },
        // { name: "Bike Storage", icon: "bike", description: "Bicycle storage facility" },
        // { name: "Electric Car Charging", icon: "charging-station", description: "Electric vehicle charging" },
        // { name: "Smart Home", icon: "smartphone", description: "Smart home technology" },
        // { name: "Wine Cellar", icon: "wine", description: "Wine storage facility" },
        // { name: "Home Theater", icon: "tv", description: "Home theater system" },
        // { name: "Wine Cellar", icon: "wine", description: "Wine storage facility" },
        // { name: "Home Theater", icon: "tv", description: "Home theater system" },
        // { name: "Library", icon: "book", description: "Private library or study" },
        // { name: "Art Studio", icon: "palette", description: "Art studio or creative space" },
        // { name: "Music Room", icon: "music", description: "Music room or studio" },
        // { name: "Wine Cellar", icon: "wine", description: "Wine storage facility" },
        // { name: "Home Theater", icon: "tv", description: "Home theater system" },
        // { name: "Library", icon: "book", description: "Private library or study" },
        // { name: "Art Studio", icon: "palette", description: "Art studio or creative space" },
        // { name: "Music Room", icon: "music", description: "Music room or studio" }
      ];

      for (const amenity of amenities) {
        await storage.createAmenity(amenity);
      }

      res.json({ message: "Amenities added successfully", count: amenities.length });
    } catch (error) {
      console.error("Error adding amenities:", error);
      res.status(500).json({ message: "Failed to add amenities" });
    }
  });

  // Setup routes to serve static files
  setupStaticFileRoutes(app);

  // Upload property image (admin, agent, or property manager only)
  app.post("/api/upload/property-image", (req, res) => {
    console.log("=== PROPERTY IMAGE UPLOAD ENDPOINT ===");
    console.log("User:", req.user);
    console.log("User role:", req.user?.role);
    console.log("Is authenticated:", req.isAuthenticated());
    
    // Check if user is authenticated
    if (!req.isAuthenticated()) {
      console.log("User not authenticated");
      return res.status(401).json({ message: "Not authenticated" });
    }

    // Get user from request
    const user = req.user;
    console.log("User object:", user);

    // Only check role if user is not an admin, agent, or property manager
    if (!user.role || (user.role !== "admin" && user.role !== "agent" && user.role !== "property_manager")) {
      console.log("Unauthorized role:", user.role);
      return res.status(403).json({ message: "Unauthorized. Admin, agent, or property manager role required." });
    }

    console.log("User authorized for upload");

    uploadPropertyImage(req, res, (err: any) => {
      if (err) {
        return res.status(400).json({
          status: "error",
          message: err.message
        });
      }
      if (!req.file) {
        return res.status(400).json({
          status: "error",
          message: "No file uploaded"
        });
      }
      // If S3, return the S3 URL
      if ((req.file as any).s3Url) {
        return res.json({
          status: "success",
          message: "Image uploaded successfully",
          imagePath: (req.file as any).s3Url
        });
      }
      // Local fallback
      const imagePath = `/uploads/images/${req.file.filename}`;
      res.json({
        status: "success",
        message: "Image uploaded successfully",
        imagePath
      });
    });
  });

  // Upload virtual tour zip (admin, agent, or property manager only)
  app.post("/api/upload/virtual-tour/:propertyId", (req, res) => {
    console.log("=== VIRTUAL TOUR UPLOAD ENDPOINT ===");
    console.log("User:", req.user);
    console.log("User role:", req.user?.role);
    console.log("Is authenticated:", req.isAuthenticated());
    console.log("Property ID:", req.params.propertyId);
    
    // Check if user is authenticated
    if (!req.isAuthenticated()) {
      console.log("User not authenticated");
      return res.status(401).json({ message: "Not authenticated" });
    }

    // Get user from request
    const user = req.user;
    console.log("User object:", user);
    // const propertyId_ = parseInt(req.params.propertyId);

    // Only check role if user is not an admin, agent, or property manager
    if (!user.role || (user.role !== "admin" && user.role !== "agent" && user.role !== "property_manager")) {
      console.log("Unauthorized role:", user.role);
      return res.status(403).json({ message: "Unauthorized. Admin, agent, or property manager role required." });
    }

    console.log("User authorized for virtual tour upload");

    const propertyId = req.params.propertyId; // Use string ID
    if (!propertyId) {
      return res.status(400).json({
        status: "error",
        message: "Invalid property ID"
      });
    }
    console.log(`Received virtual tour upload request for property ${propertyId}`);
    uploadVirtualTour(req, res, (err: any) => {
      if (err) {
        console.error(`Upload error: ${err.message}`);
        return res.status(400).json({
          status: "error",
          message: err.message
        });
      }
      // The new uploadVirtualTour responds immediately with jobId, so nothing else to do here.
    });
  });

  // SSE endpoint for tour progress
  app.get('/api/upload/virtual-tour/progress/:jobId', sseTourProgress);

  app.post("/api/setup-dynamodb", async (req, res) => {
    try {
      await createTablesIfNotExist();
      // Insert default admin user
      const adminUser = {
        id: "1",
        username: "admin",
        password: "admin123", // You should hash this in production!
        email: "admin@realevr.com",
        fullName: "Admin User",
        membershipPlan: "premium",
        membershipStartDate: null,
        membershipEndDate: null,
        role: "admin",
        isVerified: true
      };
      await DynamoDBUtils.putItem(TABLES.USERS, adminUser);
      res.json({ message: "DynamoDB tables created and admin user added!" });
    } catch (error) {
      const errorMessage = (error && typeof error === 'object' && 'message' in error) ? (error as any).message : String(error);
      res.status(500).json({ error: errorMessage || "Failed to setup DynamoDB" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
