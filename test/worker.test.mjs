import assert from "node:assert/strict";
import test from "node:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { createWorker } from "../worker/index.mjs";

const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = { ...await exportJWK(publicKey), kid: "test-key", alg: "RS256" };
const worker = createWorker(() => createLocalJWKSet({ keys: [jwk] }));
const issuer = "https://planterly-test.cloudflareaccess.com";
const audience = "planterly-test-audience";
let assetRequests = 0;
const env = {
  ACCESS_TEAM_DOMAIN: issuer,
  ACCESS_AUD: audience,
  ASSETS: { fetch: async () => { assetRequests++; return new Response("app asset"); } }
};

async function token(overrides = {}, signingKey = privateKey) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ iss: issuer, aud: audience, sub: "owner", iat: now, exp: now + 300, ...overrides })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" }).sign(signingKey);
}
function request(jwt, path = "/") {
  return new Request(`https://planterly-app.com${path}`, {
    headers: jwt ? { "Cf-Access-Jwt-Assertion": jwt } : {}
  });
}

test("missing Access setup denies requests before asset delivery", async () => {
  const before = assetRequests;
  const response = await worker.fetch(request(), { ASSETS: env.ASSETS });
  assert.equal(response.status, 503);
  assert.equal(assetRequests, before);
});

test("missing, forged, expired, wrong-issuer and wrong-audience tokens cannot fetch assets", async () => {
  const foreign = await generateKeyPair("RS256");
  for (const jwt of [undefined, "forged-token", await token({ exp: 1 }),
    await token({ iss: "https://other.cloudflareaccess.com" }),
    await token({ aud: "another-app" }), await token({}, foreign.privateKey)]) {
    const before = assetRequests;
    const response = await worker.fetch(request(jwt, "/js/app.js"), env);
    assert.equal(response.status, 403);
    assert.equal(assetRequests, before);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  }
});

test("valid signed Access token serves the asset without public caching", async () => {
  const response = await worker.fetch(request(await token()), env);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "app asset");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
});

test("legacy project paths redirect only after authentication and preserve queries", async () => {
  const response = await worker.fetch(request(await token(), "/Planterly/?source=old"), env);
  assert.equal(response.status, 301);
  assert.equal(response.headers.get("Location"), "https://planterly-app.com/?source=old");
  assert.equal((await worker.fetch(request(undefined, "/Planterly/"), env)).status, 403);
});
