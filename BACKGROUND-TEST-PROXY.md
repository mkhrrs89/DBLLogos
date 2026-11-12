# Background Test image proxy

The `functions/api/cards-photo.js` route is an **optional, same-origin Cloudflare Pages Function**. It provides a safe fallback when public player photo hosts allow their images to display but block browser canvas access (CORS).

## Deployment

- Deploy the existing repository as a **Cloudflare Pages** project, with the static output rooted at the project root and the `functions` directory present in the deployment source.
- The repository includes `_routes.json` to invoke the Function only for `/api/cards-photo`.
- Visit `https://YOUR-PAGES-HOST/api/cards-photo?health=1`. It should return JSON with `service: "dbl-cards-photo-proxy"` and response header `X-DBL-Proxy: v1`.
- The browser probes that endpoint once, on demand, **only if direct background masking of an HTTPS photo fails**. If the Function is unavailable, the application keeps the original photo and offers a local-photo option. No private source files are submitted.
- If your app is currently hosted on **GitHub Pages**, the Function will **not run there**. GitHub Pages serves static files only. Connecting or migrating the existing deployment to Cloudflare Pages requires a separate hosting configuration; this commit does not change your active hosting.

## Security controls

Only approved public HTTPS raster-image hosts can be requested. Defaults include GitHub image hosts, Wikimedia/Miraheze, Imgur images, and Discord CDN images. To allow another trusted public source host, add its exact hostname to the Cloudflare Pages environment variable `DBL_IMAGE_PROXY_HOSTS` as a comma-separated list, then redeploy.

The proxy refuses localhost/private-address targets, username/password URLs, arbitrary ports, redirects, non-image replies, files larger than 8 MiB, and slow upstream requests. It never accepts file uploads, local `blob:` or `data:` photo references, stored league-file contents, or arbitrary HTTP URLs. It is used solely for on-screen cutouts.

## Media

JPG, PNG, WebP and GIF are accepted. An animated GIF is sampled into **one still PNG cutout**, so its animation is not preserved. MOV/MP4 background masking needs a separate per-frame `VIDEO` mode pipeline; it is **not implemented** here. Existing player photos are never modified.

## Debugging

Background Test shows differentiated failure labels (such as proxy inactive, proxy fetch failed, AI model unavailable, and image access blocked). Tap **Why?** on a failed pack card for the detailed reason. The original source remains unchanged, and **Use local photo** can still process a locally selected still image without the proxy.
