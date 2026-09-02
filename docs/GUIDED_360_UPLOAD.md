# Guided Room Capture -> Virtual Tour (v1)

## What this adds

Agents can now produce a virtual tour **without** owning 3D Vista/Pano2VR or a
dedicated 360 camera. From the existing "Virtual Tour" admin screen
(`client/src/components/admin/VirtualTourManager.tsx`) there are now two tabs:

- **Upload 3D Vista ZIP** -- the original flow, completely unchanged.
- **Capture with your phone** -- new. Per room, the agent either:
  1. takes/uploads a handful of regular overlapping photos while turning around the room ("photo sweep"),
  2. uploads a short walkthrough video, or
  3. uploads a single already-equirectangular photo/video from a 360 camera (Ricoh Theta, Insta360, GoPro Max, etc.) if they happen to have one.

Every upload is automatically classified and quality-checked server-side before
it "qualifies" toward the tour -- blurry, too-dark, too-few-angle, or too-short
submissions are rejected with a specific, actionable reason instead of a
generic error, and the agent can just retake that one room.

## Why it's additive, not a rewrite

The existing tour **hosting** pipeline (`server/s3-tour-hosting.ts`) already
takes an arbitrary folder of static files and publishes it to S3 as
`Property.tourUrl`. Both viewer components
(`client/src/components/property/VirtualTour.tsx` and SRBS's
`src/components/VRTourViewer.tsx`) are just `<iframe src={tourUrl}>`. So the
new pipeline only needs to **produce a folder in the same shape** a 3D Vista
export already produces, then hand it to the existing, unmodified
`uploadTourToS3()` + `storage.updateProperty()` calls. No viewer changes were
needed anywhere.

## New files

