import { cpSync, existsSync, lstatSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "dist");

// Rebuild only our own output directory; do not follow a redirected directory.
if (dirname(output) !== root || (existsSync(output) && lstatSync(output).isSymbolicLink())) {
  throw new Error("Build output must be a directory directly inside the project.");
}
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

// Firebase source, local data exports, and deployment metadata are not web assets.
for (const name of ["index.html", "chart.html", "manifest.json", "sw.js", "assets", "css", "js"]) {
  cpSync(join(root, name), join(output, name), { recursive: true });
}
console.log("Planterly frontend built in dist/");
