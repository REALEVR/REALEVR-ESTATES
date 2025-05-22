import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  retries = 3
): Promise<Response> {
  try {
    const res = await fetch(url, {
      method,
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });

    await throwIfResNotOk(res);
    return res;
  } catch (error) {
    console.error(`API request failed: ${method} ${url}`, error);

    // If we have retries left and it's a network error, retry the request
    if (retries > 0 && (error instanceof TypeError || error.message?.includes('network'))) {
      console.log(`Retrying request (${retries} attempts left)...`);
      // Wait with exponential backoff before retrying
      const delay = Math.min(1000 * (2 ** (3 - retries)), 5000);
      await new Promise(resolve => setTimeout(resolve, delay));
      return apiRequest(method, url, data, retries - 1);
    }

    throw error;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: true, // Changed to true to refresh on focus
      staleTime: 0, // Changed to 0 to always fetch fresh data
      retry: 3, // Add retry attempts
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000), // Exponential backoff
    },
    mutations: {
      retry: 2, // Add retry for mutations too
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000), // Exponential backoff
    },
  },
});
