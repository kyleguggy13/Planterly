export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/Planterly" || url.pathname.startsWith("/Planterly/")) {
      url.pathname = url.pathname.slice("/Planterly".length) || "/";
      return Response.redirect(url.href, 301);
    }

    const asset = await env.ASSETS.fetch(request);
    if (url.pathname === "/sw.js" || url.pathname === "/manifest.json") {
      const response = new Response(asset.body, asset);
      response.headers.set("Cache-Control", "no-cache");
      return response;
    }
    return asset;
  }
};
