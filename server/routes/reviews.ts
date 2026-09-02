import { Router } from 'express'
import {
    createReview,
    getReviewsForProperty,
    getReview,
    deleteReview,
    getPropertyRatingSummary,
} from '../models/Review'
import { storage } from '../storage'

const router = Router()

// Recompute and persist the aggregate rating/reviewCount shown on the property card.
async function syncPropertyRatingSummary(propertyId: number): Promise<void> {
    const { average, count } = await getPropertyRatingSummary(propertyId)
    await storage.updateProperty(propertyId, {
        rating: average.toFixed(1),
        reviewCount: count,
    })
}

// GET /api/reviews/property/:propertyId - Public list of reviews for a property
router.get('/property/:propertyId', async (req: any, res: any) => {
    try {
        const propertyId = parseInt(req.params.propertyId, 10)
        if (Number.isNaN(propertyId)) {
            return res.status(400).json({ message: 'Invalid property id' })
        }
        const reviews = await getReviewsForProperty(propertyId)
        res.json({ reviews })
    } catch (error: any) {
        console.error('[Reviews] Error fetching reviews:', error)
        res.status(500).json({ message: error.message })
    }
})

// POST /api/reviews - Create a review (authenticated users only)
router.post('/', async (req: any, res: any) => {
    try {
        if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
            return res.status(401).json({ message: 'Not authenticated' })
        }
        const { propertyId, rating, comment } = req.body || {}
        const parsedPropertyId = parseInt(propertyId, 10)
        const parsedRating = Number(rating)

        if (Number.isNaN(parsedPropertyId)) {
            return res.status(400).json({ message: 'Invalid property id' })
        }
        if (!Number.isFinite(parsedRating) || parsedRating < 1 || parsedRating > 5) {
            return res.status(400).json({ message: 'Rating must be between 1 and 5' })
        }
        if (!comment || typeof comment !== 'string' || !comment.trim()) {
            return res.status(400).json({ message: 'Comment is required' })
        }

        const property = await storage.getProperty(parsedPropertyId)
        if (!property) {
            return res.status(404).json({ message: 'Property not found' })
        }

        const review = await createReview({
            propertyId: parsedPropertyId,
            userId: req.user.id,
            userName: req.user.fullName || req.user.username || 'Anonymous',
            rating: parsedRating,
            comment: comment.trim(),
        })

        await syncPropertyRatingSummary(parsedPropertyId)

        res.status(201).json({ review })
    } catch (error: any) {
        console.error('[Reviews] Error creating review:', error)
        res.status(500).json({ message: error.message })
    }
})

// DELETE /api/reviews/:reviewId - Remove a review (author or admin only)
router.delete('/:reviewId', async (req: any, res: any) => {
    try {
        if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
            return res.status(401).json({ message: 'Not authenticated' })
        }
        const { reviewId } = req.params
        const review = await getReview(reviewId)
        if (!review) {
            return res.status(404).json({ message: 'Review not found' })
        }
        if (review.userId !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Forbidden' })
        }
        await deleteReview(reviewId)
        await syncPropertyRatingSummary(review.propertyId)
        res.json({ message: 'Review deleted' })
    } catch (error: any) {
        console.error('[Reviews] Error deleting review:', error)
        res.status(500).json({ message: error.message })
    }
})

export default router
