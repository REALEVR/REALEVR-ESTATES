# Android app

The app lives in `android/`. It is a **Trusted Web Activity**: it opens https://estates.realevr.com full screen inside Chrome, so
everything on the site (Google sign-in, microphone for Kevin, location, uploads, 360 tours) works exactly as it does in the browser,
and every site update reaches the app at once. If Chrome is missing it falls back to a Custom Tab.

- Package: `com.realevr.estates` · version 1.0.0 (code 1) · min Android 6 · target Android 15
- Direct download: `/downloads/RealEVR-Estates.apk` (linked from the "Get the app" band on the home page)
- Site-side proof of ownership: `/.well-known/assetlinks.json` (served by `server/android-app.ts`)

## Rebuilding
Needs JDK 17+, Gradle 8.9+ and the Android SDK (platform 35, build-tools 35).

    cd android
    echo "sdk.dir=/path/to/android-sdk" > local.properties
    # keystore.properties (never committed): storeFile=..., storePassword=..., keyAlias=realevr, keyPassword=...
    gradle assembleRelease bundleRelease
    # APK: app/build/outputs/apk/release/app-release.apk   Play bundle: app/build/outputs/bundle/release/app-release.aab

Raise `versionCode` in `app/build.gradle` for every new release. Copy the new APK to `client/public/downloads/RealEVR-Estates.apk`.

## Signing key: keep it safe
The APK is signed with `realevr-upload.jks` (alias `realevr`). **Losing that file means a sideloaded app can never be updated** (people
would have to uninstall and reinstall). It is deliberately not in git. Keep a copy in a password manager or private cloud drive.
Its SHA-256 is built into `server/android-app.ts`.

## Publishing on Google Play (needs the owner's own account)
1. Create a Google Play Console developer account (one-time US$25, ID verification) at https://play.google.com/console.
2. Create the app "RealEVR Estates", upload `RealEVR-Estates-play.aab` (the signed bundle), use `android/store/play-icon-512.png`.
3. Accept Play App Signing. Play then re-signs the app with its own key: copy that key's SHA-256 (Play Console > Setup > App signing)
   into the server variable `ANDROID_CERT_SHA256` so Chrome still hides the address bar for Play installs.
4. Fill in the store listing, privacy policy (the site already has one), data-safety form and content rating, then submit for review.
New personal accounts must run a closed test with 12+ testers for 14 days before production access.
