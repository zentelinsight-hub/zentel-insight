import { handleOptions, isAllowedOrigin, jsonResponse } from "../_shared/cors.ts";
import { getAuthenticatedUser, getUserAccountStatus, getUserRole } from "../_shared/security.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const clean = (value: unknown) => String(value || "").trim();

async function fetchJson(url: URL) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`Feed source returned ${response.status}`);
  return response.json();
}

async function getNewsItems(apiKey: string) {
  if (!apiKey) return [];
  const url = new URL("https://newsdata.io/api/1/latest");
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("q", "technology OR software OR cybersecurity OR artificial intelligence");
  url.searchParams.set("language", "en");
  url.searchParams.set("category", "technology");
  url.searchParams.set("size", "10");
  const payload = await fetchJson(url);
  return Array.isArray(payload?.results) ? payload.results.map((item: Record<string, unknown>) => ({
    id: `news-${clean(item.article_id || item.link)}`,
    kind: "technology",
    author: clean(item.source_name || item.source_id) || "Technology News",
    title: clean(item.title),
    body: clean(item.description || item.content).slice(0, 700),
    category: "Technology News",
    imageUrl: clean(item.image_url),
    externalUrl: clean(item.link),
    createdAt: clean(item.pubDate) || new Date().toISOString()
  })).filter((item: { id: string; title: string; externalUrl: string }) => item.id && item.title && item.externalUrl) : [];
}

async function getVideoItems(apiKey: string) {
  if (!apiKey) return [];
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
    id: `youtube-${clean(item?.id?.videoId)}`,
    kind: "technology",
    author: clean(item?.snippet?.channelTitle) || "YouTube",
    title: clean(item?.snippet?.title),
    body: clean(item?.snippet?.description).slice(0, 700),
    category: "Technology Video",
    imageUrl: clean(item?.snippet?.thumbnails?.high?.url || item?.snippet?.thumbnails?.medium?.url),
    externalUrl: item?.id?.videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(item.id.videoId)}` : "",
    createdAt: clean(item?.snippet?.publishedAt) || new Date().toISOString()
  })).filter((item: { id: string; title: string; externalUrl: string }) => item.id && item.title && item.externalUrl) : [];
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

    const results = await Promise.allSettled([
      getNewsItems(Deno.env.get("NEWSDATA_API_KEY") || ""),
      getVideoItems(Deno.env.get("YOUTUBE_API_KEY") || "")
    ]);
    const items = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    return jsonResponse({ ok: true, items }, 200, request);
  } catch {
    return jsonResponse({ ok: false, error: "Technology feed is temporarily unavailable." }, 503, request);
  }
});
