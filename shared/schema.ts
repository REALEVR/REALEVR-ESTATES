import { pgTable, text, serial, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const properties = pgTable("properties", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  location: text("location").notNull(),
  price: integer("price").notNull(),
  currency: text("currency").default("UGX").notNull(), // Added currency field with default UGX
  description: text("description").notNull(),
  bedrooms: integer("bedrooms").notNull(),
  bathrooms: integer("bathrooms").notNull(),
  squareMeters: integer("square_meters").notNull(),
  imageUrl: text("image_url").notNull(),
  rating: text("rating").notNull(),
  reviewCount: integer("review_count").notNull(),
  propertyType: text("property_type").notNull(),
  category: text("category").notNull(), // Added category field
  isFeatured: boolean("is_featured").default(false),
  hasTour: boolean("has_tour").default(true),
  tourUrl: text("tour_url"),
  // 'equirect_360' (true 360 panoramas), 'photo_sweep_lite' (guided multi-photo
  // gallery tour), or null for legacy/manually-uploaded 3D Vista tours.
  tourQuality: text("tour_quality"),
  amenities: text("amenities").array(),
  monthlyPrice: integer("monthly_price"), // Now optional for rental properties
  isAvailable: boolean("is_available").default(true), // Property availability status
  ownerContactInfo: text("owner_contact_info"), // Owner contact information
  ownerId: integer("owner_id"), // Agent who owns this property
  viewCount: integer("view_count").default(0), // Track property view counts
  // New property details fields
  yearOfConstruction: integer("year_of_construction"),
  buildingAge: integer("building_age"),
  propertyCondition: text("property_condition"),
  auctionStart: text("auction_start"),
  auctionEnd: text("auction_end"),
  // Auction specific fields
  bankName: text("bank_name"),
  auctionDate: text("auction_date"),
  startingBid: integer("starting_bid"),
  currentBid: integer("current_bid"),
  bidIncrement: integer("bid_increment"),
  auctionStatus: text("auction_status"),
});

export const amenities = pgTable("amenities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon").notNull(),
  description: text("description").notNull(),
});

export const propertyTypes = pgTable("property_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon").notNull(),
});

export const insertPropertySchema = createInsertSchema(properties).omit({
  id: true,
});

export const insertAmenitySchema = createInsertSchema(amenities).omit({
  id: true,
});

export const insertPropertyTypeSchema = createInsertSchema(propertyTypes).omit({
  id: true,
});

export type InsertProperty = z.infer<typeof insertPropertySchema>;
export type Property = typeof properties.$inferSelect;

export type InsertAmenity = z.infer<typeof insertAmenitySchema>;
export type Amenity = typeof amenities.$inferSelect;

export type InsertPropertyType = z.infer<typeof insertPropertyTypeSchema>;
export type PropertyType = typeof propertyTypes.$inferSelect;

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull(),
  fullName: text("full_name").notNull(),
  membershipPlan: text("membership_plan"),
  membershipStartDate: text("membership_start_date"),
  membershipEndDate: text("membership_end_date"),
  role: text("role").default("normal").notNull(), // Possible values: "admin", "agent", "normal"
  isVerified: boolean("is_verified").default(false),
  emailVerificationToken: text("email_verification_token"),
  emailVerificationExpires: text("email_verification_expires"),
  // Agent-specific fields
  phoneNumber: text("phone_number"),
  companyName: text("company_name"),
  licenseNumber: text("license_number"),
  subscriptionPaymentId: text("subscription_payment_id"),
  subscriptionStatus: text("subscription_status").default("inactive"), // "active", "inactive", "expired"
  // --- Additive fields (GENE v1.8) ---
  // Real runtime storage is DynamoDB (server/dynamodb-storage.ts), which is
  // schemaless — these columns exist here only for the shared TS type +
  // zod validation; no DB migration is needed for them to start being
  // stored/read, unlike a real Postgres deployment of this schema.
  //
  // Dial code (e.g. "+256"), captured alongside phoneNumber at signup so
  // admin analytics can group users by country without parsing phone
  // strings. Deliberately separate from phoneNumber rather than baked in.
  countryCode: text("country_code"),
  // Set when a user signs in with Google (server/gene/google-auth.ts).
  // Nullable/unique-by-convention (not DB-enforced, since DynamoDB scans
  // are used for lookups here, same as email/username).
  googleId: text("google_id"),
  // "local" | "google" — which sign-in path created this account. Local
  // accounts predating this field simply have authProvider === undefined,
  // treated as "local" everywhere this is read.
  authProvider: text("auth_provider").default("local"),
  // server/dynamodb-storage.ts's createUser() already writes these two
  // (generateTimestamp() ISO strings) on every real account — they just
  // weren't declared here before, so TypeScript didn't know about them.
  // Declaring them (not part of insertUserSchema — server-generated, same
  // as `id`) is what makes server/gene/user-analytics.ts's "signups over
  // time" possible without an `as any` cast on every read.
  createdAt: text("created_at"),
  updatedAt: text("updated_at"),
});

export const insertUserSchema = createInsertSchema(users)
  .pick({
    username: true,
    password: true,
    email: true,
    fullName: true,
    membershipPlan: true,
    role: true,
    isVerified: true,
    membershipStartDate: true,
    membershipEndDate: true,
    phoneNumber: true,
    companyName: true,
    licenseNumber: true,
    subscriptionPaymentId: true,
    subscriptionStatus: true,
    countryCode: true,
    googleId: true,
    authProvider: true
  })
  .extend({
    password: z.string().min(6, "Password must be at least 6 characters"),
    email: z.string().email("Invalid email address"),
    confirmPassword: z.string(),
    role: z.enum(["admin", "agent", "normal"]).default("normal"),
    isVerified: z.boolean().optional().default(false),
    membershipStartDate: z.string().nullable().optional(),
    membershipEndDate: z.string().nullable().optional(),
    phoneNumber: z.string().optional(),
    companyName: z.string().optional(),
    licenseNumber: z.string().optional(),
    subscriptionPaymentId: z.string().optional(),
    subscriptionStatus: z.enum(["active", "inactive", "expired"]).optional().default("inactive"),
    countryCode: z.string().optional(),
    googleId: z.string().optional(),
    authProvider: z.enum(["local", "google"]).optional().default("local"),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export type InsertUser = Omit<z.infer<typeof insertUserSchema>, "confirmPassword">;
export type User = typeof users.$inferSelect;
