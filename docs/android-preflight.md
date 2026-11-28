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

## Run the web-side release check

```sh
node scripts/android-preflight.mjs https://chrisgaun.github.io/curbnyc/
```

This command checks that the app and its install manifest are available, that the manifest identity is anchored to the selected app URL, and that the required icon declarations are present. It checks `/.well-known/assetlinks.json` at the site origin, so a file under the project path does not satisfy the check. Before distribution, run it against the chosen production URL with `--package` and `--fingerprint`, using the **Play App Signing** certificate fingerprint. A missing or mismatched association returns a nonzero exit status. The signed Android build still needs on-device verification. [Android App Links troubleshooting](https://developer.android.com/training/app-links/troubleshoot)

## Meter-only Android beta

The first beta can cover published meter schedules, address search, and planned street-cleaning dates with links to official updates. Use the existing conservative wording for parking eligibility, and keep unverified location-based exclusions and the non-metered sign pilot outside the beta.

Suggested listing summary for review:

> Find NYC meter blockfaces, look up a destination, and check published meter hours and rates.

Describe this as an independently maintained open-source app, with NYC Open Data attribution and a reminder to check posted signs. Keep any claims about availability, full curb coverage, or offline meter access out of the listing. Publish a stable support contact and a public, non-editable privacy policy under the chosen production identity. Include the contact, data handling, retention and deletion terms confirmed for the signed build. [Google Play User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311)

Before inviting testers, capture the exact AAB version, web origin, verified association, commit or release tag, and support route. Run this device checklist on a real Android phone:

- Install from Play internal testing, open the app, and confirm browser address chrome stays hidden on the verified production origin.
- Allow and deny location, test recenter, then follow an official link and return to the app.
- Start on a slow connection and pan a normal route. Record first curb time, drag smoothness, and the device and OS version.
- Check a paid curb rate and an unsupported rule against posted signage. Verify that the app labels uncertainty clearly.
- Launch offline after an online session, reconnect from the retry screen, and check that the app loads the current snapshot.
- Test dark mode, TalkBack focus, address entry, and alternate-side notices. Record errors and device-specific differences before wider testing.

A working, signed beta can then enter the applicable Play track. For eligible new personal accounts, the 14-day closed-test minimum precedes the production-access application. Google says the production-access review usually takes seven days or less, with possible delays. Allow separate time for app review and fixes. [Google Play closed testing](https://support.google.com/googleplay/android-developer/answer/14151465)
