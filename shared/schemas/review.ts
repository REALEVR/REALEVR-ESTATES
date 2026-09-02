export interface Review {
    id: string
    propertyId: number
    userId: number
    userName: string
    rating: number // 1-5
    comment: string
    createdAt: string
    updatedAt: string
}

export interface CreateReviewInput {
    propertyId: number
    userId: number
    userName: string
    rating: number
    comment: string
}
