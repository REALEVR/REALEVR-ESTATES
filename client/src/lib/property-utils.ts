import type { Property } from "@shared/schema";

/**
 * Ensures that a property's amenities field is always an array
 * This is a defensive programming measure to handle any malformed data
 */
export function ensureAmenitiesArray(property: Property): Property {
  if (!property) return property;

  let amenities: string[] = [];

  // The Property type declares amenities as string[], but this function exists
  // specifically to defend against malformed runtime data (e.g. legacy records
  // where amenities was stored as a raw or JSON-encoded string) that doesn't
  // actually conform to that type. Read through `unknown` so TypeScript's
  // static narrowing doesn't treat the string-handling branches as unreachable.
  const rawAmenities = property.amenities as unknown;

  if (Array.isArray(rawAmenities)) {
    amenities = rawAmenities;
  } else if (typeof rawAmenities === 'string') {
    try {
      const parsed = JSON.parse(rawAmenities);
      if (Array.isArray(parsed)) {
        amenities = parsed;
      } else {
        // If it's a string but not a JSON array, treat as comma-separated
        amenities = rawAmenities.split(',').map((s: string) => s.trim());
      }
    } catch (e) {
      // If JSON parsing fails, treat as comma-separated
      amenities = rawAmenities.split(',').map((s: string) => s.trim());
    }
  }
  // If amenities is null, undefined, or any other type, it remains an empty array

  return {
    ...property,
    amenities: amenities
  };
}

/**
 * Ensures that an array of properties all have properly formatted amenities
 */
export function ensurePropertiesAmenitiesArray(properties: Property[]): Property[] {
  if (!Array.isArray(properties)) return [];
  
  return properties.map(property => ensureAmenitiesArray(property));
}

/**
 * Safe amenities renderer - returns an empty array if amenities is not an array
 */
export function getSafeAmenities(property: Property): string[] {
  if (!property || !property.amenities) return [];
  
  if (Array.isArray(property.amenities)) {
    return property.amenities;
  }
  
  // If it's not an array, process it through our utility function
  const processedProperty = ensureAmenitiesArray(property);
  return processedProperty.amenities || [];
}
