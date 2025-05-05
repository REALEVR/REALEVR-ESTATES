import { useQuery } from "@tanstack/react-query";
import type { Property } from "@shared/schema";

// Helper to ensure we never get cached data from the browser
function addTimestampToUrl(url: string): string {
  const timestamp = new Date().getTime();
  const randomVal = Math.random().toString(36).substring(2, 15);
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}_t=${timestamp}&_r=${randomVal}`;
}

// Custom query function that adds a timestamp and random value to prevent any caching
const freshFetch = async (url: string) => {
  // Log the fetch for debugging
  console.log(`Fetching fresh data from: ${url}`);
  
  try {
    const response = await fetch(addTimestampToUrl(url), {
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
    console.log(`Successfully fetched data from ${url}`, { count: Array.isArray(data) ? data.length : 'single item' });
    return data;
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    throw error;
  }
};

// Common refetch options for property queries to ensure data consistency
const PROPERTY_QUERY_OPTIONS = {
  staleTime: 0, // Data is always considered stale
  refetchOnMount: "always" as const,
  refetchOnWindowFocus: "always" as const,
  refetchInterval: 3000, // Poll every 3 seconds for more immediate updates
  refetchOnReconnect: true,
  gcTime: 0, // Don't keep old data in memory
  retry: 3, // Retry failed requests 3 times
  retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 10000), // Exponential backoff
};

export function useProperties() {
  const result = useQuery<Property[]>({
    queryKey: ["/api/properties"],
    ...PROPERTY_QUERY_OPTIONS,
    queryFn: () => freshFetch("/api/properties")
  });
  
  // Log data updates for debugging
  console.log("Properties query state:", { 
    isLoading: result.isLoading,
    isError: result.isError,
    dataCount: result.data?.length || 0,
    dataUpdatedAt: new Date(result.dataUpdatedAt).toLocaleTimeString()
  });
  
  return result;
}

export function useProperty(id: number) {
  const result = useQuery<Property>({
    queryKey: [`/api/properties/${id}`],
    ...PROPERTY_QUERY_OPTIONS,
    queryFn: () => freshFetch(`/api/properties/${id}`)
  });
  
  // Log property data updates for debugging
  console.log(`Property ${id} query state:`, { 
    isLoading: result.isLoading,
    isError: result.isError,
    propertyTitle: result.data?.title || 'N/A',
    dataUpdatedAt: new Date(result.dataUpdatedAt).toLocaleTimeString()
  });
  
  return result;
}

export function useFeaturedProperties() {
  const result = useQuery<Property[]>({
    queryKey: ["/api/properties/featured"],
    ...PROPERTY_QUERY_OPTIONS,
    refetchInterval: 2000, // Poll even more frequently for featured properties
    queryFn: () => freshFetch("/api/properties/featured")
  });
  
  // Log featured properties updates for debugging
  console.log("Featured properties query state:", { 
    isLoading: result.isLoading,
    isError: result.isError,
    dataCount: result.data?.length || 0,
    dataUpdatedAt: new Date(result.dataUpdatedAt).toLocaleTimeString()
  });
  
  return result;
}

export function usePropertiesByCategory(category: string) {
  const result = useQuery<Property[]>({
    queryKey: ["/api/properties/category", category],
    enabled: !!category,
    ...PROPERTY_QUERY_OPTIONS,
    queryFn: () => freshFetch(`/api/properties/category/${category}`)
  });
  
  // Log category properties updates for debugging
  if (category) {
    console.log(`${category} properties query state:`, { 
      isLoading: result.isLoading,
      isError: result.isError,
      dataCount: result.data?.length || 0,
      dataUpdatedAt: new Date(result.dataUpdatedAt).toLocaleTimeString()
    });
  }
  
  return result;
}

export function usePropertySearch(query: string) {
  const result = useQuery<Property[]>({
    queryKey: ["/api/properties/search", { q: query }],
    enabled: !!query,
    ...PROPERTY_QUERY_OPTIONS,
    queryFn: () => {
      const params = new URLSearchParams({ q: query }).toString();
      return freshFetch(`/api/properties/search?${params}`);
    }
  });
  
  // Log search results updates for debugging
  if (query) {
    console.log(`Search query "${query}" state:`, { 
      isLoading: result.isLoading,
      isError: result.isError,
      dataCount: result.data?.length || 0,
      dataUpdatedAt: new Date(result.dataUpdatedAt).toLocaleTimeString()
    });
  }
  
  return result;
}

export function usePopularProperties(limit?: number) {
  const queryParams = limit ? `?limit=${limit}` : '';
  const result = useQuery<Property[]>({
    queryKey: ["/api/properties/popular", { limit }],
    ...PROPERTY_QUERY_OPTIONS,
    queryFn: () => freshFetch(`/api/properties/popular${queryParams}`)
  });
  
  // Log popular properties updates for debugging
  console.log("Popular properties query state:", { 
    isLoading: result.isLoading,
    isError: result.isError,
    dataCount: result.data?.length || 0,
    dataUpdatedAt: new Date(result.dataUpdatedAt).toLocaleTimeString()
  });
  
  return result;
}

export function useRecentProperties(limit?: number) {
  const queryParams = limit ? `?limit=${limit}` : '';
  const result = useQuery<Property[]>({
    queryKey: ["/api/properties/recent", { limit }],
    ...PROPERTY_QUERY_OPTIONS,
    queryFn: () => freshFetch(`/api/properties/recent${queryParams}`)
  });
  
  // Log recent properties updates for debugging
  console.log("Recent properties query state:", { 
    isLoading: result.isLoading,
    isError: result.isError,
    dataCount: result.data?.length || 0,
    dataUpdatedAt: new Date(result.dataUpdatedAt).toLocaleTimeString()
  });
  
  return result;
}

export async function trackPropertyView(propertyId: number) {
  try {
    console.log(`Tracking view for property ${propertyId}`);
    const response = await fetch(`/api/properties/${propertyId}/view`, {
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
