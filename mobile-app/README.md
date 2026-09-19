# Vyapar Saathi — Android App (Capacitor wrapper)

This wraps the exact same tested web app (`static/index.html` + the FastAPI
backend) into a real installable Android app. Nothing was rewritten — this
folder just points a native app shell at the same frontend.

Everything up through scaffolding the native project is already done for you
(`npx cap init`, `npx cap add android`, the `android/` folder is fully
generated). The one thing that couldn't be finished here: **compiling it into
an actual APK**, because that requires downloading Gradle and the Android SDK,
which needs Google's servers — not reachable from this build sandbox. Android
Studio downloads both automatically the first time you open this project, so
this is a non-issue on your machine.

## What you need to do (on your own machine, not here)

1. **Install Android Studio** (free, from developer.android.com/studio) if
   you don't have it. First launch downloads the Android SDK — do this
   tonight, not at the venue, it can take a while on slower wifi.

2. **Before building, point the app at your backend.** Open
   `www/index.html` (or the copy Android Studio shows you under
   `app/src/main/assets/public/index.html` after a sync) and find this line
   near the top:
   ```js
   const API_BASE = ""; // e.g. "http://192.168.1.42:8123" for the Android build
   ```
   Change it to your laptop's LAN IP and the port the backend runs on, e.g.:
   ```js
   const API_BASE = "http://192.168.1.42:8123";
   ```
   Find your laptop's LAN IP with `ipconfig` (Windows) or `ifconfig` /
   `ipconfig getifaddr en0` (Mac). Your phone and laptop need to be on the
   **same WiFi network** for this to work — at home, at the venue, wherever
   you're recording or demoing.

3. **Re-sync after editing:**
   ```bash
   cd mobile-app
   npx cap sync android
   ```

4. **Open in Android Studio:**
   ```bash
   npx cap open android
   ```
   This opens the `android/` folder as a normal Android Studio project.

5. **Run it.** Plug your Android phone in via USB with USB debugging enabled
   (Settings → About Phone → tap "Build number" 7 times → Developer Options →
   USB debugging), select your phone in the device dropdown, and click Run
   (▶). Android Studio builds and installs the app directly.

6. **Before you press Run:** on your laptop, start the actual backend in a
   terminal and leave it running:
   ```bash
   cd ..   # back to the main project folder
   uvicorn main:app --host 0.0.0.0 --port 8123
   ```
   Note: `--host 0.0.0.0`, not `127.0.0.1` — the phone needs to reach it over
   the network, not just localhost.

7. **Get the standalone APK file** (for sharing or installing without a
   cable): in Android Studio, Build → Build Bundle(s)/APK(s) → Build APK(s).
   The .apk lands in `android/app/build/outputs/apk/debug/`.

## Recording the demo video

Once it's running on your phone as a real app icon (not a browser tab):
record your phone screen (built-in screen recorder on most Android phones,
Settings → Quick Settings → Screen Recorder) walking through the exact
Sharma Garments flow: open the app → see the insight load → tap the mic if
Sarvam is wired up → tap Review & Launch → see the success state. Keep it
short — 30-45 seconds is plenty for a pitch attachment.

## If something doesn't connect

- Phone shows a blank screen or network error → almost always the `API_BASE`
  IP is wrong, or the phone and laptop aren't on the same WiFi, or the
  backend was started with `127.0.0.1` instead of `0.0.0.0`.
- Corporate/public WiFi at a venue may block phone-to-laptop traffic even on
  the same network — test this at home first, and have the plain website
  version (running in the phone's browser, same trick with your laptop's IP
  in the address bar) as a backup if the venue WiFi is locked down.
