/**
 * React Query hooks for in-app messaging (server/gene/messaging.ts) —
 * tenant<->agent conversations, agent<->admin support threads, and (admin
 * only) a read-only view of WhatsApp threads. See that file's doc comment
 * for how this differs from the older landlord-hub "Inbox" (interest
 * signals, not a real conversation).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getQueryFn } from "@/lib/queryClient";

export type ConversationKind = "tenant_agent" | "agent_admin";

export interface Conversation {
  id: number;
  kind: ConversationKind;
  propertyId?: number;
  propertyTitle?: string;
  participantIds: number[];
  participantNames: Record<number, string>;
  createdAt: string;
  updatedAt: string;
  lastMessagePreview: string;
}

export interface ConversationMessage {
  id: number;
  conversationId: number;
  senderId: number;
  senderName: string;
  body: string;
  createdAt: string;
}

export interface WhatsappThreadSummary {
  phone: string;
  name: string;
  updatedAt: string;
  lastMessagePreview: string;
  messageCount: number;
}

export interface WhatsappThreadMessage {
  id: number;
  phone: string;
  direction: "inbound" | "outbound";
  text: string;
  createdAt: string;
}

export function useConversations(enabled: boolean) {
  return useQuery<Conversation[]>({
    queryKey: ["/api/gene/messages/conversations"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled,
    refetchInterval: enabled ? 15000 : false,
  });
}

export function useConversationMessages(conversationId: number | null) {
  return useQuery<{ conversation: Conversation; messages: ConversationMessage[] }>({
    queryKey: [`/api/gene/messages/conversations/${conversationId}/messages`],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: conversationId !== null,
    refetchInterval: conversationId !== null ? 5000 : false,
  });
}

export function useStartConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { toUserId: number; propertyId?: number; message: string }) => {
      const res = await apiRequest("POST", "/api/gene/messages/start", input);
      return res.json() as Promise<{ conversation: Conversation; message: ConversationMessage }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gene/messages/conversations"] });
    },
  });
}

export function useStartAgentAdminConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { message: string; agentId?: number }) => {
      const res = await apiRequest("POST", "/api/gene/messages/agent-admin/start", input);
      return res.json() as Promise<{ conversation: Conversation; message: ConversationMessage }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gene/messages/conversations"] });
    },
  });
}

export function useSendMessage(conversationId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (message: string) => {
      if (conversationId === null) throw new Error("No conversation selected");
      const res = await apiRequest("POST", `/api/gene/messages/conversations/${conversationId}/send`, { message });
      return res.json() as Promise<{ message: ConversationMessage }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/gene/messages/conversations/${conversationId}/messages`] });
      queryClient.invalidateQueries({ queryKey: ["/api/gene/messages/conversations"] });
    },
  });
}

export function useWhatsappThreads(enabled: boolean) {
  return useQuery<WhatsappThreadSummary[]>({
    queryKey: ["/api/gene/messages/whatsapp-threads"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled,
    refetchInterval: enabled ? 15000 : false,
  });
}

export function useWhatsappThreadMessages(phone: string | null) {
  return useQuery<WhatsappThreadMessage[]>({
    queryKey: [`/api/gene/messages/whatsapp-threads/${phone}`],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: phone !== null,
    refetchInterval: phone !== null ? 5000 : false,
  });
}
