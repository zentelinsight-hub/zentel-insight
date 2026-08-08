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
  if (!apiKey) throw new Error("NEWSDATA_API_KEY is not configured");
  const url = new URL("https://newsdata.io/api/1/latest");
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("q", "technology OR software OR cybersecurity OR artificial intelligence");
  url.searchParams.set("language", "en");
  url.searchParams.set("category", "technology");
  url.searchParams.set("size", "10");
  const payload = await fetchJson(url);
  return Array.isArray(payload?.results) ? payload.results.map((item: Record<string, unknown>) => ({
    external_id: `news-${clean(item.article_id || item.link)}`,
    source_type: "newsdata",
    source_name: clean(item.source_name || item.source_id) || "Technology News",
    title: clean(item.title),
    summary: clean(item.description || item.content).slice(0, 700),
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
    source_name: clean(item?.snippet?.channelTitle) || "YouTube",
    title: clean(item?.snippet?.title),
    summary: clean(item?.snippet?.description).slice(0, 700),
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
    const items = results.flatMap((result, index) => {
      if (result.status === "fulfilled") return result.value;
      console.error("student-tech-feed source failed", {
        source: sources[index].name,
        message: result.reason instanceof Error ? result.reason.message : "Unknown source failure"
      });
      return [];
    });

    if (!items.length) throw new Error("No external feed source returned usable records");
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
