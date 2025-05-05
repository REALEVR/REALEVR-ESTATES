import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { z } from "zod";
import fetch from "node-fetch";
import path from "path";
import fs from "fs";
import { 
  uploadPropertyImage, 
  uploadVirtualTour, 
  handleUploadErrors,
  extractTourZip,
  setupStaticFileRoutes
} from "./upload";

// Middleware to check if user is an admin or property manager
const adminMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  
  const user = req.user;
  if (!user.role || (user.role !== "admin" && user.role !== "property_manager")) {
    return res.status(403).json({ message: "Unauthorized. Admin or property manager role required." });
  }
  
  next();
};

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

  // Create a new property (admin only)
  app.post("/api/properties/create", adminMiddleware, async (req, res) => {
    try {
      const property = await storage.createProperty(req.body);
      res.status(201).json(property);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });
  
  // Update a property (admin only)
  app.patch("/api/properties/:id", adminMiddleware, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid property ID" });
      }
      
      const updatedProperty = await storage.updateProperty(id, req.body);
      if (!updatedProperty) {
        return res.status(404).json({ message: "Property not found" });
      }
      
      res.json(updatedProperty);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });
  
  // Delete a property (admin only)
  app.delete("/api/properties/:id", adminMiddleware, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
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
        const match = property.tourUrl.match(/property_(\d+)_tour/);
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
  
  // Get all users (admin only)
  app.get("/api/users", adminMiddleware, async (req, res) => {
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
      if (!role || !["user", "admin", "property_manager"].includes(role)) {
        return res.status(400).json({ message: "Invalid role. Must be 'user', 'admin', or 'property_manager'" });
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

  // Setup routes to serve static files
  setupStaticFileRoutes(app);
  
  // Upload property image (admin only)
  app.post("/api/upload/property-image", adminMiddleware, (req, res) => {
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
      
      // Return the path to the uploaded image
      const imagePath = `/uploads/images/${req.file.filename}`;
      
      res.json({ 
        status: "success", 
        message: "Image uploaded successfully",
        imagePath 
      });
    });
  });
  
  // Upload virtual tour zip (admin only)
  app.post("/api/upload/virtual-tour/:propertyId", adminMiddleware, (req, res) => {
    const propertyId = parseInt(req.params.propertyId);
    
    if (isNaN(propertyId)) {
      return res.status(400).json({ 
        status: "error", 
        message: "Invalid property ID" 
      });
    }

    console.log(`Received virtual tour upload request for property ${propertyId}`);
    
    uploadVirtualTour(req, res, async (err: any) => {
      if (err) {
        console.error(`Upload error: ${err.message}`);
        return res.status(400).json({ 
          status: "error", 
          message: err.message 
        });
      }
      
      if (!req.file) {
        console.error('No file was uploaded');
        return res.status(400).json({ 
          status: "error", 
          message: "No file uploaded" 
        });
      }
      
      console.log(`File received: ${req.file.originalname}, mimetype: ${req.file.mimetype}, size: ${req.file.size} bytes`);
      
      try {
        // Verify that the property exists
        const property = await storage.getProperty(propertyId);
        if (!property) {
          fs.unlinkSync(req.file.path); // Delete the uploaded file
          return res.status(404).json({
            status: "error",
            message: "Property not found"
          });
        }
        
        // Extract the tour files
        console.log(`Starting extraction of tour file from ${req.file.path}`);
        const extractedPath = await extractTourZip(req.file.path, propertyId);
        console.log(`Tour extracted to ${extractedPath}`);
        
        // Check for index.htm file directly
        const directory = path.join(process.cwd(), extractedPath);
        const directoryContents = fs.readdirSync(directory);
        console.log(`Directory contents:`, directoryContents);
        
        let indexFile = directoryContents.find(f => f.toLowerCase() === 'index.htm');
        
        // If not found at root level, try to find it in subdirectories
        if (!indexFile) {
          console.log('No index.htm found at root level, checking subdirectories...');
          
          for (const item of directoryContents) {
            const itemPath = path.join(directory, item);
            if (fs.statSync(itemPath).isDirectory()) {
              const subDirContents = fs.readdirSync(itemPath);
              console.log(`Contents of ${item}:`, subDirContents);
              
              if (subDirContents.includes('index.htm')) {
                indexFile = `${item}/index.htm`;
                console.log(`Found index.htm in subdirectory: ${indexFile}`);
                break;
              }
            }
          }
        }
        
        // Determine the correct tour URL
        let tourUrl = `/uploads/tours/property_${propertyId}_tour/index.htm`;
        if (indexFile && indexFile.includes('/')) {
          tourUrl = `/uploads/tours/property_${propertyId}_tour/${indexFile}`;
        }
        
        console.log(`Setting tour URL to: ${tourUrl}`);
        
        // Update the property with the tour URL
        const updatedProperty = await storage.updateProperty(propertyId, { 
          hasTour: true,
          tourUrl: tourUrl
        });
        
        res.json({
          status: "success",
          message: "Virtual tour uploaded and extracted successfully",
          tourUrl,
          property: updatedProperty,
          fileInfo: {
            originalName: req.file.originalname,
            size: req.file.size,
            mimeType: req.file.mimetype
          },
          directoryContents: directoryContents
        });
      } catch (error: any) {
        console.error(`Error processing virtual tour: ${error.message}`);
        console.error(error.stack);
        res.status(500).json({
          status: "error",
          message: "Error processing virtual tour: " + error.message
        });
      }
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}
