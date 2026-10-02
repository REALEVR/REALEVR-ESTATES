# Google Maps

The site uses Google Maps instead of OpenStreetMap.

| Where | How | Needs a key? |
| --- | --- | --- |
| **Map button in the tour window** (property page) | Swaps the tour for the property's place on Google Maps, with "Open in Google Maps" and "Directions" (opens the Google Maps app on a phone). The tour stays loaded underneath. Exact pin if the listing has one, otherwise Google finds the place from the written location. This is the only map on the property page. | No |
| **Area filter** on All properties | Google Maps with a count marker per area. | Yes |
| **Admin pin picker** (upload / edit form) | Click or drag on Google Maps; pasting a Google Maps link still works. | Yes |

Without a key, the first uses Google's keyless embed. The last two keep the basic map so nothing breaks.

## Set the key (optional, free for embeds)

1. Google Cloud Console → create a project → enable **Maps JavaScript API** and **Maps Embed API**.
2. Credentials → create an API key → **restrict it to HTTP referrers** (your site address) and to those two APIs.
3. On the server, set `GOOGLE_MAPS_API_KEY`. No rebuild needed.

Maps Embed API is free and unlimited. Maps JavaScript API bills per map load (Google gives a monthly free credit); the
two interactive maps are the only places that use it. If Google refuses the key (wrong, restricted to another address,
billing off) those two maps fall back to the basic map by themselves.
