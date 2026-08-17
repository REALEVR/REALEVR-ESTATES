import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'
import type { Review } from '../../../shared/schemas/review'

interface ReviewsResponse {
    reviews: Review[]
}

export function useReviews(propertyId: number) {
    const queryClient = useQueryClient()
    const queryKey = ['/api/reviews/property', propertyId]

    const { data, isLoading, error } = useQuery<ReviewsResponse>({
        queryKey,
        queryFn: async () => {
            const res = await fetch(`/api/reviews/property/${propertyId}`, { credentials: 'include' })
            if (!res.ok) throw new Error('Failed to fetch reviews')
            return res.json()
        },
        enabled: Number.isFinite(propertyId),
    })

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey })
        queryClient.invalidateQueries({ queryKey: ['/api/properties', propertyId] })
    }

    const createReviewMutation = useMutation({
        mutationFn: (input: { rating: number; comment: string }) =>
            apiRequest('POST', '/api/reviews', { propertyId, ...input }),
        onSuccess: invalidate,
    })

    const deleteReviewMutation = useMutation({
        mutationFn: (reviewId: string) => apiRequest('DELETE', `/api/reviews/${reviewId}`),
        onSuccess: invalidate,
    })

    return {
        reviews: data?.reviews ?? [],
        isLoading,
        error,
        createReview: createReviewMutation.mutateAsync,
        isCreating: createReviewMutation.isPending,
        deleteReview: deleteReviewMutation.mutate,
    }
}
