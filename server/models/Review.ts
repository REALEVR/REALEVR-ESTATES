import { DynamoDBUtils, TABLES, generateId, generateTimestamp } from '../dynamodb'
import type { Review, CreateReviewInput } from '../../shared/schemas/review'

const TABLE = (TABLES as any).REVIEWS as string

export async function createReview(input: CreateReviewInput): Promise<Review> {
    const now = generateTimestamp()
    const review: Review = {
        id: generateId().toString(),
        propertyId: input.propertyId,
        userId: input.userId,
        userName: input.userName,
        rating: input.rating,
        comment: input.comment,
        createdAt: now,
        updatedAt: now,
    }
    await DynamoDBUtils.putItem(TABLE, review as unknown as Record<string, unknown>)
    return review
}

export async function getReviewsForProperty(propertyId: number): Promise<Review[]> {
    const items = await DynamoDBUtils.scanTable(
        TABLE,
        '#pid = :pid',
        { ':pid': propertyId },
        { '#pid': 'propertyId' }
    )
    const reviews = items as unknown as Review[]
    return reviews.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export async function getAllReviews(): Promise<Review[]> {
    const items = await DynamoDBUtils.scanTable(TABLE)
    const reviews = items as unknown as Review[]
    return reviews.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export async function getReview(reviewId: string): Promise<Review | undefined> {
    const item = await DynamoDBUtils.getItem(TABLE, { id: reviewId })
    return item as Review | undefined
}

export async function deleteReview(reviewId: string): Promise<void> {
    await DynamoDBUtils.deleteItem(TABLE, { id: reviewId })
}

export async function getPropertyRatingSummary(
    propertyId: number
): Promise<{ average: number; count: number }> {
    const reviews = await getReviewsForProperty(propertyId)
    if (reviews.length === 0) {
        return { average: 0, count: 0 }
    }
    const total = reviews.reduce((sum, r) => sum + r.rating, 0)
    return { average: Math.round((total / reviews.length) * 10) / 10, count: reviews.length }
}
