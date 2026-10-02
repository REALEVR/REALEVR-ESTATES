/**
 * Server-rendered copy of the site's content pages, for crawlers.
 *
 * Search and AI crawlers (GPTBot, ClaudeBot, PerplexityBot and others) fetch the HTML and many do not run JavaScript,
 * so a pure single-page app shows them an empty shell. This file renders the real page components to HTML with React,
 * and collects each page's own title, description, canonical and structured data from <PageSeo> while it does, so the
 * page states those once for browsers and crawlers alike.
 *
 * Built into dist/ssr/static-pages.cjs by scripts/build-ssr.mjs and loaded by server/crawler-pages.ts. If the bundle is
 * missing the server falls back to a smaller crawler page; nothing breaks.
 */
import { renderToString } from 'react-dom/server'
import { Router } from 'wouter'
import type { ComponentType } from 'react'
import type { PageSeoProps } from '@/components/seo/PageSeo'

import AboutUsPage from '@/pages/AboutUsPage'
import HowItWorksPage from '@/pages/HowItWorksPage'
import TrustSafetyPage from '@/pages/TrustSafetyPage'
import ContactUsPage from '@/pages/ContactUsPage'
import HelpCenterPage from '@/pages/HelpCenterPage'
import HostResponsibly from '@/pages/HostResponsibly'
import RefundPolicy from '@/pages/RefundPolicy'
import CookiePolicy from '@/pages/CookiePolicy'
import PrivacyPolicy from '@/pages/PrivacyPolicy'
import TermsOfService from '@/pages/TermsOfService'
import AuctionTerms from '@/pages/AuctionTerms'
import BidderVetting from '@/pages/BidderVetting'
import LegalCenter from '@/pages/LegalCenter'
import LegalRegions from '@/pages/LegalRegions'
import AcceptableUse from '@/pages/AcceptableUse'
import AmlSanctions from '@/pages/AmlSanctions'
import DataRights from '@/pages/DataRights'
import PartnerTerms from '@/pages/PartnerTerms'
import GuidesPage from '@/pages/GuidesPage'
import GuideArticlePage from '@/pages/GuideArticlePage'
import ComparePage from '@/pages/ComparePage'
import CompareIndexPage from '@/pages/CompareIndexPage'
import { GUIDES } from '@shared/guides'
import { COMPARISONS } from '@shared/compare'

const PAGES: Record<string, ComponentType> = {
    '/about': AboutUsPage,
    '/how-it-works': HowItWorksPage,
    '/trust-safety': TrustSafetyPage,
    '/contact': ContactUsPage,
    '/help': HelpCenterPage,
    '/host-responsibly': HostResponsibly,
    '/refund-policy': RefundPolicy,
    '/cookies': CookiePolicy,
    '/privacy': PrivacyPolicy,
    '/terms': TermsOfService,
    '/auction-terms': AuctionTerms,
    '/bidder-vetting': BidderVetting,
    '/legal': LegalCenter,
    '/legal/regions': LegalRegions,
    '/acceptable-use': AcceptableUse,
    '/aml-sanctions': AmlSanctions,
    '/data-rights': DataRights,
    '/partner-terms': PartnerTerms,
    '/guides': GuidesPage,
    '/compare': CompareIndexPage,
}
for (const g of GUIDES) PAGES[`/guides/${g.slug}`] = GuideArticlePage
for (const c of COMPARISONS) PAGES[`/compare/${c.slug}`] = ComparePage

export const STATIC_PATHS = Object.keys(PAGES)

export interface RenderedPage {
    html: string
    seo: PageSeoProps | null
}

export function renderStaticPage(path: string, baseUrl = ''): RenderedPage | null {
    const Page = PAGES[path]
    if (!Page) return null
    let seo: PageSeoProps | null = null
    ;(globalThis as { __SITE_URL__?: string }).__SITE_URL__ = baseUrl
    ;(globalThis as { __seoCollect?: (p: PageSeoProps) => void }).__seoCollect = (p) => {
        seo = p
    }
    try {
        const html = renderToString(
            <Router ssrPath={path}>
                <Page />
            </Router>
        )
        return { html, seo }
    } catch (err) {
        console.error('[ssr] could not render', path, err)
        return null
    } finally {
        delete (globalThis as { __seoCollect?: unknown }).__seoCollect
    }
}
