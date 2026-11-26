# Mobile search and map preferences

Search submits the typed address or place to [NYC Planning GeoSearch](https://geosearch.planninglabs.nyc/docs/) only when the driver selects **Find address**. The service can return several boroughs for similar street names, so the app requires the driver to choose a result before moving the map. The app sends the entered text and a result limit. It does not include GPS coordinates, map center, cookies, or a referrer, and it stores no search history. Closing the search clears the query and cancels pending requests. The search result is a map center and conveys no curb eligibility.

Only the map radius and restricted-curb visibility are stored on the device. Arrival defaults to now and location follows the existing GPS permission flow on each load. Choosing an address supersedes any pending initial location request. The center-on-location control still initiates a fresh request.

An already open map marks itself offline when the browser reports a lost connection and retains the meter data it had loaded. Freshness still appears under **Data and nearby meters**. A fresh offline launch and cached background tiles remain outside this pass. Address search also requires a connection.
