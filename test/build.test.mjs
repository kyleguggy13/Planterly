import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "dist");

test("deployment contains all referenced local assets and module imports", () => {
  const html = readFileSync(join(output, "index.html"), "utf8").replace(/<!--[\s\S]*?-->/g, "");
  for (const [, ref] of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    if (/^(?:https?:|data:|#)/.test(ref)) continue;
    const pathname = ref.split(/[?#]/)[0];
    if (pathname) assert.ok(existsSync(join(output, pathname)), `Missing asset: ${ref}`);
  }
  for (const file of readdirSync(join(output, "js"))) {
    const source = readFileSync(join(output, "js", file), "utf8");
    for (const [, ref] of source.matchAll(/from\s+["'](\.\.?\/[^"']+)["']/g)) {
      assert.ok(existsSync(resolve(output, "js", ref)), `Missing module: ${ref}`);
    }
  }
  const manifest = JSON.parse(readFileSync(join(output, "manifest.json"), "utf8"));
  for (const icon of manifest.icons) assert.ok(existsSync(join(output, icon.src)));
});

test("deployment excludes backend files and personal log exports", () => {
  for (const name of ["functions", "support", ".env", ".git", ".openai", "firebase.json", "CNAME"]) {
    assert.equal(existsSync(join(output, name)), false, `Unexpected public path: ${name}`);
  }
  const hosting = JSON.parse(readFileSync(join(root, ".openai/hosting.json"), "utf8"));
  assert.equal(hosting.static.directory, "dist");
  assert.ok(hosting.project_id);
});
