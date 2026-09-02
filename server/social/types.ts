export type SocialPlatform = 'facebook' | 'instagram' | 'twitter' | 'linkedin'

export interface PlatformCaptions {
    facebook: string
    instagram: string
    twitter: string
    linkedin: string
}

export interface PostResult {
    platform: SocialPlatform
    status: 'posted' | 'skipped' | 'failed'
    detail: string
    postId?: string
}