| File | Purpose |
|---|---|
| `server/tour-media-classifier.ts` | Classifies an upload as `equirect_photo` / `equirect_video` / `photo` / `walkthrough_video` via aspect-ratio + resolution heuristics (`sharp` for images, `ffprobe` for video). |
| `server/tour-quality-checks.ts` | Blur (Laplacian-variance) and brightness scoring per image, used to gate every photo/frame. |
| `server/video-frame-extractor.ts` | Samples frames from an uploaded video via `ffmpeg`, scores each, and picks the best one(s). |
| `server/room-capture-types.ts` | Shared types + the draft manifest shape. |
| `server/room-capture.ts` | Express handlers: per-room upload, manifest read, room delete/retake, and finalize (assemble + publish). |
| `server/tour-generator.ts` | Turns a completed draft manifest into the on-disk `index.html` / `tour.json` / `panos/` / `rooms/` structure that `uploadTourToS3` already knows how to walk. |
| `server/templates/generated-tour.html` | Self-contained static viewer: true 360 rooms render via [Photo Sphere Viewer](https://photo-sphere-viewer.js.org/) (loaded from a CDN, same "bundle your own player" pattern a 3D Vista export uses); photo-sweep rooms render via a small hand-rolled swipeable gallery (no external dependency). |
| `client/src/components/admin/RoomCaptureGuide.tsx` | The agent-facing wizard: room list, live camera capture with a compass overlay (uses `DeviceOrientationEvent` where available, degrades gracefully where it isn't), gallery/video upload fallback, per-room qualify/retake feedback, and the "build tour" step with live progress. |

## Modified files

- `server/routes.ts` -- registers the four new `/api/upload/room-capture/*` routes (see below), all behind the existing `adminMiddleware` (admin/agent role required). **Also fixes a real bug found during review: the existing `/api/upload/virtual-tour/:propertyId` ZIP-upload route had no authentication check at all** (unlike `/api/upload/property-image` right above it in the same file) -- it's now behind the same `adminMiddleware`.
- `server/upload.ts` -- adds a path-containment check to the ZIP extraction loop (zip-slip protection: a crafted ZIP entry name like `../../etc/x` could previously write outside the intended folder). No behavior change for well-formed ZIPs.
- `shared/schema.ts` -- adds a nullable `tourQuality` text column (`'equirect_360' | 'photo_sweep_lite' | null`) so the UI/API can distinguish a true 360 tour from the guided-capture "basic" tier. Purely additive; existing rows are unaffected (`null`).
- `client/src/components/admin/VirtualTourManager.tsx` -- wraps the existing upload UI in a `Tabs` component; the ZIP flow is byte-for-byte the same, just in its own tab.
- `package.json` -- adds `sharp` (image metadata/quality/resize). Video handling shells out to the `ffmpeg`/`ffprobe` binaries already used implicitly elsewhere in this stack; **the deploy target must have `ffmpeg` installed** (e.g. `apt-get install ffmpeg` in the Dockerfile/buildpack) -- it's present in this dev sandbox but wasn't previously a declared server dependency.

## API

All four routes require an authenticated admin/agent session (`adminMiddleware`).

```
POST   /api/upload/room-capture/:propertyId
  multipart/form-data: roomName (text), and either photos[] (1-20 images) or video (1 file)
  -> { status: 'success' | 'needs_retake', room: { slug, name, kind, status, warnings, rejectionReasons } }

GET    /api/upload/room-capture/:propertyId/manifest
  -> the current draft manifest (room list + statuses) -- lets the wizard resume a session

DELETE /api/upload/room-capture/:propertyId/:roomSlug
  -> removes a room from the draft (used for "retake" / "remove room")

POST   /api/upload/room-capture/:propertyId/finalize
  -> { jobId }  (build/publish progress is streamed via the EXISTING
       GET /api/upload/virtual-tour/progress/:jobId SSE endpoint -- jobId is generic,
       nothing new needed there)
```

## Quality gates (v1)

| Check | Threshold |
|---|---|
| Photo sweep: minimum accepted photos per room | 6 |
| Video: minimum duration | 5s |
| Blur (Laplacian-variance) | reject if < 15 |
| Brightness | reject if mean luminance < 25 or > 235 |
| Equirectangular detection | aspect ratio 1.9-2.15 : 1 and width above a resolution floor |
| Minimum qualified rooms before "Build tour" is enabled | 1 (configurable; the product spec below recommends 3 for a real listing -- kept at 1 in code so early testing/dogfooding isn't blocked) |

All of these are enforced **server-side** as the source of truth. The
client-side compass/blur hints in `RoomCaptureGuide.tsx` are advisory only, to
reduce retakes in the field -- exactly per the product spec's non-goal of
never letting a client-side check be the final word.

## Known limitations (v1, by design -- see product spec for what's deferred)

- **No true panorama stitching.** There is no maintained Node panorama-stitching
  library, and installing a native CV stack (OpenCV/Hugin) was out of scope for
  this pass. A multi-photo sweep or regular walkthrough video does **not**
  become a seamless 360 sphere -- it becomes a "basic" swipeable photo gallery
  per room (`tourQuality: 'photo_sweep_lite'`), clearly badged as such in both
  the generated viewer and (recommended follow-up) the admin property list.
  True 360 tours in v1 only come from agents who already own a 360 camera.
  `server/tour-generator.ts` and the manifest schema (`tourQuality`) were
  designed so a real stitcher can be dropped in later (per-room reprocessing)
  without changing the API contract.
- **HEIC photos** (the default iPhone format) are accepted by extension but
  will fail at the `sharp` classification step on a server build without HEIC
  support compiled in. Recommended follow-up: either require agents to shoot
  in "Most Compatible" (JPEG) mode, or add a HEIC->JPEG conversion step.
- **No per-property ownership check**, only role (`admin`/`agent`) -- this
  matches the existing `uploadVirtualTour` route's behavior, which also has no
  ownership check. Flagged in the review findings as a pre-existing gap worth
  closing across both endpoints together.
- **Raw draft media is deleted on successful finalize**, but a room that's
  captured and never finalized leaves its files under
  `uploads/tours/property_<id>_draft/` indefinitely. Recommended follow-up: a
  scheduled cleanup job (there's already a `server/cron/` folder with a
  similar pattern) for stale drafts.
- The generated viewer loads [Photo Sphere Viewer] from a public CDN
  (`cdn.jsdelivr.net`) for true-360 rooms, same approach a 3D Vista export uses
  for its own bundled player. This was verified to build and run correctly;
  it just requires the *viewer's* browser to have internet access (normal for
  a public-facing property listing).

## Verification performed this session

- `npx tsc --noEmit`: 41 pre-existing errors before and after these changes,
  zero new errors in any new/modified file.
- `npm run build` (vite + esbuild): succeeds, new code included in both bundles.
- Classifier tested against synthetic 4000x2000 (equirect) and 1200x900
  (regular) JPEGs -- classified correctly.
- Blur/brightness scoring tested against a textured image (sharpness 51.4,
  passes) vs. a Gaussian-blurred copy of the same image (sharpness 1.8,
  correctly rejected) and a near-black image (correctly flagged too dark).
- Video pipeline tested against a synthetic 8s/1080p clip: classified as
  `walkthrough_video`, extracted and sharpness-scored 4 frames, picked a
  sensible primary frame.
- `tour-generator.ts` tested end-to-end against a hand-built manifest (one
  panorama room + one gallery room) -- produced the correct directory shape
  and a valid `tour.json`.
- Generated `index.html` verified in a real headless-Chromium render: room
  chips, title, and the gallery-mode swipeable viewer all render pixel-correct
  from an actual screenshot. The Photo Sphere Viewer CDN script could not load
  inside this sandbox's restricted network (no general internet egress), so
  the panorama-mode render itself is unverified visually here -- worth an
  agent smoke-test after deploy.
