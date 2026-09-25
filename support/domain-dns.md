# planterly-app.com DNS setup

The Sites deployment is published at https://planterly.kylegug.chatgpt.site. Domain activation is pending DNS verification; these records were returned by Sites for this specific project on 2026-09-25 UTC.

In Cloudflare, open **planterly-app.com > DNS > Records** and add the following. Use Auto TTL and DNS only (gray cloud) for the A records. Replace conflicting apex web records from the earlier GitHub Pages plan; preserve unrelated MX and TXT records.

| Type | Name in Cloudflare | Content |
| --- | --- | --- |
| A | @ | `162.159.143.30` |
| A | @ | `172.66.3.26` |
| TXT | `_openai-site-verification` | `openai-site-verification=ggfLYzGYCCF0IHWLkcXAhbFo7JOgYGfZnMWdJXDJ2vg` |
| TXT | `_cf-custom-hostname` | `d220b0f4-62b6-46ca-977c-c3c557342a27` |

These are domain verification values, not account credentials. Do not substitute the previous GitHub Pages IPs or create a Cloudflare Pages project. The domain is already attached through Sites.

After saving the records, ask Codex to refresh Planterly's custom-domain status. Certificate issuance may expose additional verification records; complete any returned records before treating the domain as active.

The apex uses the two A records above. Sites also returned `custom-domains.chatgpt.site.` as a subdomain CNAME target, but `www.planterly-app.com` has not been attached and must be registered separately before using it.

Firebase Authentication must authorize `planterly-app.com` before Google sign-in works there, and `planterly.kylegug.chatgpt.site` for testing on the Sites address. Domain activation does not change the Sites audience; the initial deployment is private until explicitly changed.

Keep GitHub Pages available until the new domain, sign-in, data, and reminders have been verified. See [migration instructions](domain-migration.md).
