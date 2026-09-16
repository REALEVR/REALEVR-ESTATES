/**
 * React Query hooks for the agent portfolio "mini-website"
 * (server/gene/agent-portfolio.ts) — both the editor's own data (this
 * agent's bio/articles) and the public page anyone can view.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getQueryFn } from "@/lib/queryClient";

export interface AgentPortfolio {
  userId: number;
  tagline?: string;
  bio?: string;
  avatarUrl?: string;
  coverImageUrl?: string;
  specialties?: string[];
  yearsExperience?: number;
  updatedAt: string;
}

export interface AgentArticle {
  id: number;
  userId: number;
  title: string;
  slug: string;
  excerpt?: string;
  body: string;
  coverImageUrl?: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AgentPortfolioMe {
  portfolio: AgentPortfolio | null;
  articles: AgentArticle[];
  shareUrl: string;
}

export interface PublicAgentPortfolio {
  agent: {
    username: string;
    fullName: string;
    companyName: string | null;
    phoneNumber: string | null;
    role: string;
  };
  portfolio: {
    tagline: string | null;
    bio: string | null;
    avatarUrl: string | null;
    coverImageUrl: string | null;
    specialties: string[];
    yearsExperience: number | null;
  };
  stats: {
    totalProperties: number;
    avgRating: number;
    totalReviews: number;
    totalViews: number;
  };
  properties: Array<{
    id: number;
    title: string;
    location: string;
    price: number;
    currency: string;
    category: string;
    imageUrl: string;
    bedrooms: number;
    bathrooms: number;
    isAvailable: boolean;
    hasTour: boolean;
    rating: string;
    reviewCount: number;
  }>;
  articles: Array<Omit<AgentArticle, "userId" | "published">>;
  reviews: Array<{ rating: number; comment: string; userName: string; createdAt: string; propertyTitle: string | null }>;
  shareUrl: string;
}

const ME_KEY = ["/api/agent/portfolio/me"];

export function useMyAgentPortfolio(enabled: boolean) {
  return useQuery<AgentPortfolioMe>({
    queryKey: ME_KEY,
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled,
  });
}

export function useSaveAgentPortfolio() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Pick<AgentPortfolio, "tagline" | "bio" | "avatarUrl" | "coverImageUrl" | "specialties" | "yearsExperience">>) => {
      const res = await apiRequest("PUT", "/api/agent/portfolio", input);
      return (await res.json()) as AgentPortfolio;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ME_KEY }),
  });
}

export function useCreateAgentArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { title: string; excerpt?: string; body: string; coverImageUrl?: string; published: boolean }) => {
      const res = await apiRequest("POST", "/api/agent/portfolio/articles", input);
      return (await res.json()) as AgentArticle;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ME_KEY }),
  });
}

export function useUpdateAgentArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: number; title?: string; excerpt?: string; body?: string; coverImageUrl?: string; published?: boolean }) => {
      const res = await apiRequest("PUT", `/api/agent/portfolio/articles/${id}`, input);
      return (await res.json()) as AgentArticle;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ME_KEY }),
  });
}

export function useDeleteAgentArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/agent/portfolio/articles/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ME_KEY }),
  });
}

export function usePublicAgentPortfolio(username: string | undefined) {
  return useQuery<PublicAgentPortfolio>({
    queryKey: ["/api/agents", username, "portfolio"],
    queryFn: async () => {
      const res = await fetch(`/api/agents/${encodeURIComponent(username!)}/portfolio`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || "Portfolio not found");
      }
      return res.json();
    },
    enabled: !!username,
    retry: false,
  });
}
