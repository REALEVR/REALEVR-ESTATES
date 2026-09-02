import { useState } from 'react'
import { Star, Trash2 } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useReviews } from '@/hooks/useReviews'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

function StarRating({
    value,
    onChange,
    size = 20,
    readOnly = false,
}: {
    value: number
    onChange?: (value: number) => void
    size?: number
    readOnly?: boolean
}) {
    const [hovered, setHovered] = useState<number | null>(null)
    const display = hovered ?? value

    return (
        <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
                <button
                    type="button"
                    key={star}
                    disabled={readOnly}
                    className={readOnly ? 'cursor-default' : 'cursor-pointer'}
                    onMouseEnter={() => !readOnly && setHovered(star)}
                    onMouseLeave={() => !readOnly && setHovered(null)}
                    onClick={() => !readOnly && onChange?.(star)}
                >
                    <Star
                        size={size}
                        className={star <= display ? 'fill-[#FFB400] text-[#FFB400]' : 'text-gray-300'}
                    />
                </button>
            ))}
        </div>
    )
}

interface ReviewsSectionProps {
    propertyId: number
}

export default function ReviewsSection({ propertyId }: ReviewsSectionProps) {
    const { user } = useAuth()
    const { toast } = useToast()
    const { reviews, isLoading, createReview, isCreating, deleteReview } = useReviews(propertyId)
    const [rating, setRating] = useState(0)
    const [comment, setComment] = useState('')

    const alreadyReviewed = user ? reviews.some((r) => r.userId === user.id) : false

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (rating === 0) {
            toast({ title: 'Please select a star rating', variant: 'destructive' })
            return
        }
        if (!comment.trim()) {
            toast({ title: 'Please write a short comment', variant: 'destructive' })
            return
        }
        try {
            await createReview({ rating, comment: comment.trim() })
            setRating(0)
            setComment('')
            toast({ title: 'Thanks for your review!' })
        } catch (error: any) {
            toast({ title: 'Failed to submit review', description: error.message, variant: 'destructive' })
        }
    }

    return (
        <div className="space-y-6">
            {user && !alreadyReviewed && (
                <Card>
                    <CardContent className="p-6">
                        <h4 className="font-semibold mb-3">Leave a review</h4>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <StarRating value={rating} onChange={setRating} />
                            <Textarea
                                placeholder="Share your experience with this property..."
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                rows={3}
                            />
                            <Button type="submit" disabled={isCreating}>
                                {isCreating ? 'Submitting...' : 'Submit Review'}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            )}

            {isLoading ? (
                <div className="space-y-3">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                </div>
            ) : reviews.length === 0 ? (
                <p className="text-gray-500 italic">No reviews yet. Be the first to share your experience.</p>
            ) : (
                <div className="space-y-4">
                    {reviews.map((review) => (
                        <Card key={review.id}>
                            <CardContent className="p-4">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium">{review.userName}</span>
                                            <StarRating value={review.rating} readOnly size={14} />
                                        </div>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            {new Date(review.createdAt).toLocaleDateString(undefined, {
                                                year: 'numeric',
                                                month: 'short',
                                                day: 'numeric',
                                            })}
                                        </p>
                                    </div>
                                    {user && (user.id === review.userId || user.role === 'admin') && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => deleteReview(review.id)}
                                            aria-label="Delete review"
                                        >
                                            <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" />
                                        </Button>
                                    )}
                                </div>
                                <p className="text-gray-600 mt-2">{review.comment}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}
