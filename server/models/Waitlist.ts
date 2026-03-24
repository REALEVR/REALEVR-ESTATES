export type PropertyType = 'residential' | 'commercial' | 'land' | 'mixed'
export type InterestType = 'quick-sale' | 'long-term-rent' | 'short-term-rent' | 'all'
export type HeardAboutType = 'social-media' | 'referral' | 'search' | 'ad' | 'other'
export type WaitlistStatus = 'pending' | 'verified' | 'invited' | 'registered' | 'rejected'

export interface WaitlistSocialMedia {
    instagram?: string
    facebook?: string
    linkedin?: string
}

export interface WaitlistEntry {
    id: string
    firstName: string
    lastName: string
    email: string
    phoneNumber?: string
    propertyType: PropertyType
    propertyCount?: number
    location?: string
    city?: string
    state?: string
    country?: string
    interest: InterestType
    estimatedPropertyValue?: string
    businessDescription?: string
    website?: string
    socialMedia?: WaitlistSocialMedia
    heardAbout: HeardAboutType
    referralCode?: string
    status: WaitlistStatus
    emailVerified: boolean
    verificationToken?: string
    verificationTokenExpiry?: string
    inviteToken?: string
    inviteTokenExpiry?: string
    sentAtTimestamp?: string
    registeredAtTimestamp?: string
    notes?: string
    createdAt: string
    updatedAt: string
}

export interface WaitlistRegistrationInput {
    firstName: string
    lastName: string
    email: string
    phoneNumber?: string
    propertyType: PropertyType
    propertyCount?: number
    location?: string
    city?: string
    state?: string
    country?: string
    interest: InterestType
    estimatedPropertyValue?: string
    businessDescription?: string
    website?: string
    socialMedia?: WaitlistSocialMedia
    heardAbout: HeardAboutType
    referralCode?: string
}
