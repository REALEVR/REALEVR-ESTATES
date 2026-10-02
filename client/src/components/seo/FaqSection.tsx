import { faqJsonLd, PAGE_FAQS, type FaqPage } from '@shared/seo-faq'

/**
 * "Questions people ask": each question is a heading, as people search it, with a short answer under it. The same
 * words go out as FAQ structured data and in the server-rendered copy, so they always match.
 */
export default function FaqSection({ page, className = '' }: { page: FaqPage; className?: string }) {
    const faqs = PAGE_FAQS[page]
    return (
        <section className={`mx-auto mt-12 max-w-3xl px-1 ${className}`} aria-labelledby={`faq-${page}`}>
            <h2 id={`faq-${page}`} className="mb-4 font-display text-2xl font-bold text-foreground">
                Questions people ask
            </h2>
            <div className="space-y-5">
                {faqs.map((f) => (
                    <div key={f.q}>
                        <h3 className="text-base font-semibold text-foreground">{f.q}</h3>
                        <p className="mt-1 text-muted-foreground">{f.a}</p>
                    </div>
                ))}
            </div>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(faqs)).replace(/</g, '\\u003c') }} />
        </section>
    )
}
