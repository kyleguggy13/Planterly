import { createRemoteJWKSet, jwtVerify } from "jose";

const keySets = new Map();
function remoteKeys(issuer) {
  if (!keySets.has(issuer)) {
    keySets.set(issuer, createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)));
  }
  return keySets.get(issuer);
}

const privateHeaders = { "Cache-Control": "private, no-store" };

// A key resolver can be supplied by tests to exercise real signed tokens offline.
export function createWorker(resolveKeys = remoteKeys) {
  return {
    async fetch(request, env) {
      const issuer = String(env.ACCESS_TEAM_DOMAIN || "").replace(/\/$/, "");
      const audience = env.ACCESS_AUD;
      if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer) || !audience) {
        return new Response("Private app setup is not complete.", { status: 503, headers: privateHeaders });
      }

      const token = request.headers.get("Cf-Access-Jwt-Assertion");
      if (!token) {
        return new Response("Sign in through Cloudflare Access to open Planterly.", { status: 403, headers: privateHeaders });
      }
      try {
        await jwtVerify(token, resolveKeys(issuer), {
          issuer,
          audience,
          algorithms: ["RS256"],
          requiredClaims: ["exp", "iat", "sub"]
        });
      } catch {
        return new Response("Access denied.", { status: 403, headers: privateHeaders });
      }

      const url = new URL(request.url);
      if (url.pathname === "/Planterly" || url.pathname.startsWith("/Planterly/")) {
        url.pathname = url.pathname.slice("/Planterly".length) || "/";
        return new Response(null, { status: 301, headers: { ...privateHeaders, Location: url.href } });
      }

      const asset = await env.ASSETS.fetch(request);
      const response = new Response(asset.body, asset);
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
  };
}

export default createWorker();
