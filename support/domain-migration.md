# Planterly hosting and domain migration

Planterly uses the Sites publishing workflow used by finance-calculator. Sites manages deployment on Cloudflare. The frontend remains static HTML, CSS, and JavaScript; Firebase continues to provide accounts, Firestore data, and reminder functions. A React rewrite is not required for hosting or for a separate native iOS app.

The selected Site is recorded in `.openai/hosting.json`. Reuse its `project_id` on every deployment. Do not create a separate Cloudflare Pages project or reuse finance-calculator's Site ID.

## Development and publishing

Requires Node.js 22.13 or newer. From this repository:

```powershell
npm run dev
npm test
npm run lint
```

The local app is served at `http://127.0.0.1:3000`. Run `npm run build` after edits and refresh the browser. The dependency-free frontend build writes public files to `dist/`; Firebase source, deployment metadata, and personal log exports are excluded.

To publish, ask Codex to publish Planterly using Sites. The workflow builds and verifies the source, pushes a source snapshot to the Site's repository, packages `dist/` with Sites metadata, saves a version, deploys it, and checks deployment status. GitHub remains the development repository; a GitHub push alone does not trigger a Sites deployment. Firebase functions deploy separately.

New Sites start private. The intended production domain is `https://planterly-app.com/`; a private Sites test deployment does not complete the public domain migration. Firebase sign-in and Sites visitor access are separate settings.

## Custom domain

After a successful Sites publication, add `planterly-app.com` through Sites custom-domain management. Use the exact DNS targets and verification records returned by that operation. They belong to this Site and must not be guessed from GitHub Pages or Cloudflare Pages instructions. Record the returned values and status in `support/domain-dns.md` when available.

In Cloudflare DNS, replace any earlier GitHub Pages web records with the new Site's records, preserving unrelated MX and TXT records. Complete every domain-validation record and refresh domain status through Sites until HTTPS and the domain are active. Add `www.planterly-app.com` separately if desired, using its own returned configuration.

Do not use the earlier Cloudflare Pages build settings, the removed `cloudflare/` directory, a GitHub Pages `CNAME` file, or a guessed `pages.dev` target.

## Firebase and existing users

1. Before retiring the old app, open `https://kyleguggy13.github.io/Planterly/` and use **Export Logs** on every device with browser-only data.
2. In [Firebase Authentication settings](https://console.firebase.google.com/project/planterly-data/authentication/settings), authorize `planterly-app.com` and any other hostname used for sign-in, including the exact Sites test hostname when testing there. Keep `authDomain` in `js/firebase.js` as `planterly-data.firebaseapp.com`.
3. If the Firebase web API key restricts HTTP referrers, allow the new origins there too.
4. Sign in with the same Google account on the new host to load cloud-saved data. Browser storage and sessions do not move between origins. Import a backup only when needed: import replaces current meals and library, including cloud data when signed in.
5. Disable the old device's web reminders if possible. Reinstall the Home Screen app from the new domain and enable notifications again. Check for duplicates from old subscriptions.
6. Once the custom domain works over HTTPS, deploy the updated reminder links:

```powershell
npm --prefix functions ci
npm --prefix functions run lint
npm --prefix functions test
npx firebase-tools login
npx firebase-tools deploy --only functions --project planterly-data
```

Keep the current VAPID secrets. Sites deployment does not deploy these functions.

## Final cutover

Verify the custom domain, app styles and icons, Google sign-in, saved meals after reload, installed-app launch, and **Send Test Notification**. HTTPS routing and Firebase account access need live checks; build tests cannot prove them.

Only after the new domain is working and data is backed up, disable publishing in [GitHub Pages settings](https://github.com/kyleguggy13/Planterly/settings/pages): unpublish the site and set the publishing branch to **None**. Disable a Pages deployment workflow if one exists. Keep the repository.

The old `github.io` URL will stop serving the app and will not automatically redirect. Update shared links and bookmarks.

## Native iOS app

See [iOS architecture and shared data contract](ios-architecture.md). The native app will use the existing Firebase backend directly. Its ability to load meals will not depend on the web hosting provider.
