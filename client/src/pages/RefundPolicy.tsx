import { Link } from "wouter";

export default function RefundPolicy() {
  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-4xl mx-auto bg-white p-8 rounded-lg shadow-sm">
        <h1 className="text-3xl font-bold mb-6">Refund Policy</h1>
        <p className="text-gray-500 mb-8">Last Updated: September 7, 2026</p>

        <div className="prose max-w-none">
          <p>
            This page describes exactly which payments RealEVR Estates processes on this site and their refund
            terms. We keep this specific to what the platform actually charges for, rather than a generic template —
            if a payment type below doesn't apply to what you paid for, its section doesn't apply to you.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-4">1. Rental Property Viewing Fee (UGX 15,000)</h2>
          <p>
            A rental unit's virtual tour is free to preview for the first few seconds. Continuing to view it, or
            viewing any other rental unit's tour, requires a one-time UGX 15,000 payment, which then unlocks
            unrestricted tour viewing across the platform for 24 hours.
          </p>
          <p>
            <strong>This fee is non-refundable</strong> once the payment succeeds and access is granted — it pays
            for the access itself, which is delivered immediately, not for any specific outcome (e.g. deciding not
            to rent the property, or a landlord being unresponsive, are not grounds for a refund). The one exception
            is a failed or duplicate charge: if you were charged but access was never granted due to a technical
            error on our side, contact us and we will investigate and refund the failed charge.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-4">2. BnB Booking Deposit (20% of stay total)</h2>
          <p>
            Viewing a BnB's virtual tour is always free. Booking a BnB requires a 20% deposit of the total stay
            cost, paid to secure the booking and unlock the host's contact details.
          </p>
          <p>
            <strong>This deposit is non-refundable.</strong> It compensates the host for holding the listed dates
            for you and is forfeited if you cancel, don't show up, or change your mind. If the host cancels on you,
            or the property turns out to be materially misrepresented, contact us — those cases are handled
            individually and are not covered by a blanket refund guarantee, since resolving them may involve the
            host directly.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-4">3. Agent / Broker Subscriptions</h2>
          <p>
            Agent membership plans (Standard, Premium) are billed for the period selected at signup or renewal.
            Subscription fees already paid for the current billing period are non-refundable; you can cancel to stop
            future renewals at any time from your account, and you keep access through the end of the period
            already paid for.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-4">4. Why These Payments Are Structured This Way</h2>
          <p>
            Every payment on this platform pays for something delivered immediately and irreversibly — tour access
            that's already granted, a booking slot that's already held, a subscription period that's already active.
            None of them are pre-payment for a future service we might fail to deliver, which is the usual basis for
            a refund. That's why the default across all three is non-refundable rather than case-by-case.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-4">5. Payment Errors</h2>
          <p>
            The one situation always eligible for a refund, regardless of payment type: you were charged but did not
            receive what you paid for, due to a technical fault on our side (a duplicate charge, a payment that
            succeeded on the gateway but never registered on our platform, etc.). Contact us with your transaction
            ID and we will investigate.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-4">6. Contact Us</h2>
          <p>To report a payment error or ask about a specific charge:</p>
          <address className="not-italic mt-4">
            RealEVR Estates<br />
            Email: support@realevr.com
          </address>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200">
          <Link href="/" className="text-accent hover:underline">
            &larr; Back to Homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
