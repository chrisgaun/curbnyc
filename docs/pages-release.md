# GitHub Pages release checks

Run `npm test` and `python3 -m unittest scripts.test_sign_blockfaces` before merging. Use a single batch commit for a related release. The approved Alpha 1 tag remains the historical reference.

The **Verify Pages release** workflow is set up for successful main-branch GitHub Pages deployment events. It checks out the deployment SHA and compares the public entry point, active first-party modules and styles, manifest, icons, and offline worker with that checkout. The workflow can also be dispatched manually from main. It does not publish files or edit repository settings.

To verify a specific production commit manually, check out that SHA and run:

```sh
node scripts/check-pages-release.mjs
```

To check the same assets in a local preview, start `python3 -m http.server 8000` and run `node scripts/check-pages-release.mjs http://localhost:8000/`. A missing or mismatched file causes a nonzero exit status. For rapid consecutive deployments, wait for the intended Pages deployment to finish and check the current SHA. A newer deployment can supersede the one being checked. [GitHub deployment events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#deployment_status)

The byte check confirms first-party delivery. Separately load the public map in a browser and confirm visible meter lines, a tap opening the associated schedule, and a valid snapshot timestamp under **Data and nearby meters**. Exercise location allowed and denied, map search, and offline recovery on a phone before calling device coverage complete. The meter data refresh is versioned separately and may update without a Pages rebuild.

If a source change needs rollback, revert its merge on main, wait for the resulting Pages deployment, and run the checker at the revert SHA. Confirm the public map renders curbs and the data source remains current. Preserve release tags.
