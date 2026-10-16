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
2. **Real photos only.** The sample BnB listing's cover is an AI-made coin illustration with the title baked in. Add a photo check on
   upload (minimum size, no text overlays, at least 5 photos) and a "no photo, no listing" rule for featured slots.
3. **Fill the hero slot.** On phones the tour slot under the categories can show an empty grey panel with a pause button. Show a
   still of the featured tour with a Play button until the video is ready, and never show a pause control over nothing.
4. **Trust that is checkable.** Replace claims with facts: owner joined date, number of tours, "phone verified" once you verify
   numbers, a visible report button. Do not add ID-verified badges until IDs are actually checked.
5. **Fonts and icons.** Montserrat, Space Grotesk and Font Awesome all load. Keep one display and one text face, and swap Font Awesome
   for inline SVG icons (lucide is already installed). This also removes the blank-icon flash when the icon font is slow.
6. **Lighter first load on phones.** Aim for under 1 MB before scroll. Serve card photos at 480 px wide with `srcset`, and cap the
   first screen at about 6 cards.
7. **Phone navigation.** The bottom tab bar labels are 11 px (the platform minimum). Raise to 12 px, and make sure the sticky
   Book / Tour bar on a property page sits above the tab bar, not under it.
8. **One primary call to action per screen.** The hero offers Search, See new listings, a search bar, a tour card and a video. Keep
   Search as the single primary action.
9. **Empty states with a next step.** "No amenities listed" and "0 listings" should say what to do (message the host, set an alert).
10. **Measure.** Add real-user monitoring for load time on 3G-class connections, and check the site weekly on a mid-range Android phone.
