# planterly-app.com domain setup

The domain now belongs to the direct Cloudflare Workers deployment configured in `wrangler.jsonc`. The previous OpenAI Sites custom-domain attachment has been removed and the previous DNS instructions are obsolete.

## Before deploying

In Cloudflare DNS, check whether any records from earlier attempts were actually added. Remove only obsolete web-hosting records for this migration:

- Apex A records targeting `162.159.143.30` or `172.66.3.26` (the former Sites targets).
- A CNAME targeting `custom-domains.chatgpt.site`.
- The `_openai-site-verification` and `_cf-custom-hostname` TXT records created specifically for this retired Planterly attachment, if present.
- Apex A records targeting GitHub Pages (`185.199.108.153` through `185.199.111.153`) or a `www` CNAME targeting `kyleguggy13.github.io`, if added during the earlier plan.

Preserve unrelated MX, TXT, and other service records. If these records were never added, there is nothing to remove.

## Attach the Worker

Sign in using `npx wrangler login`, then run `npm run deploy`. The `routes` entry in `wrangler.jsonc` attaches `planterly-app.com` using `custom_domain: true`. Cloudflare creates the required DNS record and certificate automatically; no static hosting IPs or OpenAI verification tokens are needed.

The CLI account must own the active `planterly-app.com` Cloudflare zone. Resolve any existing-record conflict by checking that the conflicting web record is obsolete before replacing it.

Only the apex hostname is configured. Add `www` later through a deliberate Worker Custom Domain configuration if needed. Alternate `workers.dev` and preview URLs are disabled.

The Worker denies access until Cloudflare Access is configured. Follow the [deployment and private-access steps](domain-migration.md). Verify HTTPS, owner-only access, Firebase sign-in, and saved data before disabling the old GitHub Pages site.
