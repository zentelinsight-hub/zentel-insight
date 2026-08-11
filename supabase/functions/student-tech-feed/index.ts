import { handleOptions, isAllowedOrigin, jsonResponse } from "../_shared/cors.ts";
import { getAuthenticatedUser, getUserAccountStatus, getUserRole } from "../_shared/security.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const clean = (value: unknown) => String(value || "").trim();
const FEED_ASSET_BUCKET = "technology-feed-assets";

function decodeEntities(value: unknown) {
  const named: Record<string, string> = { amp: "&", apos: "'", quot: "\"", lt: "<", gt: ">", nbsp: " " };
  return clean(value)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match)
    .replace(/<[^>]*>/g, " ")
    .replace(/only available in paid plans/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isSafePublicUrl(value: unknown) {
  try {
    const url = new URL(clean(value));
    const host = url.hostname.toLowerCase();
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
    if (/^(127|10)\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return false;
    const private172 = host.match(/^172\.(\d+)\./);
    if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return false;
    if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return false;
    return true;
  } catch {
    return false;
  }
}

function sourceIdentity(externalUrl: unknown, suppliedIcon: unknown = "") {
  try {
    const url = new URL(clean(externalUrl));
    return {
      domain: url.hostname.toLowerCase().replace(/^www\./, ""),
      origin: url.origin,
      icon: isSafePublicUrl(suppliedIcon) ? clean(suppliedIcon) : null
    };
  } catch {
    return { domain: "", origin: "", icon: null };
  }
}

function getHtmlAttribute(tag: string, name: string) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:["']([^"']+)["']|([^\\s>]+))`, 'i');
  const match = tag.match(pattern);
  return clean(match?.[1] || match?.[2]);
}

function declaredIconUrls(html: string, origin: string) {
  const candidates: string[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    const rel = getHtmlAttribute(tag, 'rel').toLowerCase().split(/\s+/);
    if (!rel.some((value) => ['icon', 'shortcut', 'apple-touch-icon', 'mask-icon'].includes(value))) continue;
    const href = getHtmlAttribute(tag, 'href');
    if (!href) continue;
    try {
      const candidate = new URL(href, origin).toString();
      if (isSafePublicUrl(candidate)) candidates.push(candidate);
    } catch {
      // Ignore malformed declarations and continue to the conventional icon.
    }
  }
  return [...new Set(candidates)];
}

function declaredImageUrls(html: string, pageUrl: string) {
  const candidates: string[] = [];
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const key = clean(getHtmlAttribute(tag, 'property') || getHtmlAttribute(tag, 'name')).toLowerCase();
    if (!['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'].includes(key)) continue;
    const content = getHtmlAttribute(tag, 'content');
    if (!content) continue;
    try {
      const candidate = new URL(content, pageUrl).toString();
      if (isSafePublicUrl(candidate)) candidates.push(candidate);
    } catch {
      // Continue through remaining metadata.
    }
  }
  return [...new Set(candidates)];
}

async function inspectHtmlPage(url: string) {
  if (!isSafePublicUrl(url)) return { icons: [], images: [] };
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'ZentelInsightFeed/1.0' },
      signal: AbortSignal.timeout(7_000)
    });
    const contentType = clean(response.headers.get('content-type')).toLowerCase();
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (!response.ok || !isSafePublicUrl(response.url) || !contentType.includes('text/html') || contentLength > 1_500_000) {
      return { icons: [], images: [] };
    }
    const html = (await response.text()).slice(0, 500_000);
    return {
      icons: declaredIconUrls(html, response.url),
      images: declaredImageUrls(html, response.url)
    };
  } catch {
    return { icons: [], images: [] };
  }
}

function imageExtension(contentType: string) {
  const extensions: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
    'image/x-icon': 'ico',
    'image/vnd.microsoft.icon': 'ico'
  };
  return extensions[contentType] || '';
}

async function assetKey(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

async function cacheExternalImage(
  supabase: any,
  value: unknown,
  folder: 'icons' | 'items',
  identity: string,
  maxBytes: number
) {
  if (!isSafePublicUrl(value)) return null;
  const sourceUrl = clean(value);
  if (sourceUrl.includes(`/storage/v1/object/public/${FEED_ASSET_BUCKET}/`)) return sourceUrl;
  try {
    const response = await fetch(sourceUrl, {
      redirect: 'follow',
      headers: { Accept: 'image/*', 'User-Agent': 'ZentelInsightFeed/1.0' },
      signal: AbortSignal.timeout(9_000)
    });
    const contentType = clean(response.headers.get('content-type')).toLowerCase().split(';')[0];
    const contentLength = Number(response.headers.get('content-length') || 0);
    const extension = imageExtension(contentType);
    if (!response.ok || !isSafePublicUrl(response.url) || !extension || contentLength > maxBytes) return null;
    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > maxBytes) return null;
    const path = `${folder}/${await assetKey(`${identity}:${response.url}`)}.${extension}`;
    const { error } = await supabase.storage.from(FEED_ASSET_BUCKET).upload(path, bytes, {
      cacheControl: '2592000',
      contentType,
      upsert: true
    });
    if (error) return null;
    return supabase.storage.from(FEED_ASSET_BUCKET).getPublicUrl(path).data.publicUrl || null;
  } catch {
    return null;
  }
}

async function inspectOriginForIcons(origin: string) {
  return (await inspectHtmlPage(origin)).icons;
}

async function resolveSourceIcon(supabase: any, item: Record<string, any>) {
  const identity = sourceIdentity(item.external_url, item.source_icon_url);
  const domain = item.source_type === 'youtube' ? 'youtube.com' : identity.domain;
  const origin = item.source_type === 'youtube' ? 'https://www.youtube.com' : identity.origin;
  if (!domain || !origin) return { ...item, source_icon_url: null, source_domain: domain };

  const { data: cached } = await supabase
    .from('technology_source_icons')
    .select('icon_url, resolution_status, expires_at')
    .eq('domain', domain)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (cached) return { ...item, source_icon_url: cached.resolution_status === 'resolved' ? cached.icon_url : null, source_domain: domain };

  const declared = item.source_type === 'youtube' ? [] : await inspectOriginForIcons(origin);
  const candidates = [
    item.source_type === 'youtube' ? 'https://www.youtube.com/favicon.ico' : identity.icon,
    ...declared,
    new URL('/favicon.ico', origin).toString()
  ].filter(Boolean);
  let resolved: string | null = null;
  for (const candidate of [...new Set(candidates)]) {
    resolved = await cacheExternalImage(supabase, candidate, 'icons', domain, 512 * 1024);
    if (resolved) break;
  }

  await supabase.from('technology_source_icons').upsert({
    domain,
    source_origin: origin,
    icon_url: resolved,
    content_type: resolved ? 'managed' : null,
    resolution_status: resolved ? 'resolved' : 'missing',
    resolved_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + (resolved ? 30 : 7) * 86_400_000).toISOString()
  }, { onConflict: 'domain' });
  return { ...item, source_icon_url: resolved, source_domain: domain };
}

async function resolveItemImage(supabase: any, item: Record<string, any>) {
  const identity = clean(item.external_id || item.external_url);
  let resolved = await cacheExternalImage(supabase, item.image_url, 'items', identity, 5 * 1024 * 1024);
  if (!resolved && item.source_type !== 'youtube') {
    const metadata = await inspectHtmlPage(clean(item.external_url));
    for (const candidate of metadata.images) {
      resolved = await cacheExternalImage(supabase, candidate, 'items', identity, 5 * 1024 * 1024);
      if (resolved) break;
    }
  }
  return { ...item, image_url: resolved };
}

async function resolveFeedAssets(supabase: any, item: Record<string, any>) {
  return resolveItemImage(supabase, await resolveSourceIcon(supabase, item));
}

async function fetchJson(url: URL) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`Feed source returned ${response.status}`);
  return response.json();
}

async function getNewsItems(apiKey: string) {
  if (!apiKey) throw new Error("NEWSDATA_API_KEY is not configured");
  const url = new URL("https://newsdata.io/api/1/latest");
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("q", "technology OR software OR cybersecurity OR artificial intelligence");
  url.searchParams.set("language", "en");
  url.searchParams.set("category", "technology");
  url.searchParams.set("size", "10");
  const payload = await fetchJson(url);
  return Array.isArray(payload?.results) ? payload.results.map((item: Record<string, unknown>) => ({ item, identity: sourceIdentity(item.link, item.source_icon) })).map(({ item, identity }) => ({
    external_id: `news-${clean(item.article_id || item.link)}`,
    source_type: "newsdata",
    source_name: decodeEntities(item.source_name || item.source_id) || "Technology News",
    source_icon_url: identity.icon,
    source_domain: identity.domain,
    title: decodeEntities(item.title),
    summary: decodeEntities(item.description || item.content).slice(0, 700),
    category: "Technology News",
    image_url: clean(item.image_url) || null,
    external_url: clean(item.link),
    published_at: clean(item.pubDate) || new Date().toISOString(),
    imported_at: new Date().toISOString(),
    active: true
  })).filter((item: { external_id: string; title: string; external_url: string }) => item.external_id && item.title && item.external_url) : [];
}

async function getVideoItems(apiKey: string) {
  if (!apiKey) throw new Error("YOUTUBE_API_KEY is not configured");
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("q", "technology software cybersecurity AI education");
  url.searchParams.set("type", "video");
  url.searchParams.set("order", "date");
  url.searchParams.set("safeSearch", "strict");
  url.searchParams.set("maxResults", "8");
  const payload = await fetchJson(url);
  return Array.isArray(payload?.items) ? payload.items.map((item: Record<string, any>) => ({
    external_id: `youtube-${clean(item?.id?.videoId)}`,
    source_type: "youtube",
    source_name: decodeEntities(item?.snippet?.channelTitle) || "YouTube",
    source_icon_url: "https://www.youtube.com/favicon.ico",
    source_domain: "youtube.com",
    title: decodeEntities(item?.snippet?.title),
    summary: decodeEntities(item?.snippet?.description).slice(0, 700),
    category: "Technology Video",
    image_url: clean(item?.snippet?.thumbnails?.high?.url || item?.snippet?.thumbnails?.medium?.url) || null,
    external_url: item?.id?.videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(item.id.videoId)}` : "",
    published_at: clean(item?.snippet?.publishedAt) || new Date().toISOString(),
    imported_at: new Date().toISOString(),
    active: true
  })).filter((item: { external_id: string; title: string; external_url: string }) => item.external_id && item.title && item.external_url) : [];
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed." }, 405, request);
  if (!isAllowedOrigin(request)) return jsonResponse({ ok: false, error: "Origin is not allowed." }, 403, request);

  const supabase = createServiceClient();
  const auth = await getAuthenticatedUser(request, supabase);
  if (!auth.user) return jsonResponse({ ok: false, error: auth.error }, 401, request);

  try {
    const [role, status] = await Promise.all([
      getUserRole(supabase, auth.user.id),
      getUserAccountStatus(supabase, auth.user.id)
    ]);
    if (role !== "student" || status !== "active") return jsonResponse({ ok: false, error: "Active Student access is required." }, 403, request);

    const sources = [
      { name: "newsdata", request: getNewsItems(Deno.env.get("NEWSDATA_API_KEY") || "") },
      { name: "youtube", request: getVideoItems(Deno.env.get("YOUTUBE_API_KEY") || "") }
    ];
    const results = await Promise.allSettled(sources.map((source) => source.request));
    const importedItems = results.flatMap((result, index) => {
      if (result.status === "fulfilled") return result.value;
      console.error("student-tech-feed source failed", {
        source: sources[index].name,
        message: result.reason instanceof Error ? result.reason.message : "Unknown source failure"
      });
      return [];
    });

    const { data: existingItems, error: existingError } = await supabase
      .from('technology_feed_items')
      .select('external_id, source_type, source_name, source_icon_url, source_domain, title, summary, category, image_url, external_url, published_at, imported_at, active')
      .eq('active', true)
      .order('published_at', { ascending: false })
      .limit(30);
    if (existingError) throw existingError;
    if (!importedItems.length && !existingItems?.length) throw new Error("No external feed source returned usable records");
    const candidates = new Map((existingItems || []).map((item: Record<string, any>) => [item.external_id, item]));
    importedItems.forEach((item) => candidates.set(item.external_id, item));
    const items = await Promise.all([...candidates.values()].map((item) => resolveFeedAssets(supabase, item)));
    const { error: upsertError } = await supabase
      .from("technology_feed_items")
      .upsert(items, { onConflict: "external_id" });
    if (upsertError) throw upsertError;

    return jsonResponse({
      ok: true,
      imported: items.length,
      sources: {
        newsdata: results[0].status === "fulfilled" ? results[0].value.length : 0,
        youtube: results[1].status === "fulfilled" ? results[1].value.length : 0
      }
    }, 200, request);
  } catch (error) {
    console.error("student-tech-feed import failed", {
      message: error instanceof Error ? error.message : "Unknown import failure"
    });
    return jsonResponse({ ok: false, error: "Technology feed is temporarily unavailable." }, 503, request);
  }
});
