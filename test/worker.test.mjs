import assert from "node:assert/strict";
import test from "node:test";
import worker from "../worker/index.mjs";

const request = path => new Request(`https://planterly-app.com${path}`);

test("anonymous visitors can load the frontend and assets without Access settings", async () => {
  for (const path of ["/", "/js/app.js", "/assets/icons/icon-192.png"]) {
    let requestedUrl;
    const env = { ASSETS: { fetch: async req => {
      requestedUrl = req.url;
      return new Response("asset", { headers: { "Content-Type": "text/plain" } });
    } } };
    const response = await worker.fetch(request(path), env);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "asset");
    assert.equal(requestedUrl, request(path).url);
    assert.equal(response.headers.get("Content-Type"), "text/plain");
  }
});

test("missing assets retain their 404 response", async () => {
  const response = await worker.fetch(request("/missing.js"), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) }
  });
  assert.equal(response.status, 404);
});

test("service worker and manifest revalidate while preserving their content type", async () => {
  for (const path of ["/sw.js", "/manifest.json"]) {
    const response = await worker.fetch(request(path), {
      ASSETS: { fetch: async () => new Response("asset", {
        headers: { "Content-Type": "application/javascript", "Cache-Control": "max-age=3600" }
      }) }
    });
    assert.equal(response.headers.get("Cache-Control"), "no-cache");
    assert.equal(response.headers.get("Content-Type"), "application/javascript");
  }
});

test("legacy project paths redirect publicly and preserve queries", async () => {
  const response = await worker.fetch(request("/Planterly/?source=old"), {});
  assert.equal(response.status, 301);
  assert.equal(response.headers.get("Location"), "https://planterly-app.com/?source=old");
});
