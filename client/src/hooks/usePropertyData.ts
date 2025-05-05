import { useQuery } from "@tanstack/react-query";
import type { Property } from "@shared/schema";

// Helper to ensure we never get cached data from the browser
function addTimestampToUrl(url: string): string {
  const timestamp = new Date().getTime();
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}_t=${timestamp}`;
}

// Custom query function that adds a timestamp to prevent any caching
const freshFetch = async (url: string) => {
  const response = await fetch(addTimestampToUrl(url), {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    },
    credentials: "include"
  });
  
  if (!response.ok) {
    throw new Error('Network response was not ok');
  }
  
  return response.json();
};

export function useProperties() {
  return useQuery<Property[]>({
    queryKey: ["/api/properties"],
    staleTime: 0,
    refetchOnMount: true,
    gcTime: 0, // In React Query v5, cacheTime was renamed to gcTime
    queryFn: () => freshFetch("/api/properties")
  });
}

export function useProperty(id: number) {
  return useQuery<Property>({
    queryKey: [`/api/properties/${id}`],
    staleTime: 0,
    refetchOnMount: true,
    gcTime: 0,
    queryFn: () => freshFetch(`/api/properties/${id}`)
  });
}

export function useFeaturedProperties() {
  return useQuery<Property[]>({
    queryKey: ["/api/properties/featured"],
    staleTime: 0,
    refetchOnMount: true,
    gcTime: 0,
    queryFn: () => freshFetch("/api/properties/featured")
  });
}

export function usePropertiesByCategory(category: string) {
  return useQuery<Property[]>({
    queryKey: ["/api/properties/category", category],
    enabled: !!category,
    staleTime: 0,
    refetchOnMount: true,
    gcTime: 0,
    queryFn: () => freshFetch(`/api/properties/category/${category}`)
  });
}

export function usePropertySearch(query: string) {
  return useQuery<Property[]>({
    queryKey: ["/api/properties/search", { q: query }],
    enabled: !!query,
    staleTime: 0,
    refetchOnMount: true,
    gcTime: 0,
    queryFn: () => {
      const params = new URLSearchParams({ q: query }).toString();
      return freshFetch(`/api/properties/search?${params}`);
    }
  });
}

export default {
  useProperties,
  useProperty,
  useFeaturedProperties,
  usePropertiesByCategory,
  usePropertySearch,
};
