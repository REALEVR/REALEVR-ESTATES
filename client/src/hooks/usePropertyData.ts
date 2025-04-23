import { useQuery } from "@tanstack/react-query";
import type { Property } from "@shared/schema";

export function useProperties() {
  return useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });
}

export function useProperty(id: number) {
  return useQuery<Property>({
    queryKey: [`/api/properties/${id}`],
  });
}

export function useFeaturedProperties() {
  return useQuery<Property[]>({
    queryKey: ["/api/properties/featured"],
  });
}

export function usePropertiesByCategory(category: string) {
  return useQuery<Property[]>({
    queryKey: ["/api/properties/category", category],
    enabled: !!category,
  });
}

export function usePropertySearch(query: string) {
  return useQuery<Property[]>({
    queryKey: ["/api/properties/search", query],
    enabled: !!query,
  });
}

export default {
  useProperties,
  useProperty,
  useFeaturedProperties,
  usePropertiesByCategory,
  usePropertySearch,
};
