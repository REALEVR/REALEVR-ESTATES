> **Status: the guided walk-through is switched off for now** (no "Walk me through" button, no autostart): `WALK_ENABLED = false` in
> `server/templates/tour-viewer/tour-app.js`. Everything below describes it for when it comes back.
>
> **Room order:** instead, the viewer lists and steps through the rooms in walking order (`walkRank` / `inWalkingOrder` in the same file):
> out front, entrance and hall, living room, dining, kitchen, study, master bedroom then the other bedrooms, bathrooms, utility,
> balcony, garden last. Rooms whose names it does not recognise sit among the bedrooms; equal ranks keep their captured order.
> Doors are linked by room, so ordering never breaks them. Applies to every phone-captured tour on the next deploy.

# Guided walk-through (phone-captured tours)

Every phone-captured tour (the ones with a `tour.json`, drawn by `server/templates/tour-viewer/tour-app.js`) now plays itself
like a cinematic walk-through the first time someone opens it.

## What the visitor sees
1. The title card lifts and the first room settles.
2. In each room the camera looks around, turns to the next doorway, pushes through it, and the next room dissolves in facing
   away from the door they came through (the same `walkThrough()` a visitor triggers by tapping a door).
3. The room's name appears large for a moment on arrival; a small glass control shows progress (`2 / 6`) with **Pause**, **Next**
   and **x**.
4. At the end: "That is the whole home" and **Walk me through** to play it again.
5. Touching the tour (drag, scroll, key press, tapping a door or a room chip) ends the walk and hands over control.

## How the route is chosen
Follows the doors the agent connected (first unvisited door in each room). Any 360 room no door leads to is reached by a
dissolve in tour order, so every 360 room is shown once. Photo-set rooms are skipped.

## Switches
- `?walk=0` on the tour URL turns the autostart off (the **Walk me through** button is still there).
- Visitors with "reduce motion" set get no autostart; the button is there and plays with cuts and dissolves, no camera moves.
- Never built in the door editor (`?edit=1`) or for tours with fewer than two 360 rooms.

## Rollout
The viewer files are shared by every tour (`tour-viewer/current/` in the tours bucket). They are republished on every server
boot (`initializeS3TourHosting`), so existing tours get the walk-through on the next deploy. Browsers pick it up within five
minutes (the viewer's cache lifetime).

## Not covered
Uploaded 3D Vista exports use 3D Vista's own player and are untouched. AI-generated walk-through *videos* made from photos (the
Google Flow / Kling style) are a separate, paid, per-clip feature and are not part of this.
