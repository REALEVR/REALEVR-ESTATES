import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getQueryFn } from "@/lib/queryClient";

const LINK_KEY = ["/api/gene/whatsapp/link/me"];

export function useWhatsappLinkStatus(enabled: boolean) {
  return useQuery<{ linked: boolean; phone: string | null }>({
    queryKey: LINK_KEY,
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled,
  });
}

export function useLinkWhatsapp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (phone: string) => {
      const res = await apiRequest("POST", "/api/gene/whatsapp/link", { phone });
      return (await res.json()) as { linked: boolean; phone: string };
    },
    onSuccess: (data) => {
      queryClient.setQueryData(LINK_KEY, { linked: true, phone: data.phone });
    },
  });
}
