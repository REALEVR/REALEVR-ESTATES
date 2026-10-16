# Design review: recommendations (October 2026)

Reviewed on the live site, phone (390 px) and desktop (1440 px). The review environment dropped some connections, so the
property page and listings page were judged on what rendered plus the code; re-check them on a real phone.

## Fixed in this pass
- Safety note on the property page was a flex paragraph that broke into three squeezed columns on phones. Now normal wrapped text.
- BnB price said "/ day" next to a sticky bar saying "per night". Now "/ night" everywhere.
- "Loading the 360° tour…" sat on top of the Enter VR button on phones. It now sits at the top of the viewer.
- Two H1s on the home page (desktop and phone headlines). Now one per layout.
- Slide dots (tour / news) were 28 px tall; now 44 px. Footer and legal links were 16 px tall; now 28 to 32 px.
- The tour-orbit graphic no longer touches the phone headline.

## Next, in order of value
1. **(Done) Show value before the ask on /rental-units.** The first thing on the page is a "Viewing Package Required, 10,000 UGX" box,
   above the filters and listings. Lead with the listings and the free preview; show the package after the first row, or as a sticky
   bar once someone opens a listing.
2. **(Done) Real photos only.** A listing cover is now checked on upload (`server/photo-rules.ts`): JPG/PNG/WebP, at least 1000 x 600 px,
   not a flat graphic, and (via Gemini, only when it answers) a real photograph with no text or logo over it. Listing forms and the
   self-serve page send `purpose=listing`; other uses of the upload route (agent portfolio pictures) are not held to it. A listing with
   no cover cannot take a featured slot or buy a boost. `GET /api/admin/photo-audit` (admin; add `?ai=1` for the Gemini check) lists
   existing covers that would fail today. "At least 5 photos": a listing has one cover, and guided room captures already need 6+ photos
   per room, so the count is enforced there. Set `PHOTO_AI_CHECK=0` to switch the Gemini check off.
3. **(Done) Fill the hero slot.** On phones the tour slot under the categories can show an empty grey panel with a pause button. Show a
   still of the featured tour with a Play button until the video is ready, and never show a pause control over nothing.
4. **(Done) Trust that is checkable.** Every property page now has a "What you can check" card (`ListingTrust.tsx`, facts from
   `GET /api/properties/:id/trust`): when the manager joined, how many listings they have, how many have a tour you can open, and
   whether their email is confirmed. It states plainly that ID documents and phone numbers are not checked yet, so there is no
   "ID verified" or "phone verified" badge. A visible "Report this listing" button (no account needed) sends the report to the admins
   in-app, by email and on WhatsApp; admins can list and close reports at `GET /api/admin/listing-reports`. Add a "phone verified"
   fact only once phone numbers are actually verified and the result is stored on the account.
5. **(Done) Fonts and icons.** Font Awesome is gone: every icon is an inline SVG through `client/src/components/ui/icon.tsx` (lucide, plus
   WhatsApp/Apple/Android/Pinterest marks), sized by the surrounding font size so the old classes still work, and it takes the old
   names so amenity and category icons stored in the database keep working (an unknown name draws a small sparkle, never a blank).
   Result of the production build: main stylesheet 252.9 KB to 161.2 KB, 8 icon font files removed, built assets 4.1 MB to 3.1 MB, and no
   blank-icon flash on slow connections. The site keeps exactly two type faces, Montserrat (text) and Space Grotesk (headlines), each
   requested as one 400 to 700 weight range instead of five separate weights.
6. **Lighter first load on phones.** Aim for under 1 MB before scroll. Serve card photos at 480 px wide with `srcset`, and cap the
   first screen at about 6 cards.
7. **Phone navigation.** The bottom tab bar labels are 11 px (the platform minimum). Raise to 12 px, and make sure the sticky
   Book / Tour bar on a property page sits above the tab bar, not under it.
8. **One primary call to action per screen.** The hero offers Search, See new listings, a search bar, a tour card and a video. Keep
   Search as the single primary action.
9. **Empty states with a next step.** "No amenities listed" and "0 listings" should say what to do (message the host, set an alert).
10. **Measure.** Add real-user monitoring for load time on 3G-class connections, and check the site weekly on a mid-range Android phone.
