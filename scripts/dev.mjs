import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import "./build.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

createServer(async (request, response) => {
  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const filename = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!filename.startsWith(`${root}${sep}`) || !(await stat(filename)).isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": types[extname(filename)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(filename).on("error", () => response.destroy()).pipe(response);
  } catch {
    response.writeHead(404).end("Not found");
  }
}).listen(3000, "127.0.0.1", () => {
  console.log("Local: http://127.0.0.1:3000");
  console.log("Run npm run build after edits, then refresh the browser.");
});
