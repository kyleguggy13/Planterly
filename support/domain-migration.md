# Direct Cloudflare Workers deployment

Planterly deploys directly to your Cloudflare account with Wrangler. GitHub holds the source; Firebase provides authentication, Firestore, and reminder functions. No OpenAI Sites project, source repository, or publishing service is part of this deployment.

## Develop and validate

Requires Node.js 22.13 or newer:

```powershell
npm ci
npm run dev
npm test
npm run lint
npm run deploy:check
```

The UI development server binds only to `127.0.0.1:3000`. Run `npm run build` after editing and refresh the browser. `npm run dev:worker` exercises the actual Worker locally; it denies access without a valid Cloudflare Access configuration and signed token. Use `.dev.vars.example` as a starting point only for that integration testing.

`wrangler.jsonc` defines Worker `planterly-app`, serves frontend files from `dist/`, and attaches `planterly-app.com` as a Worker Custom Domain. Build output excludes Firebase source and saved log exports. Every asset request goes through the Worker to validate Cloudflare Access. The alternate `workers.dev` hostname and preview URLs are disabled.

## First deployment into your account

1. Sign in to the Cloudflare account containing `planterly-app.com`:

```powershell
npx wrangler login
npx wrangler whoami
```

2. Review [domain cleanup](domain-dns.md) if records from the previous hosting attempts were added.
3. Deploy:

```powershell
npm run deploy
```

Wrangler runs the frontend build, uploads the Worker and assets, and attaches the custom domain. Cloudflare manages the domain's DNS record and certificate. Do not use `--temporary`, which deploys to a temporary account instead of your own. If multiple accounts are available, choose the one owning the domain or set `CLOUDFLARE_ACCOUNT_ID` in your shell.

The first deployment deliberately responds with **503 Private app setup is not complete** until Access is configured. It does not expose the frontend while configuration is missing.

## Keep the app private

The current preference is owner-only access. Firebase login alone is not a private-site gate; it protects account data, while Cloudflare Access protects entry to the web app.

1. Enable Cloudflare Zero Trust if needed.
2. Go to **Workers & Pages > planterly-app > Access > Protect this Worker behind Access**.
3. Select **All traffic**, configure an Allow policy for only your individual email address, and apply it. Use an available identity provider or email one-time PIN. Do not allow Everyone or your entire email domain.
4. In the Access application settings, copy the **Application Audience (AUD) Tag**. Also find your Zero Trust team domain, in the form `https://your-team.cloudflareaccess.com`.
5. Set these Worker values through Wrangler's interactive prompts:

```powershell
npx wrangler secret put ACCESS_TEAM_DOMAIN
npx wrangler secret put ACCESS_AUD
```

Enter the HTTPS team origin for the first prompt and the exact AUD tag for the second. These identify the Access application; never paste a browser session token into either setting. Secrets remain in your Cloudflare account and are not checked into Git.

6. Open `https://planterly-app.com/`, complete Access sign-in, and verify the app loads. A private/incognito request must encounter Access sign-in or a denial. Verify that only your allowed account gets through.

The Worker verifies the Access JWT signature, issuer, audience, and expiration before serving assets. `run_worker_first: true` is required to prevent direct asset bypass. If configuration is absent or invalid, it denies access. Do not change these controls to fix a setup error. Worker Static Assets do not currently forward `ctx.access`, so the implementation validates the documented JWT header instead.

## Optional automatic deployments from GitHub

After the first deployment and private access work, connect `kyleguggy13/Planterly` in **Workers & Pages > planterly-app > Settings > Builds**. Use production branch `main`, repository root as the root directory, and deploy command `npm run deploy`. The Wrangler custom build already runs `npm run build`, so do not add a duplicate build command. Retain the Access settings and Worker secrets. GitHub remains the code source; Cloudflare owns the deployment.

Alternatively, run `npm run deploy` yourself after changes. Neither path uses OpenAI Sites.

## Firebase and existing users

1. Export browser-only logs from the old GitHub Pages app before shutting it down.
2. In [Firebase Authentication settings](https://console.firebase.google.com/project/planterly-data/authentication/settings), authorize `planterly-app.com`. Keep `authDomain` in `js/firebase.js` as `planterly-data.firebaseapp.com`.
3. If the Firebase API key has HTTP referrer restrictions, allow `https://planterly-app.com/*` there too.
4. Sign in with the same Google account to load cloud-saved data. Browser storage and sessions do not move between origins. Import a backup only when needed: import replaces current meals and library, including cloud data when signed in.
5. After the domain works, deploy the updated reminder links:

```powershell
npm --prefix functions ci
npm --prefix functions run lint
npm --prefix functions test
npx firebase-tools login
npx firebase-tools deploy --only functions --project planterly-data
```

Worker deployment does not deploy Firebase functions. Keep existing VAPID secrets. Reinstall the Home Screen web app from the new origin, enable notifications again, and test for duplicate old subscriptions. An expired Access session can require sign-in when opening a notification; test this private setup on your device.

## Retire previous hosting

The custom domain has been removed from the former OpenAI Sites project. Its old private `chatgpt.site` copy may still exist independently; delete that retired Planterly project in Sites if you want the copy removed. The available connector can detach domains but cannot delete the project. Do not publish future changes there. Remove any Sites-only Firebase authorized hostname after you stop using it.

Once the new domain, sign-in, data, and reminders are verified, disable publishing in [GitHub Pages settings](https://github.com/kyleguggy13/Planterly/settings/pages): unpublish the site and set the publishing branch to **None**. Disable a Pages workflow if present. Keep the GitHub repository and its Cloudflare integration. The old GitHub URL will not automatically redirect after it is disabled.

## Native iOS app

The planned SwiftUI app shares Firebase accounts and data directly; it does not depend on this hosting provider or Cloudflare Access for its Firebase calls. See the [iOS architecture and shared data contract](ios-architecture.md).

## References

- [Worker Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Worker static assets](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Cloudflare Access for Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
- [Validate Access JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
