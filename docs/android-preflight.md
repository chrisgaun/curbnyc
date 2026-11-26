# Android release preflight

The browser install manifest retains the CurbNYC name and current GitHub Pages app identity. It includes 192 and 512 pixel PNGs plus a separate maskable 512 pixel PNG based on the existing icon. Localhost is suitable for browser preflight. A production Android build requires a verified HTTPS origin.

## Packaging

1. Complete the CurbCommons name and distribution review under #7. Choose the stable Android application ID and production origin before generating a build. The browser manifest ID and Android application ID serve different purposes.
2. Use the existing web app in a Trusted Web Activity. Verify the Android association through `/.well-known/assetlinks.json` at the HTTPS origin root. The project path `/curbnyc/` on GitHub Pages does not itself give this repository control of the origin root. Match the Android application ID and Google Play App Signing certificate SHA-256. Do not commit signing secrets. [Chrome TWA quick start](https://developer.chrome.com/docs/android/trusted-web-activity/quick-start)
3. Generate and test a signed AAB only after the owner selects the production ID and signing setup. As checked November 26, 2026, Google lists API level 36 for new phone apps and updates. Confirm the requirement for the intended submission date. [Google Play target API](https://developer.android.com/google/play/requirements/target-sdk)
4. Use internal testing to check permission allowed and denied, recenter, slow network, install/update behavior, and performance on a real Android device. For applicable new personal accounts, Google documents a closed-test threshold of 12 opted-in testers for 14 continuous days before applying for production access. Confirm the selected account's requirements before scheduling the test. [Play Console testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465)

The app needs a connection to load map and meter data. After the service worker activates on an online visit, a disconnected launch of the installed app shows a retry screen. It does not present cached meter rules. A browser that has never loaded the app sees its standard connection error. Test both the offline screen and recovery on target devices before describing this behavior in the listing.

## Privacy and store disclosures for owner review

The app is independent of New York City, the NYC Department of Transportation, and Google. Attribute official data separately from CurbNYC's own guidance. The map covers meter schedules and points to official sources. It does not grant parking permission or show live vacancies.

Audit the actual signed build before completing the privacy policy and Play Data Safety form. In the current web app, the browser may request foreground geolocation at startup or upon recentering. Map viewport queries go to NYC Open Data and can indirectly reveal the viewed location. The app also requests dependencies and data from GitHub, unpkg, and MapLibre's glyph host. If the address search draft ships, only explicitly submitted address text and a result cap go to NYC Planning GeoSearch, and the app will retain map display preferences locally. Check whether any distribution wrapper or hosting change adds data recipients. Do not promise that external providers discard requests.

The AAB, production Digital Asset Links, signing, Play Console registration, store submission, and device tests remain open.
