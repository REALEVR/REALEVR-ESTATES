import { useQuery } from "@tanstack/react-query";
import type { Property } from "@shared/schema";

export function useProperties() {
  return useQuery<Property[]>({
    queryKey: ["/api/properties"],
    staleTime: 0, // Always refetch to ensure fresh data
  });
}

export function useProperty(id: number) {
  return useQuery<Property>({
    queryKey: [`/api/properties/${id}`],
    staleTime: 0, // Always refetch to ensure fresh data
  });
}

export function useFeaturedProperties() {
  return useQuery<Property[]>({
    queryKey: ["/api/properties/featured"],
    staleTime: 0, // Always refetch to ensure fresh data
  });
}

export function usePropertiesByCategory(category: string) {
  return useQuery<Property[]>({
    queryKey: ["/api/properties/category", category],
    enabled: !!category,
    staleTime: 0, // Always refetch to ensure fresh data
  });
}

export function usePropertySearch(query: string) {
  return useQuery<Property[]>({
    queryKey: ["/api/properties/search", { q: query }],
    enabled: !!query,
    staleTime: 0, // Always refetch to ensure fresh data
    queryFn: ({ queryKey }) => {
      // We need a custom query function to handle the query parameter
      const [url, params] = queryKey;
      const searchParams = new URLSearchParams(params as Record<string, string>).toString();
      return fetch(`${url}?${searchParams}`).then(res => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
      });
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
