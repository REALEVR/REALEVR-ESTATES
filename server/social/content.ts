import { Type } from '@google/genai'
import { getGeminiClient } from '../lib/gemini'
import type { Property } from '@shared/schema'
import type { PlatformCaptions } from './types'

const SYSTEM_INSTRUCTION =
    'You are the social media manager for RealEVR Estates, a Ugandan real-estate platform known for ' +
    'immersive VR property tours. Write one daily promotional post about the given property, adapted ' +
    'per platform. Be warm and professional, never spammy. Always mention the property is viewable via ' +
    'a VR tour on the site. Include 3-5 relevant hashtags (#RealEVREstates plus location/property-type ' +
    'ones). Do not invent details not given to you.'

const responseSchema = {
    type: Type.OBJECT,
    properties: {
        facebook: { type: Type.STRING, description: 'Up to ~2 short paragraphs, friendly tone' },
        instagram: { type: Type.STRING, description: 'Punchy, emoji-friendly, hashtags at the end' },
        twitter: { type: Type.STRING, description: 'Under 260 characters including hashtags' },
        linkedin: { type: Type.STRING, description: 'Slightly more professional framing, still concise' },
    },
    required: ['facebook', 'instagram', 'twitter', 'linkedin'],
}

const FALLBACK_HASHTAGS = '#RealEVREstates #VirtualTour #UgandaRealEstate'

function fallbackCaptions(property: Property): PlatformCaptions {
    const base = `${property.title} in ${property.location} — take the VR tour on RealEVR Estates. ${FALLBACK_HASHTAGS}`
    return { facebook: base, instagram: base, twitter: base.slice(0, 260), linkedin: base }
}

/**
 * Draft today's social captions for one property, one Gemini call, one JSON response
 * covering all four platforms so tone/length can differ without four separate calls.
 * Falls back to a plain templated caption if Gemini isn't configured or errors.
 */
export async function generateDailyCaptions(property: Property): Promise<PlatformCaptions> {
    const ai = getGeminiClient()
    if (!ai) return fallbackCaptions(property)

    const prompt = `Property details:
Title: ${property.title}
Location: ${property.location}
Price: ${property.currency} ${property.price.toLocaleString()}${property.category === 'rental' ? '/month' : ''}
Bedrooms: ${property.bedrooms}, Bathrooms: ${property.bathrooms}
Category: ${property.propertyType} (${property.category})
${property.amenities?.length ? `Amenities: ${property.amenities.join(', ')}` : ''}`

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { systemInstruction: SYSTEM_INSTRUCTION, responseMimeType: 'application/json', responseSchema },
        })
        const parsed = JSON.parse(response.text || '{}')
        if (parsed.facebook && parsed.instagram && parsed.twitter && parsed.linkedin) {
            return parsed as PlatformCaptions
        }
        return fallbackCaptions(property)
    } catch (error) {
        console.error('[Social] Caption generation failed, using fallback:', error)
        return fallbackCaptions(property)
    }
}
