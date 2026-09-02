import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageSeo } from "@/components/seo/PageSeo";
import { getSiteUrl } from "@/lib/siteUrl";
import { SITE_NAME } from "@shared/seo";

/**
 * FAQ content, structured (not just JSX prose) so the same array both
 * renders the page AND drives a real schema.org FAQPage JSON-LD block —
 * see PageSeo below. This is the "answer engine optimization" surface:
 * FAQPage markup is what lets Google's AI Overviews, and search/answer
 * engines generally, quote a specific question+answer pair directly rather
 * than needing to guess at page structure. Answers are written to be true
 * and platform-verifiable (how RealEVR Estates actually works) — no
 * invented market statistics or prices that this codebase can't stand
 * behind.
 */
const FAQS: Array<{ question: string; answer: string }> = [
  {
    question: "What is RealEVR Estates?",
    answer:
      "RealEVR Estates is a Uganda-based real estate platform where every listing — rental units, furnished BnBs, properties for sale, and bank-auction sales — comes with an immersive virtual tour, so you can walk through a real home on your phone, tablet, or a VR headset browser before you ever visit in person.",
  },
  {
    question: "How do I view a virtual tour?",
    answer:
      "Click on any property card and then click \"View Tour.\" For rental properties, there's a small 15,000 UGX fee to unlock the virtual tour, which covers up to 5 property views for 24 hours. Other property types (BnBs, for-sale, bank sales) are free to view.",
  },
  {
    question: "Is RealEVR Estates free to use for renters and buyers?",
    answer:
      "Yes — browsing listings, using search and filters, and contacting an agent are all free. The only fee is the small one-time viewing fee for rental-unit virtual tours described above; there's no subscription required to search or inquire.",
  },
  {
    question: "How do I list a property on RealEVR Estates?",
    answer:
      "Anyone can submit a property as its listing agent through \"List a Property\" — you provide the property details and the landlord/manager's WhatsApp number, the landlord verifies it's a real, authorized listing with a one-time WhatsApp code, and the listing goes live. RealEVR Estates then owes the submitting agent a flat referral fee for a verified listing — nobody pays to list a property.",
  },
  {
    question: "How do I register as a professional agent?",
    answer:
      "Visit the agent registration page and choose a membership plan. You'll provide your license/company details, and once approved you can list and manage properties directly from an agent dashboard.",
  },
  {
    question: "What payment methods do you accept?",
    answer:
      "Mobile money (MTN, Airtel) and other supported local payment methods through our payment partners, used for the rental tour-viewing fee and agent membership plans.",
  },
  {
    question: "How do I contact a property owner or agent?",
    answer:
      "After viewing a property, use the \"Contact Agent\" button to reach the property's owner or agent directly. For BnB-style properties you may need to book first.",
  },
  {
    question: "Can I schedule a physical viewing before renting or buying?",
    answer:
      "Yes — use the \"Schedule Visit\" button on any property listing to arrange an in-person viewing with the property's owner or agent, in addition to the virtual tour.",
  },
  {
    question: "Can I talk to someone on WhatsApp instead of using the website?",
    answer:
      "Yes — RealEVR Estates has a WhatsApp concierge. You can ask about available properties, get help finding something in your budget, or request a human agent, all over WhatsApp.",
  },
  {
    question: "What areas in Uganda does RealEVR Estates cover?",
    answer:
      "Listings span Uganda, including Kampala and the surrounding areas — coverage depends on what agents and landlords have listed at any given time; use the search and location filters on each category page to see what's currently available near you.",
  },
  {
    question: "How do I reset my password?",
    answer:
      "If you've forgotten your password, contact support at support@realevr.com and the support team will help you reset it.",
  },
];

function buildFaqJsonLd(base: string) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.answer,
      },
    })),
    url: `${base}/help`,
  };
}

export default function HelpCenterPage() {
  const jsonLd = useMemo(() => buildFaqJsonLd(getSiteUrl()), []);

  return (
    <div className="container mx-auto px-6 py-8">
      <PageSeo
        title={`Help Center & FAQ | ${SITE_NAME}`}
        description="Answers to common questions about RealEVR Estates: virtual tours, listing a property, agent registration, payments, and how to reach support."
        canonicalPath="/help"
        jsonLd={jsonLd}
      />
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8">Help Center</h1>

        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl text-accent">Frequently Asked Questions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {FAQS.map((faq, index) => (
                  <div
                    key={faq.question}
                    className={index < FAQS.length - 1 ? "border-b border-gray-200 pb-4" : ""}
                  >
                    <h3 className="font-semibold text-lg mb-2">{faq.question}</h3>
                    <p className="text-gray-600">{faq.answer}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-2xl text-accent">Contact Support</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold text-lg mb-4">Get in Touch</h3>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <i className="fas fa-envelope text-accent"></i>
                      <span className="text-gray-600">support@realevr.com</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <i className="fas fa-phone text-accent"></i>
                      <span className="text-gray-600">+256 700 000 000</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <i className="fas fa-clock text-accent"></i>
                      <span className="text-gray-600">Mon-Fri: 8AM-6PM EAT</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-lg mb-4">Quick Actions</h3>
                  <div className="space-y-3">
                    <Button variant="outline" className="w-full justify-start">
                      <i className="fas fa-user-plus mr-2"></i>
                      Register as Agent
                    </Button>
                    <Button variant="outline" className="w-full justify-start">
                      <i className="fas fa-question-circle mr-2"></i>
                      Report an Issue
                    </Button>
                    <Button variant="outline" className="w-full justify-start">
                      <i className="fas fa-lightbulb mr-2"></i>
                      Suggest Feature
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-2xl text-accent">User Guides</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mb-4">
                    <i className="fas fa-search text-accent text-xl"></i>
                  </div>
                  <h3 className="font-semibold mb-2">Finding Properties</h3>
                  <p className="text-gray-600 text-sm mb-3">
                    Learn how to search and filter properties to find exactly what you're looking for.
                  </p>
                  <Button variant="link" className="p-0 h-auto text-accent">
                    Read Guide →
                  </Button>
                </div>

                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mb-4">
                    <i className="fas fa-vr-cardboard text-accent text-xl"></i>
                  </div>
                  <h3 className="font-semibold mb-2">Virtual Tours</h3>
                  <p className="text-gray-600 text-sm mb-3">
                    Everything you need to know about experiencing properties through virtual tours.
                  </p>
                  <Button variant="link" className="p-0 h-auto text-accent">
                    Read Guide →
                  </Button>
                </div>

                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mb-4">
                    <i className="fas fa-credit-card text-accent text-xl"></i>
                  </div>
                  <h3 className="font-semibold mb-2">Payments & Billing</h3>
                  <p className="text-gray-600 text-sm mb-3">
                    Understanding our payment system and subscription plans for agents.
                  </p>
                  <Button variant="link" className="p-0 h-auto text-accent">
                    Read Guide →
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-2xl text-accent">Still Need Help?</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <p className="text-gray-600 mb-6">
                  Can't find what you're looking for? Our support team is here to help!
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button className="bg-accent hover:bg-accent/90">
                    <i className="fas fa-envelope mr-2"></i>
                    Email Support
                  </Button>
                  <Button variant="outline">
                    <i className="fas fa-phone mr-2"></i>
                    Call Us
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
