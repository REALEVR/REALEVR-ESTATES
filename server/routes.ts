import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { z } from "zod";
import fetch from "node-fetch";

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication routes
  setupAuth(app);
  // Get all properties
  app.get("/api/properties", async (req, res) => {
    try {
      const properties = await storage.getAllProperties();
      res.json(properties);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch properties" });
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
  
  // Get properties by category
  app.get("/api/properties/category/:category", async (req, res) => {
    try {
      const category = req.params.category;
      const properties = await storage.getPropertiesByCategory(category);
      res.json(properties);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch properties by category" });
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
  
  // Get a specific property by ID - must be placed after other /api/properties/... routes
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
        properties = properties.filter(p => {
          if (!p.amenities) return false;
          return filters.amenities!.every(amenity => p.amenities!.includes(amenity));
        });
      }
      
      res.json(properties);
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

      const data = await response.json();

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
      const property = await storage.getProperty(parseInt(propertyId));
      
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

      const data = await response.json();

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

  const httpServer = createServer(app);
  return httpServer;
}
