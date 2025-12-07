import { useQuery } from "@tanstack/react-query";
import type { Property } from "@shared/schema";

// Custom query function that ensures fresh data
const freshFetch = async (url: string) => {
  try {
    const response = await fetch(url, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Requested-With': 'XMLHttpRequest'
      },
      credentials: "include"
    });
    
    if (!response.ok) {
      console.error(`Fetch error for ${url}: ${response.status} ${response.statusText}`);
      throw new Error(`Network response was not ok: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    throw error;
  }
};

// Common refetch options for property queries to ensure data consistency
const PROPERTY_QUERY_OPTIONS = {
  staleTime: 5 * 60 * 1000, // Data is fresh for 5 minutes
  refetchOnMount: true, // Only refetch if data is stale
  refetchOnWindowFocus: false, // Don't refetch on window focus
  refetchOnReconnect: true,
  gcTime: 10 * 60 * 1000, // Keep data in memory for 10 minutes
  retry: 3, // Retry failed requests 3 times
  retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 10000), // Exponential backoff
};

export function useProperties() {
  const result = useQuery<Property[]>({
    queryKey: ["/api/properties"],
    ...PROPERTY_QUERY_OPTIONS,
    queryFn: () => freshfetch(import.meta.env.VITE_BACKEND_URL +"/api/properties")
  });
  
  return result;
}

export function useProperty(id: number) {
  const result = useQuery<Property>({
    queryKey: [`/api/properties/${id}`],
    ...PROPERTY_QUERY_OPTIONS,
    queryFn: () => freshfetch(import.meta.env.VITE_BACKEND_URL +`/api/properties/${id}`)
  });
  
  return result;
}

export function useFeaturedProperties() {
  const result = useQuery<Property[]>({
    queryKey: ["/api/properties/featured"],
    ...PROPERTY_QUERY_OPTIONS,
    queryFn: () => freshfetch(import.meta.env.VITE_BACKEND_URL +"/api/properties/featured")
  });
  
  return result;
}

export function usePropertiesByCategory(category: string) {
  const result = useQuery<Property[]>({
    queryKey: ["/api/properties/category", category],
    enabled: !!category,
    ...PROPERTY_QUERY_OPTIONS,
    queryFn: () => freshfetch(import.meta.env.VITE_BACKEND_URL +`/api/properties/category/${category}`)
  });
  
  return result;
}

export function usePropertySearch(query: string) {
  const result = useQuery<Property[]>({
    queryKey: ["/api/properties/search", { q: query }],
    enabled: !!query,
    ...PROPERTY_QUERY_OPTIONS,
    queryFn: () => {
      const params = new URLSearchParams({ q: query }).toString();
      return freshfetch(import.meta.env.VITE_BACKEND_URL +`/api/properties/search?${params}`);
    }
  });
  
  return result;
}

export function usePopularProperties(limit?: number) {
  const queryParams = limit ? `?limit=${limit}` : '';
  const result = useQuery<Property[]>({
    queryKey: ["/api/properties/popular", { limit }],
    ...PROPERTY_QUERY_OPTIONS,
    queryFn: () => freshfetch(import.meta.env.VITE_BACKEND_URL +`/api/properties/popular${queryParams}`)
  });
  
  return result;
}

export function useRecentProperties(limit?: number) {
  const queryParams = limit ? `?limit=${limit}` : '';
  const result = useQuery<Property[]>({
    queryKey: ["/api/properties/recent", { limit }],
    ...PROPERTY_QUERY_OPTIONS,
    queryFn: () => freshfetch(import.meta.env.VITE_BACKEND_URL +`/api/properties/recent${queryParams}`)
  });
  
  return result;
}

export async function trackPropertyView(propertyId: number) {
  try {
    console.log(`Tracking view for property ${propertyId}`);
    const response = await fetch(import.meta.env.VITE_BACKEND_URL +`/api/properties/${propertyId}/view`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to track property view: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`View tracked successfully, new count: ${data.viewCount}`);
    return data.viewCount;
  } catch (error) {
    console.error('Error tracking property view:', error);
    // Don't throw error as this is a non-critical operation
    return null;
  }
}

export default {
  useProperties,
  useProperty,
  useFeaturedProperties,
  usePropertiesByCategory,
  usePropertySearch,
  usePopularProperties,
  useRecentProperties,
  trackPropertyView,
};
