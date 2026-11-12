// Cloudflare Pages Function: /api/cards-photo
// Self-hosted same-origin image fetch for the DBL Background Test collection.
// Requires deployment through Cloudflare Pages; GitHub Pages cannot execute it.
// Public HTTPS raster images only, strict host allowlist, no redirect following,
// no credentials, no private-address targets, and a hard response byte limit.
// Never sends league files, user-selected local images, or embedded data URLs.
const MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_HOSTS = new Set([
  'raw.githubusercontent.com',
  'user-images.githubusercontent.com',
  'images.githubusercontent.com',
  'media.githubusercontent.com',
  'avatars.githubusercontent.com',
  'github.com',
  'i.imgur.com',
  'upload.wikimedia.org',
  'static.wikia.nocookie.net',
  'cdn.discordapp.com',
  'media.discordapp.net'
]);
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'
]);

function reply(message, status = 400) {
  return new Response(JSON.stringify({error: message}), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-DBL-Proxy': 'v1'
    }
  });
}

function validImageTarget(raw, env) {
  if (!raw || raw.length > 1800) return null;
  let target;
  try { target = new URL(raw); } catch (_) { return null; }
  if (target.protocol !== 'https:' || target.username || target.password ||
      target.port || target.hash || !target.hostname) return null;
  const host = target.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') ||
      host.endsWith('.local') || host.endsWith('.internal') ||
      /^\d+(?:\.\d+){3}$/.test(host) || host.includes(':') ||
      host.includes('..')) return null;
  const configured = typeof env?.DBL_IMAGE_PROXY_HOSTS === 'string'
    ? env.DBL_IMAGE_PROXY_HOSTS.split(',').map(x => x.trim().toLowerCase())
      .filter(x => /^[a-z0-9.-]{3,200}$/.test(x))
    : [];
  if (!DEFAULT_HOSTS.has(host) && !configured.includes(host) &&
      !host.endsWith('.miraheze.org') &&
      !host.endsWith('.wikia.nocookie.net')) return null;
  return target;
}

export async function onRequestGet({request, env}) {
  const incoming = new URL(request.url);
  if (incoming.searchParams.get('health') === '1') {
    return new Response(JSON.stringify({service:'dbl-cards-photo-proxy', version:1}), {
      status:200,
      headers:{
        'Content-Type':'application/json; charset=utf-8',
        'Cache-Control':'no-store',
        'X-DBL-Proxy':'v1',
        'X-Content-Type-Options':'nosniff'
      }
    });
  }
  const target = validImageTarget(incoming.searchParams.get('url'), env);
  if (!target) return reply('This public image host is not approved for proxying.', 403);
  try {
    // Redirects are rejected rather than blindly following to an unapproved
    // host or private network. Cloudflare Workers' fetch is server-to-server.
    const upstream = await fetch(target.toString(), {
      method:'GET',
      redirect:'manual',
      headers:{Accept:'image/avif,image/webp,image/png,image/jpeg,image/gif'},
      signal: AbortSignal.timeout(10000)
    });
    if (!upstream.ok) {
      if (upstream.status >= 300 && upstream.status < 400)
        return reply('The image host redirected the request.', 422);
      return reply('The image host returned HTTP ' + upstream.status + '.', 502);
    }
    const contentType = (upstream.headers.get('content-type') || '')
      .split(';')[0].trim().toLowerCase();
    if (!ALLOWED_TYPES.has(contentType))
      return reply('The destination did not return an approved raster image.', 415);
    const length = Number(upstream.headers.get('content-length') || 0);
    if (length > MAX_BYTES) return reply('The image is too large.', 413);
    if (!upstream.body) return reply('The image response was empty.', 502);
    const reader = upstream.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) {
          await reader.cancel();
          return reply('The image exceeds the size limit.', 413);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    if (!size) return reply('The image response was empty.', 502);
    return new Response(new Blob(chunks, {type:contentType}), {
      status:200,
      headers:{
        'Content-Type':contentType,
        'Content-Length':String(size),
        'Cache-Control':'public, max-age=1800',
        'X-Content-Type-Options':'nosniff',
        'Cross-Origin-Resource-Policy':'same-origin',
        'X-DBL-Proxy':'v1'
      }
    });
  } catch (_) {
    return reply('The image server could not be reached.', 502);
  }
}
