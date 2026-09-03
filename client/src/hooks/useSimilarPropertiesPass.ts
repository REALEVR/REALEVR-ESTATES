import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getQueryFn } from '@/lib/queryClient'

interface SimilarPropertiesStatus {
    active: boolean
    priceUgx: number
}

/** Whether the caller currently has an active "Similar Properties" unlock
 * (server/gene/similar-properties-pass.ts). Unauthenticated visitors always
 * get { active: false } rather than a 401 — see that route's own handling. */
export function useSimilarPropertiesPass(enabled: boolean) {
    return useQuery<SimilarPropertiesStatus>({
        queryKey: ['/api/gene/similar-properties/status'],
        queryFn: getQueryFn({ on401: 'returnNull' }),
        enabled,
    })
}

export function useInvalidateSimilarPropertiesPass() {
    const queryClient = useQueryClient()
    return () => queryClient.invalidateQueries({ queryKey: ['/api/gene/similar-properties/status'] })
}
